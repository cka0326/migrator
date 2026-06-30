import{a as e,i as t,n,r}from"./index-DO0UUkNJ.js";import{n as i,t as a}from"./download-DAP42NLz.js";var o=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),s=e=>e?e.namespace?`${e.namespace}.${e.name}`:e.name:`∅ deleted`;function c(e,t,n){let r=2*Math.PI*42,i=r*(1-Math.max(0,Math.min(100,e))/100);return`<svg viewBox="0 0 110 110" width="120" height="120" role="img" aria-label="${o(t)} ${e}%">
    <circle cx="55" cy="55" r="42" fill="none" stroke="#e2e8f0" stroke-width="11"/>
    <circle cx="55" cy="55" r="42" fill="none" stroke="${n}" stroke-width="11" stroke-linecap="round"
      stroke-dasharray="${r.toFixed(1)}" stroke-dashoffset="${i.toFixed(1)}" transform="rotate(-90 55 55)"/>
    <text x="55" y="52" text-anchor="middle" font-size="22" font-weight="700" fill="#0f172a">${e}%</text>
    <text x="55" y="70" text-anchor="middle" font-size="10" fill="#64748b">${o(t)}</text>
  </svg>`}function l(n){let i=e.reduce((e,t)=>e+n[t],0);if(i===0)return`<div class="muted">No mappings yet.</div>`;let a=0;return`<svg viewBox="0 0 100 16" width="100%" height="16" preserveAspectRatio="none">${e.filter(e=>n[e]>0).map(e=>{let s=n[e]/i*100,c=`<rect x="${a}" y="0" width="${s}" height="16" fill="${r[e]}"><title>${o(t[e])}: ${n[e]}</title></rect>`;return a+=s,c}).join(``)}</svg><div class="legend">${e.map(e=>`<span class="lg"><i style="background:${r[e]}"></i>${o(t[e])} ${n[e]}</span>`).join(``)}</div>`}function u(e){let t=e.trend;if(t.length<2)return`<div class="muted">Need at least two canvases for a trend.</div>`;let n=e=>36+(t.length===1?592/2:e/(t.length-1)*592),r=e=>12+160*(1-e/100),i=(e,i)=>`<path d="${t.map((t,i)=>`${i?`L`:`M`}${n(i).toFixed(1)} ${r(t[e]).toFixed(1)}`).join(` `)}" fill="none" stroke="${i}" stroke-width="2.5"/>${t.map((t,a)=>`<circle cx="${n(a).toFixed(1)}" cy="${r(t[e]).toFixed(1)}" r="3" fill="${i}"/>`).join(``)}`,a=[0,25,50,75,100].map(e=>`<line x1="36" y1="${r(e)}" x2="628" y2="${r(e)}" stroke="#eef2f7"/>
     <text x="30" y="${r(e)+3}" text-anchor="end" font-size="9" fill="#94a3b8">${e}</text>`).join(``),s=t.map((e,t)=>`<text x="${n(t).toFixed(1)}" y="192" text-anchor="middle" font-size="9" fill="#64748b">${o(e.canvasName.slice(0,12))}</text>`).join(``);return`<svg viewBox="0 0 640 200" width="100%" style="max-width:680px">
    ${a}${i(`columnCoveragePct`,`#2563eb`)}${i(`tableCoveragePct`,`#14b8a6`)}${s}
  </svg>
  <div class="legend"><span class="lg"><i style="background:#14b8a6"></i>Table coverage</span>
  <span class="lg"><i style="background:#2563eb"></i>Column coverage</span></div>`}function d(e){let i=e.status,a=new Map(e.nodes.map(e=>[e.datasetId,e])),u=i.perMapping.map(e=>`
    <tr>
      <td>${o(s(a.get(e.legacyDatasetId)))}</td>
      <td>${o(s(a.get(e.targetDatasetId)))}</td>
      <td class="num">${e.mappedColumnCount}/${Math.max(e.legacyColumnCount,e.targetColumnCount)}</td>
      <td class="num">${e.columnCoveragePct}%</td>
      <td class="num">${e.typeMismatches.length||``}</td>
      <td><span class="chip" style="background:${n[e.derived]}22;color:${n[e.derived]}">${e.derived}</span></td>
      <td><span class="chip" style="background:${r[e.validationState]}22;color:#334155">${o(t[e.validationState])}</span></td>
    </tr>`).join(``);return`
  <section class="card">
    <h2>${o(e.canvas.name)}</h2>
    <div class="kpis">
      ${c(i.tableCoveragePct,`Tables mapped`,`#14b8a6`)}
      ${c(i.columnCoveragePct,`Columns mapped`,`#2563eb`)}
      <div class="stat"><div class="big">${Math.max(i.mappedLegacyCount,i.mappedTargetCount)}/${Math.max(i.legacyTableCount,i.targetTableCount)}</div><div class="lbl">Tables mapped</div></div>
      <div class="stat"><div class="big" style="color:${i.mismatchCount?`#dc2626`:`#0f172a`}">${i.mismatchCount}</div><div class="lbl">Type mismatches</div></div>
    </div>
    <div class="bar">${l(i.validationHistogram)}</div>
    ${i.perMapping.length?`<table><thead><tr>
      <th>Legacy</th><th>Target</th><th class="num">Cols</th><th class="num">Cov</th><th class="num">Mism.</th><th>Derived</th><th>Validation</th>
    </tr></thead><tbody>${u}</tbody></table>`:`<div class="muted">No table mappings in this canvas.</div>`}
  </section>`}function f(e,t){let n=e.scope===`trend`?`<section class="card"><h2>Validation trend across canvases</h2>${u(e)}</section>
       ${e.entries.map(d).join(``)}`:e.entries.length?e.entries.map(d).join(``):`<section class="card"><div class="muted">No canvas selected.</div></section>`;return`<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${o(t)} — DataTrace dashboard</title>
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
      <h1>${o(t)}</h1>
      <div class="sub">${o(e.project?.name??`Unknown project`)} · scope: ${o(e.scope)} · generated ${o(new Date(e.generatedAt).toLocaleString())}</div>
    </div>
  </header>
  <div class="wrap">${n}</div>
</body></html>`}function p(e,t){let n=f(e,t);a(new Blob([n],{type:`text/html`}),`dashboard-${i(t)}.html`)}function m(e,t){let n=f(e,t),r=window.open(``,`_blank`);if(!r){p(e,t);return}r.document.open(),r.document.write(n),r.document.close(),r.onload=()=>{r.focus(),r.print()},setTimeout(()=>{try{r.focus(),r.print()}catch{}},400)}export{f as buildDashboardHTML,p as exportDashboardHTML,m as printDashboardPDF};