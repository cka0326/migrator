import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ColumnConflictTable } from './ColumnConflictTable';
import { seedColumnResult, buildMergedColumn } from '../lib/columnMerge';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ColumnDef, TableMetadata, TableNode } from '../types/models';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: TableNode[]; // 2+ tables on the same canvas/system
}

const TABLE_FIELDS: { key: string; label: string; get: (m: TableMetadata) => unknown }[] = [
  { key: 'description', label: 'Description', get: m => m.description },
  { key: 'environment', label: 'Environment', get: m => m.environment },
  { key: 'businessDomain', label: 'Business Domain', get: m => m.businessDomain },
  { key: 'rowCount', label: 'Row Count', get: m => m.rowCount },
  { key: 'hasPrimaryKey', label: 'Has Primary Key', get: m => m.hasPrimaryKey },
  { key: 'uniqueKeyColumns', label: 'Unique Key Columns', get: m => m.uniqueKeyColumns },
  { key: 'grainDescription', label: 'Grain', get: m => m.grainDescription },
  { key: 'refreshFrequency', label: 'Refresh Frequency', get: m => m.refreshFrequency },
];
const tStr = (v: unknown) => (v === undefined || v === null || v === '' ? '' : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v));
const parseNum = (s: string) => (s.trim() === '' ? undefined : Number(s));
const parseBool = (s: string) => { const u = s.trim().toUpperCase(); return u === 'TRUE' ? true : u === 'FALSE' ? false : undefined; };
const enumU = (s: string) => { const u = s.trim().toUpperCase(); return u && u !== 'UNASSIGNED' ? u : undefined; };

export function MergeTablesDialog({ open, onOpenChange, sources }: Props) {
  const mergeTables = useStore(s => s.mergeTables);
  const nodes = useStore(s => s.nodes);

  const canvasId = sources[0]?.canvasId ?? '';
  const system = sources[0]?.system ?? 'LEGACY';

  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [metaResult, setMetaResult] = useState<Record<string, string>>({});
  const [colResults, setColResults] = useState<Record<string, Record<string, string>>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [metaOpen, setMetaOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Group columns across sources by name → variants.
  const groups = useMemo(() => {
    const m = new Map<string, ColumnDef[]>();
    for (const t of sources) for (const c of t.columns) {
      if (!m.has(c.name)) m.set(c.name, []);
      m.get(c.name)!.push(c);
    }
    return m;
  }, [sources]);

  useEffect(() => {
    if (!open || sources.length === 0) return;
    setName(sources[0].name);
    setNamespace(sources[0].namespace);
    // Seed table metadata (first non-empty per field).
    const mr: Record<string, string> = {};
    for (const f of TABLE_FIELDS) mr[f.key] = sources.map(t => tStr(f.get(t.metadata))).find(v => v !== '') ?? '';
    setMetaResult(mr);
    // Seed per-conflict column results.
    const cr: Record<string, Record<string, string>> = {};
    for (const [colName, variants] of groups) if (variants.length >= 2) cr[colName] = seedColumnResult(variants);
    setColResults(cr);
    setExpanded(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sources]);

  const setCol = (colName: string, key: string, value: string) =>
    setColResults(prev => ({ ...prev, [colName]: { ...prev[colName], [key]: value } }));
  const toggle = (colName: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(colName) ? n.delete(colName) : n.add(colName); return n; });

  const newDatasetId = `${canvasId}::${system}:${(namespace || '').trim().toUpperCase()}.${(name || '').trim().toUpperCase()}`;
  const srcIds = new Set(sources.map(s => s.datasetId));
  const collides = !!nodes[newDatasetId] && !srcIds.has(newDatasetId);

  // Build merged columns (in first-seen order). Conflicts use the resolved result.
  const mergedColumns: ColumnDef[] = useMemo(() => {
    const out: ColumnDef[] = [];
    for (const [colName, variants] of groups) {
      out.push(variants.length >= 2 && colResults[colName] ? buildMergedColumn(colResults[colName]) : { ...variants[0] });
    }
    return out;
  }, [groups, colResults]);

  const dupName = useMemo(() => {
    const seen = new Set<string>();
    for (const c of mergedColumns) { if (seen.has(c.name)) return c.name; seen.add(c.name); }
    return null;
  }, [mergedColumns]);

  const error = !name.trim() ? 'Table name is required'
    : !namespace.trim() ? 'Namespace is required'
    : collides ? 'A different table with this identity already exists in the canvas'
    : dupName ? `Two merged columns are both named "${dupName}"`
    : null;

  const handleMerge = async () => {
    if (error) return;
    setBusy(true);
    try {
      const metadata: TableMetadata = {
        description: (metaResult.description || '').trim() || undefined,
        environment: enumU(metaResult.environment || '') as any,
        businessDomain: (metaResult.businessDomain || '').trim() || undefined,
        rowCount: parseNum(metaResult.rowCount || ''),
        hasPrimaryKey: parseBool(metaResult.hasPrimaryKey || ''),
        uniqueKeyColumns: (metaResult.uniqueKeyColumns || '').trim() || undefined,
        grainDescription: (metaResult.grainDescription || '').trim() || undefined,
        refreshFrequency: enumU(metaResult.refreshFrequency || '') as any,
      };
      await mergeTables(canvasId, system, [...srcIds], {
        name: name.trim().toUpperCase(),
        namespace: namespace.trim().toUpperCase(),
        metadata,
        columns: mergedColumns,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const conflictCount = [...groups.values()].filter(v => v.length >= 2).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] grid-rows-[auto_1fr_auto] p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <DialogTitle>Merge {sources.length} tables</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Columns are unioned by name ({conflictCount} need conflict resolution). All connections are re-pointed to the merged table and de-duplicated.
          </p>
        </DialogHeader>

        <div className="overflow-y-auto min-h-0 px-4 py-3 space-y-3">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">Merged table name</Label>
              <Input value={name} onChange={e => setName(e.target.value.toUpperCase())} className="h-8 text-xs font-mono" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Namespace · {system}</Label>
              <Input value={namespace} onChange={e => setNamespace(e.target.value.toUpperCase())} className="h-8 text-xs font-mono" />
            </div>
          </div>

          {/* Table metadata resolver */}
          <div className="border rounded-md">
            <button onClick={() => setMetaOpen(o => !o)} className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-slate-600">
              {metaOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Table metadata
            </button>
            {metaOpen && (
              <table className="w-full text-xs border-collapse border-t">
                <thead className="bg-muted/60 border-b">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-semibold w-[120px]">Field</th>
                    {sources.map(t => <th key={t.datasetId} className="text-left px-2 py-1.5 font-mono font-semibold truncate">{t.name}</th>)}
                    <th className="text-left px-2 py-1.5 font-semibold w-[180px]">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {TABLE_FIELDS.map(f => (
                    <tr key={f.key} className="border-b last:border-0 align-top">
                      <td className="px-2 py-1 text-slate-500">{f.label}</td>
                      {sources.map(t => {
                        const v = tStr(f.get(t.metadata));
                        return (
                          <td key={t.datasetId} className="px-1 py-1">
                            <button onClick={() => setMetaResult(prev => ({ ...prev, [f.key]: v }))} title="Use this value"
                              className="w-full text-left px-1.5 py-0.5 rounded font-mono hover:bg-accent hover:text-accent-foreground border border-transparent hover:border-border">
                              {v || <span className="text-slate-300">—</span>}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-1 py-1">
                        <input value={metaResult[f.key] ?? ''} onChange={e => setMetaResult(prev => ({ ...prev, [f.key]: e.target.value }))}
                          className="w-full h-7 px-1.5 text-xs rounded border border-input bg-background" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Columns */}
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Columns ({groups.size})</div>
            {[...groups.entries()].map(([colName, variants]) => {
              const conflict = variants.length >= 2;
              const isOpen = expanded.has(colName);
              return (
                <div key={colName} className="border rounded-md">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    {conflict ? (
                      <button onClick={() => toggle(colName)} className="text-slate-400 hover:text-slate-700 shrink-0">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    ) : <span className="w-[14px] shrink-0" />}
                    <span className="font-mono text-xs font-semibold truncate min-w-0">
                      {conflict && colResults[colName]?.name ? colResults[colName].name : colName}
                    </span>
                    {conflict
                      ? <span className="text-[9px] px-1.5 py-0 rounded font-semibold uppercase bg-amber-100 text-amber-800 shrink-0">conflict · {variants.length}</span>
                      : <span className="text-[9px] px-1.5 py-0 rounded font-semibold uppercase bg-slate-100 text-slate-500 shrink-0">{variants[0].dataType}</span>}
                  </div>
                  {conflict && isOpen && colResults[colName] && (
                    <div className="border-t">
                      <ColumnConflictTable
                        columns={variants}
                        result={colResults[colName]}
                        onChange={(key, value) => setCol(colName, key, value)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t bg-muted/30">
          <span className="text-[11px]">
            {error ? <span className="text-destructive">{error}</span> : <span className="text-muted-foreground">{mergedColumns.length} columns in merged table.</span>}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={handleMerge} disabled={busy || !!error}>{busy ? 'Merging…' : 'Merge tables'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
