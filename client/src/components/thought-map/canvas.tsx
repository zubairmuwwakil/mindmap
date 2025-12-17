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
  useReactFlow,
  NodeTypes
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback } from 'react';
import CustomNode, { ThoughtNode } from './custom-node';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, MousePointer2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const nodeTypes: NodeTypes = {
  thought: CustomNode,
};

const initialNodes: ThoughtNode[] = [
  { 
    id: '1', 
    type: 'thought', 
    position: { x: 250, y: 250 }, 
    data: { label: 'Central Concept', content: 'Start mapping your thoughts here.' } 
  },
];

const initialEdges: Edge[] = [];

function ThoughtCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<ThoughtNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { toast } = useToast();

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1.5 } }, eds)),
    [setEdges],
  );

  const addNode = useCallback(() => {
    const id = `${Date.now()}`;
    const newNode: ThoughtNode = {
      id,
      type: 'thought',
      position: { 
        x: Math.random() * 400 + 100, // slightly better random positioning
        y: Math.random() * 400 + 100
      },
      data: { label: 'New Idea', content: '' },
    };
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]);

  const clearCanvas = () => {
    if (confirm('Are you sure you want to clear the canvas?')) {
      setNodes([]);
      setEdges([]);
      toast({
        title: "Canvas cleared",
        description: "Start fresh with a clean slate.",
      });
    }
  };

  return (
    <div className="w-full h-screen bg-background text-foreground">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="bg-background"
        minZoom={0.1}
        maxZoom={4}
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background gap={24} size={1.5} color="hsl(var(--muted-foreground)/0.2)" />
        <Controls className="bg-background border-border shadow-sm rounded-md overflow-hidden" showInteractive={false} />
        
        <Panel position="top-left" className="m-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold tracking-tight bg-background/50 backdrop-blur-sm p-2 rounded-lg">ThoughtMapper</h1>
            <p className="text-sm text-muted-foreground px-2">Visualise your thinking process.</p>
          </div>
        </Panel>

        <Panel position="bottom-center" className="m-8 mb-12">
          <div className="flex items-center gap-2 bg-background/80 backdrop-blur-md p-2 rounded-full border border-border shadow-lg">
            <Button variant="ghost" size="icon" onClick={() => {}} className="rounded-full hover:bg-muted" title="Select">
              <MousePointer2 className="w-4 h-4" />
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            <Button onClick={addNode} className="rounded-full px-6 shadow-sm" variant="default">
              <Plus className="w-4 h-4 mr-2" />
              Add Thought
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            <Button variant="ghost" size="icon" onClick={clearCanvas} className="rounded-full hover:bg-destructive/10 hover:text-destructive" title="Clear Canvas">
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
