// Resolves a dashboard selection (saved or live) into a fully computed model that
// the DashboardView renders and the exporters (ZIP / HTML / PDF) serialise. Keeping
// this in one place means the on-screen dashboard and every export show identical
// numbers. Data is read from the Repository, status computed via migrationStatus.

import { Repository } from '../db/repository';
import { canvasStatus, trendStatus, type CanvasStatus, type TrendPoint } from './migrationStatus';
import type { Project, Canvas, TableNode, TableMapping, DashboardScope } from '../types/models';

export interface CanvasStatusEntry {
  canvas: Canvas;
  nodes: TableNode[];
  mappings: TableMapping[];
  status: CanvasStatus;
}

export interface DashboardModel {
  scope: DashboardScope;
  project: Project | null;
  entries: CanvasStatusEntry[];   // one entry for "canvas" scope; all canvases for "trend"
  trend: TrendPoint[];            // populated only for "trend" scope
  generatedAt: string;
}

export interface DashboardSelection {
  scope: DashboardScope;
  projectId: string;
  canvasId?: string;              // required for "canvas" scope
}

export async function resolveDashboardModel(input: DashboardSelection): Promise<DashboardModel> {
  const project = (await Repository.getProject(input.projectId)) ?? null;

  let canvases: Canvas[] = [];
  if (input.scope === 'canvas') {
    if (input.canvasId) {
      const c = await Repository.getCanvas(input.canvasId);
      if (c) canvases = [c];
    }
  } else {
    canvases = (await Repository.getCanvasesByProject(input.projectId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const entries: CanvasStatusEntry[] = [];
  const statusByCanvas: Record<string, CanvasStatus> = {};
  for (const c of canvases) {
    const [nodes, mappings] = await Promise.all([
      Repository.getTableNodesByCanvas(c.id),
      Repository.getTableMappingsByCanvas(c.id),
    ]);
    const status = canvasStatus(nodes, mappings);
    statusByCanvas[c.id] = status;
    entries.push({ canvas: c, nodes, mappings, status });
  }

  const trend = input.scope === 'trend' ? trendStatus(canvases, statusByCanvas) : [];
  return { scope: input.scope, project, entries, trend, generatedAt: new Date().toISOString() };
}
