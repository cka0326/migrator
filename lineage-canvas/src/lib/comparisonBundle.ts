// Export/import a saved comparison as a shareable .zip bundle:
//   comparison.json  — the comparison config PLUS every project/canvas/table it
//                      references, so a recipient can open it live in CompareView.
//   diff.xlsx        — a side-by-side diff report (compare.ts) for offline reading.
// Import is additive: referenced projects/canvases/tables are inserted only if
// missing (original ids preserved), then the comparison is added.

import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { Repository } from '../db/repository';
import { downloadBlob, slugify } from './download';
import { compareTableMetadata, compareTables, compareColumnPair } from './compare';
import type {
  Project, Canvas, SavedComparison, ComparisonEndpoint, TableNode, TableEdge, ColumnEdge, ColumnDef,
} from '../types/models';

interface ComparisonBundle {
  bundleType: 'comparison';
  version: 1;
  exportedAt: string;
  comparison: SavedComparison;
  projects: Project[];
  canvases: Canvas[];
  tableNodes: TableNode[];
  tableEdges: TableEdge[];
  columnEdges: ColumnEdge[];
}

const canvasOf = (datasetId: string) => datasetId.slice(0, datasetId.indexOf('::'));

function referencedDatasetIds(cmp: SavedComparison): string[] {
  const ids: string[] = [];
  if (cmp.left?.datasetId) ids.push(cmp.left.datasetId);
  if (cmp.right?.datasetId) ids.push(cmp.right.datasetId);
  for (const p of cmp.columnPairs || []) { ids.push(p.left.datasetId); ids.push(p.right.datasetId); }
  return ids;
}

// ---------------------------------------------------------------------------
// Diff report (.xlsx)
// ---------------------------------------------------------------------------

function findColumn(nodeById: Map<string, TableNode>, ep: ComparisonEndpoint): ColumnDef | null {
  if (!ep.datasetId || !ep.column) return null;
  const node = nodeById.get(ep.datasetId);
  return node?.columns.find(c => c.name === ep.column) ?? null;
}

function buildDiffWorkbook(cmp: SavedComparison, nodeById: Map<string, TableNode>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const label = (id?: string) => (id ? (nodeById.get(id)?.qualifiedName ?? id) : '');

  if (cmp.mode === 'columns') {
    const aoa: Array<Array<string | number>> = [['target_column', 'source_column', 'field', 'left', 'right', 'status']];
    for (const pair of cmp.columnPairs || []) {
      const left = findColumn(nodeById, pair.left);
      const right = findColumn(nodeById, pair.right);
      const leftLabel = `${label(pair.left.datasetId)}.${pair.left.column ?? ''}`;
      const rightLabel = `${label(pair.right.datasetId)}.${pair.right.column ?? ''}`;
      const diffs = compareColumnPair(left, right);
      if (diffs.length === 0) {
        aoa.push([leftLabel, rightLabel, '(column not found on one side)', '', '', 'removed']);
        continue;
      }
      for (const d of diffs) aoa.push([leftLabel, rightLabel, d.field, d.a ?? '', d.b ?? '', d.changed ? 'changed' : 'same']);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Column pairs');
    return wb;
  }

  // systems / projects mode — two endpoint tables
  const leftTable = cmp.left?.datasetId ? nodeById.get(cmp.left.datasetId) ?? null : null;
  const rightTable = cmp.right?.datasetId ? nodeById.get(cmp.right.datasetId) ?? null : null;

  const metaAoa: Array<Array<string | number>> = [
    ['Left', label(cmp.left?.datasetId), 'Right', label(cmp.right?.datasetId)],
    [],
    ['field', 'left', 'right', 'status'],
  ];
  for (const f of compareTableMetadata(leftTable, rightTable)) {
    metaAoa.push([f.field, f.a ?? '', f.b ?? '', f.changed ? 'changed' : 'same']);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metaAoa), 'Table metadata');

  const { columns, summary } = compareTables(leftTable, rightTable);
  const colAoa: Array<Array<string | number>> = [
    [`added: ${summary.added}`, `removed: ${summary.removed}`, `changed: ${summary.changed}`, `same: ${summary.same}`],
    [],
    ['column', 'status', 'field', 'left', 'right'],
  ];
  for (const c of columns) {
    if (c.fields.length === 0) {
      colAoa.push([c.name, c.status, '', '', '']);
    } else {
      colAoa.push([c.name, c.status, '', '', '']);
      for (const f of c.fields) if (f.changed) colAoa.push(['', '', f.field, f.a ?? '', f.b ?? '']);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(colAoa), 'Columns');
  return wb;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportComparisonBundle(comparisonId: string): Promise<void> {
  const comparison = await Repository.getComparison(comparisonId);
  if (!comparison) throw new Error('Comparison not found');

  const canvasIds = new Set(referencedDatasetIds(comparison).map(canvasOf).filter(Boolean));

  const canvases: Canvas[] = [];
  const projectsById = new Map<string, Project>();
  const tableNodes: TableNode[] = [];
  const tableEdges: TableEdge[] = [];
  const columnEdges: ColumnEdge[] = [];
  const nodeById = new Map<string, TableNode>();

  for (const cid of canvasIds) {
    const canvas = await Repository.getCanvas(cid);
    if (!canvas) continue;
    canvases.push(canvas);
    if (!projectsById.has(canvas.projectId)) {
      const proj = await Repository.getProject(canvas.projectId);
      if (proj) projectsById.set(proj.id, proj);
    }
    const [n, te, ce] = await Promise.all([
      Repository.getTableNodesByCanvas(cid),
      Repository.getTableEdgesByCanvas(cid),
      Repository.getColumnEdgesByCanvas(cid),
    ]);
    tableNodes.push(...n); tableEdges.push(...te); columnEdges.push(...ce);
    for (const node of n) nodeById.set(node.datasetId, node);
  }

  const bundle: ComparisonBundle = {
    bundleType: 'comparison', version: 1, exportedAt: new Date().toISOString(),
    comparison, projects: [...projectsById.values()], canvases, tableNodes, tableEdges, columnEdges,
  };

  const zip = new JSZip();
  zip.file('comparison.json', JSON.stringify(bundle, null, 2));
  zip.file('diff.xlsx', XLSX.write(buildDiffWorkbook(comparison, nodeById), { type: 'array', bookType: 'xlsx' }));
  zip.file('README.txt', [
    `DataTrace — comparison bundle`,
    `Comparison: ${comparison.name} (mode: ${comparison.mode})`,
    `Exported: ${bundle.exportedAt}`,
    ``,
    `  comparison.json   Config + referenced projects/canvases/tables. Import via`,
    `                    "Import comparison" to open it live in the app.`,
    `  diff.xlsx         Side-by-side diff report for offline analysis.`,
  ].join('\n'));

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `comparison-${slugify(comparison.name)}.zip`);
}

// ---------------------------------------------------------------------------
// Import (additive; keeps original ids, only fills in what's missing)
// ---------------------------------------------------------------------------

export async function importComparisonBundle(file: File): Promise<SavedComparison> {
  const zip = await JSZip.loadAsync(file);
  const jsonFile = zip.file('comparison.json');
  if (!jsonFile) throw new Error('Not a comparison bundle: comparison.json is missing.');
  const bundle = JSON.parse(await jsonFile.async('string')) as ComparisonBundle;
  if (bundle.bundleType !== 'comparison') throw new Error('Not a comparison bundle.');

  // New id so importing the same comparison twice doesn't overwrite; endpoints keep
  // their original datasetIds (the referenced tables are inserted if missing).
  const comparison: SavedComparison = { ...bundle.comparison, id: uuidv4() };

  await Repository.saveImportedComparison({
    comparison,
    projects: bundle.projects || [],
    canvases: bundle.canvases || [],
    tableNodes: bundle.tableNodes || [],
    tableEdges: bundle.tableEdges || [],
    columnEdges: bundle.columnEdges || [],
  });
  return comparison;
}
