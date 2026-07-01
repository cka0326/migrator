import type { Node, Edge } from '@xyflow/react';
import type { TableNode } from '../types/models';
import { COLUMN_PREVIEW_LIMIT } from './columnPreview';

// Deterministic layered-grid layout for the canvas.
//
// Tables flow left → right by connection depth: sources (no incoming edges) sit in
// the leftmost column, and every other table's column is its longest path from a
// source. Within a column, tables are ordered to minimise edge crossings (iterative
// barycenter sweeps) and packed top-to-bottom without overlapping. The result is
// deterministic, so re-running it on unchanged data yields identical positions.

const NODE_WIDTH = 280;
const H_GAP = 120;                 // horizontal gap between columns
const V_GAP = 48;                  // vertical gap between stacked cards
const BARYCENTER_SWEEPS = 4;

// Height a card occupies in the canvas. Capped at the collapsed preview so layout
// is stable regardless of whether a node is currently expanded.
function estHeight(node: Node): number {
  const cols = (node.data as unknown as TableNode).columns?.length ?? 0;
  return 80 + Math.min(cols, COLUMN_PREVIEW_LIMIT) * 32;
}

export interface GridLayoutOptions {
  // Height each card occupies (override for focus views where cards are expanded).
  heightOf?: (node: Node) => number;
  hGap?: number;                   // horizontal gap between columns
  vGap?: number;                   // vertical gap between stacked cards
  centerColumns?: boolean;         // center each column vertically around y=0
}

const nodeName = (node: Node) => {
  const t = node.data as unknown as TableNode;
  return (t.namespace ? `${t.namespace}.${t.name}` : t.name) ?? node.id;
};

export function gridLayout(nodes: Node[], edges: Edge[], opts: GridLayoutOptions = {}): { nodes: Node[] } {
  if (nodes.length === 0) return { nodes };
  const heightFn = opts.heightOf ?? estHeight;
  const hGap = opts.hGap ?? H_GAP;
  const vGap = opts.vGap ?? V_GAP;
  const stride = NODE_WIDTH + hGap;

  const ids = new Set(nodes.map(n => n.id));
  // Keep only edges whose endpoints are both present; collapse duplicates.
  const links = edges.filter(e => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);

  const succ = new Map<string, Set<string>>();
  const pred = new Map<string, Set<string>>();
  for (const id of ids) { succ.set(id, new Set()); pred.set(id, new Set()); }
  for (const e of links) { succ.get(e.source)!.add(e.target); pred.get(e.target)!.add(e.source); }

  // --- Layer assignment: longest path from a source (in-degree 0). ---
  // Kahn's ordering gives a safe processing order; a visited guard makes cycles
  // terminate (a back-edge node just lands one past its processed predecessors).
  const indeg = new Map<string, number>();
  for (const id of ids) indeg.set(id, pred.get(id)!.size);
  const layer = new Map<string, number>();
  for (const id of ids) layer.set(id, 0);

  const queue: string[] = [...ids].filter(id => indeg.get(id) === 0).sort((a, b) => a.localeCompare(b));
  const processed = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (processed.has(id)) continue;
    processed.add(id);
    for (const t of succ.get(id)!) {
      layer.set(t, Math.max(layer.get(t)!, layer.get(id)! + 1));
      indeg.set(t, indeg.get(t)! - 1);
      if (indeg.get(t)! <= 0 && !processed.has(t)) queue.push(t);
    }
  }
  // Any nodes left unprocessed (cycles) still have a layer from partial relaxation.

  // --- Group into columns; seed order by name for stable, deterministic output. ---
  const maxLayer = Math.max(...[...layer.values()]);
  const columns: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const id of ids) columns[layer.get(id)!].push(id);
  const nameById = new Map(nodes.map(n => [n.id, nodeName(n)]));
  for (const col of columns) col.sort((a, b) => nameById.get(a)!.localeCompare(nameById.get(b)!));

  // --- Barycenter crossing reduction: alternate forward/backward sweeps. ---
  const orderIndex = (col: string[]) => new Map(col.map((id, i) => [id, i]));
  const bary = (id: string, neighbors: Set<string>, idx: Map<string, number>) => {
    let sum = 0, n = 0;
    for (const nb of neighbors) { const i = idx.get(nb); if (i !== undefined) { sum += i; n++; } }
    return n === 0 ? -1 : sum / n; // -1 keeps neighbourless nodes in place (stable sort)
  };
  const sweep = (order: string[], neighborsOf: (id: string) => Set<string>, refIdx: Map<string, number>) => {
    const b = new Map(order.map(id => [id, bary(id, neighborsOf(id), refIdx)]));
    // Nodes with no neighbours (bary -1) keep their current slot.
    const withPos = order.map((id, i) => ({ id, b: b.get(id)!, i }));
    withPos.sort((x, y) => {
      const bx = x.b < 0 ? x.i : x.b;
      const by = y.b < 0 ? y.i : y.b;
      return bx - by || x.i - y.i;
    });
    return withPos.map(w => w.id);
  };
  for (let s = 0; s < BARYCENTER_SWEEPS; s++) {
    for (let l = 1; l <= maxLayer; l++) {
      columns[l] = sweep(columns[l], id => pred.get(id)!, orderIndex(columns[l - 1]));
    }
    for (let l = maxLayer - 1; l >= 0; l--) {
      columns[l] = sweep(columns[l], id => succ.get(id)!, orderIndex(columns[l + 1]));
    }
  }

  // --- Assign positions: uniform x per column, packed y within each column. ---
  const byId = new Map(nodes.map(n => [n.id, n]));
  const positions = new Map<string, { x: number; y: number }>();
  columns.forEach((col, l) => {
    const heights = col.map(id => heightFn(byId.get(id)!));
    const total = heights.reduce((s, h) => s + h, 0) + vGap * Math.max(0, col.length - 1);
    let y = opts.centerColumns ? -total / 2 : 0;
    col.forEach((id, i) => {
      positions.set(id, { x: l * stride, y });
      y += heights[i] + vGap;
    });
  });

  return { nodes: nodes.map(n => ({ ...n, position: positions.get(n.id) ?? { x: 0, y: 0 } })) };
}
