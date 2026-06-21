// Self-contained visual snapshot of a dashboard model, as a standalone HTML string
// (inline CSS + inline SVG charts, no external assets). Used for the "Export HTML"
// download and the "Export PDF" path (open the HTML in a window and print → Save as PDF).

import { downloadBlob, slugify } from './download';
import type { DashboardModel } from './dashboardModel';
import {
  VALIDATION_LABELS, VALIDATION_COLORS, DERIVED_COLORS, VALIDATION_STATES,
} from './migrationStatus';
import type { TableNode, ValidationState } from '../types/models';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const qn = (n?: TableNode) => (n ? (n.namespace ? `${n.namespace}.${n.name}` : n.name) : '∅ deleted');

// Radial progress donut as inline SVG.
function donut(pct: number, label: string, color: string): string {
  const r = 42, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `<svg viewBox="0 0 110 110" width="120" height="120" role="img" aria-label="${esc(label)} ${pct}%">
    <circle cx="55" cy="55" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="11"/>
    <circle cx="55" cy="55" r="${r}" fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 55 55)"/>
    <text x="55" y="52" text-anchor="middle" font-size="22" font-weight="700" fill="#0f172a">${pct}%</text>
    <text x="55" y="70" text-anchor="middle" font-size="10" fill="#64748b">${esc(label)}</text>
  </svg>`;
}

// Horizontal stacked bar for a validation-state histogram.
function stacked(hist: Record<ValidationState, number>): string {
  const total = VALIDATION_STATES.reduce((s, k) => s + hist[k], 0);
  if (total === 0) return `<div class="muted">No mappings yet.</div>`;
  let x = 0;
  const segs = VALIDATION_STATES.filter(k => hist[k] > 0).map(k => {
    const w = (hist[k] / total) * 100; const seg =
      `<rect x="${x}" y="0" width="${w}" height="16" fill="${VALIDATION_COLORS[k]}"><title>${esc(VALIDATION_LABELS[k])}: ${hist[k]}</title></rect>`;
    x += w; return seg;
  }).join('');
  const legend = VALIDATION_STATES.map(k =>
    `<span class="lg"><i style="background:${VALIDATION_COLORS[k]}"></i>${esc(VALIDATION_LABELS[k])} ${hist[k]}</span>`).join('');
  return `<svg viewBox="0 0 100 16" width="100%" height="16" preserveAspectRatio="none">${segs}</svg><div class="legend">${legend}</div>`;
}

// Simple coverage line chart across canvases (trend scope).
function trendChart(model: DashboardModel): string {
  const pts = model.trend;
  if (pts.length < 2) return `<div class="muted">Need at least two canvases for a trend.</div>`;
  const W = 640, H = 200, padL = 36, padB = 28, padT = 12, padR = 12;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const x = (i: number) => padL + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
  const y = (v: number) => padT + innerH * (1 - v / 100);
  const line = (key: 'tableCoveragePct' | 'columnCoveragePct', color: string) => {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
    const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p[key]).toFixed(1)}" r="3" fill="${color}"/>`).join('');
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5"/>${dots}`;
  };
  const grid = [0, 25, 50, 75, 100].map(v =>
    `<line x1="${padL}" y1="${y(v)}" x2="${W - padR}" y2="${y(v)}" stroke="#eef2f7"/>
     <text x="${padL - 6}" y="${y(v) + 3}" text-anchor="end" font-size="9" fill="#94a3b8">${v}</text>`).join('');
  const labels = pts.map((p, i) =>
    `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#64748b">${esc(p.canvasName.slice(0, 12))}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:680px">
    ${grid}${line('columnCoveragePct', '#2563eb')}${line('tableCoveragePct', '#14b8a6')}${labels}
  </svg>
  <div class="legend"><span class="lg"><i style="background:#14b8a6"></i>Table coverage</span>
  <span class="lg"><i style="background:#2563eb"></i>Column coverage</span></div>`;
}

function entrySection(e: DashboardModel['entries'][number]): string {
  const s = e.status;
  const byId = new Map(e.nodes.map(n => [n.datasetId, n]));
  const rows = s.perMapping.map(m => `
    <tr>
      <td>${esc(qn(byId.get(m.legacyDatasetId)))}</td>
      <td>${esc(qn(byId.get(m.targetDatasetId)))}</td>
      <td class="num">${m.mappedColumnCount}/${Math.max(m.legacyColumnCount, m.targetColumnCount)}</td>
      <td class="num">${m.columnCoveragePct}%</td>
      <td class="num">${m.typeMismatches.length || ''}</td>
      <td><span class="chip" style="background:${DERIVED_COLORS[m.derived]}22;color:${DERIVED_COLORS[m.derived]}">${m.derived}</span></td>
      <td><span class="chip" style="background:${VALIDATION_COLORS[m.validationState]}22;color:#334155">${esc(VALIDATION_LABELS[m.validationState])}</span></td>
    </tr>`).join('');
  return `
  <section class="card">
    <h2>${esc(e.canvas.name)}</h2>
    <div class="kpis">
      ${donut(s.tableCoveragePct, 'Tables mapped', '#14b8a6')}
      ${donut(s.columnCoveragePct, 'Columns mapped', '#2563eb')}
      <div class="stat"><div class="big">${Math.max(s.mappedLegacyCount, s.mappedTargetCount)}/${Math.max(s.legacyTableCount, s.targetTableCount)}</div><div class="lbl">Tables mapped</div></div>
      <div class="stat"><div class="big" style="color:${s.mismatchCount ? '#dc2626' : '#0f172a'}">${s.mismatchCount}</div><div class="lbl">Type mismatches</div></div>
    </div>
    <div class="bar">${stacked(s.validationHistogram)}</div>
    ${s.perMapping.length ? `<table><thead><tr>
      <th>Legacy</th><th>Target</th><th class="num">Cols</th><th class="num">Cov</th><th class="num">Mism.</th><th>Derived</th><th>Validation</th>
    </tr></thead><tbody>${rows}</tbody></table>` : `<div class="muted">No table mappings in this canvas.</div>`}
  </section>`;
}

export function buildDashboardHTML(model: DashboardModel, name: string): string {
  const body = model.scope === 'trend'
    ? `<section class="card"><h2>Validation trend across canvases</h2>${trendChart(model)}</section>
       ${model.entries.map(entrySection).join('')}`
    : model.entries.length
      ? model.entries.map(entrySection).join('')
      : `<section class="card"><div class="muted">No canvas selected.</div></section>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(name)} — DataTrace dashboard</title>
<style>
  :root{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a}
  body{margin:0;background:#f1f5f9;padding:24px}
  header{max-width:920px;margin:0 auto 18px;display:flex;align-items:center;gap:10px}
  header h1{font-size:20px;margin:0}
  header .sub{color:#64748b;font-size:13px}
  .wrap{max-width:920px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
  .card h2{font-size:15px;margin:0 0 14px}
  .kpis{display:flex;flex-wrap:wrap;align-items:center;gap:22px;margin-bottom:14px}
  .stat .big{font-size:30px;font-weight:700;line-height:1}
  .stat .lbl{font-size:11px;color:#64748b;margin-top:4px}
  .bar{margin:6px 0 14px}
  .legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:11px;color:#475569}
  .legend .lg{display:inline-flex;align-items:center;gap:5px}
  .legend i{width:10px;height:10px;border-radius:2px;display:inline-block}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
  th,td{text-align:left;padding:7px 9px;border-bottom:1px solid #eef2f7}
  th{background:#f8fafc;font-weight:600;color:#475569}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .chip{display:inline-block;padding:1px 8px;border-radius:999px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
  .muted{color:#94a3b8;font-size:13px;padding:8px 0}
  svg{display:block}
  @media print{body{background:#fff;padding:0}.card{break-inside:avoid;box-shadow:none}}
</style></head>
<body>
  <header>
    <div>
      <h1>${esc(name)}</h1>
      <div class="sub">${esc(model.project?.name ?? 'Unknown project')} · scope: ${esc(model.scope)} · generated ${esc(new Date(model.generatedAt).toLocaleString())}</div>
    </div>
  </header>
  <div class="wrap">${body}</div>
</body></html>`;
}

export function exportDashboardHTML(model: DashboardModel, name: string): void {
  const html = buildDashboardHTML(model, name);
  downloadBlob(new Blob([html], { type: 'text/html' }), `dashboard-${slugify(name)}.html`);
}

// Print-to-PDF without a PDF library: open the report HTML in a new window and invoke
// the browser print dialog (user picks "Save as PDF"). Falls back to HTML download if
// the popup is blocked.
export function printDashboardPDF(model: DashboardModel, name: string): void {
  const html = buildDashboardHTML(model, name);
  const w = window.open('', '_blank');
  if (!w) { exportDashboardHTML(model, name); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Give the new document a tick to lay out before printing.
  w.onload = () => { w.focus(); w.print(); };
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* already printed */ } }, 400);
}
