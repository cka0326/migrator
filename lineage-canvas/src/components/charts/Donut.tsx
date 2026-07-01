// Radial progress donut (dependency-free SVG).
interface DonutProps {
  pct: number;
  label: string;
  color: string;
  size?: number;
  sublabel?: string;
}

export function Donut({ pct, label, color, size = 120, sublabel }: DonutProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const r = 42;
  const c = 2 * Math.PI * r;
  const off = c * (1 - clamped / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 110 110" width={size} height={size} role="img" aria-label={`${label} ${clamped}%`}>
        <circle cx="55" cy="55" r={r} fill="none" stroke="#e2e8f0" strokeWidth="11" />
        <circle
          cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={c.toFixed(1)} strokeDashoffset={off.toFixed(1)}
          transform="rotate(-90 55 55)" style={{ transition: 'stroke-dashoffset .4s ease' }}
        />
        {/* Only the percentage sits inside the ring, centered — the label lives below
            so long labels can't overflow into / be clipped by the ring. */}
        <text x="55" y="55" textAnchor="middle" dominantBaseline="central" fontSize="24" fontWeight="700" fill="#0f172a">{clamped}%</text>
      </svg>
      <span className="text-xs font-medium text-slate-600 text-center leading-tight">{label}</span>
      {sublabel && <span className="text-[11px] text-slate-500 text-center leading-tight">{sublabel}</span>}
    </div>
  );
}
