import { v4 as uuidv4 } from 'uuid';
import { LineageExtractSchema } from '../schema/lineageSchema';
import { tableEdgeId, columnEdgeId } from '../lib/edgeIds';
import {
  DEFAULT_NAMESPACE,
  type ParsedImportModel,
  type ParsedTable,
  type ImportTarget,
  type ImportOptions,
  type ImportSummary,
} from '../lib/importModel';

import type { UploadRec, TableEdge, ColumnEdge, TableNode, ColumnDef, System } from '../types/models';
import { db } from './database';

const up = (s: string) => s.trim().toUpperCase();
const stripUndefined = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/**
 * Parse + validate a v1.0 JSON extract into a source-agnostic ParsedImportModel.
 * Identifiers are upper-cased and namespaces default to DEFAULT_UNKNOWN so the model
 * lines up with how tables are identified in the canvas.
 */
export function parseLineageExtract(fileContent: string): ParsedImportModel {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch {
    throw new Error('Invalid JSON format');
  }

  const result = LineageExtractSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Schema validation failed: ${result.error.message}`);
  }
  const data = result.data;

  return {
    source: 'JSON',
    tables: data.tables.map(t => ({
      name: up(t.name),
      namespace: t.namespace && t.namespace.trim() ? up(t.namespace) : DEFAULT_NAMESPACE,
      columns: (t.columns || []).map(c => ({ name: up(c.name), dataType: c.data_type })),
    })),
    tableConnections: data.table_connections.map(tc => ({ from: up(tc.from), to: up(tc.to) })),
    columnConnections: data.column_connections.map(cc => ({
      target: { table: up(cc.target.table), column: up(cc.target.column) },
      sources: cc.sources.map(s => ({ table: up(s.table), column: up(s.column) })),
    })),
  };
}

/**
 * Write a ParsedImportModel into a canvas. Additive by default: creates missing
 * tables, APPENDS new columns to existing tables, and adds connections — never
 * overwriting metadata or deleting anything. The override modes (Excel) additionally
 * overwrite metadata and (for 'override-metadata-connections') REPLACE the affected
 * tables' connections. All writes happen in one transaction.
 */
export async function ingestParsedModel(
  model: ParsedImportModel,
  target: ImportTarget,
  options: ImportOptions,
): Promise<ImportSummary> {
  const { canvasId, defaultSystem } = target;
  const { mode } = options;
  const uploadId = uuidv4();
  const now = new Date().toISOString();

  const tableByName = new Map<string, ParsedTable>();
  for (const t of model.tables) tableByName.set(t.name, t);

  const systemOf = (name: string): System => tableByName.get(name)?.system ?? defaultSystem;
  const namespaceOf = (name: string): string => tableByName.get(name)?.namespace ?? DEFAULT_NAMESPACE;
  const datasetIdOf = (name: string): string => `${canvasId}::${systemOf(name)}:${namespaceOf(name)}.${name}`;

  // Every table name referenced anywhere (declared or only in a connection).
  const allNames = new Set<string>(model.tables.map(t => t.name));
  for (const tc of model.tableConnections) { allNames.add(tc.from); allNames.add(tc.to); }
  for (const cc of model.columnConnections) {
    allNames.add(cc.target.table);
    for (const s of cc.sources) allNames.add(s.table);
  }

  // Columns referenced by column connections, grouped by table name (so referenced
  // columns are materialised even if the table didn't list them).
  const edgeCols = new Map<string, Set<string>>();
  const addEdgeCol = (table: string, column: string) => {
    if (!edgeCols.has(table)) edgeCols.set(table, new Set());
    edgeCols.get(table)!.add(column);
  };
  for (const cc of model.columnConnections) {
    addEdgeCol(cc.target.table, cc.target.column);
    for (const s of cc.sources) addEdgeCol(s.table, s.column);
  }

  const summary: ImportSummary = { tables: 0, newTables: 0, columnsAdded: 0, tableEdges: 0, columnEdges: 0, stubsCreated: 0 };

  await db.transaction('rw', [db.tableNodes, db.tableEdges, db.columnEdges, db.uploadRecs], async () => {
    // 'override-metadata-connections': replace the affected (declared) tables' edges.
    if (mode === 'override-metadata-connections') {
      const affected = new Set(model.tables.map(t => datasetIdOf(t.name)));
      const te = await db.tableEdges.where('canvasId').equals(canvasId).toArray();
      const teDel = te.filter(e => affected.has(e.fromDataset) || affected.has(e.toDataset)).map(e => e.edgeId);
      if (teDel.length) await db.tableEdges.bulkDelete(teDel);
      const ce = await db.columnEdges.where('canvasId').equals(canvasId).toArray();
      const ceDel = ce.filter(e => affected.has(e.target.datasetId) || e.sources.some(s => affected.has(s.datasetId))).map(e => e.edgeId);
      if (ceDel.length) await db.columnEdges.bulkDelete(ceDel);
    }

    // Reconcile every referenced table.
    for (const name of allNames) {
      const datasetId = datasetIdOf(name);
      const declared = tableByName.get(name);
      const existing = await db.tableNodes.get(datasetId);

      const declaredCols = declared?.columns ?? [];
      const referenced = edgeCols.get(name) ?? new Set<string>();
      const wantNames = new Set<string>([...declaredCols.map(c => c.name), ...referenced]);

      const columns: ColumnDef[] = existing ? [...existing.columns] : [];
      const byName = new Map(columns.map(c => [c.name, c] as const));

      for (const colName of wantNames) {
        const dcl = declaredCols.find(c => c.name === colName);
        const found = byName.get(colName);
        if (!found) {
          const col: ColumnDef = {
            name: colName,
            dataType: dcl?.dataType ? up(dcl.dataType) : 'UNKNOWN',
            ordinal: columns.length + 1,
            origin: model.source === 'EXCEL' ? 'EXCEL' : 'LINEAGE',
            metadata: dcl?.metadata ? { ...dcl.metadata } : {},
            stats: dcl?.stats ? { ...dcl.stats } : {},
            createdByUploadId: existing ? undefined : uploadId,
          };
          columns.push(col);
          byName.set(colName, col);
          summary.columnsAdded++;
        } else if (mode !== 'additive' && dcl) {
          // Override modes refresh an existing column's type/metadata/stats from the import.
          if (dcl.dataType) found.dataType = up(dcl.dataType);
          if (dcl.metadata) found.metadata = { ...found.metadata, ...stripUndefined(dcl.metadata) };
          if (dcl.stats) found.stats = { ...found.stats, ...stripUndefined(dcl.stats) };
        }
      }

      if (existing) {
        existing.columns = columns;
        if (mode !== 'additive' && declared?.metadata) {
          existing.metadata = { ...existing.metadata, ...stripUndefined(declared.metadata) };
        }
        // A previously-stubbed table that's now described becomes a real node.
        if (declared && existing.origin === 'STUB') {
          existing.origin = model.source === 'EXCEL' ? 'EXCEL' : 'IMPORT';
          existing.completeness = 'PARTIAL';
        }
        if (!existing.referencedByUploadIds.includes(uploadId)) existing.referencedByUploadIds.push(uploadId);
        existing.updatedAt = now;
        await db.tableNodes.put(existing);
      } else {
        const isStub = !declared;
        const namespace = namespaceOf(name);
        const node: TableNode = {
          datasetId,
          canvasId,
          system: systemOf(name),
          namespace,
          name,
          qualifiedName: `${namespace}.${name}`,
          origin: isStub ? 'STUB' : (model.source === 'EXCEL' ? 'EXCEL' : 'IMPORT'),
          completeness: isStub ? 'STUB' : 'PARTIAL',
          metadata: { ...(declared?.metadata ? stripUndefined(declared.metadata) : {}), columnCount: columns.length },
          columns,
          createdByUploadId: uploadId,
          referencedByUploadIds: [uploadId],
          createdAt: now,
          updatedAt: now,
        };
        await db.tableNodes.put(node);
        summary.newTables++;
        if (isStub) summary.stubsCreated++;
      }
      summary.tables++;
    }

    // Table edges (content ids → idempotent upsert, de-duped within the batch).
    const teMap = new Map<string, TableEdge>();
    for (const tc of model.tableConnections) {
      const fromDataset = datasetIdOf(tc.from);
      const toDataset = datasetIdOf(tc.to);
      const edgeId = tableEdgeId(fromDataset, toDataset);
      teMap.set(edgeId, { edgeId, canvasId, uploadId, fromDataset, toDataset, processId: `${canvasId}::IMPORT` });
    }
    if (teMap.size) await db.tableEdges.bulkPut([...teMap.values()]);
    summary.tableEdges = teMap.size;

    // Column edges.
    const ceMap = new Map<string, ColumnEdge>();
    for (const cc of model.columnConnections) {
      const tgt = { datasetId: datasetIdOf(cc.target.table), column: cc.target.column };
      const srcs = cc.sources.map(s => ({ datasetId: datasetIdOf(s.table), column: s.column }));
      const edgeId = columnEdgeId(tgt, srcs);
      ceMap.set(edgeId, { edgeId, canvasId, uploadId, target: tgt, sources: srcs, processId: `${canvasId}::IMPORT`, transformationType: 'UNKNOWN' });
    }
    if (ceMap.size) await db.columnEdges.bulkPut([...ceMap.values()]);
    summary.columnEdges = ceMap.size;

    const uploadRec: UploadRec = {
      uploadId,
      canvasId,
      kind: options.kind,
      fileName: options.fileName,
      system: defaultSystem,
      uploadedAt: now,
      status: 'ACTIVE',
      summary: {
        datasets: summary.tables,
        processes: 0,
        tableEdges: summary.tableEdges,
        columnEdges: summary.columnEdges,
        stubsCreated: summary.stubsCreated,
      },
      rawPayload: options.rawPayload ?? '',
    };
    await db.uploadRecs.put(uploadRec);
  });

  return summary;
}
