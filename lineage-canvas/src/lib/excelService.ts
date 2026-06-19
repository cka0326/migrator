import * as XLSX from 'xlsx';
import { db } from '../db/database';
import type { TableNode, ColumnDef, System } from '../types/models';

export async function generateExcelTemplate() {
  const wb = XLSX.utils.book_new();

  // README
  const readmeData = [
    ["Lineage Canvas Metadata Template"],
    [""],
    ["Fill out TABLE_META and COLUMN_METADATA sheets. DATA sheet is optional for inferring stats."],
    ["Do not rename the sheets."]
  ];
  const wsReadme = XLSX.utils.aoa_to_sheet(readmeData);
  XLSX.utils.book_append_sheet(wb, wsReadme, "README");

  // TABLE_META
  const tableMetaData = [
    ["Field", "Value", "Notes"],
    ["system", "LEGACY", "LEGACY or TARGET"],
    ["namespace", "", "Library or Schema"],
    ["table_name", "", ""],
    ["object_type", "TABLE", "TABLE|VIEW|EXTERNAL|DATASET"],
    ["role", "", "SOURCE|INTERMEDIATE|TARGET"],
    ["is_temporary", "FALSE", "TRUE or FALSE"],
    ["business_name", "", ""],
    ["description", "", ""],
    ["owner", "", ""],
    ["domain", "", ""],
    ["classification", "", "PUBLIC|INTERNAL|CONFIDENTIAL|RESTRICTED|PII|PHI"]
  ];
  const wsTableMeta = XLSX.utils.aoa_to_sheet(tableMetaData);
  XLSX.utils.book_append_sheet(wb, wsTableMeta, "TABLE_META");

  // COLUMN_METADATA
  const columnHeaders = [
    "column_name", "business_name", "data_type", "ordinal", "nullable", 
    "is_primary_key", "is_foreign_key", "classification", "description"
  ];
  const wsColMeta = XLSX.utils.aoa_to_sheet([columnHeaders]);
  XLSX.utils.book_append_sheet(wb, wsColMeta, "COLUMN_METADATA");

  // DATA
  const wsData = XLSX.utils.aoa_to_sheet([["col1", "col2"]]);
  XLSX.utils.book_append_sheet(wb, wsData, "DATA");

  XLSX.writeFile(wb, "Lineage_Canvas_Template.xlsx");
}

export async function processExcelUpload(file: File, canvasId: string) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);

  // Parse TABLE_META
  const wsTableMeta = wb.Sheets["TABLE_META"];
  if (!wsTableMeta) throw new Error("Missing TABLE_META sheet");
  const tableMetaRows: any[] = XLSX.utils.sheet_to_json(wsTableMeta, { header: 1 });
  
  const metaObj: Record<string, string> = {};
  for (let i = 1; i < tableMetaRows.length; i++) {
    const row = tableMetaRows[i];
    if (row[0]) metaObj[row[0]] = row[1];
  }

  const system = metaObj["system"]?.toUpperCase() as System;
  const namespace = metaObj["namespace"]?.toUpperCase();
  const tableName = metaObj["table_name"]?.toUpperCase();

  if (!system || !namespace || !tableName) {
    throw new Error("TABLE_META must contain system, namespace, and table_name");
  }
  if (system !== 'LEGACY' && system !== 'TARGET') {
    throw new Error("system must be LEGACY or TARGET");
  }

  const datasetId = `${canvasId}::${system}:${namespace}.${tableName}`;

  // Parse COLUMN_METADATA
  const wsColMeta = wb.Sheets["COLUMN_METADATA"];
  const colMetaRows: any[] = wsColMeta ? XLSX.utils.sheet_to_json(wsColMeta) : [];

  // Reconcile with DB
  await db.transaction('rw', [db.tableNodes, db.uploadRecs], async () => {
    let existingNode = await db.tableNodes.get(datasetId);

    const columns: ColumnDef[] = existingNode ? [...existingNode.columns] : [];

    colMetaRows.forEach((row, idx) => {
      const colName = row["column_name"]?.toUpperCase();
      if (!colName) return;

      const existingCol = columns.find(c => c.name === colName);
      
      const newColData: ColumnDef = {
        name: colName,
        dataType: row["data_type"] || existingCol?.dataType || 'UNKNOWN',
        ordinal: parseInt(row["ordinal"]) || existingCol?.ordinal || idx + 1,
        origin: existingCol ? (existingCol.origin === 'LINEAGE' ? 'EXCEL' : existingCol.origin) : 'EXCEL',
        metadata: {
          ...existingCol?.metadata,
          description: row["description"] || existingCol?.metadata?.description,
          businessName: row["business_name"] || existingCol?.metadata?.businessName,
          classification: row["classification"] || existingCol?.metadata?.classification,
        },
        stats: { ...existingCol?.stats },
        lastEditedBy: "UPLOAD"
      };

      if (existingCol) {
        const cIdx = columns.findIndex(c => c.name === colName);
        columns[cIdx] = newColData;
      } else {
        columns.push(newColData);
      }
    });

    if (existingNode) {
      existingNode.columns = columns;
      existingNode.origin = existingNode.origin === 'STUB' ? 'EXCEL' : existingNode.origin;
      existingNode.metadata = {
        ...existingNode.metadata,
        description: metaObj["description"] || existingNode.metadata.description,
        businessName: metaObj["business_name"] || existingNode.metadata.businessName,
      };
      await db.tableNodes.put(existingNode);
    } else {
      const newNode: TableNode = {
        datasetId,
        canvasId,
        system,
        namespace,
        name: tableName,
        qualifiedName: `${namespace}.${tableName}`,
        origin: 'EXCEL',
        completeness: 'PARTIAL',
        metadata: {
          objectType: (metaObj["object_type"] as any) || 'TABLE',
          role: metaObj["role"] as any,
          isTemporary: metaObj["is_temporary"]?.toUpperCase() === 'TRUE',
          description: metaObj["description"],
          businessName: metaObj["business_name"],
        },
        columns,
        referencedByUploadIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.tableNodes.put(newNode);
    }

    await db.uploadRecs.put({
      uploadId: crypto.randomUUID(),
      canvasId,
      kind: 'EXCEL',
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      status: 'ACTIVE',
      summary: {},
      rawPayload: ''
    });
  });
}
