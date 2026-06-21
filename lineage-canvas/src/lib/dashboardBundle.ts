// Export/import a migration-status dashboard as a shareable .zip bundle:
//   dashboard.json  — config PLUS every referenced project/canvas/table/mapping, so a
//                     recipient can open it live in the Dashboard tab.
//   status.xlsx     — summary + per-canvas table-status sheets for offline reading.
//   report.html     — self-contained visual snapshot (same as the HTML export).
// Import is additive: referenced project/canvas/tables/mappings are inserted only if
// missing (original ids preserved), then the dashboard is added with a new id.

import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { Repository } from '../db/repository';
import { downloadBlob, slugify } from './download';
import { resolveDashboardModel, type DashboardModel } from './dashboardModel';
import { buildDashboardHTML } from './dashboardReport';
import { VALIDATION_LABELS } from './migrationStatus';
import type { SavedDashboard, Project, Canvas, TableNode, TableMapping } from '../types/models';

interface DashboardBundle {
  bundleType: 'dashboard';
  version: 1;
  exportedAt: string;
  dashboard: SavedDashboard;
  projects: Project[];
  canvases: Canvas[];
  tableNodes: TableNode[];
  tableMappings: TableMapping[];
}

const qn = (n?: TableNode) => (n ? (n.namespace ? `${n.namespace}.${n.name}` : n.name) : '∅ (deleted)');

function buildStatusWorkbook(model: DashboardModel): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const summary: Array<Array<string | number>> = [
    ['Project', model.project?.name ?? ''],
    ['Scope', model.scope],
    ['Generated', model.generatedAt],
    [],
    ['Canvas', 'Legacy tables', 'Target tables', 'Mapped tables', 'Table coverage %',
      'Column coverage %', 'Mismatches', 'Validated', 'In progress', 'Not started', 'Issues'],
  ];
  for (const e of model.entries) {
    const s = e.status;
    summary.push([
      e.canvas.name, s.legacyTableCount, s.targetTableCount,
      Math.max(s.mappedLegacyCount, s.mappedTargetCount), s.tableCoveragePct, s.columnCoveragePct,
      s.mismatchCount, s.validationHistogram.VALIDATED, s.validationHistogram.IN_PROGRESS,
      s.validationHistogram.NOT_STARTED, s.validationHistogram.ISSUE,
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

  const used = new Set<string>();
  for (const e of model.entries) {
    const byId = new Map(e.nodes.map(n => [n.datasetId, n]));
    const aoa: Array<Array<string | number>> = [[
      'Legacy table', 'Target table', 'Mapped cols', 'Legacy cols', 'Target cols',
      'Coverage %', 'Type mismatches', 'Derived', 'Validation', 'Notes',
    ]];
    for (const m of e.status.perMapping) {
      aoa.push([
        qn(byId.get(m.legacyDatasetId)), qn(byId.get(m.targetDatasetId)),
        m.mappedColumnCount, m.legacyColumnCount, m.targetColumnCount, m.columnCoveragePct,
        m.typeMismatches.length, m.derived, VALIDATION_LABELS[m.validationState],
        e.mappings.find(x => x.id === m.mappingId)?.notes ?? '',
      ]);
    }
    // Sheet names: max 31 chars, unique.
    let name = slugify(e.canvas.name).slice(0, 28) || 'canvas';
    let n = name; let i = 2;
    while (used.has(n.toLowerCase())) { n = `${name.slice(0, 26)}_${i++}`; }
    used.add(n.toLowerCase());
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n);
  }
  return wb;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportDashboardBundle(dashboard: SavedDashboard): Promise<void> {
  const model = await resolveDashboardModel(dashboard);

  const projects: Project[] = model.project ? [model.project] : [];
  const canvases: Canvas[] = model.entries.map(e => e.canvas);
  const tableNodes: TableNode[] = model.entries.flatMap(e => e.nodes);
  const tableMappings: TableMapping[] = model.entries.flatMap(e => e.mappings);

  const bundle: DashboardBundle = {
    bundleType: 'dashboard', version: 1, exportedAt: new Date().toISOString(),
    dashboard, projects, canvases, tableNodes, tableMappings,
  };

  const zip = new JSZip();
  zip.file('dashboard.json', JSON.stringify(bundle, null, 2));
  zip.file('status.xlsx', XLSX.write(buildStatusWorkbook(model), { type: 'array', bookType: 'xlsx' }));
  zip.file('report.html', buildDashboardHTML(model, dashboard.name));
  zip.file('README.txt', [
    `DataTrace — migration status dashboard bundle`,
    `Dashboard: ${dashboard.name} (scope: ${dashboard.scope})`,
    `Project: ${model.project?.name ?? '(missing)'}`,
    `Exported: ${bundle.exportedAt}`,
    ``,
    `  dashboard.json   Config + referenced project/canvas/tables/mappings. Import via`,
    `                   "Import dashboard" to open it live in the app.`,
    `  status.xlsx      Summary + per-canvas table-status sheets for offline analysis.`,
    `  report.html      Self-contained visual snapshot — open in any browser.`,
  ].join('\n'));

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `dashboard-${slugify(dashboard.name)}.zip`);
}

// ---------------------------------------------------------------------------
// Import (additive; keeps original ids, only fills in what's missing)
// ---------------------------------------------------------------------------

export async function importDashboardBundle(file: File): Promise<SavedDashboard> {
  const zip = await JSZip.loadAsync(file);
  const jsonFile = zip.file('dashboard.json');
  if (!jsonFile) throw new Error('Not a dashboard bundle: dashboard.json is missing.');
  const bundle = JSON.parse(await jsonFile.async('string')) as DashboardBundle;
  if (bundle.bundleType !== 'dashboard') throw new Error('Not a dashboard bundle.');

  const dashboard: SavedDashboard = { ...bundle.dashboard, id: uuidv4() };

  await Repository.saveImportedDashboard({
    dashboard,
    projects: bundle.projects || [],
    canvases: bundle.canvases || [],
    tableNodes: bundle.tableNodes || [],
    tableMappings: bundle.tableMappings || [],
  });
  return dashboard;
}
