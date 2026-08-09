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
import { Plus, Trash2, MousePointer2, Cloud, Save, Layout, Undo2, Redo2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useHistory } from './use-history';

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
type SavedMap = { id: number; name: string; nodes: ThoughtNode[]; edges: Edge[] };

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
  // Set while the server's map is being installed, so that restoring a map does
  // not immediately save back the thing we just read.
  const restoringFromServerRef = useRef(false);
  // Whether the graph has changed since the last save was dispatched.
  const dirtyRef = useRef(false);

  const { data: savedMaps, isSuccess, isError } = useQuery<SavedMap[]>({
    queryKey: ['/api/maps'],
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name: "My Mind Sky", nodes, edges };
      if (currentMapId) {
        return apiRequest("PATCH", `/api/maps/${currentMapId}`, payload).then(res => res.json());
      } else {
        return apiRequest("POST", "/api/maps", payload).then(res => res.json());
      }
    },
    onSuccess: (data) => {
      setCurrentMapId(data.id);
      queryClient.invalidateQueries({ queryKey: ['/api/maps'] });
    },
    onError: () => {
      // Without this the only signal of a failed save is its absence, which is
      // indistinguishable from a save that worked.
      toast({
        variant: "destructive",
        title: "Could not reach the clouds",
        description: "Your thoughts are still here, but they are not saved yet.",
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
    const latest = savedMaps?.[savedMaps.length - 1];
    if (latest?.nodes?.length) {
      const restored: Snapshot = { nodes: latest.nodes, edges: latest.edges ?? [] };
      applyingRef.current = true;
      restoringFromServerRef.current = true;
      setNodes(restored.nodes);
      setEdges(restored.edges);
      setCurrentMapId(latest.id);
      // Reset rather than commit: the restored map is the start of history,
      // not a step the user can undo their way out of.
      history.reset(restored);
    }
    hydratedRef.current = true;
  }, [savedMaps, isSuccess, isError, setNodes, setEdges, history]);

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
    if (restoringFromServerRef.current) {
      restoringFromServerRef.current = false;
      return;
    }
    dirtyRef.current = true;
  }, [nodes, edges]);

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

export default function WrappedCanvas() {
  return (
    <ReactFlowProvider>
      <ThoughtCanvas />
    </ReactFlowProvider>
  );
}
