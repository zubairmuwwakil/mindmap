import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Panel,
  ReactFlowProvider,
  NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import CustomNode, { ThoughtNode } from './custom-node';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, MousePointer2, Cloud, Save, Layout, Undo2, Redo2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useHistory } from './use-history';
import { isDraftNewer, readDraft, writeDraft } from './local-draft';

const nodeTypes: NodeTypes = {
  thought: CustomNode,
};

const initialNodes: ThoughtNode[] = [
  {
    id: 'proposal',
    type: 'thought',
    position: { x: 400, y: 50 },
    data: { label: 'The Proposal', content: 'What is the overarching goal?', type: 'proposal' }
  },
  {
    id: 'idea-1',
    type: 'thought',
    position: { x: 400, y: 450 },
    data: { label: 'Main Concept', content: 'The core idea to achieve the proposal.', type: 'idea' }
  },
];

const initialEdges: Edge[] = [
  {
    id: 'e1-2',
    source: 'proposal',
    target: 'idea-1',
    animated: true,
    style: { stroke: '#93C5FD', strokeWidth: 3 },
    type: 'smoothstep'
  },
];

/** The unit of undo, and the unit of persistence. They are the same thing. */
type Snapshot = { nodes: ThoughtNode[]; edges: Edge[] };

/** Shape of a row from GET /api/maps. */
type SavedMap = { id: number; name: string; nodes: ThoughtNode[]; edges: Edge[]; updatedAt: string };

/**
 * Long enough that a burst of edits — dragging three bubbles into place, or
 * holding Cmd+Z — settles into one request instead of one per change; short
 * enough that closing the tab straight after an edit still keeps it.
 */
const AUTOSAVE_DELAY_MS = 1200;

function ThoughtCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<ThoughtNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [currentMapId, setCurrentMapId] = useState<number | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimCode, setClaimCode] = useState('');
  const [claimBusy, setClaimBusy] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const history = useHistory<Snapshot>({ nodes: initialNodes, edges: initialEdges });

  /**
   * Three refs, all guarding the same seam: React Flow reports every state
   * change the same way, whether it came from the user, from an undo, or from
   * the server. Only the user's changes are worth remembering or saving.
   */
  // Set while a restored snapshot is being pushed into React Flow.
  const applyingRef = useRef(false);
  // Set by an action that deserves a history entry, read once the state lands.
  const pendingCommitRef = useRef(false);
  // False until the server's answer (or its failure) has been dealt with.
  const hydratedRef = useRef(false);
  // The initial render and any restored graph are setup, not user edits.
  const skipDirtyEffectsRef = useRef(0);
  // Whether the graph has changed since the last save was dispatched.
  const dirtyRef = useRef(false);

  const { data: savedMaps, isSuccess, isError } = useQuery<SavedMap[]>({
    queryKey: ['/api/maps'],
  });

  /**
   * Where saves are landing. 'server' means Postgres; 'local' means the API
   * could not store it and the graph went to this browser's localStorage.
   * The status pill renders this, so the two are never confused.
   */
  const [mode, setMode] = useState<'server' | 'local'>('server');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saved' | 'failed'>('idle');

  const saveMutation = useMutation({
    mutationFn: async (): Promise<{ where: 'server'; id: number; updatedAt: string; snapshot: Snapshot } | { where: 'local' }> => {
      const payload = { name: "My Mind Sky", nodes, edges };
      const snapshot = { nodes, edges };
      try {
        const res = currentMapId
          ? await apiRequest("PATCH", `/api/maps/${currentMapId}`, payload)
          : await apiRequest("POST", "/api/maps", payload);
        const data = await res.json();
        return { where: 'server', id: data.id, updatedAt: data.updatedAt, snapshot };
      } catch (err) {
        // The server is tried on every save, so the app recovers by itself
        // once the database is back. Until then, keep the work in the browser.
        if (writeDraft(nodes, edges)) return { where: 'local' };
        throw err;
      }
    },
    onSuccess: (result) => {
      setSaveState('saved');
      if (result.where === 'server') {
        setCurrentMapId(result.id);
        // Match the server timestamp so this backup will not trigger a needless
        // resave on every visit, but can recover from a cleared identity cookie.
        writeDraft(result.snapshot.nodes, result.snapshot.edges, result.updatedAt);
        if (modeRef.current === 'local') {
          toast({ title: "Back online", description: "Saving to the database again." });
        }
        setMode('server');
        queryClient.invalidateQueries({ queryKey: ['/api/maps'] });
        return;
      }
      if (modeRef.current === 'server') {
        toast({
          title: "Database offline: saving in this browser",
          description: "Your sky is kept on this device until the server is back.",
        });
      }
      setMode('local');
    },
    onError: () => {
      // Neither the server nor the browser would store it. Say so plainly:
      // the alternative is a "saved" UI over work that will not survive a reload.
      setSaveState('failed');
      toast({
        variant: "destructive",
        title: "Not saved",
        description: "The server is unreachable and this browser would not store the map.",
      });
    },
  });

  // mutate() is a new function identity every render. Held in a ref so the
  // autosave effect below depends on the graph alone and its timer is not
  // restarted by unrelated re-renders.
  const saveRef = useRef(saveMutation.mutate);
  saveRef.current = saveMutation.mutate;

  /**
   * Restore the map the user last saved, so "it autosaves" means something
   * across visits rather than only within one.
   *
   * On failure we still mark the canvas hydrated: the starter graph is a
   * perfectly good place to work from, and refusing to autosave afterwards
   * would turn a read outage into a write outage.
   */
  useEffect(() => {
    if (hydratedRef.current || (!isSuccess && !isError)) return;
    let restored: Snapshot | null = null;
    if (isSuccess) {
      const latest = savedMaps?.[savedMaps.length - 1];
      const draft = readDraft<ThoughtNode, Edge>();
      if (latest && Array.isArray(latest.nodes)) {
        restored = { nodes: latest.nodes, edges: latest.edges ?? [] };
        setCurrentMapId(latest.id);
      }
      if (draft && isDraftNewer(draft.savedAt, latest?.updatedAt)) {
        restored = { nodes: draft.nodes, edges: draft.edges };
        dirtyRef.current = true;
        setSaveState('dirty');
        toast({ title: "Recovered newer browser draft", description: "Your latest sky will sync to the database." });
      }
    } else {
      // The API could not read the database: work from this browser's copy.
      setMode('local');
      const draft = readDraft<ThoughtNode, Edge>();
      if (draft) restored = { nodes: draft.nodes, edges: draft.edges };
    }
    if (restored) {
      applyingRef.current = true;
      setNodes(restored.nodes);
      setEdges(restored.edges);
      // Reset rather than commit: the restored map is the start of history,
      // not a step the user can undo their way out of.
      history.reset(restored);
    }
    skipDirtyEffectsRef.current = restored ? 2 : 1;
    hydratedRef.current = true;
  }, [savedMaps, isSuccess, isError, setNodes, setEdges, history, toast]);

  /** Flag the change that is about to happen as worth a history entry. */
  const markMeaningful = useCallback(() => {
    pendingCommitRef.current = true;
  }, []);

  /**
   * Commit once the flagged change has actually landed in state.
   *
   * Reading `nodes`/`edges` here rather than at the call site is what makes
   * "commit the result" correct: setNodes is asynchronous, so the call site
   * only ever sees the state it is replacing.
   */
  useEffect(() => {
    if (applyingRef.current) {
      applyingRef.current = false;
      return;
    }
    if (!pendingCommitRef.current) return;
    pendingCommitRef.current = false;
    history.commitSnapshot({ nodes, edges });
  }, [nodes, edges, history]);

  /** Any change to the graph leaves the server's copy out of date. */
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (skipDirtyEffectsRef.current > 0) {
      skipDirtyEffectsRef.current -= 1;
      return;
    }
    dirtyRef.current = true;
    setSaveState('dirty');
  }, [nodes, edges, isSuccess, isError]);

  /**
   * Debounced autosave.
   *
   * The debounce is also what pauses saving during undo/redo: each keystroke
   * clears the pending timer, so holding Cmd+Z sends one request for wherever
   * the user stops, not one per step.
   *
   * Waiting on `isPending` matters more than it looks. Until the first save
   * returns an id every save is a POST, so two in flight at once would create
   * two maps and the second id would win — the user's next edit would then
   * PATCH a row that is missing everything they did before it. Re-running when
   * the flight settles is what picks the pending change back up.
   */
  useEffect(() => {
    if (!hydratedRef.current || !dirtyRef.current) return;
    if (saveMutation.isPending) return;
    const timer = setTimeout(() => {
      dirtyRef.current = false;
      saveRef.current();
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [nodes, edges, saveMutation.isPending]);

  const applySnapshot = useCallback((snapshot: Snapshot | null) => {
    if (!snapshot) return;
    applyingRef.current = true;
    pendingCommitRef.current = false;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, [setNodes, setEdges]);

  const undo = useCallback(() => applySnapshot(history.stepBack()), [applySnapshot, history]);
  const redo = useCallback(() => applySnapshot(history.stepForward()), [applySnapshot, history]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;

      // A bubble's title and body are ordinary text fields. Cmd+Z inside one
      // belongs to the browser's text undo; stealing it would make editing a
      // label feel broken to fix a canvas-level convenience.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  const onConnect = useCallback(
    (params: Connection) => {
      markMeaningful();
      setEdges((eds) => addEdge({
        ...params,
        animated: true,
        style: { stroke: '#93C5FD', strokeWidth: 2 },
        type: 'bezier',
        deletable: true
      }, eds));
    },
    [setEdges, markMeaningful],
  );

  const addNode = useCallback((type: 'proposal' | 'idea' | 'step' = 'step') => {
    const id = `${Date.now()}`;
    const newNode: ThoughtNode = {
      id,
      type: 'thought',
      position: {
        x: Math.random() * 400 + 200,
        y: Math.random() * 400 + 200
      },
      data: {
        label: type === 'proposal' ? 'New Proposal' : 'New Idea',
        content: '',
        type
      },
    };
    markMeaningful();
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes, markMeaningful]);

  const clearCanvas = () => {
    if (confirm('Are you sure you want to clear the sky?')) {
      markMeaningful();
      setNodes([]);
      setEdges([]);
    }
  };

  const claimOlderMaps = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!claimCode || claimBusy) return;
    setClaimBusy(true);
    try {
      const response = await apiRequest('POST', '/api/maps/claim-legacy', { code: claimCode });
      const result: { maps: SavedMap[] } = await response.json();
      if (!result.maps.length) {
        toast({ title: 'No older maps to recover' });
        return;
      }
      const latest = [...result.maps].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt)).at(-1)!;
      const snapshot = { nodes: latest.nodes, edges: latest.edges };
      applyingRef.current = true;
      skipDirtyEffectsRef.current = 1;
      pendingCommitRef.current = false;
      dirtyRef.current = false;
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      history.reset(snapshot);
      setCurrentMapId(latest.id);
      setSaveState('saved');
      setMode('server');
      writeDraft(snapshot.nodes, snapshot.edges, latest.updatedAt);
      setClaimOpen(false);
      setClaimCode('');
      queryClient.invalidateQueries({ queryKey: ['/api/maps'] });
      toast({ title: `Recovered ${result.maps.length} older map${result.maps.length === 1 ? '' : 's'}` });
    } catch {
      toast({ variant: 'destructive', title: 'Recovery failed', description: 'Check the recovery code and try again.' });
    } finally {
      setClaimBusy(false);
    }
  };

  return (
    <div className="w-full h-screen relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-40 z-0">
         <div className="absolute top-20 left-20 text-white/40 animate-pulse duration-[10s]"><Cloud size={120} /></div>
         <div className="absolute top-40 right-40 text-white/30 animate-pulse duration-[15s]"><Cloud size={180} /></div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        // Drag-end, not drag: a snapshot per mousemove would make one gesture
        // cost dozens of Cmd+Z presses to unwind.
        onNodeDragStop={markMeaningful}
        onNodesDelete={() => {
          markMeaningful();
          toast({ title: "Bubble Popped", description: "The thought has vanished." });
        }}
        onEdgesDelete={() => {
          markMeaningful();
          toast({ title: "Link Broken", description: "The connection was severed." });
        }}
        deleteKeyCode={['Backspace', 'Delete']}
        className="relative z-10"
      >
        <Background gap={40} size={1} color="rgba(255, 255, 255, 0.5)" />
        <Controls className="bg-white/50 border-white/40 shadow-sm rounded-md backdrop-blur-md" showInteractive={false} />

        <Panel position="top-left" className="m-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-blue-900 flex items-center gap-2">
              <Cloud className="fill-blue-100 text-blue-500" />
              MindSky
            </h1>
            <p className="text-blue-800/60 font-medium px-1">Press Delete/Backspace to pop bubbles or cut links.</p>
            <SaveStatus mode={mode} state={saveMutation.isPending ? 'saving' : saveState} />
            {isSuccess && savedMaps?.length === 0 && (
              <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
                <DialogTrigger asChild>
                  <Button variant="link" size="sm" className="self-start px-1 text-blue-900">Recover older maps</Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={claimOlderMaps} className="space-y-4">
                    <DialogHeader>
                      <DialogTitle>Recover older maps</DialogTitle>
                      <DialogDescription>Enter the one-time recovery code to move existing maps into this browser’s private space.</DialogDescription>
                    </DialogHeader>
                    <Input type="password" autoComplete="off" aria-label="Recovery code" value={claimCode} onChange={(event) => setClaimCode(event.target.value)} required />
                    <DialogFooter>
                      <Button type="submit" disabled={claimBusy}>{claimBusy ? 'Recovering…' : 'Recover maps'}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </Panel>

        <Panel position="top-right" className="m-4 flex gap-2">
          <Button onClick={() => addNode('proposal')} variant="outline" className="bg-white/50 backdrop-blur-md border-blue-200 text-blue-900 rounded-full">
            <Layout className="w-4 h-4 mr-2" />
            New Header
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg">
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save Sky"}
          </Button>
        </Panel>

        <Panel position="bottom-center" className="m-8 mb-12">
          <div className="flex items-center gap-2 bg-white/40 backdrop-blur-md p-2 rounded-full border border-white/60 shadow-xl ring-1 ring-white/50">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/50 text-blue-900" title="Select">
              <MousePointer2 className="w-4 h-4" />
            </Button>
            <div className="w-px h-6 bg-blue-900/10 mx-1" />
            <Button
              variant="ghost"
              size="icon"
              onClick={undo}
              disabled={!history.canUndo}
              className="rounded-full hover:bg-white/50 text-blue-900 disabled:opacity-30"
              title="Undo (Cmd/Ctrl+Z)"
              data-testid="undo-button"
            >
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={redo}
              disabled={!history.canRedo}
              className="rounded-full hover:bg-white/50 text-blue-900 disabled:opacity-30"
              title="Redo (Cmd/Ctrl+Shift+Z)"
              data-testid="redo-button"
            >
              <Redo2 className="w-4 h-4" />
            </Button>
            <div className="w-px h-6 bg-blue-900/10 mx-1" />
            <Button onClick={() => addNode('step')} className="rounded-full px-6 shadow-sm bg-blue-500 hover:bg-blue-600 text-white border-none">
              <Plus className="w-4 h-4 mr-2" />
              Float Idea
            </Button>
            <div className="w-px h-6 bg-blue-900/10 mx-1" />
            <Button variant="ghost" size="icon" onClick={clearCanvas} className="rounded-full hover:bg-red-50 text-blue-900 hover:text-red-500" title="Clear Canvas">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

/**
 * Always-visible answer to "where is my work?". A toast says it once; this
 * keeps saying it, which is what a visitor who missed the toast needs.
 */
function SaveStatus({ mode, state }: {
  mode: 'server' | 'local';
  state: 'idle' | 'dirty' | 'saving' | 'saved' | 'failed';
}) {
  const where = mode === 'server' ? 'database' : 'this browser';
  const text =
    state === 'saving' ? 'Saving…' :
    state === 'dirty' ? 'Unsaved changes' :
    state === 'failed' ? 'Not saved' :
    state === 'saved' ? `Saved to ${where}` :
    mode === 'server' ? 'Autosave on' : 'Offline mode';
  const tone =
    state === 'failed' ? 'bg-red-100 text-red-800 border-red-200' :
    mode === 'local' ? 'bg-amber-100 text-amber-900 border-amber-200' :
    'bg-white/60 text-blue-900 border-white/70';
  return (
    <div className="flex flex-col gap-1 px-1" data-testid="save-status" aria-live="polite">
      <span className={`self-start text-xs font-semibold rounded-full border px-3 py-1 backdrop-blur-md ${tone}`}>
        {text}
      </span>
      {mode === 'local' && (
        <span className="text-xs text-amber-900/80 max-w-xs">
          The database is unreachable, so your sky is saved on this device only.
        </span>
      )}
    </div>
  );
}

export default function WrappedCanvas() {
  return (
    <ReactFlowProvider>
      <ThoughtCanvas />
    </ReactFlowProvider>
  );
}
