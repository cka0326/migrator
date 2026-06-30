// Shared rules for the collapsed table-node column preview so the canvas edges
// and the node body agree on which columns are visible.

export const COLUMN_PREVIEW_LIMIT = 5;

// Connected columns (those that participate in a column edge) sort first so they
// survive the preview cut; ties and the rest fall back to alphabetical order.
export function prioritizeColumns<T extends { name: string }>(columns: T[], connected: Set<string>): T[] {
  return [...columns].sort((a, b) => {
    const ca = connected.has(a.name);
    const cb = connected.has(b.name);
    if (ca !== cb) return ca ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// The set of column names a node shows while collapsed to the preview: the first
// COLUMN_PREVIEW_LIMIT after prioritization. Connected columns beyond that limit
// are hidden and their edges fall back to the table-level handle.
export function previewVisibleColumns(columnNames: string[], connected: Set<string>): Set<string> {
  const ordered = prioritizeColumns(columnNames.map(name => ({ name })), connected);
  return new Set(ordered.slice(0, COLUMN_PREVIEW_LIMIT).map(c => c.name));
}
