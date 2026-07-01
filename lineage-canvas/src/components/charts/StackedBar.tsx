import type { ValidationState } from '../../types/models';
import { VALIDATION_STATES, VALIDATION_LABELS, VALIDATION_COLORS } from '../../lib/migrationStatus';

// Horizontal stacked bar of a validation-state histogram, with legend + counts.
// When `onSelectState` is provided the legend entries act as toggle filters:
// clicking one highlights it (and dims the rest) and reports the selection.
export function StackedBar({
  hist,
  showLegend = true,
  activeState = null,
  onSelectState,
}: {
  hist: Record<ValidationState, number>;
  showLegend?: boolean;
  activeState?: ValidationState | null;
  onSelectState?: (s: ValidationState) => void;
}) {
  const total = VALIDATION_STATES.reduce((s, k) => s + hist[k], 0);
  if (total === 0) return <div className="text-xs text-slate-400 py-1">No mappings yet.</div>;
  let x = 0;
  const clickable = !!onSelectState;
  return (
    <div>
      <svg viewBox="0 0 100 14" width="100%" height={14} preserveAspectRatio="none" className="rounded overflow-hidden">
        {VALIDATION_STATES.filter(k => hist[k] > 0).map(k => {
          const w = (hist[k] / total) * 100;
          const dim = activeState && activeState !== k;
          const seg = <rect key={k} x={x} y={0} width={w} height={14} fill={VALIDATION_COLORS[k]} opacity={dim ? 0.3 : 1} />;
          x += w;
          return seg;
        })}
      </svg>
      {showLegend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-600">
          {VALIDATION_STATES.map(k => {
            const isActive = activeState === k;
            const content = (
              <>
                <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: VALIDATION_COLORS[k] }} />
                {VALIDATION_LABELS[k]} <span className="font-semibold tabular-nums">{hist[k]}</span>
              </>
            );
            if (!clickable) {
              return <span key={k} className="inline-flex items-center gap-1">{content}</span>;
            }
            return (
              <button
                key={k}
                type="button"
                onClick={() => onSelectState!(k)}
                title={`Show only "${VALIDATION_LABELS[k]}" mappings`}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 border transition-colors ${
                  isActive ? 'border-slate-400 bg-slate-100' : 'border-transparent hover:bg-slate-100'
                } ${activeState && !isActive ? 'opacity-50' : ''}`}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
