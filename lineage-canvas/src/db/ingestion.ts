import { v4 as uuidv4 } from 'uuid';
import { LineageExtractSchema } from '../schema/lineageSchema';

import type { UploadRec, ProcessRec, TableEdge, ColumnEdge, TableNode, ColumnDef, System } from '../types/models';
import { db } from './database';

export async function ingestLineageJSON(fileContent: string, fileName: string) {
  let parsed: any;
  try {
    parsed = JSON.parse(fileContent);
  } catch (e) {
    throw new Error("Invalid JSON format");
  }

  const result = LineageExtractSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Schema validation failed: ${result.error.message}`);
  }

  const data = result.data;
  const uploadId = uuidv4();
  const system = data.extract.source_system as System;

  let stubsCreated = 0;
  
  const edgeReferencedColumns = new Map<string, Set<string>>();
  for (const ce of data.column_edges) {
    if (!edgeReferencedColumns.has(ce.target.dataset_id)) edgeReferencedColumns.set(ce.target.dataset_id, new Set());
    edgeReferencedColumns.get(ce.target.dataset_id)!.add(ce.target.column);
    
    for (const source of ce.sources) {
      if (!edgeReferencedColumns.has(source.dataset_id)) edgeReferencedColumns.set(source.dataset_id, new Set());
      edgeReferencedColumns.get(source.dataset_id)!.add(source.column);
    }
  }

  // We use Dexie transaction for all these writes
  await db.transaction('rw', [db.tableNodes, db.processRecs, db.tableEdges, db.columnEdges, db.uploadRecs], async () => {
    
    // 1. Reconcile Datasets
    for (const ds of data.datasets) {
      const existingNode = await db.tableNodes.get(ds.dataset_id);
      
      const extractColumns = ds.columns || [];
      const edgeCols = edgeReferencedColumns.get(ds.dataset_id) || new Set();
      const allColNames = new Set([...extractColumns.map(c => c.name), ...edgeCols]);

      const finalColumns: ColumnDef[] = existingNode ? [...existingNode.columns] : [];

      for (const colName of allColNames) {
        if (!finalColumns.some(c => c.name === colName)) {
          const extractCol = extractColumns.find(c => c.name === colName);
          finalColumns.push({
            name: colName,
            dataType: extractCol?.data_type || 'UNKNOWN',
            ordinal: extractCol?.ordinal || finalColumns.length + 1,
            origin: 'LINEAGE',
            metadata: {},
            stats: {},
            createdByUploadId: existingNode ? undefined : uploadId
          });
        }
      }

      if (existingNode) {
        existingNode.columns = finalColumns;
        if (!existingNode.referencedByUploadIds.includes(uploadId)) {
            existingNode.referencedByUploadIds.push(uploadId);
        }
        await db.tableNodes.put(existingNode);
      } else {
        const newNode: TableNode = {
            datasetId: ds.dataset_id,
            system: ds.system as System,
            namespace: ds.namespace,
            name: ds.name,
            qualifiedName: ds.qualified_name,
            origin: 'STUB',
            completeness: 'STUB',
            metadata: {
              objectType: (ds.object_type as any) || 'TABLE',
              role: ds.role as any,
              isTemporary: ds.is_temporary
            },
            columns: finalColumns,
            createdByUploadId: uploadId,
            referencedByUploadIds: [uploadId],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await db.tableNodes.put(newNode);
        stubsCreated++;
      }
    }

    // 2. Create Processes
    const processRecs: ProcessRec[] = data.processes.map(p => ({
      processId: p.process_id,
      uploadId,
      sequence: p.sequence || 0,
      name: p.name || p.process_id,
      operationType: p.operation_type,
      sourceFile: p.source_file,
      codeLocation: p.code_location ? { startLine: p.code_location.start_line || null, endLine: p.code_location.end_line || null } : undefined,
      inputs: p.inputs,
      outputs: p.outputs,
      description: p.description,
      snippet: p.snippet
    }));
    if (processRecs.length > 0) await db.processRecs.bulkAdd(processRecs);

    // 3. Create TableEdges
    const tableEdges: TableEdge[] = data.table_edges.map(te => ({
      edgeId: te.edge_id,
      uploadId,
      fromDataset: te.from_dataset,
      toDataset: te.to_dataset,
      processId: te.process_id
    }));
    if (tableEdges.length > 0) await db.tableEdges.bulkAdd(tableEdges);

    // 4. Create ColumnEdges
    const columnEdges: ColumnEdge[] = data.column_edges.map(ce => ({
      edgeId: ce.edge_id,
      uploadId,
      target: { datasetId: ce.target.dataset_id, column: ce.target.column },
      sources: ce.sources.map((s: any) => ({ datasetId: s.dataset_id, column: s.column })),
      processId: ce.process_id,
      transformationType: ce.transformation_type as any,
      expression: ce.expression,
      confidence: ce.confidence as any
    }));
    if (columnEdges.length > 0) await db.columnEdges.bulkAdd(columnEdges);

    // 5. Create UploadRec
    const uploadRec: UploadRec = {
      uploadId,
      kind: 'LINEAGE_JSON',
      fileName,
      system,
      uploadedAt: new Date().toISOString(),
      status: 'ACTIVE',
      summary: {
        datasets: data.datasets.length,
        processes: data.processes.length,
        tableEdges: data.table_edges.length,
        columnEdges: data.column_edges.length,
        stubsCreated
      },
      rawPayload: fileContent
    };
    await db.uploadRecs.put(uploadRec);
  });
}
