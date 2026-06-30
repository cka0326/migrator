import { BaseEdge, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

export function CustomTableEdge({
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
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isHighlighted = !!data?.lineageHighlight;
  const isDimmed = !!data?.lineageDimmed;

  return (
    <BaseEdge
       path={edgePath}
       markerEnd={markerEnd}
       style={{
          ...style,
          stroke: isHighlighted ? '#2563eb' : '#cbd5e1',
          strokeWidth: isHighlighted ? 4 : 3,
          opacity: isDimmed ? 0.15 : 1,
       }}
    />
  );
}
