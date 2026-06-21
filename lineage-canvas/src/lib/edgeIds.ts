// Content-derived ids for lineage edges. Deriving the id from the edge's endpoints
// (rather than a random uuid) makes writes idempotent: the same connection always
// maps to the same id, so re-imports and merges UPSERT instead of duplicating, and
// two columns/tables that assert the same link collapse to one. Shared by ingestion
// (src/db/ingestion.ts) and the merge actions (src/store/useStore.ts).

export interface ColumnRef { datasetId: string; column: string }

/** Stable id for a table→table edge. */
export function tableEdgeId(fromDataset: string, toDataset: string): string {
  return `TE|${fromDataset}|${toDataset}`;
}

/** Stable id for a column→column edge (sources are order-independent). */
export function columnEdgeId(target: ColumnRef, sources: ColumnRef[]): string {
  const sortedSourceKeys = sources
    .map(s => `${s.datasetId}::${s.column}`)
    .sort()
    .join(',');
  return `CE|${target.datasetId}::${target.column}|${sortedSourceKeys}`;
}
