import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Donut } from './charts/Donut';
import { StackedBar } from './charts/StackedBar';
import { TrendChart } from './charts/TrendChart';
import { resolveDashboardModel, type DashboardModel, type CanvasStatusEntry } from '../../lib/dashboardModel';
import { VALIDATION_LABELS, DERIVED_COLORS } from '../../lib/migrationStatus';
import type { DashboardScope, SavedDashboard, TableNode } from '../../types/models';
import { ArrowLeft, LayoutDashboard, Save, Download, FileText, FileType, FileArchive, AlertTriangle } from 'lucide-react';

const qn = (n?: TableNode) => (n ? (n.namespace ? `${n.namespace}.${n.name}` : n.name) : '∅ deleted');

function SnapshotEntry({ entry, legacyLabel, targetLabel }: { entry: CanvasStatusEntry; legacyLabel: string; targetLabel: string }) {
  const s = entry.status;
  const byId = new Map(entry.nodes.map(n => [n.datasetId, n]));
  return (
    <div className="space-y-4">
      <div className="border rounded-lg bg-white p-4 flex flex-wrap items-center gap-6">
        <Donut pct={s.tableCoveragePct} label="Tables mapped" color="#14b8a6" />
        <Donut pct={s.columnCoveragePct} label="Columns mapped" color="#2563eb" />
        <div className="flex flex-col gap-1 text-sm">
          <div><span className="font-semibold tabular-nums">{Math.max(s.mappedLegacyCount, s.mappedTargetCount)}</span> of <span className="tabular-nums">{Math.max(s.legacyTableCount, s.targetTableCount)}</span> tables mapped</div>
          <div className="text-slate-500">{legacyLabel}: {s.legacyTableCount} · {targetLabel}: {s.targetTableCount}</div>
          <div className={s.mismatchCount ? 'text-red-600 font-medium' : 'text-slate-500'}>{s.mismatchCount} with type mismatches</div>
          <div className="text-slate-500">{s.totalMappedColumns} of {s.totalComparableColumns} columns paired</div>
        </div>
        <div className="flex-1 min-w-[220px]">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Validation state</div>
          <StackedBar hist={s.validationHistogram} />
        </div>
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b text-xs font-semibold text-slate-700">Table-by-table status</div>
        {s.perMapping.length === 0 ? (
          <div className="px-3 py-6 text-center text-slate-400 text-sm">No table mappings — define them in the Mapping view.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">{legacyLabel}</th>
                <th className="text-left px-3 py-2 font-semibold">{targetLabel}</th>
                <th className="text-right px-3 py-2 font-semibold w-[90px]">Columns</th>
                <th className="text-right px-3 py-2 font-semibold w-[70px]">Coverage</th>
                <th className="text-left px-3 py-2 font-semibold w-[110px]">Derived</th>
                <th className="text-left px-3 py-2 font-semibold w-[130px]">Validation</th>
                <th className="text-left px-3 py-2 font-semibold">Mismatches</th>
              </tr>
            </thead>
            <tbody>
              {s.perMapping.map(m => {
                const color = DERIVED_COLORS[m.derived];
                return (
                  <tr key={m.mappingId} className="border-b last:border-0 align-top">
                    <td className="px-3 py-2 font-mono">{qn(byId.get(m.legacyDatasetId))}</td>
                    <td className="px-3 py-2 font-mono">{qn(byId.get(m.targetDatasetId))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.mappedColumnCount}/{Math.max(m.legacyColumnCount, m.targetColumnCount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.columnCoveragePct}%</td>
                    <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: `${color}22`, color }}>{m.derived}</span></td>
                    <td className="px-3 py-2">{VALIDATION_LABELS[m.validationState]}</td>
                    <td className="px-3 py-2">
                      {m.typeMismatches.length === 0 ? <span className="text-slate-400">—</span> : (
                        <div className="space-y-0.5">
                          {m.typeMismatches.map((mm, i) => (
                            <div key={i} className="inline-flex items-center gap-1 text-amber-700">
                              <AlertTriangle size={11} className="shrink-0" />
                              <span className="font-mono">{mm.legacyColumn} ({mm.legacyType}) → {mm.targetColumn} ({mm.targetType})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {(s.unmappedLegacy.length > 0 || s.unmappedTarget.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded-lg bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 mb-2">Unmapped {legacyLabel} ({s.unmappedLegacy.length})</div>
            <div className="flex flex-wrap gap-1.5">{s.unmappedLegacy.map(t => <span key={t.datasetId} className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700">{qn(t)}</span>)}</div>
          </div>
          <div className="border rounded-lg bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-700 mb-2">Unmapped {targetLabel} ({s.unmappedTarget.length})</div>
            <div className="flex flex-wrap gap-1.5">{s.unmappedTarget.map(t => <span key={t.datasetId} className="text-[11px] font-mono px-2 py-0.5 rounded bg-teal-50 text-teal-700">{qn(t)}</span>)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardView() {
  const setView = useStore(s => s.setView);
  const projects = useStore(s => s.projects);
  const canvases = useStore(s => s.canvases);
  const dashboards = useStore(s => s.dashboards);
  const activeDashboardId = useStore(s => s.activeDashboardId);
  const activeProjectId = useStore(s => s.activeProjectId);
  const saveDashboard = useStore(s => s.saveDashboard);

  const savedDashboard = activeDashboardId ? dashboards[activeDashboardId] : null;

  const [scope, setScope] = useState<DashboardScope>('canvas');
  const [projectId, setProjectId] = useState<string>('');
  const [canvasId, setCanvasId] = useState<string>('');
  const [model, setModel] = useState<DashboardModel | null>(null);
  const [loading, setLoading] = useState(false);

  const projectOptions = useMemo(() => Object.values(projects).sort((a, b) => a.name.localeCompare(b.name)), [projects]);
  const projectCanvases = useMemo(
    () => Object.values(canvases).filter(c => c.projectId === projectId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [canvases, projectId],
  );
  const project = projectId ? projects[projectId] : null;
  const legacyLabel = project?.legacySystemName || 'Legacy';
  const targetLabel = project?.targetSystemName || 'Target';

  // Initialise selection from a saved dashboard or the active project.
  useEffect(() => {
    if (savedDashboard) {
      setScope(savedDashboard.scope);
      setProjectId(savedDashboard.projectId);
      setCanvasId(savedDashboard.canvasId ?? '');
    } else {
      setProjectId(prev => prev || activeProjectId || projectOptions[0]?.id || '');
    }
  }, [savedDashboard, activeProjectId, projectOptions]);

  // Default the canvas selection when a project is chosen for snapshot scope.
  useEffect(() => {
    if (scope === 'canvas' && !canvasId && projectCanvases.length) setCanvasId(projectCanvases[0].id);
  }, [scope, canvasId, projectCanvases]);

  // (Re)load the computed model whenever the selection changes.
  useEffect(() => {
    if (!projectId) { setModel(null); return; }
    if (scope === 'canvas' && !canvasId) { setModel(null); return; }
    let cancelled = false;
    setLoading(true);
    resolveDashboardModel({ scope, projectId, canvasId: scope === 'canvas' ? canvasId : undefined })
      .then(m => { if (!cancelled) setModel(m); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scope, projectId, canvasId]);

  const ephemeralDashboard = (): SavedDashboard => ({
    id: savedDashboard?.id ?? uuidv4(),
    name: savedDashboard?.name ?? `${project?.name ?? 'Migration'} — ${scope === 'trend' ? 'trend' : 'snapshot'}`,
    scope, projectId, canvasId: scope === 'canvas' ? canvasId : undefined,
    createdAt: savedDashboard?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const handleSave = async () => {
    if (!projectId) return;
    const name = window.prompt('Save dashboard as:', savedDashboard?.name ?? `${project?.name ?? ''} ${scope}`);
    if (!name || !name.trim()) return;
    await saveDashboard({ ...ephemeralDashboard(), name: name.trim() });
  };

  const dashName = savedDashboard?.name ?? `${project?.name ?? 'Migration'} — ${scope === 'trend' ? 'trend' : 'snapshot'}`;

  const exportZip = async () => {
    const { exportDashboardBundle } = await import('../../lib/dashboardBundle');
    await exportDashboardBundle(ephemeralDashboard());
  };
  const exportHtml = async () => {
    if (!model) return;
    const { exportDashboardHTML } = await import('../../lib/dashboardReport');
    exportDashboardHTML(model, dashName);
  };
  const exportPdf = async () => {
    if (!model) return;
    const { printDashboardPDF } = await import('../../lib/dashboardReport');
    printDashboardPDF(model, dashName);
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-background flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => setView('canvas')}>
            <ArrowLeft className="mr-1" /> Back to canvas
          </Button>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 min-w-0">
            <LayoutDashboard size={16} className="shrink-0" />
            <span className="truncate">Migration Status{savedDashboard ? ` — ${savedDashboard.name}` : ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Project */}
          <Select value={projectId} onValueChange={(v) => { setProjectId(v); setCanvasId(''); }}>
            <SelectTrigger className="h-8 text-xs w-[180px]">
              <SelectValue placeholder="Project">{(v: string) => projects[v]?.name ?? 'Project'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {projectOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Scope toggle */}
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-md p-0.5">
            <button onClick={() => setScope('canvas')} className={`px-2.5 py-1 text-xs font-medium rounded ${scope === 'canvas' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Snapshot</button>
            <button onClick={() => setScope('trend')} className={`px-2.5 py-1 text-xs font-medium rounded ${scope === 'trend' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Trend</button>
          </div>
          {/* Canvas (snapshot only) */}
          {scope === 'canvas' && (
            <Select value={canvasId} onValueChange={setCanvasId} disabled={!projectId}>
              <SelectTrigger className="h-8 text-xs w-[160px]">
                <SelectValue placeholder="Canvas">{(v: string) => canvases[v]?.name ?? 'Canvas'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projectCanvases.length === 0 && <SelectItem value="__none" disabled>No canvases</SelectItem>}
                {projectCanvases.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={handleSave} disabled={!projectId}>
            <Save className="mr-1" /> {savedDashboard ? 'Update' : 'Save'}
          </Button>
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" disabled={!model} />}>
              <Download className="mr-1" /> Export
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1">
              <button onClick={exportZip} className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-slate-100 text-left">
                <FileArchive size={14} /> Data bundle (.zip)
              </button>
              <button onClick={exportHtml} className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-slate-100 text-left">
                <FileText size={14} /> Standalone HTML
              </button>
              <button onClick={exportPdf} className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-slate-100 text-left">
                <FileType size={14} /> PDF (print / save as PDF)
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-5xl mx-auto">
          {!projectId ? (
            <div className="text-center text-slate-400 text-sm py-16">Pick a project to see its migration status.</div>
          ) : loading ? (
            <div className="text-center text-slate-400 text-sm py-16">Loading…</div>
          ) : !model ? (
            <div className="text-center text-slate-400 text-sm py-16">{scope === 'canvas' ? 'Select a canvas.' : 'No canvases in this project.'}</div>
          ) : scope === 'trend' ? (
            <div className="space-y-4">
              <div className="border rounded-lg bg-white p-4">
                <div className="text-sm font-semibold text-slate-700 mb-3">Validation trend across canvases</div>
                <TrendChart points={model.trend} />
              </div>
              <div className="border rounded-lg bg-white overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b text-xs font-semibold text-slate-700">Per-canvas summary</div>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Canvas</th>
                      <th className="text-right px-3 py-2 font-semibold">Tables mapped</th>
                      <th className="text-right px-3 py-2 font-semibold">Table cov.</th>
                      <th className="text-right px-3 py-2 font-semibold">Column cov.</th>
                      <th className="text-right px-3 py-2 font-semibold">Validated</th>
                      <th className="text-right px-3 py-2 font-semibold">Mismatches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.trend.map(p => (
                      <tr key={p.canvasId} className="border-b last:border-0">
                        <td className="px-3 py-2">{p.canvasName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.mappedTables}/{p.totalTables}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.tableCoveragePct}%</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.columnCoveragePct}%</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.validationHistogram.VALIDATED}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${p.mismatchCount ? 'text-red-600 font-medium' : ''}`}>{p.mismatchCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : model.entries[0] ? (
            <SnapshotEntry entry={model.entries[0]} legacyLabel={legacyLabel} targetLabel={targetLabel} />
          ) : (
            <div className="text-center text-slate-400 text-sm py-16">Select a canvas.</div>
          )}
        </div>
      </div>
    </div>
  );
}
