import { memo, useCallback } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow } from '@xyflow/react';
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ThoughtNodeData = {
  label: string;
  content?: string;
  type?: 'idea' | 'question' | 'fact';
};

export type ThoughtNode = Node<ThoughtNodeData, 'thought'>;

const CustomNode = ({ id, data, isConnectable, selected }: NodeProps<ThoughtNode>) => {
  const { updateNodeData } = useReactFlow();

  const onLabelChange = useCallback((evt: React.ChangeEvent<HTMLInputElement>) => {
    updateNodeData(id, { label: evt.target.value });
  }, [id, updateNodeData]);

  const onContentChange = useCallback((evt: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(id, { content: evt.target.value });
  }, [id, updateNodeData]);

  return (
    <div className={`transition-all duration-200 ${selected ? 'ring-2 ring-primary ring-offset-2 rounded-lg' : ''}`}>
      <Card className="w-[280px] shadow-sm hover:shadow-md transition-shadow bg-card/90 backdrop-blur-sm border-muted-foreground/20">
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={isConnectable}
          className="!w-3 !h-3 !bg-muted-foreground/50 !border-2 !border-background hover:!bg-primary transition-colors"
        />
        <CardHeader className="p-3 pb-0">
          <Input 
            value={data.label} 
            onChange={onLabelChange}
            className="border-none shadow-none text-lg font-semibold px-0 h-auto focus-visible:ring-0 bg-transparent placeholder:text-muted-foreground/50"
            placeholder="Main Idea"
            data-testid="node-title-input"
          />
        </CardHeader>
        <CardContent className="p-3 pt-2">
          <Textarea 
            value={data.content} 
            onChange={onContentChange}
            className="min-h-[80px] resize-none border-none shadow-none focus-visible:ring-0 p-0 text-sm text-muted-foreground bg-transparent placeholder:text-muted-foreground/30 font-mono leading-relaxed"
            placeholder="Add details..."
            data-testid="node-content-input"
          />
        </CardContent>
        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={isConnectable}
          className="!w-3 !h-3 !bg-muted-foreground/50 !border-2 !border-background hover:!bg-primary transition-colors"
        />
      </Card>
    </div>
  );
};

export default memo(CustomNode);
