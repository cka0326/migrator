import { useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog';
import { compareColumnPair } from '../../lib/compare';
import {
  buildColumnMappingWorkbook, columnMappingWorkbookToBlob, parseColumnMappingWorkbook,
  type ColumnMappingImportResult,
} from '../../lib/columnMappingExcel';
import { downloadBlob, slugify } from '../../lib/download';
import { openComparisonInNewTab } from '../../lib/ephemeralTab';
import { Wand2, Plus, Trash2, ArrowRight, AlertTriangle, Check, Download, Upload, ExternalLink } from 'lucide-react';
import type { TableNode, TableMapping, ColumnMappingPair } from '../../types/models';

interface Props {
  mapping: TableMapping;
  legacyNode?: TableNode;
  targetNode?: TableNode;
  legacyLabel: string;
  targetLabel: string;
  includedFields: Set<string>;
}

export function ColumnMappingEditor({ mapping, legacyNode, targetNode, legacyLabel, targetLabel, includedFields }: Props) {
  const updateTableMapping = useStore(s => s.updateTableMapping);
  const autoSuggestColumns = useStore(s => s.autoSuggestColumns);
  const activeProjectId = useStore(s => s.activeProjectId);
  const [newLegacy, setNewLegacy] = useState<string>('');
  const [newTarget, setNewTarget] = useState<string>('');

  // Excel column-mapping download/upload for this table pair.
  const fileRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<
    { fileName: string; result: ColumnMappingImportResult } | null
  >(null);
  const [importError, setImportError] = useState<string | null>(null);
  const bothNodes = !!legacyNode && !!targetNode;

  const handleDownloadExcel = () => {
    if (!legacyNode || !targetNode) return;
    const wb = buildColumnMappingWorkbook(mapping, legacyNode, targetNode, legacyLabel, targetLabel);
    const blob = columnMappingWorkbookToBlob(wb);
    downloadBlob(blob, `column-mapping_${slugify(legacyNode.name)}_to_${slugify(targetNode.name)}.xlsx`);
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file || !legacyNode || !targetNode) return;
    setImportError(null);
    try {
      const result = await parseColumnMappingWorkbook(file, mapping, legacyNode, targetNode);
      setImportPreview({ fileName: file.name, result });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read the workbook.');
    }
  };

  const applyImport = async () => {
    if (!importPreview) return;
    await updateTableMapping(mapping.id, {
      columnMappings: [...mapping.columnMappings, ...importPreview.result.newPairs],
    });
    setImportPreview(null);
  };

  // Open a "compare columns" view (in a new tab) for this pair's mapped columns.
  const openColumnCompare = () => {
    if (!bothNodes || !activeProjectId) return;
    openComparisonInNewTab({
      mode: 'columns',
      projectId: activeProjectId,
      title: `${legacyNode!.name} ↔ ${targetNode!.name} columns`,
      columnPairs: mapping.columnMappings.map(p => ({
        left: { datasetId: mapping.legacyDatasetId, column: p.legacyColumn },
        right: { datasetId: mapping.targetDatasetId, column: p.targetColumn },
      })),
      returnTo: 'mapping',
    });
  };

  const legacyCols = legacyNode?.columns ?? [];
  const targetCols = targetNode?.columns ?? [];
  const colByName = (cols: typeof legacyCols, name: string) => cols.find(c => c.name.toUpperCase() === name.toUpperCase());

  const pairedLegacy = new Set(mapping.columnMappings.map(p => p.legacyColumn.toUpperCase()));
  const pairedTarget = new Set(mapping.columnMappings.map(p => p.targetColumn.toUpperCase()));
  const availLegacy = legacyCols.filter(c => !pairedLegacy.has(c.name.toUpperCase()));
  const availTarget = targetCols.filter(c => !pairedTarget.has(c.name.toUpperCase()));

  const setPairs = (pairs: ColumnMappingPair[]) => updateTableMapping(mapping.id, { columnMappings: pairs });

  const addPair = () => {
    if (!newLegacy || !newTarget) return;
    setPairs([...mapping.columnMappings, { legacyColumn: newLegacy, targetColumn: newTarget }]);
    setNewLegacy(''); setNewTarget('');
  };
  const removePair = (i: number) => setPairs(mapping.columnMappings.filter((_, idx) => idx !== i));
  const clearAllPairs = () => {
    const n = mapping.columnMappings.length;
    if (n === 0) return;
    if (window.confirm(`Remove all ${n} column mapping${n === 1 ? '' : 's'} for this table? Table columns are not affected.`)) {
      setPairs([]);
    }
  };

  return (
    <div className="px-4 py-3 bg-slate-50/70 border-t">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Column mappings</span>
        <div className="flex items-center gap-1.5">
          <Button size="xs" variant="outline" onClick={() => autoSuggestColumns(mapping.id)} disabled={!bothNodes}>
            <Wand2 className="mr-1" /> Auto-match by name
          </Button>
          <Button size="xs" variant="outline" onClick={handleDownloadExcel} disabled={!bothNodes}
            title="Download an Excel to map columns offline for this table pair">
            <Download className="mr-1" /> Excel
          </Button>
          <Button size="xs" variant="outline" onClick={() => fileRef.current?.click()} disabled={!bothNodes}
            title="Upload a filled column-mapping Excel">
            <Upload className="mr-1" /> Upload
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFilePicked} />
          <Button size="xs" variant="outline" onClick={openColumnCompare}
            disabled={!bothNodes || mapping.columnMappings.length === 0}
            title="Open a column comparison for the mapped columns in a new tab">
            <ExternalLink className="mr-1" /> Compare columns
          </Button>
          <Button size="xs" variant="outline" onClick={clearAllPairs} disabled={mapping.columnMappings.length === 0}
            className="text-red-600 hover:text-red-700"
            title="Remove all column mappings for this table">
            <Trash2 className="mr-1" /> Clear all
          </Button>
        </div>
      </div>

      {importError && (
        <div className="text-xs text-red-600 mb-2 flex items-start gap-1">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {importError}
        </div>
      )}

      {mapping.columnMappings.length === 0 && (
        <div className="text-xs text-slate-400 py-1">No column pairs yet — auto-match or add manually below.</div>
      )}

      <div className="space-y-1">
        {mapping.columnMappings.map((p, i) => {
          const lc = colByName(legacyCols, p.legacyColumn);
          const tc = colByName(targetCols, p.targetColumn);
          const missing = !lc || !tc;
          // Count differences across the currently-selected compared fields.
          const diffs = missing ? [] : compareColumnPair(lc!, tc!, includedFields).filter(f => f.changed);
          const diffCount = diffs.length;
          return (
            <div key={`${p.legacyColumn}->${p.targetColumn}-${i}`}
              className="grid grid-cols-[1fr_auto_1fr_auto_auto] items-center gap-2 text-xs bg-white border rounded px-2 py-1.5">
              <span className="font-mono truncate">
                {p.legacyColumn}
                <span className="text-slate-400 ml-1">{lc ? `· ${lc.dataType}` : '· missing'}</span>
              </span>
              <ArrowRight size={12} className="text-slate-300" />
              <span className="font-mono truncate">
                {p.targetColumn}
                <span className="text-slate-400 ml-1">{tc ? `· ${tc.dataType}` : '· missing'}</span>
              </span>
              {missing ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600"><AlertTriangle size={11} /> missing</span>
              ) : diffCount === 0 ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><Check size={11} /> match</span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600"
                  title={diffs.map(f => f.field).join(', ')}
                >
                  <AlertTriangle size={11} /> {diffCount} diff{diffCount === 1 ? '' : 's'}
                </span>
              )}
              <button onClick={() => removePair(i)} className="text-slate-400 hover:text-red-600"><Trash2 size={12} /></button>
            </div>
          );
        })}
      </div>

      {/* Add a pair from remaining columns */}
      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 mt-2">
        <Select value={newLegacy} onValueChange={setNewLegacy} disabled={!legacyNode}>
          <SelectTrigger className="h-7 text-xs min-w-0">
            <SelectValue placeholder={`${legacyLabel} column`}>{(v: string) => v || `${legacyLabel} column`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availLegacy.length === 0 && <SelectItem value="__none" disabled>All columns mapped</SelectItem>}
            {availLegacy.map(c => <SelectItem key={c.name} value={c.name}>{c.name} · {c.dataType}</SelectItem>)}
          </SelectContent>
        </Select>
        <ArrowRight size={12} className="text-slate-300" />
        <Select value={newTarget} onValueChange={setNewTarget} disabled={!targetNode}>
          <SelectTrigger className="h-7 text-xs min-w-0">
            <SelectValue placeholder={`${targetLabel} column`}>{(v: string) => v || `${targetLabel} column`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availTarget.length === 0 && <SelectItem value="__none" disabled>All columns mapped</SelectItem>}
            {availTarget.map(c => <SelectItem key={c.name} value={c.name}>{c.name} · {c.dataType}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="xs" onClick={addPair} disabled={!newLegacy || !newTarget}><Plus /></Button>
      </div>

      {/* Confirm before replacing this pair's column mappings with the uploaded file. */}
      <Dialog open={!!importPreview} onOpenChange={(o) => { if (!o) setImportPreview(null); }}>
        <DialogContent className="sm:max-w-md">
          {importPreview && (
            <>
              <DialogHeader>
                <DialogTitle>Import column mappings</DialogTitle>
                <DialogDescription>
                  From <span className="font-mono">{importPreview.fileName}</span>. New pairs are added to the{' '}
                  {mapping.columnMappings.length} existing column mapping{mapping.columnMappings.length === 1 ? '' : 's'} — nothing is replaced.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="font-semibold tabular-nums">{importPreview.result.addedCount}</span> new column mapping{importPreview.result.addedCount === 1 ? '' : 's'} to add
                </div>
                {importPreview.result.warnings.length > 0 && (
                  <div className="max-h-40 overflow-auto rounded border bg-amber-50 p-2 text-amber-800 space-y-1">
                    {importPreview.result.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {w}</div>
                    ))}
                  </div>
                )}
                {importPreview.result.addedCount === 0 && (
                  <div className="text-slate-500">No new pairs found — existing mappings are already up to date.</div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setImportPreview(null)}>Cancel</Button>
                <Button size="sm" onClick={applyImport} disabled={importPreview.result.addedCount === 0}>
                  <Check className="mr-1" /> Add {importPreview.result.addedCount} mapping{importPreview.result.addedCount === 1 ? '' : 's'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
