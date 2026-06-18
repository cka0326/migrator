import { BaseEdge, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

export function CustomTableEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps<any>) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <BaseEdge 
       path={edgePath} 
       markerEnd={markerEnd} 
       style={{ 
          ...style, 
          stroke: '#cbd5e1', 
          strokeWidth: 3, 
       }} 
    />
  );
}
