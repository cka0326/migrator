import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

export function CustomColumnEdge({

  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}: EdgeProps<any>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isUnknown = data?.transformationType === 'UNKNOWN';
  const strokeColor = isUnknown ? '#9ca3af' : '#60a5fa'; // gray for unknown, blue for known
  
  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ 
          ...style, 
          stroke: strokeColor, 
          strokeWidth: 1.5, 
          strokeDasharray: isUnknown ? '4 4' : 'none',
          opacity: 0.8
      }} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan bg-background border rounded px-1 text-[10px] shadow-sm cursor-pointer hover:bg-muted"
          onClick={(e) => {
             e.stopPropagation();
             alert(`Edge: ${data?.transformationType}\nExpr: ${data?.expression}`);
          }}
        >
          {data?.transformationType === 'DIRECT' ? '→' : 'ƒ'}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
