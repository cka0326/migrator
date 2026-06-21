// Migration validation status engine.
//
// Pure functions that turn canvas TableNodes + TableMappings into the numbers the
// Mapping view and the Dashboard render. Type equivalence reuses dataTypesEquivalent
// so that columns carrying the same underlying type across Snowflake/SAS/Python are
// not counted as mismatches just because the spelling differs (see ./dataTypes).

import type { TableNode, TableMapping, ValidationState } from '../types/models';
import { dataTypesEquivalent } from './dataTypes';

// Derived status of a single table mapping, computed from its column pairings.
export type DerivedStatus = 'COMPLETE' | 'PARTIAL' | 'MISMATCH';

export interface TypeMismatch {
  legacyColumn: string;
  targetColumn: string;
  legacyType: string;
  targetType: string;
}

export interface TableMappingStatus {
  mappingId: string;
  legacyDatasetId: string;
  targetDatasetId: string;
  legacyExists: boolean;
  targetExists: boolean;
  legacyColumnCount: number;
  targetColumnCount: number;
  mappedColumnCount: number;
  unmappedLegacy: string[];        // legacy columns with no pairing
  unmappedTarget: string[];        // target columns with no pairing
  typeMismatches: TypeMismatch[];  // mapped pairs whose types are not equivalent
  // Coverage = mapped columns / max(legacy, target) columns. 100 when both empty.
  columnCoveragePct: number;
  derived: DerivedStatus;
  validationState: ValidationState;
}

const colByName = (node: TableNode | undefined, name: string) =>
  node?.columns.find(c => c.name.toUpperCase() === name.toUpperCase());

export function tableMappingStatus(
  mapping: TableMapping,
  legacyNode: TableNode | undefined,
  targetNode: TableNode | undefined,
): TableMappingStatus {
  const legacyCols = legacyNode?.columns ?? [];
  const targetCols = targetNode?.columns ?? [];

  // Only count pairings whose endpoints still exist on both tables.
  const livePairs = mapping.columnMappings.filter(
    cp => colByName(legacyNode, cp.legacyColumn) && colByName(targetNode, cp.targetColumn),
  );

  const pairedLegacy = new Set(livePairs.map(cp => cp.legacyColumn.toUpperCase()));
  const pairedTarget = new Set(livePairs.map(cp => cp.targetColumn.toUpperCase()));

  const unmappedLegacy = legacyCols.filter(c => !pairedLegacy.has(c.name.toUpperCase())).map(c => c.name);
  const unmappedTarget = targetCols.filter(c => !pairedTarget.has(c.name.toUpperCase())).map(c => c.name);

  const typeMismatches: TypeMismatch[] = [];
  for (const cp of livePairs) {
    const lc = colByName(legacyNode, cp.legacyColumn)!;
    const tc = colByName(targetNode, cp.targetColumn)!;
    if (!dataTypesEquivalent(lc.dataType, tc.dataType)) {
      typeMismatches.push({
        legacyColumn: lc.name, targetColumn: tc.name,
        legacyType: lc.dataType, targetType: tc.dataType,
      });
    }
  }

  const denom = Math.max(legacyCols.length, targetCols.length);
  const columnCoveragePct = denom === 0 ? 100 : Math.round((livePairs.length / denom) * 100);

  let derived: DerivedStatus;
  if (typeMismatches.length > 0) derived = 'MISMATCH';
  else if (unmappedLegacy.length === 0 && unmappedTarget.length === 0 && denom > 0) derived = 'COMPLETE';
  else derived = 'PARTIAL';

  return {
    mappingId: mapping.id,
    legacyDatasetId: mapping.legacyDatasetId,
    targetDatasetId: mapping.targetDatasetId,
    legacyExists: !!legacyNode,
    targetExists: !!targetNode,
    legacyColumnCount: legacyCols.length,
    targetColumnCount: targetCols.length,
    mappedColumnCount: livePairs.length,
    unmappedLegacy,
    unmappedTarget,
    typeMismatches,
    columnCoveragePct,
    derived,
    validationState: mapping.validationState,
  };
}

export const VALIDATION_STATES: ValidationState[] = ['NOT_STARTED', 'IN_PROGRESS', 'VALIDATED', 'ISSUE'];

export interface CanvasStatus {
  legacyTableCount: number;
  targetTableCount: number;
  mappedLegacyCount: number;          // distinct legacy tables that appear in a mapping
  mappedTargetCount: number;
  unmappedLegacy: TableNode[];
  unmappedTarget: TableNode[];
  tableCoveragePct: number;           // mapped tables / max(legacy, target) tables
  columnCoveragePct: number;          // total mapped cols / total comparable cols
  totalMappedColumns: number;
  totalComparableColumns: number;
  mismatchCount: number;              // mappings with a type mismatch
  validationHistogram: Record<ValidationState, number>;
  derivedHistogram: Record<DerivedStatus, number>;
  perMapping: TableMappingStatus[];
}

export function canvasStatus(nodes: TableNode[], mappings: TableMapping[]): CanvasStatus {
  const byId = new Map(nodes.map(n => [n.datasetId, n]));
  const legacy = nodes.filter(n => n.system === 'LEGACY');
  const target = nodes.filter(n => n.system === 'TARGET');

  const perMapping = mappings.map(m => tableMappingStatus(m, byId.get(m.legacyDatasetId), byId.get(m.targetDatasetId)));

  const mappedLegacyIds = new Set(perMapping.filter(s => s.legacyExists).map(s => s.legacyDatasetId));
  const mappedTargetIds = new Set(perMapping.filter(s => s.targetExists).map(s => s.targetDatasetId));

  const unmappedLegacy = legacy.filter(n => !mappedLegacyIds.has(n.datasetId));
  const unmappedTarget = target.filter(n => !mappedTargetIds.has(n.datasetId));

  const tableDenom = Math.max(legacy.length, target.length);
  const mappedTables = Math.max(mappedLegacyIds.size, mappedTargetIds.size);
  const tableCoveragePct = tableDenom === 0 ? 0 : Math.round((mappedTables / tableDenom) * 100);

  const totalMappedColumns = perMapping.reduce((s, m) => s + m.mappedColumnCount, 0);
  const totalComparableColumns = perMapping.reduce(
    (s, m) => s + Math.max(m.legacyColumnCount, m.targetColumnCount), 0);
  const columnCoveragePct = totalComparableColumns === 0 ? 0
    : Math.round((totalMappedColumns / totalComparableColumns) * 100);

  const validationHistogram: Record<ValidationState, number> =
    { NOT_STARTED: 0, IN_PROGRESS: 0, VALIDATED: 0, ISSUE: 0 };
  const derivedHistogram: Record<DerivedStatus, number> = { COMPLETE: 0, PARTIAL: 0, MISMATCH: 0 };
  for (const m of perMapping) {
    validationHistogram[m.validationState]++;
    derivedHistogram[m.derived]++;
  }

  return {
    legacyTableCount: legacy.length,
    targetTableCount: target.length,
    mappedLegacyCount: mappedLegacyIds.size,
    mappedTargetCount: mappedTargetIds.size,
    unmappedLegacy,
    unmappedTarget,
    tableCoveragePct,
    columnCoveragePct,
    totalMappedColumns,
    totalComparableColumns,
    mismatchCount: perMapping.filter(m => m.typeMismatches.length > 0).length,
    validationHistogram,
    derivedHistogram,
    perMapping,
  };
}

export interface TrendPoint {
  canvasId: string;
  canvasName: string;
  createdAt: string;
  tableCoveragePct: number;
  columnCoveragePct: number;
  mappedTables: number;
  totalTables: number;            // max(legacy, target) tables
  validationHistogram: Record<ValidationState, number>;
  mismatchCount: number;
}

// Build a time-ordered series from per-canvas status. `canvases` should already be
// the project's canvases; `statusByCanvas` maps canvasId -> its CanvasStatus.
export function trendStatus(
  canvases: { id: string; name: string; createdAt: string }[],
  statusByCanvas: Record<string, CanvasStatus>,
): TrendPoint[] {
  return [...canvases]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(c => {
      const s = statusByCanvas[c.id];
      return {
        canvasId: c.id,
        canvasName: c.name,
        createdAt: c.createdAt,
        tableCoveragePct: s?.tableCoveragePct ?? 0,
        columnCoveragePct: s?.columnCoveragePct ?? 0,
        mappedTables: s ? Math.max(s.mappedLegacyCount, s.mappedTargetCount) : 0,
        totalTables: s ? Math.max(s.legacyTableCount, s.targetTableCount) : 0,
        validationHistogram: s?.validationHistogram ?? { NOT_STARTED: 0, IN_PROGRESS: 0, VALIDATED: 0, ISSUE: 0 },
        mismatchCount: s?.mismatchCount ?? 0,
      };
    });
}

// ---------- shared display helpers (used by views + exports) ----------

export const VALIDATION_LABELS: Record<ValidationState, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  VALIDATED: 'Validated',
  ISSUE: 'Issue',
};

// Hex colors so they work in inline-SVG charts and the standalone HTML export too.
export const VALIDATION_COLORS: Record<ValidationState, string> = {
  NOT_STARTED: '#cbd5e1', // slate-300
  IN_PROGRESS: '#60a5fa', // blue-400
  VALIDATED: '#34d399',   // emerald-400
  ISSUE: '#f87171',       // red-400
};

export const DERIVED_COLORS: Record<DerivedStatus, string> = {
  COMPLETE: '#34d399',
  PARTIAL: '#fbbf24',
  MISMATCH: '#f87171',
};
