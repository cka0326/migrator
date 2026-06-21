import type { TrendPoint } from '../../../lib/migrationStatus';

// Two-line coverage trend across a project's canvases (time-ordered).
export function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) {
    return <div className="text-xs text-slate-400 py-4">Need at least two canvases in this project to show a trend.</div>;
  }
  const W = 680, H = 220, padL = 36, padB = 30, padT = 12, padR = 12;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const x = (i: number) => padL + (i / (points.length - 1)) * innerW;
  const y = (v: number) => padT + innerH * (1 - v / 100);

  const renderLine = (key: 'tableCoveragePct' | 'columnCoveragePct', color: string) => {
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
    return (
      <g key={key}>
        <path d={d} fill="none" stroke={color} strokeWidth={2.5} />
        {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p[key])} r={3.5} fill={color} />)}
      </g>
    );
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 720 }}>
        {[0, 25, 50, 75, 100].map(v => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="#eef2f7" />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{v}</text>
          </g>
        ))}
        {renderLine('columnCoveragePct', '#2563eb')}
        {renderLine('tableCoveragePct', '#14b8a6')}
        {points.map((p, i) => (
          <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize={9} fill="#64748b">
            {p.canvasName.length > 12 ? p.canvasName.slice(0, 11) + '…' : p.canvasName}
          </text>
        ))}
      </svg>
      <div className="flex gap-4 mt-1 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#14b8a6' }} />Table coverage</span>
        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#2563eb' }} />Column coverage</span>
      </div>
    </div>
  );
}
