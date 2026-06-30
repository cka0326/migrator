import { BaseEdge, getBezierPath } from '@xyflow/react';
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
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isUnknown = data?.transformationType === 'UNKNOWN';
  const isHighlighted = !!data?.lineageHighlight;
  const isDimmed = !!data?.lineageDimmed;
  // gray for unknown, blue for known; highlighted lineage edges deepen to a
  // stronger blue and thicken.
  const strokeColor = isHighlighted ? '#2563eb' : (isUnknown ? '#9ca3af' : '#60a5fa');

  return (
    <BaseEdge path={edgePath} markerEnd={markerEnd} style={{
        ...style,
        stroke: strokeColor,
        strokeWidth: isHighlighted ? 2.5 : 1.5,
        strokeDasharray: isUnknown ? '4 4' : 'none',
        opacity: isDimmed ? 0.1 : (isHighlighted ? 1 : 0.8)
    }} />
  );
}
