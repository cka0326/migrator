import type { ValidationState } from '../../../types/models';
import { VALIDATION_STATES, VALIDATION_LABELS, VALIDATION_COLORS } from '../../../lib/migrationStatus';

// Horizontal stacked bar of a validation-state histogram, with legend + counts.
export function StackedBar({ hist, showLegend = true }: { hist: Record<ValidationState, number>; showLegend?: boolean }) {
  const total = VALIDATION_STATES.reduce((s, k) => s + hist[k], 0);
  if (total === 0) return <div className="text-xs text-slate-400 py-1">No mappings yet.</div>;
  let x = 0;
  return (
    <div>
      <svg viewBox="0 0 100 14" width="100%" height={14} preserveAspectRatio="none" className="rounded overflow-hidden">
        {VALIDATION_STATES.filter(k => hist[k] > 0).map(k => {
          const w = (hist[k] / total) * 100;
          const seg = <rect key={k} x={x} y={0} width={w} height={14} fill={VALIDATION_COLORS[k]} />;
          x += w;
          return seg;
        })}
      </svg>
      {showLegend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-600">
          {VALIDATION_STATES.map(k => (
            <span key={k} className="inline-flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: VALIDATION_COLORS[k] }} />
              {VALIDATION_LABELS[k]} <span className="font-semibold tabular-nums">{hist[k]}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
