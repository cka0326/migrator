// Export/import a single project as a shareable .zip bundle:
//   project.json          — lossless, re-importable into the app
//   excel/<canvas>.xlsx   — one filled template per canvas (for offline analysis)
//   README.txt
// Import is additive: a brand-new project (fresh ids) is created; existing data is
// never cleared. Mirrors the id-remap done by Repository.copyCanvasContents.

import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import { Repository } from '../db/repository';
import { buildCanvasWorkbook, workbookToArrayBuffer } from './excelExport';
import { downloadBlob, slugify } from './download';
import type {
  Project, Canvas, SavedComparison, TableNode, TableEdge, ColumnEdge, ProcessRec, UploadRec,
} from '../types/models';

interface ProjectBundle {
  bundleType: 'project';
  version: 1;
  exportedAt: string;
  project: Project;
  canvases: Canvas[];
  comparisons: SavedComparison[];
  tableNodes: TableNode[];
  tableEdges: TableEdge[];
  columnEdges: ColumnEdge[];
  processRecs: ProcessRec[];
  uploadRecs: UploadRec[];
}

// "${canvasId}::rest" → "${newCanvasId}::rest"; ids without a "::" (e.g. 'MANUAL')
// pass through unchanged.
function makeDatasetSwap(canvasIdMap: Map<string, string>) {
  return (id: string): string => {
    const idx = id.indexOf('::');
    if (idx === -1) return id;
    const newCanvas = canvasIdMap.get(id.slice(0, idx));
    return newCanvas ? `${newCanvas}::${id.slice(idx + 2)}` : id;
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportProjectBundle(projectId: string): Promise<void> {
  const project = await Repository.getProject(projectId);
  if (!project) throw new Error('Project not found');

  const canvases = await Repository.getCanvasesByProject(projectId);
  const comparisons = await Repository.getComparisonsByProject(projectId);

  const tableNodes: TableNode[] = [];
  const tableEdges: TableEdge[] = [];
  const columnEdges: ColumnEdge[] = [];
  const processRecs: ProcessRec[] = [];
  const uploadRecs: UploadRec[] = [];
  const nodesByCanvas = new Map<string, TableNode[]>();
  const tEdgesByCanvas = new Map<string, TableEdge[]>();
  const cEdgesByCanvas = new Map<string, ColumnEdge[]>();

  for (const c of canvases) {
    const [n, te, ce, pr, up] = await Promise.all([
      Repository.getTableNodesByCanvas(c.id),
      Repository.getTableEdgesByCanvas(c.id),
      Repository.getColumnEdgesByCanvas(c.id),
      Repository.getProcessRecsByCanvas(c.id),
      Repository.getUploadsByCanvas(c.id),
    ]);
    nodesByCanvas.set(c.id, n); tEdgesByCanvas.set(c.id, te); cEdgesByCanvas.set(c.id, ce);
    tableNodes.push(...n); tableEdges.push(...te); columnEdges.push(...ce);
    processRecs.push(...pr); uploadRecs.push(...up);
  }

  const bundle: ProjectBundle = {
    bundleType: 'project', version: 1, exportedAt: new Date().toISOString(),
    project, canvases, comparisons, tableNodes, tableEdges, columnEdges, processRecs, uploadRecs,
  };

  const zip = new JSZip();
  zip.file('project.json', JSON.stringify(bundle, null, 2));

  const excelDir = zip.folder('excel')!;
  const usedNames = new Set<string>();
  for (const c of canvases) {
    let fileBase = slugify(c.name);
    while (usedNames.has(fileBase.toLowerCase())) fileBase = `${fileBase}_2`;
    usedNames.add(fileBase.toLowerCase());
    const wb = buildCanvasWorkbook(c, nodesByCanvas.get(c.id) || [], tEdgesByCanvas.get(c.id) || [], cEdgesByCanvas.get(c.id) || [], project);
    excelDir.file(`${fileBase}.xlsx`, workbookToArrayBuffer(wb));
  }

  zip.file('README.txt', [
    `Lineage Canvas — project bundle`,
    `Project: ${project.name}`,
    `Exported: ${bundle.exportedAt}`,
    ``,
    `Contents:`,
    `  project.json        Lossless data. Import via "Import project" to load the`,
    `                      full project (tables, lineage, saved comparisons) into the app.`,
    `  excel/*.xlsx        One filled template per canvas for offline analysis. Each can`,
    `                      also be re-imported individually via "Upload Excel".`,
    ``,
    `Note: in the Excel files, tables are keyed by name; if two tables (e.g. across`,
    `Legacy/Target) share a name, their connections are ambiguous in Excel — use`,
    `project.json for a lossless round-trip.`,
  ].join('\n'));

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `project-${slugify(project.name)}.zip`);
}

// ---------------------------------------------------------------------------
// Import (additive, fresh ids)
// ---------------------------------------------------------------------------

export async function importProjectBundle(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const jsonFile = zip.file('project.json');
  if (!jsonFile) throw new Error('Not a project bundle: project.json is missing.');
  const bundle = JSON.parse(await jsonFile.async('string')) as ProjectBundle;
  if (bundle.bundleType !== 'project') throw new Error('Not a project bundle.');

  const newProjectId = uuidv4();
  const project: Project = { ...bundle.project, id: newProjectId };

  const canvasIdMap = new Map<string, string>();
  for (const c of bundle.canvases) canvasIdMap.set(c.id, uuidv4());
  const swap = makeDatasetSwap(canvasIdMap);
  const newCanvas = (oldId: string) => canvasIdMap.get(oldId) ?? oldId;

  const uploadIdMap = new Map<string, string>();
  for (const u of bundle.uploadRecs) uploadIdMap.set(u.uploadId, uuidv4());
  const mapUpload = (uid: string) => uploadIdMap.get(uid) ?? uid;

  const canvases = bundle.canvases.map(c => ({ ...c, id: newCanvas(c.id), projectId: newProjectId }));

  const tableNodes = bundle.tableNodes.map(n => ({
    ...n,
    datasetId: swap(n.datasetId),
    canvasId: newCanvas(n.canvasId),
    createdByUploadId: n.createdByUploadId ? mapUpload(n.createdByUploadId) : undefined,
    referencedByUploadIds: (n.referencedByUploadIds || []).map(mapUpload),
  }));

  const tableEdges = bundle.tableEdges.map(e => ({
    ...e,
    edgeId: `${newCanvas(e.canvasId)}::${uuidv4()}`,
    canvasId: newCanvas(e.canvasId),
    uploadId: mapUpload(e.uploadId),
    fromDataset: swap(e.fromDataset),
    toDataset: swap(e.toDataset),
    processId: swap(e.processId),
  }));

  const columnEdges = bundle.columnEdges.map(e => ({
    ...e,
    edgeId: `${newCanvas(e.canvasId)}::${uuidv4()}`,
    canvasId: newCanvas(e.canvasId),
    uploadId: mapUpload(e.uploadId),
    target: { datasetId: swap(e.target.datasetId), column: e.target.column },
    sources: e.sources.map(s => ({ datasetId: swap(s.datasetId), column: s.column })),
    processId: swap(e.processId),
  }));

  const processRecs = bundle.processRecs.map(p => ({
    ...p,
    processId: swap(p.processId),
    canvasId: newCanvas(p.canvasId),
    uploadId: mapUpload(p.uploadId),
    inputs: p.inputs.map(swap),
    outputs: p.outputs.map(swap),
  }));

  const uploadRecs = bundle.uploadRecs.map(u => ({ ...u, uploadId: mapUpload(u.uploadId), canvasId: newCanvas(u.canvasId) }));

  const comparisons = bundle.comparisons.map(cmp => ({
    ...cmp,
    id: uuidv4(),
    projectId: newProjectId,
    left: cmp.left ? { ...cmp.left, datasetId: swap(cmp.left.datasetId) } : undefined,
    right: cmp.right ? { ...cmp.right, datasetId: swap(cmp.right.datasetId) } : undefined,
    columnPairs: cmp.columnPairs?.map(p => ({
      left: { ...p.left, datasetId: swap(p.left.datasetId) },
      right: { ...p.right, datasetId: swap(p.right.datasetId) },
    })),
  }));

  await Repository.saveImportedProjectBundle({
    project, canvases, comparisons, tableNodes, tableEdges, columnEdges, processRecs, uploadRecs,
  });
  return newProjectId;
}
