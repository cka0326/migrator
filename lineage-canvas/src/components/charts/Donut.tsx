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
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 110 110" width={size} height={size} role="img" aria-label={`${label} ${clamped}%`}>
        <circle cx="55" cy="55" r={r} fill="none" stroke="#e2e8f0" strokeWidth="11" />
        <circle
          cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={c.toFixed(1)} strokeDashoffset={off.toFixed(1)}
          transform="rotate(-90 55 55)" style={{ transition: 'stroke-dashoffset .4s ease' }}
        />
        <text x="55" y="52" textAnchor="middle" fontSize="22" fontWeight="700" fill="#0f172a">{clamped}%</text>
        <text x="55" y="70" textAnchor="middle" fontSize="10" fill="#64748b">{label}</text>
      </svg>
      {sublabel && <span className="text-[11px] text-slate-500 -mt-1">{sublabel}</span>}
    </div>
  );
}
