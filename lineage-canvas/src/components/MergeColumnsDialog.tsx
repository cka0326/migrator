import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ColumnConflictTable } from './ColumnConflictTable';
import { seedColumnResult, buildMergedColumn } from '../lib/columnMerge';
import type { ColumnDef } from '../types/models';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasetId: string;
  columns: ColumnDef[]; // the 2+ columns to merge
}

export function MergeColumnsDialog({ open, onOpenChange, datasetId, columns }: Props) {
  const mergeColumns = useStore(s => s.mergeColumns);
  const nodes = useStore(s => s.nodes);
  const columnEdges = useStore(s => s.columnEdges);

  const [result, setResult] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setResult(seedColumnResult(columns));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, columns]);

  const set = (key: string, value: string) => setResult(prev => ({ ...prev, [key]: value }));

  const sourceNames = columns.map(c => c.name);
  const sourceSet = new Set(sourceNames);
  const node = nodes[datasetId];
  const otherNames = new Set((node?.columns || []).filter(c => !sourceSet.has(c.name)).map(c => c.name));
  const mergedName = (result.name || '').trim().toUpperCase();

  const nameError = !mergedName ? 'Name is required'
    : otherNames.has(mergedName) ? `A different column named "${mergedName}" already exists`
    : null;

  const combinedConnections = useMemo(() => {
    const ids = new Set<string>();
    for (const e of Object.values(columnEdges)) {
      const hit = (e.target.datasetId === datasetId && sourceSet.has(e.target.column))
        || e.sources.some(s => s.datasetId === datasetId && sourceSet.has(s.column));
      if (hit) ids.add(e.edgeId);
    }
    return ids.size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnEdges, datasetId, sourceNames.join(',')]);

  const handleMerge = async () => {
    if (nameError) return;
    setBusy(true);
    try {
      await mergeColumns(datasetId, sourceNames, buildMergedColumn(result));
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] grid-rows-[auto_1fr_auto] p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <DialogTitle>Merge {columns.length} columns</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Pick a value per field (click a source cell) or type your own in <span className="font-medium">Result</span>.
            Connections from all merged columns are combined and de-duplicated.
          </p>
        </DialogHeader>

        <div className="overflow-auto min-h-0">
          <ColumnConflictTable columns={columns} result={result} onChange={set} nameError={nameError} />
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t bg-muted/30">
          <span className="text-[11px] text-muted-foreground">
            {nameError ? <span className="text-destructive">{nameError}</span> : `${combinedConnections} connection(s) will be combined.`}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={handleMerge} disabled={busy || !!nameError}>{busy ? 'Merging…' : 'Merge columns'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
