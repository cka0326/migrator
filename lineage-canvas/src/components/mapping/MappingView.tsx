import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ColumnMappingEditor } from './ColumnMappingEditor';
import { Donut } from '../charts/Donut';
import { StackedBar } from '../charts/StackedBar';
import {
  canvasStatus, tableMappingStatus, VALIDATION_STATES, VALIDATION_LABELS, DERIVED_COLORS,
} from '../../lib/migrationStatus';
import { COMPARABLE_FIELDS } from '../../lib/compare';
import type { TableNode, ValidationState } from '../../types/models';
import {
  ArrowLeft, Wand2, Plus, Trash2, ChevronDown, ChevronRight, AlertTriangle, GitCompareArrows,
  GitCompare, SlidersHorizontal, X,
} from 'lucide-react';

const tableLabel = (t: TableNode) => (t.namespace ? `${t.namespace}.${t.name}` : t.name);

// A small curved connector tinted by the mapping's derived status.
function Connector({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 60 24" width={60} height={24} className="shrink-0">
      <path d="M2 12 C 22 12, 38 12, 50 12" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <path d="M44 6 L54 12 L44 18" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MappingView() {
  const setView = useStore(s => s.setView);
  const activeCanvasId = useStore(s => s.activeCanvasId);
  const activeProjectId = useStore(s => s.activeProjectId);
  const project = useStore(s => (activeProjectId ? s.projects[activeProjectId] : null));
  const canvas = useStore(s => (activeCanvasId ? s.canvases[activeCanvasId] : null));
  const nodes = useStore(s => s.nodes);
  const mappings = useStore(s => s.mappings);
  const createTableMapping = useStore(s => s.createTableMapping);
  const updateTableMapping = useStore(s => s.updateTableMapping);
  const deleteTableMapping = useStore(s => s.deleteTableMapping);
  const autoSuggestMappings = useStore(s => s.autoSuggestMappings);
  const openEphemeralComparison = useStore(s => s.openEphemeralComparison);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newLegacy, setNewLegacy] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Filter the mapping list by clicking a validation-state legend entry.
  const [filterState, setFilterState] = useState<ValidationState | null>(null);
  // Which column-metadata fields count toward the diff (shared with the compare
  // view; drives the per-pair "N diff" badges in each ColumnMappingEditor).
  const [includedFields, setIncludedFields] = useState<Set<string>>(new Set(COMPARABLE_FIELDS));
  const toggleField = (f: string) => setIncludedFields(prev => {
    const next = new Set(prev);
    next.has(f) ? next.delete(f) : next.add(f);
    return next;
  });

  const legacyLabel = project?.legacySystemName || 'Legacy';
  const targetLabel = project?.targetSystemName || 'Target';

  const nodeList = useMemo(() => Object.values(nodes), [nodes]);
  const mappingList = useMemo(
    () => Object.values(mappings).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [mappings],
  );
  const status = useMemo(() => canvasStatus(nodeList, mappingList), [nodeList, mappingList]);
  const byId = useMemo(() => new Map(nodeList.map(n => [n.datasetId, n])), [nodeList]);
  // The histogram always reflects every mapping; the list can be filtered by state.
  const visibleMappings = useMemo(
    () => (filterState ? mappingList.filter(m => m.validationState === filterState) : mappingList),
    [mappingList, filterState],
  );

  const mappedLegacy = new Set(mappingList.map(m => m.legacyDatasetId));
  const mappedTarget = new Set(mappingList.map(m => m.targetDatasetId));
  const availLegacy = nodeList.filter(n => n.system === 'LEGACY' && !mappedLegacy.has(n.datasetId));
  const availTarget = nodeList.filter(n => n.system === 'TARGET' && !mappedTarget.has(n.datasetId));

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleCreate = async () => {
    setError(null);
    if (!newLegacy || !newTarget) return;
    const err = await createTableMapping(newLegacy, newTarget);
    if (err) { setError(err); return; }
    setNewLegacy(''); setNewTarget('');
  };

  const handleAutoSuggest = async () => {
    if (!activeCanvasId) return;
    const n = await autoSuggestMappings(activeCanvasId);
    setError(n === 0 ? 'No new name-matched tables to map.' : null);
  };

  if (!activeCanvasId || !canvas) {
    return (
      <div className="flex h-full w-full items-center justify-center text-slate-400 text-sm">
        Open a canvas to define its table mappings.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => setView('canvas')}>
            <ArrowLeft className="mr-1" /> Back to canvas
          </Button>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 min-w-0">
            <GitCompareArrows size={16} className="shrink-0" />
            <span className="truncate">Mapping — {project?.name}</span>
            <span className="text-xs font-normal text-slate-400 truncate">· {canvas.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}>
              <SlidersHorizontal size={14} className="mr-1" />
              Compared fields ({includedFields.size}/{COMPARABLE_FIELDS.length})
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-0">
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-xs font-semibold text-slate-700">Compared fields</span>
                <div className="flex gap-1">
                  <button className="text-[11px] text-primary hover:underline" onClick={() => setIncludedFields(new Set(COMPARABLE_FIELDS))}>All</button>
                  <span className="text-slate-300">·</span>
                  <button className="text-[11px] text-primary hover:underline" onClick={() => setIncludedFields(new Set())}>None</button>
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {COMPARABLE_FIELDS.map(f => (
                  <label key={f} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" className="accent-primary" checked={includedFields.has(f)} onChange={() => toggleField(f)} />
                    <span className="text-slate-700">{f}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={handleAutoSuggest}>
            <Wand2 className="mr-1" /> Auto-suggest mappings
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Summary card with coverage visuals */}
          <div className="border rounded-lg bg-white p-4 flex flex-wrap items-center gap-6">
            <Donut pct={status.tableCoveragePct} label="Tables mapped" color="#14b8a6" />
            <Donut pct={status.columnCoveragePct} label="Columns mapped" color="#2563eb" />
            <div className="flex flex-col gap-1 text-sm">
              <div><span className="font-semibold tabular-nums">{Math.max(status.mappedLegacyCount, status.mappedTargetCount)}</span> of <span className="tabular-nums">{Math.max(status.legacyTableCount, status.targetTableCount)}</span> tables mapped</div>
              <div className="text-slate-500">{legacyLabel}: {status.legacyTableCount} · {targetLabel}: {status.targetTableCount}</div>
              <div className={status.mismatchCount ? 'text-red-600 font-medium' : 'text-slate-500'}>
                {status.mismatchCount} table{status.mismatchCount === 1 ? '' : 's'} with type mismatches
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Validation state</div>
                {filterState && (
                  <button
                    onClick={() => setFilterState(null)}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    <X size={11} /> Clear filter
                  </button>
                )}
              </div>
              <StackedBar
                hist={status.validationHistogram}
                activeState={filterState}
                onSelectState={(s) => setFilterState(prev => (prev === s ? null : s))}
              />
              {filterState && (
                <div className="text-[11px] text-slate-500 mt-1">
                  Showing {VALIDATION_LABELS[filterState]} · {visibleMappings.length} of {mappingList.length}
                </div>
              )}
            </div>
          </div>

          {/* Create a new mapping */}
          <div className="border rounded-lg bg-white p-3">
            <div className="grid grid-cols-[1fr_auto_1fr_auto] items-end gap-2">
              <div>
                <label className="text-[11px] text-slate-500 font-medium">{legacyLabel} table (Legacy)</label>
                <Select value={newLegacy} onValueChange={setNewLegacy}>
                  <SelectTrigger className="h-8 text-xs min-w-0">
                    <SelectValue placeholder="Select legacy table">
                      {(v: string) => { const t = byId.get(v); return t ? tableLabel(t) : 'Select legacy table'; }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availLegacy.length === 0 && <SelectItem value="__none" disabled>No unmapped legacy tables</SelectItem>}
                    {availLegacy.map(t => <SelectItem key={t.datasetId} value={t.datasetId}>{tableLabel(t)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="pb-1.5 text-slate-300"><ChevronRight size={16} /></div>
              <div>
                <label className="text-[11px] text-slate-500 font-medium">{targetLabel} table (Target)</label>
                <Select value={newTarget} onValueChange={setNewTarget}>
                  <SelectTrigger className="h-8 text-xs min-w-0">
                    <SelectValue placeholder="Select target table">
                      {(v: string) => { const t = byId.get(v); return t ? tableLabel(t) : 'Select target table'; }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availTarget.length === 0 && <SelectItem value="__none" disabled>No unmapped target tables</SelectItem>}
                    {availTarget.map(t => <SelectItem key={t.datasetId} value={t.datasetId}>{tableLabel(t)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={handleCreate} disabled={!newLegacy || !newTarget}><Plus className="mr-1" /> Map</Button>
            </div>
            {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
          </div>

          {/* Mapping cards */}
          {mappingList.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-10">
              No table mappings yet. Use <span className="font-medium">Auto-suggest</span> or map a pair above.
            </div>
          ) : visibleMappings.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-10">
              No mappings are <span className="font-medium">{filterState ? VALIDATION_LABELS[filterState] : ''}</span>.{' '}
              <button className="text-primary hover:underline" onClick={() => setFilterState(null)}>Clear filter</button>
            </div>
          ) : (
            visibleMappings.map(m => {
              const legacyNode = byId.get(m.legacyDatasetId);
              const targetNode = byId.get(m.targetDatasetId);
              const st = tableMappingStatus(m, legacyNode, targetNode);
              const isOpen = expanded.has(m.id);
              const color = DERIVED_COLORS[st.derived];
              const canCompare = !!legacyNode && !!targetNode && !!activeProjectId;
              const openTableCompare = () => {
                if (!canCompare) return;
                openEphemeralComparison({
                  mode: 'systems',
                  projectId: activeProjectId!,
                  title: `${tableLabel(legacyNode!)} ↔ ${tableLabel(targetNode!)}`,
                  left: { datasetId: m.legacyDatasetId },
                  right: { datasetId: m.targetDatasetId },
                  alignPairs: m.columnMappings.map(p => ({ legacy: p.legacyColumn, target: p.targetColumn })),
                  returnTo: 'mapping',
                });
              };
              return (
                <div key={m.id} className="border rounded-lg bg-white overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <button onClick={() => toggle(m.id)} className="text-slate-400 hover:text-slate-700 shrink-0">
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {/* legacy ↔ target with connector */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="min-w-0 flex-1 text-right">
                        <div className="text-sm font-medium font-mono truncate">{legacyNode ? tableLabel(legacyNode) : '∅ deleted'}</div>
                        <div className="text-[10px] text-slate-400">{legacyLabel} · {st.legacyColumnCount} cols</div>
                      </div>
                      <Connector color={color} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium font-mono truncate">{targetNode ? tableLabel(targetNode) : '∅ deleted'}</div>
                        <div className="text-[10px] text-slate-400">{targetLabel} · {st.targetColumnCount} cols</div>
                      </div>
                    </div>
                    {/* status chips */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide"
                        style={{ background: `${color}22`, color }}>{st.derived}</span>
                      <span className="text-[10px] text-slate-500 tabular-nums">{st.columnCoveragePct}% cols</span>
                      {st.typeMismatches.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                          <AlertTriangle size={11} /> {st.typeMismatches.length}
                        </span>
                      )}
                      <Button
                        size="xs" variant="outline" onClick={openTableCompare} disabled={!canCompare}
                        title="Open a temporary table comparison for this mapped pair"
                      >
                        <GitCompare className="mr-1" /> Compare
                      </Button>
                      <Select value={m.validationState} onValueChange={(v) => updateTableMapping(m.id, { validationState: v as ValidationState })}>
                        <SelectTrigger className="h-7 text-xs w-[130px]">
                          <SelectValue>{(v: string) => VALIDATION_LABELS[(v || 'NOT_STARTED') as ValidationState]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {VALIDATION_STATES.map(s => <SelectItem key={s} value={s}>{VALIDATION_LABELS[s]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <button onClick={() => deleteTableMapping(m.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {isOpen && (
                    <ColumnMappingEditor
                      mapping={m} legacyNode={legacyNode} targetNode={targetNode}
                      legacyLabel={legacyLabel} targetLabel={targetLabel}
                      includedFields={includedFields}
                    />
                  )}
                </div>
              );
            })
          )}

          {/* Unmapped tables overview */}
          {(availLegacy.length > 0 || availTarget.length > 0) && (
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 mb-2">Unmapped {legacyLabel}</div>
                {availLegacy.length === 0 ? <div className="text-xs text-slate-400">All mapped 🎉</div> : (
                  <div className="flex flex-wrap gap-1.5">
                    {availLegacy.map(t => <span key={t.datasetId} className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700">{tableLabel(t)}</span>)}
                  </div>
                )}
              </div>
              <div className="border rounded-lg bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-700 mb-2">Unmapped {targetLabel}</div>
                {availTarget.length === 0 ? <div className="text-xs text-slate-400">All mapped 🎉</div> : (
                  <div className="flex flex-wrap gap-1.5">
                    {availTarget.map(t => <span key={t.datasetId} className="text-[11px] font-mono px-2 py-0.5 rounded bg-teal-50 text-teal-700">{tableLabel(t)}</span>)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
