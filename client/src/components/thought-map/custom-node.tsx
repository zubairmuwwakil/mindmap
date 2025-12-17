import { memo, useCallback } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow } from '@xyflow/react';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ThoughtNodeData = {
  label: string;
  content?: string;
  type?: 'proposal' | 'idea' | 'step';
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

  // Dynamic styles based on node type
  const isProposal = data.type === 'proposal';
  const isIdea = data.type === 'idea';
  
  const sizeClass = isProposal ? 'w-[320px] h-[320px]' : isIdea ? 'w-[260px] h-[260px]' : 'w-[200px] h-[200px]';
  const colorClass = isProposal 
    ? 'bg-blue-100/40 border-blue-200/60' 
    : isIdea 
      ? 'bg-white/40 border-white/60' 
      : 'bg-indigo-50/40 border-indigo-100/60';

  return (
    <div className={`transition-all duration-300 ${selected ? 'scale-105' : ''} group`}>
      <Card className={`
        ${sizeClass} ${colorClass}
        rounded-full border-2 backdrop-blur-sm 
        bubble-shadow flex flex-col items-center justify-center text-center
        relative overflow-hidden transition-colors
      `}>
        {/* Shine effect for bubble realism */}
        <div className="bubble-shine" />

        <Handle
          type="target"
          position={Position.Top}
          isConnectable={isConnectable}
          className="!w-4 !h-4 !bg-blue-300/80 !border-2 !border-white opacity-0 group-hover:opacity-100 transition-opacity"
        />
        
        <div className="z-10 w-[85%] flex flex-col gap-2 items-center">
          <Input 
            value={data.label} 
            onChange={onLabelChange}
            className={`
              border-none shadow-none font-bold text-center bg-transparent focus-visible:ring-0 placeholder:text-blue-900/30
              ${isProposal ? 'text-2xl text-blue-900' : isIdea ? 'text-xl text-slate-800' : 'text-lg text-slate-700'}
            `}
            placeholder={isProposal ? "Core Proposal" : "Idea"}
            data-testid="node-title-input"
          />
          
          <Textarea 
            value={data.content} 
            onChange={onContentChange}
            className="resize-none border-none shadow-none focus-visible:ring-0 text-center bg-transparent placeholder:text-blue-900/20 font-hand text-slate-600 leading-tight h-auto min-h-[60px] overflow-hidden"
            placeholder={isProposal ? "What is the big vision?" : "Details..."}
            data-testid="node-content-input"
          />
        </div>

        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={isConnectable}
          className="!w-4 !h-4 !bg-blue-300/80 !border-2 !border-white opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </Card>
      
      {/* Decorative label below bubble for context if needed */}
      {data.type && (
        <div className="absolute -bottom-8 left-0 right-0 text-center text-xs font-bold uppercase tracking-widest text-blue-900/40 pointer-events-none">
          {data.type}
        </div>
      )}
    </div>
  );
};

export default memo(CustomNode);
