import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { Repository } from '../db/repository';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { System, TableMetadata } from '../types/models';
import type { ParsedImportModel, ParsedTable, ImportMode } from '../lib/importModel';
import { DEFAULT_NAMESPACE } from '../lib/importModel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: 'JSON' | 'EXCEL';
  model: ParsedImportModel | null;
  rawPayload?: string;
  fileName: string;
}

const identityOf = (system: System, namespace: string, name: string) =>
  `${system}:${(namespace || DEFAULT_NAMESPACE).toUpperCase()}.${name.toUpperCase()}`;

export function ImportValidationDialog({ open, onOpenChange, source, model, rawPayload, fileName }: Props) {
  const projects = useStore(s => s.projects);
  const canvases = useStore(s => s.canvases);
  const activeProjectId = useStore(s => s.activeProjectId);
  const activeCanvasId = useStore(s => s.activeCanvasId);
  const activeSystemTab = useStore(s => s.activeSystemTab);
  const runImport = useStore(s => s.runImport);

  const [tables, setTables] = useState<ParsedTable[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [canvasId, setCanvasId] = useState<string>('');
  const [system, setSystem] = useState<System>('LEGACY');
  const [mode, setMode] = useState<ImportMode>('additive');
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Seed local state when a new model is opened.
  useEffect(() => {
    if (!open || !model) return;
    setTables(model.tables.map(t => ({ ...t, metadata: { ...(t.metadata || {}) } })));
    // Prefer a project matching the Excel MASTER hint, else the active project.
    const hintName = model.projectHint?.name?.toLowerCase();
    const matched = hintName ? Object.values(projects).find(p => p.name.toLowerCase() === hintName) : undefined;
    const pid = matched?.id || activeProjectId || Object.keys(projects)[0] || '';
    setProjectId(pid);
    setSystem(activeSystemTab);
    setMode('additive');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, model]);

  const projectCanvases = useMemo(
    () => Object.values(canvases).filter(c => c.projectId === projectId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [canvases, projectId],
  );

  // Keep canvas valid for the chosen project.
  useEffect(() => {
    if (projectCanvases.some(c => c.id === canvasId)) return;
    const preferred = (projectId === activeProjectId && activeCanvasId) ? activeCanvasId : projectCanvases[0]?.id;
    setCanvasId(preferred && projectCanvases.some(c => c.id === preferred) ? preferred : (projectCanvases[0]?.id || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, projectCanvases]);

  // Load existing table identities for the chosen canvas to flag merges.
  useEffect(() => {
    let cancelled = false;
    if (!canvasId) { setExisting(new Set()); return; }
    Repository.getTableNodesByCanvas(canvasId).then(nodes => {
      if (cancelled) return;
      setExisting(new Set(nodes.map(n => identityOf(n.system, n.namespace, n.name))));
    });
    return () => { cancelled = true; };
  }, [canvasId]);

  const updateTable = (i: number, patch: Partial<ParsedTable>) =>
    setTables(prev => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const updateMeta = (i: number, patch: Partial<TableMetadata>) =>
    setTables(prev => prev.map((t, idx) => (idx === i ? { ...t, metadata: { ...(t.metadata || {}), ...patch } } : t)));
  const toggleExpanded = (name: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });

  const tableConnCount = model?.tableConnections.length ?? 0;
  const columnConnCount = model?.columnConnections.length ?? 0;

  const systemForTable = (t: ParsedTable): System => (source === 'EXCEL' ? (t.system ?? system) : system);
  const mergeCount = tables.filter(t => existing.has(identityOf(systemForTable(t), t.namespace, t.name))).length;

  const handleConfirm = async () => {
    if (!model || !canvasId) return;
    setBusy(true);
    try {
      const finalModel: ParsedImportModel = { ...model, tables };
      const summary = await runImport(
        finalModel,
        { canvasId, defaultSystem: system },
        { mode, fileName, kind: source === 'EXCEL' ? 'EXCEL' : 'LINEAGE_JSON', rawPayload },
      );
      onOpenChange(false);
      alert(
        `Import complete.\n` +
        `Tables: ${summary.tables} (${summary.newTables} new, ${summary.stubsCreated} stub)\n` +
        `Columns added: ${summary.columnsAdded}\n` +
        `Table links: ${summary.tableEdges}\nColumn links: ${summary.columnEdges}`,
      );
    } catch (e) {
      alert(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] grid-rows-[auto_1fr_auto] p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <DialogTitle>Review import — {source}</DialogTitle>
          <p className="text-xs text-muted-foreground truncate">{fileName}</p>
        </DialogHeader>

        <div className="overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Target picker */}
          <div className="grid grid-cols-3 gap-2">
            <div className="min-w-0">
              <Label className="text-[11px] text-muted-foreground">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Project" /></SelectTrigger>
                <SelectContent>
                  {Object.values(projects).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="text-[11px] text-muted-foreground">Canvas</Label>
              <Select value={canvasId} onValueChange={setCanvasId} disabled={!projectId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Canvas" /></SelectTrigger>
                <SelectContent>
                  {projectCanvases.length === 0 && <SelectItem value="__none" disabled>No canvases</SelectItem>}
                  {projectCanvases.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="text-[11px] text-muted-foreground">System {source === 'EXCEL' && '(default)'}</Label>
              <Select value={system} onValueChange={(v) => setSystem(v as System)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LEGACY">Legacy</SelectItem>
                  <SelectItem value="TARGET">Target</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary + Excel mode */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{tables.length} tables</span>
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{tableConnCount} table links</span>
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{columnConnCount} column links</span>
            {mergeCount > 0 && <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">{mergeCount} merge into existing</span>}
          </div>

          {source === 'EXCEL' && (
            <div>
              <Label className="text-[11px] text-muted-foreground">How to apply to existing tables</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as ImportMode)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="additive">Additive — add tables/columns/connections only</SelectItem>
                  <SelectItem value="override-metadata">Override metadata — also overwrite table/column metadata</SelectItem>
                  <SelectItem value="override-metadata-connections">Override metadata + connections — also replace connections</SelectItem>
                </SelectContent>
              </Select>
              {mode === 'override-metadata-connections' && (
                <p className="text-[11px] text-amber-700 mt-1">Existing connections of these tables will be replaced.</p>
              )}
            </div>
          )}

          {/* Tables */}
          <div className="space-y-1.5">
            {tables.map((t, i) => {
              const isExisting = existing.has(identityOf(systemForTable(t), t.namespace, t.name));
              const isOpen = expanded.has(t.name);
              const m = t.metadata || {};
              return (
                <div key={t.name} className="border rounded-md">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <button onClick={() => toggleExpanded(t.name)} className="text-slate-400 hover:text-slate-700 shrink-0">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <span className="font-mono text-xs font-semibold truncate min-w-0">{t.name}</span>
                    <span className={`text-[9px] px-1.5 py-0 rounded font-semibold uppercase shrink-0 ${isExisting ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                      {isExisting ? 'merge' : 'new'}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{t.columns.length} cols</span>
                    <div className="ml-auto flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground">ns</span>
                      <Input
                        value={t.namespace}
                        onChange={(e) => updateTable(i, { namespace: e.target.value.toUpperCase() })}
                        className="h-6 w-36 text-[11px] font-mono"
                      />
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t px-2 py-2 space-y-2 bg-muted/20">
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Description"><Input className="h-7 text-xs" value={m.description || ''} onChange={(e) => updateMeta(i, { description: e.target.value || undefined })} /></Field>
                        <Field label="Business Domain"><Input className="h-7 text-xs" value={m.businessDomain || ''} onChange={(e) => updateMeta(i, { businessDomain: e.target.value || undefined })} /></Field>
                        <Field label="Environment">
                          <Select value={m.environment || 'UNASSIGNED'} onValueChange={(v) => updateMeta(i, { environment: v === 'UNASSIGNED' ? undefined : v as any })}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {['UNASSIGNED', 'DEV', 'TEST', 'UAT', 'PROD'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Refresh Frequency">
                          <Select value={m.refreshFrequency || 'UNASSIGNED'} onValueChange={(v) => updateMeta(i, { refreshFrequency: v === 'UNASSIGNED' ? undefined : v as any })}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {['UNASSIGNED', 'DAILY', 'WEEKLY', 'MONTHLY', 'AD_HOC'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Row Count"><Input type="number" className="h-7 text-xs" value={m.rowCount ?? ''} onChange={(e) => updateMeta(i, { rowCount: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>
                        <Field label="Grain"><Input className="h-7 text-xs" value={m.grainDescription || ''} onChange={(e) => updateMeta(i, { grainDescription: e.target.value || undefined })} /></Field>
                      </div>
                      {t.columns.length > 0 && (
                        <div className="text-[10px] text-muted-foreground font-mono break-words">
                          Columns: {t.columns.map(c => c.name).join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {tables.length === 0 && <div className="text-center text-xs text-muted-foreground py-6">No tables to import.</div>}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t bg-muted/30">
          <span className="text-[11px] text-muted-foreground">Metadata is optional — you can fill it now or later.</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={handleConfirm} disabled={busy || !canvasId || tables.length === 0}>
              {busy ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
