import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../store/useStore';
import { Repository } from '../../db/repository';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { compareTables, compareColumnPair, compareTableMetadata, COMPARABLE_FIELDS } from '../../lib/compare';
import type { TableNode, ColumnDef, System, Canvas, Project, ComparisonMode, ComparisonEndpoint, ColumnPair, SavedComparison } from '../../types/models';
import { ArrowLeft, GitCompare, Plus, Save, Trash2, ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-react';

const canvasOf = (datasetId: string) => datasetId.slice(0, datasetId.indexOf('::'));

// Tables are identified by namespace.table, so always show the qualified name.
const tableLabel = (t: TableNode) => (t.namespace ? `${t.namespace}.${t.name}` : t.name);

interface ColEndpoint { canvasId?: string; tableId?: string; column?: string }
interface ProjSel { projectId?: string; canvasId?: string; tableId?: string }

interface TablePickerProps {
  title: string;
  accent: string;
  canvasOptions: { id: string; name: string }[];
  canvasId: string | null;
  onCanvasChange: (id: string) => void;
  tables: TableNode[];
  tableId: string | null;
  onTableChange: (id: string) => void;
  systemLabel: (s: System) => string;
}

function TablePicker(props: TablePickerProps) {
  const { title, accent, canvasOptions, canvasId, onCanvasChange, tables, tableId, onTableChange, systemLabel } = props;
  return (
    <div className="flex flex-col min-w-0">
      <div className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-b ${accent}`}>{title}</div>
      <div className="p-3 space-y-2 border-b bg-white">
        <div className="min-w-0">
          <label className="text-[11px] text-slate-500 font-medium">Canvas (snapshot)</label>
          <Select value={canvasId || ''} onValueChange={onCanvasChange}>
            <SelectTrigger className="h-8 text-xs w-full min-w-0">
              <SelectValue placeholder="Select canvas">
                {(v: string) => canvasOptions.find(c => c.id === v)?.name ?? 'Select canvas'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {canvasOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <label className="text-[11px] text-slate-500 font-medium">Table</label>
          <Select value={tableId || ''} onValueChange={onTableChange} disabled={!canvasId}>
            <SelectTrigger className="h-8 text-xs w-full min-w-0">
              <SelectValue placeholder="Select table">
                {(v: string) => {
                  const t = tables.find(t => t.datasetId === v);
                  return t ? `${tableLabel(t)} · ${systemLabel(t.system)}` : 'Select table';
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {tables.length === 0 && <SelectItem value="__none" disabled>No tables</SelectItem>}
              {tables.map(t => (
                <SelectItem key={t.datasetId} value={t.datasetId}>{tableLabel(t)} · {systemLabel(t.system)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

interface ProjectTablePickerProps {
  title: string;
  accent: string;
  projectOptions: Project[];
  allCanvases: Canvas[];
  tablesByCanvas: Record<string, TableNode[]>;
  value: ProjSel;
  onChange: (v: ProjSel) => void;
  systemLabel: (s: System) => string;
}

function ProjectTablePicker({ title, accent, projectOptions, allCanvases, tablesByCanvas, value, onChange, systemLabel }: ProjectTablePickerProps) {
  const canvasOptions = value.projectId ? allCanvases.filter(c => c.projectId === value.projectId) : [];
  const tables = value.canvasId ? (tablesByCanvas[value.canvasId] || []) : [];
  return (
    <div className="flex flex-col min-w-0">
      <div className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-b ${accent}`}>{title}</div>
      <div className="p-3 flex flex-col gap-2 border-b bg-white">
        <div className="min-w-0">
          <label className="text-[11px] text-slate-500 font-medium">Project</label>
          <Select value={value.projectId || ''} onValueChange={(v) => onChange({ projectId: v })}>
            <SelectTrigger className="h-8 text-xs w-full min-w-0">
              <SelectValue placeholder="Project">
                {(v: string) => projectOptions.find(p => p.id === v)?.name ?? 'Project'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {projectOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <label className="text-[11px] text-slate-500 font-medium">Canvas</label>
          <Select value={value.canvasId || ''} onValueChange={(v) => onChange({ ...value, canvasId: v, tableId: undefined })} disabled={!value.projectId}>
            <SelectTrigger className="h-8 text-xs w-full min-w-0">
              <SelectValue placeholder="Canvas">
                {(v: string) => canvasOptions.find(c => c.id === v)?.name ?? 'Canvas'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {canvasOptions.length === 0 && <SelectItem value="__none" disabled>No canvases</SelectItem>}
              {canvasOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <label className="text-[11px] text-slate-500 font-medium">Table</label>
          <Select value={value.tableId || ''} onValueChange={(v) => onChange({ ...value, tableId: v })} disabled={!value.canvasId}>
            <SelectTrigger className="h-8 text-xs w-full min-w-0">
              <SelectValue placeholder="Table">
                {(v: string) => {
                  const t = tables.find(t => t.datasetId === v);
                  return t ? `${tableLabel(t)} · ${systemLabel(t.system)}` : 'Table';
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {tables.length === 0 && <SelectItem value="__none" disabled>No tables</SelectItem>}
              {tables.map(t => (
                <SelectItem key={t.datasetId} value={t.datasetId}>
                  {tableLabel(t)}
                  <span className={`ml-1.5 text-[9px] px-1 py-px rounded font-semibold uppercase ${t.system === 'LEGACY' ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700'}`}>
                    {systemLabel(t.system)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

interface ColumnPickerProps {
  title: string;
  accent: string;
  canvasOptions: { id: string; name: string }[];
  tablesByCanvas: Record<string, TableNode[]>;
  value: ColEndpoint;
  onChange: (v: ColEndpoint) => void;
  systemLabel: (s: System) => string;
}

function ColumnPicker({ title, accent, canvasOptions, tablesByCanvas, value, onChange, systemLabel }: ColumnPickerProps) {
  const tables = value.canvasId ? (tablesByCanvas[value.canvasId] || []) : [];
  const table = tables.find(t => t.datasetId === value.tableId);
  const columns = table?.columns || [];
  return (
    <div className="flex flex-col min-w-0">
      <div className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-b ${accent}`}>{title}</div>
      <div className="p-3 flex flex-col gap-2 border-b bg-white">
        <div className="min-w-0">
          <label className="text-[11px] text-slate-500 font-medium">Canvas</label>
          <Select value={value.canvasId || ''} onValueChange={(v) => onChange({ canvasId: v })}>
            <SelectTrigger className="h-8 text-xs w-full min-w-0">
              <SelectValue placeholder="Canvas">
                {(v: string) => canvasOptions.find(c => c.id === v)?.name ?? 'Canvas'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {canvasOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <label className="text-[11px] text-slate-500 font-medium">Table</label>
          <Select value={value.tableId || ''} onValueChange={(v) => onChange({ ...value, tableId: v, column: undefined })} disabled={!value.canvasId}>
            <SelectTrigger className="h-8 text-xs w-full min-w-0">
              <SelectValue placeholder="Table">
                {(v: string) => {
                  const t = tables.find(t => t.datasetId === v);
                  return t ? `${tableLabel(t)} · ${systemLabel(t.system)}` : 'Table';
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {tables.length === 0 && <SelectItem value="__none" disabled>No tables</SelectItem>}
              {tables.map(t => <SelectItem key={t.datasetId} value={t.datasetId}>{tableLabel(t)} · {systemLabel(t.system)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <label className="text-[11px] text-slate-500 font-medium">Column</label>
          <Select value={value.column || ''} onValueChange={(v) => onChange({ ...value, column: v })} disabled={!value.tableId}>
            <SelectTrigger className="h-8 text-xs w-full min-w-0">
              <SelectValue placeholder="Column">
                {(v: string) => columns.find(c => c.name === v)?.name ?? 'Column'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {columns.length === 0 && <SelectItem value="__none" disabled>No columns</SelectItem>}
              {columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export function CompareView() {
  const setView = useStore(state => state.setView);
  const activeProjectId = useStore(state => state.activeProjectId);
  const project = useStore(state => activeProjectId ? state.projects[activeProjectId] : null);
  const projects = useStore(state => state.projects);
  const canvases = useStore(state => state.canvases);
  const comparisons = useStore(state => state.comparisons);
  const activeComparisonId = useStore(state => state.activeComparisonId);
  const saveComparison = useStore(state => state.saveComparison);

  const [mode, setMode] = useState<ComparisonMode>('systems');
  const [tablesByCanvas, setTablesByCanvas] = useState<Record<string, TableNode[]>>({});
  // Which metadata fields participate in the comparison (all enabled by default).
  const [includedFields, setIncludedFields] = useState<Set<string>>(new Set(COMPARABLE_FIELDS));
  const toggleField = (f: string) => setIncludedFields(prev => {
    const next = new Set(prev);
    next.has(f) ? next.delete(f) : next.add(f);
    return next;
  });
  // When on, every diff surface hides rows that are identical, showing only the
  // actual differences.
  const [showOnlyDiffs, setShowOnlyDiffs] = useState(false);

  // "Legacy vs Target" selections (within the active project)
  const [leftCanvasId, setLeftCanvasId] = useState<string | null>(null);
  const [rightCanvasId, setRightCanvasId] = useState<string | null>(null);
  const [leftTableId, setLeftTableId] = useState<string | null>(null);
  const [rightTableId, setRightTableId] = useState<string | null>(null);

  // "Across projects" selections (any project)
  const [projLeft, setProjLeft] = useState<ProjSel>({});
  const [projRight, setProjRight] = useState<ProjSel>({});

  // column-comparison builder + saved pairs
  const [colLeft, setColLeft] = useState<ColEndpoint>({});
  const [colRight, setColRight] = useState<ColEndpoint>({});
  const [pairs, setPairs] = useState<ColumnPair[]>([]);
  const [collapsedPairs, setCollapsedPairs] = useState<Set<string>>(new Set());

  // Stable identity for a pair so collapse state survives deletions/reordering.
  const pairKey = (p: ColumnPair) => `${p.left.datasetId}::${p.left.column}->${p.right.datasetId}::${p.right.column}`;
  const toggleCollapsed = (key: string) => setCollapsedPairs(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const projectCanvases = useMemo(
    () => Object.values(canvases)
      .filter(c => c.projectId === activeProjectId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [canvases, activeProjectId]
  );
  const allCanvases = useMemo(
    () => Object.values(canvases).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [canvases]
  );
  const projectOptions = useMemo(
    () => Object.values(projects).sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  );

  const systemLabel = (s: System) =>
    s === 'LEGACY' ? (project?.legacySystemName || 'Legacy') : (project?.targetSystemName || 'Target');

  // Legacy/Target display name resolved against a specific project (needed in the
  // across-projects mode where each side may belong to a different project).
  const labelForProject = (projectId?: string) => (s: System) => {
    const p = projectId ? projects[projectId] : null;
    return s === 'LEGACY' ? (p?.legacySystemName || 'Legacy') : (p?.targetSystemName || 'Target');
  };

  // Lazily load tables for every canvas referenced by any current selection
  // (across all modes, any project) and cache them.
  const neededCanvasIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of projectCanvases) ids.add(c.id);
    for (const id of [leftCanvasId, rightCanvasId, projLeft.canvasId, projRight.canvasId, colLeft.canvasId, colRight.canvasId]) {
      if (id) ids.add(id);
    }
    for (const p of pairs) { ids.add(canvasOf(p.left.datasetId)); ids.add(canvasOf(p.right.datasetId)); }
    return ids;
  }, [projectCanvases, leftCanvasId, rightCanvasId, projLeft.canvasId, projRight.canvasId, colLeft.canvasId, colRight.canvasId, pairs]);

  useEffect(() => {
    const missing = [...neededCanvasIds].filter(id => id && !tablesByCanvas[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map(id => Repository.getTableNodesByCanvas(id).then(t => [id, t] as const)))
      .then(entries => { if (!cancelled) setTablesByCanvas(prev => ({ ...prev, ...Object.fromEntries(entries) })); });
    return () => { cancelled = true; };
  }, [neededCanvasIds, tablesByCanvas]);

  // Initialise from a saved comparison view, if one was opened.
  useEffect(() => {
    if (!activeComparisonId) return;
    const cmp = comparisons[activeComparisonId];
    if (!cmp) return;
    setMode(cmp.mode);
    const toProjSel = (datasetId: string): ProjSel => {
      const cId = canvasOf(datasetId);
      return { projectId: canvases[cId]?.projectId, canvasId: cId, tableId: datasetId };
    };
    if (cmp.mode === 'columns') {
      setPairs(cmp.columnPairs || []);
    } else if (cmp.mode === 'projects') {
      if (cmp.left?.datasetId) setProjLeft(toProjSel(cmp.left.datasetId));
      if (cmp.right?.datasetId) setProjRight(toProjSel(cmp.right.datasetId));
    } else {
      if (cmp.left?.datasetId) { setLeftCanvasId(canvasOf(cmp.left.datasetId)); setLeftTableId(cmp.left.datasetId); }
      if (cmp.right?.datasetId) { setRightCanvasId(canvasOf(cmp.right.datasetId)); setRightTableId(cmp.right.datasetId); }
    }
  }, [activeComparisonId, comparisons, canvases]);

  // Default canvas selections for the within-project mode.
  useEffect(() => {
    if (projectCanvases.length === 0) return;
    setLeftCanvasId(prev => prev ?? projectCanvases[0].id);
    setRightCanvasId(prev => prev ?? (projectCanvases[1]?.id ?? projectCanvases[0].id));
  }, [projectCanvases]);

  // Default project/canvas for the across-projects mode.
  useEffect(() => {
    if (mode !== 'projects') return;
    setProjLeft(prev => prev.projectId ? prev : { projectId: activeProjectId ?? undefined, canvasId: projectCanvases[0]?.id });
    setProjRight(prev => prev.projectId ? prev : { projectId: activeProjectId ?? undefined, canvasId: projectCanvases[0]?.id });
  }, [mode, activeProjectId, projectCanvases]);

  const leftTablesAll = leftCanvasId ? (tablesByCanvas[leftCanvasId] || []) : [];
  const rightTablesAll = rightCanvasId ? (tablesByCanvas[rightCanvasId] || []) : [];
  const leftFiltered = leftTablesAll.filter(t => t.system === 'LEGACY');
  const rightFiltered = rightTablesAll.filter(t => t.system === 'TARGET');

  useEffect(() => {
    if (leftTableId && !leftFiltered.some(t => t.datasetId === leftTableId)) setLeftTableId(null);
  }, [leftFiltered, leftTableId]);
  useEffect(() => {
    if (rightTableId && !rightFiltered.some(t => t.datasetId === rightTableId)) setRightTableId(null);
  }, [rightFiltered, rightTableId]);

  const tableById = (datasetId?: string | null): TableNode | null =>
    datasetId ? ((tablesByCanvas[canvasOf(datasetId)] || []).find(t => t.datasetId === datasetId) ?? null) : null;

  const leftTable = mode === 'projects'
    ? tableById(projLeft.tableId)
    : (leftFiltered.find(t => t.datasetId === leftTableId) ?? null);
  const rightTable = mode === 'projects'
    ? tableById(projRight.tableId)
    : (rightFiltered.find(t => t.datasetId === rightTableId) ?? null);
  const diff = useMemo(() => compareTables(leftTable, rightTable, includedFields), [leftTable, rightTable, includedFields]);
  const metaDiff = useMemo(() => compareTableMetadata(leftTable, rightTable), [leftTable, rightTable]);
  const metaChangedCount = metaDiff.filter(f => f.changed).length;

  const findColumn = (ep: ComparisonEndpoint): ColumnDef | null => {
    if (!ep.datasetId || !ep.column) return null;
    const t = (tablesByCanvas[canvasOf(ep.datasetId)] || []).find(x => x.datasetId === ep.datasetId);
    return t?.columns.find(c => c.name === ep.column) ?? null;
  };

  // Fully-qualified "{project}{canvas}{table}{column}" path for a datasetId,
  // each component in its own color with braces as separators. The project is
  // derived from the datasetId's canvas so cross-project labels are correct.
  const segColors = ['text-purple-700', 'text-blue-700', 'text-teal-700', 'text-amber-700'];
  const renderQualified = (datasetId: string, column?: string) => {
    const cId = canvasOf(datasetId);
    const canvas = canvases[cId];
    const projectName = canvas ? (projects[canvas.projectId]?.name ?? '') : '';
    const canvasName = canvas?.name ?? cId;
    const t = (tablesByCanvas[cId] || []).find(t => t.datasetId === datasetId);
    const tName = t ? tableLabel(t) : datasetId;
    const parts = column !== undefined ? [projectName, canvasName, tName, column] : [projectName, canvasName, tName];
    return parts.map((p, i) => (
      <span key={i}>
        <span className="text-slate-400">{'{'}</span>
        <span className={segColors[i]}>{p}</span>
        <span className="text-slate-400">{'}'}</span>
      </span>
    ));
  };

  const canAddPair = !!(colLeft.tableId && colLeft.column && colRight.tableId && colRight.column);
  const addPair = () => {
    if (!canAddPair) return;
    setPairs(prev => [...prev, {
      left: { datasetId: colLeft.tableId!, column: colLeft.column! },
      right: { datasetId: colRight.tableId!, column: colRight.column! },
    }]);
    setColLeft(c => ({ canvasId: c.canvasId, tableId: c.tableId }));
    setColRight(c => ({ canvasId: c.canvasId, tableId: c.tableId }));
  };

  const handleSaveView = async () => {
    if (!activeProjectId) return;
    const base = activeComparisonId ? comparisons[activeComparisonId] : null;
    const name = window.prompt('Save comparison view as:', base?.name || `${mode} comparison`);
    if (!name || !name.trim()) return;
    const now = new Date().toISOString();
    const leftSel = mode === 'projects' ? projLeft.tableId : leftTableId;
    const rightSel = mode === 'projects' ? projRight.tableId : rightTableId;
    const cmp: SavedComparison = {
      id: base?.id ?? uuidv4(),
      projectId: activeProjectId,
      name: name.trim(),
      mode,
      left: mode !== 'columns' && leftSel ? { datasetId: leftSel } : undefined,
      right: mode !== 'columns' && rightSel ? { datasetId: rightSel } : undefined,
      columnPairs: mode === 'columns' ? pairs : undefined,
      createdAt: base?.createdAt ?? now,
      updatedAt: now,
    };
    await saveComparison(cmp);
  };

  const statusStyles: Record<string, string> = {
    added: 'bg-green-100 text-green-800',
    removed: 'bg-red-100 text-red-800',
    changed: 'bg-amber-100 text-amber-800',
    same: 'bg-slate-100 text-slate-500',
  };

  const modeBtn = (m: ComparisonMode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`px-3 py-1 text-xs font-medium rounded ${mode === m ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
    >
      {label}
    </button>
  );

  if (!activeProjectId || !project) {
    return (
      <div className="flex h-full w-full items-center justify-center text-slate-400 text-sm">
        Select a project to compare.
      </div>
    );
  }

  const savedName = activeComparisonId ? comparisons[activeComparisonId]?.name : null;

  const tableDiff = (
    <div className="flex-1 overflow-auto p-4">
      {!leftTable || !rightTable ? (
        <div className="flex h-full items-center justify-center text-slate-400 text-sm">
          Pick a table on each side to see the column-by-column comparison.
        </div>
      ) : (
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-3 text-xs">
            <span className="px-2 py-1 rounded bg-green-100 text-green-800 font-medium">+{diff.summary.added} added</span>
            <span className="px-2 py-1 rounded bg-red-100 text-red-800 font-medium">−{diff.summary.removed} removed</span>
            <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 font-medium">~{diff.summary.changed} changed</span>
            <span className="px-2 py-1 rounded bg-slate-100 text-slate-500 font-medium">={diff.summary.same} same</span>
          </div>
          <div className="text-xs font-mono mb-2 flex flex-wrap items-center gap-1">
            {renderQualified(leftTable.datasetId)}
            <span className="text-slate-400 mx-1">→</span>
            {renderQualified(rightTable.datasetId)}
          </div>

          {/* Table-level metadata diff */}
          <div className="border rounded-md overflow-hidden bg-white mb-4">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b">
              <span className="text-xs font-semibold text-slate-700">Table metadata</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${metaChangedCount ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>
                {metaChangedCount ? `${metaChangedCount} differ` : 'identical'}
              </span>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold w-[180px]">Field</th>
                  <th className="text-left px-3 py-2 font-semibold">A</th>
                  <th className="w-6"></th>
                  <th className="text-left px-3 py-2 font-semibold">B</th>
                </tr>
              </thead>
              <tbody>
                {(showOnlyDiffs ? metaDiff.filter(f => f.changed) : metaDiff).map(f => (
                  <tr key={f.field} className={`border-b last:border-0 ${f.changed ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-3 py-1.5 text-slate-500">{f.field}</td>
                    <td className={`px-3 py-1.5 font-mono ${f.changed ? 'text-red-700' : 'text-slate-700'}`}>{f.a || '∅'}</td>
                    <td className="text-slate-300 text-center">{f.changed ? '→' : ''}</td>
                    <td className={`px-3 py-1.5 font-mono ${f.changed ? 'text-green-700' : 'text-slate-700'}`}>{f.b || '∅'}</td>
                  </tr>
                ))}
                {showOnlyDiffs && metaChangedCount === 0 && (
                  <tr><td colSpan={4} className="px-3 py-3 text-center text-slate-400">No differences in the compared fields.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border rounded-md overflow-hidden bg-white">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b">
              <span className="text-xs font-semibold text-slate-700">Columns</span>
              <span className="text-[10px] text-slate-500">
                {diff.summary.added + diff.summary.removed + diff.summary.changed} of {diff.columns.length} differ
              </span>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold w-[180px]">Column</th>
                  <th className="text-left px-3 py-2 font-semibold w-[90px]">Status</th>
                  <th className="text-left px-3 py-2 font-semibold w-[180px]">Table</th>
                  <th className="text-left px-3 py-2 font-semibold">Differences (A → B)</th>
                </tr>
              </thead>
              <tbody>
                {(showOnlyDiffs ? diff.columns.filter(c => c.status !== 'same') : diff.columns).map(col => {
                  const inLeft = col.status !== 'added';   // present on side A unless added on B
                  const inRight = col.status !== 'removed'; // present on side B unless removed from A
                  return (
                  <tr key={col.name} className="border-b last:border-0 align-top">
                    <td className="px-3 py-2 font-mono font-medium text-slate-800">{col.name}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${statusStyles[col.status]}`}>{col.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        {inLeft && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-blue-700">
                            <span className="px-1 py-px rounded bg-blue-100 font-semibold">A</span>
                            <span className="font-mono break-all">{tableLabel(leftTable)}</span>
                          </span>
                        )}
                        {inRight && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-teal-700">
                            <span className="px-1 py-px rounded bg-teal-100 font-semibold">B</span>
                            <span className="font-mono break-all">{tableLabel(rightTable)}</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {col.status === 'same' && <span className="text-slate-400">Identical</span>}
                      {col.status === 'added' && <span className="text-green-700">Only on the right (B)</span>}
                      {col.status === 'removed' && <span className="text-red-700">Only on the left (A)</span>}
                      {col.status === 'changed' && (
                        <div className="space-y-0.5">
                          {col.fields.filter(f => f.changed).map(f => (
                            <div key={f.field} className="flex gap-2 flex-wrap">
                              <span className="text-slate-500 w-28 shrink-0">{f.field}</span>
                              <span className="font-mono text-red-700">{f.a || '∅'}</span>
                              <span className="text-slate-400">→</span>
                              <span className="font-mono text-green-700">{f.b || '∅'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
                {showOnlyDiffs && (diff.summary.added + diff.summary.removed + diff.summary.changed) === 0 && (
                  <tr><td colSpan={4} className="px-3 py-3 text-center text-slate-400">No column differences.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView('canvas')}>
            <ArrowLeft size={15} className="mr-1" /> Back to canvas
          </Button>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <GitCompare size={16} /> Compare — {project.name}
            {savedName && <span className="text-xs font-normal text-primary">· {savedName}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 rounded-md p-0.5">
            {modeBtn('systems', 'Legacy vs Target')}
            {modeBtn('projects', 'Across projects')}
            {modeBtn('columns', 'Compare columns')}
          </div>

          <label
            className={`flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none px-2 py-1 rounded-md border transition-colors ${showOnlyDiffs ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-border text-slate-600 hover:bg-slate-50'}`}
            title="Hide identical rows and show only the differences"
          >
            <input
              type="checkbox"
              className="accent-amber-600"
              checked={showOnlyDiffs}
              onChange={(e) => setShowOnlyDiffs(e.target.checked)}
            />
            Only differences
          </label>

          <Popover>
            <PopoverTrigger
              render={<Button variant="outline" size="sm" />}
            >
              <SlidersHorizontal size={14} className="mr-1" />
              Fields ({includedFields.size}/{COMPARABLE_FIELDS.length})
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-0">
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-xs font-semibold text-slate-700">Compared fields</span>
                <div className="flex gap-1">
                  <button
                    className="text-[11px] text-primary hover:underline"
                    onClick={() => setIncludedFields(new Set(COMPARABLE_FIELDS))}
                  >
                    All
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    className="text-[11px] text-primary hover:underline"
                    onClick={() => setIncludedFields(new Set())}
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {COMPARABLE_FIELDS.map(f => (
                  <label key={f} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={includedFields.has(f)}
                      onChange={() => toggleField(f)}
                    />
                    <span className="text-slate-700">{f}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" onClick={handleSaveView}>
            <Save size={14} className="mr-1" /> {savedName ? 'Update view' : 'Save view'}
          </Button>
        </div>
      </div>

      {mode === 'columns' ? (
        <>
          {/* Column-pair builder */}
          <div className="grid grid-cols-2 divide-x border-b">
            <ColumnPicker title="Column A" accent="bg-blue-50 text-blue-900" canvasOptions={projectCanvases}
              tablesByCanvas={tablesByCanvas} value={colLeft} onChange={setColLeft} systemLabel={systemLabel} />
            <ColumnPicker title="Column B" accent="bg-teal-50 text-teal-900" canvasOptions={projectCanvases}
              tablesByCanvas={tablesByCanvas} value={colRight} onChange={setColRight} systemLabel={systemLabel} />
          </div>
          <div className="flex items-center justify-center gap-2 py-2 border-b bg-white">
            <Button size="sm" onClick={addPair} disabled={!canAddPair}>
              <Plus size={14} className="mr-1" /> Add column pair
            </Button>
            {pairs.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={collapsedPairs.size === pairs.length}
                  onClick={() => setCollapsedPairs(new Set(pairs.map(pairKey)))}
                >
                  <ChevronRight size={14} className="mr-1" /> Collapse all
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={collapsedPairs.size === 0}
                  onClick={() => setCollapsedPairs(new Set())}
                >
                  <ChevronDown size={14} className="mr-1" /> Expand all
                </Button>
              </>
            )}
          </div>

          {/* Pair diffs */}
          <div className="flex-1 overflow-auto p-4">
            {pairs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-slate-400 text-sm">
                Pick a column on each side (tables may differ and names need not match), then “Add column pair”.
              </div>
            ) : (
              <div className="max-w-4xl mx-auto space-y-4">
                {pairs.map((pair, idx) => {
                  const a = findColumn(pair.left);
                  const b = findColumn(pair.right);
                  const fields = compareColumnPair(a, b, includedFields);
                  const changedCount = fields.filter(f => f.changed).length;
                  const key = pairKey(pair);
                  const isCollapsed = collapsedPairs.has(key);
                  return (
                    <div key={idx} className="border rounded-md bg-white overflow-hidden">
                      <div
                        className="flex items-start justify-between gap-2 px-3 py-2 bg-slate-50 border-b cursor-pointer select-none"
                        onClick={() => toggleCollapsed(key)}
                      >
                        <div className="flex items-start gap-1.5 min-w-0">
                          <span className="text-slate-400 mt-px shrink-0">
                            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </span>
                          <div className="font-mono text-xs text-slate-700 min-w-0 break-all">
                            <span className="font-semibold">{renderQualified(pair.left.datasetId, pair.left.column)}</span>
                            <span className="mx-2 text-slate-400">↔</span>
                            <span className="font-semibold">{renderQualified(pair.right.datasetId, pair.right.column)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${changedCount ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>
                            {changedCount ? `${changedCount} differ` : 'identical'}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setPairs(prev => prev.filter((_, i) => i !== idx)); }}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {!isCollapsed && ((!a || !b) ? (
                        <div className="px-3 py-2 text-xs text-red-600">One of the columns could not be found.</div>
                      ) : (
                        <table className="w-full text-xs">
                          <tbody>
                            {(showOnlyDiffs ? fields.filter(f => f.changed) : fields).map(f => (
                              <tr key={f.field} className={`border-b last:border-0 ${f.changed ? 'bg-amber-50/40' : ''}`}>
                                <td className="px-3 py-1.5 text-slate-500 w-32">{f.field}</td>
                                <td className={`px-3 py-1.5 font-mono ${f.changed ? 'text-red-700' : 'text-slate-700'}`}>{f.a || '∅'}</td>
                                <td className="px-2 text-slate-300">→</td>
                                <td className={`px-3 py-1.5 font-mono ${f.changed ? 'text-green-700' : 'text-slate-700'}`}>{f.b || '∅'}</td>
                              </tr>
                            ))}
                            {showOnlyDiffs && changedCount === 0 && (
                              <tr><td colSpan={4} className="px-3 py-3 text-center text-slate-400">No differences — columns are identical.</td></tr>
                            )}
                          </tbody>
                        </table>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : mode === 'projects' ? (
        <>
          <div className="grid grid-cols-2 divide-x border-b">
            <ProjectTablePicker title="Table A (any project)" accent="bg-blue-50 text-blue-900"
              projectOptions={projectOptions} allCanvases={allCanvases} tablesByCanvas={tablesByCanvas}
              value={projLeft} onChange={setProjLeft} systemLabel={labelForProject(projLeft.projectId)} />
            <ProjectTablePicker title="Table B (any project)" accent="bg-teal-50 text-teal-900"
              projectOptions={projectOptions} allCanvases={allCanvases} tablesByCanvas={tablesByCanvas}
              value={projRight} onChange={setProjRight} systemLabel={labelForProject(projRight.projectId)} />
          </div>
          {tableDiff}
        </>
      ) : (
        <>
          {/* Legacy vs Target swim-lane pickers (within this project) */}
          <div className="grid grid-cols-2 divide-x border-b">
            <TablePicker title={`${systemLabel('LEGACY')} (Legacy)`} accent="bg-blue-50 text-blue-900" canvasOptions={projectCanvases}
              canvasId={leftCanvasId} onCanvasChange={setLeftCanvasId} tables={leftFiltered}
              tableId={leftTableId} onTableChange={setLeftTableId} systemLabel={systemLabel} />
            <TablePicker title={`${systemLabel('TARGET')} (Target)`} accent="bg-teal-50 text-teal-900" canvasOptions={projectCanvases}
              canvasId={rightCanvasId} onCanvasChange={setRightCanvasId} tables={rightFiltered}
              tableId={rightTableId} onTableChange={setRightTableId} systemLabel={systemLabel} />
          </div>
          {tableDiff}
        </>
      )}
    </div>
  );
}
