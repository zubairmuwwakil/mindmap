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
import { useCallback, useEffect, useState } from 'react';
import CustomNode, { ThoughtNode } from './custom-node';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, MousePointer2, Cloud, Save, Layout } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

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

function ThoughtCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<ThoughtNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [currentMapId, setCurrentMapId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      toast({ title: "Sky Saved", description: "Your thoughts are securely stored in the clouds." });
    }
  });

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ 
      ...params, 
      animated: true, 
      style: { stroke: '#93C5FD', strokeWidth: 2 },
      type: 'bezier',
      deletable: true
    }, eds)),
    [setEdges],
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
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]);

  const clearCanvas = () => {
    if (confirm('Are you sure you want to clear the sky?')) {
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
        onNodesDelete={() => toast({ title: "Bubble Popped", description: "The thought has vanished." })}
        onEdgesDelete={() => toast({ title: "Link Broken", description: "The connection was severed." })}
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
