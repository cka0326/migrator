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
    ["description", "", ""],
    ["environment", "", "DEV|TEST|UAT|PROD"],
    ["business_domain", "", "Claims, Policy, Billing, Finance, etc."],
    ["row_count", "", "number"],
    ["column_count", "", "number"],
    ["has_primary_key", "", "TRUE or FALSE"],
    ["unique_key_columns", "", "comma-separated column names"],
    ["grain_description", "", "e.g. one row per policy per term"],
    ["refresh_frequency", "", "DAILY|WEEKLY|MONTHLY|AD_HOC"]
  ];
  const wsTableMeta = XLSX.utils.aoa_to_sheet(tableMetaData);
  XLSX.utils.book_append_sheet(wb, wsTableMeta, "TABLE_META");

  // COLUMN_METADATA
  const columnHeaders = [
    "column_name", "data_type", "nullable", "max_length", "precision",
    "default_value", "column_definition", "column_computation_formula",
    "null_count", "min_value", "max_value", "unique_count", "uniques",
    "mean_value", "stddev_value", "sum_value"
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

      const num = (v: any) => (v === undefined || v === null || v === '' ? undefined : Number(v));
      const bool = (v: any) => (v === undefined || v === null || v === '' ? undefined : String(v).toUpperCase() === 'TRUE');

      const newColData: ColumnDef = {
        name: colName,
        dataType: row["data_type"] || existingCol?.dataType || 'UNKNOWN',
        ordinal: existingCol?.ordinal || idx + 1,
        origin: existingCol ? (existingCol.origin === 'LINEAGE' ? 'EXCEL' : existingCol.origin) : 'EXCEL',
        metadata: {
          ...existingCol?.metadata,
          nullable: bool(row["nullable"]) ?? existingCol?.metadata?.nullable,
          maxLength: num(row["max_length"]) ?? existingCol?.metadata?.maxLength,
          precision: num(row["precision"]) ?? existingCol?.metadata?.precision,
          defaultValue: row["default_value"] || existingCol?.metadata?.defaultValue,
          columnDefinition: row["column_definition"] || existingCol?.metadata?.columnDefinition,
          columnComputationFormula: row["column_computation_formula"] || existingCol?.metadata?.columnComputationFormula,
        },
        stats: {
          ...existingCol?.stats,
          nullCount: num(row["null_count"]) ?? existingCol?.stats?.nullCount,
          minValue: row["min_value"] || existingCol?.stats?.minValue,
          maxValue: row["max_value"] || existingCol?.stats?.maxValue,
          uniqueCount: num(row["unique_count"]) ?? existingCol?.stats?.uniqueCount,
          uniques: row["uniques"] || existingCol?.stats?.uniques,
          meanValue: num(row["mean_value"]) ?? existingCol?.stats?.meanValue,
          stddevValue: num(row["stddev_value"]) ?? existingCol?.stats?.stddevValue,
          sumValue: num(row["sum_value"]) ?? existingCol?.stats?.sumValue,
        },
        lastEditedBy: "UPLOAD"
      };

      if (existingCol) {
        const cIdx = columns.findIndex(c => c.name === colName);
        columns[cIdx] = newColData;
      } else {
        columns.push(newColData);
      }
    });

    const numMeta = (v: any) => (v === undefined || v === null || v === '' ? undefined : Number(v));
    const boolMeta = (v: any) => (v === undefined || v === null || v === '' ? undefined : String(v).toUpperCase() === 'TRUE');
    const tableMeta = {
      description: metaObj["description"] || undefined,
      environment: (metaObj["environment"]?.toUpperCase() as any) || undefined,
      businessDomain: metaObj["business_domain"] || undefined,
      rowCount: numMeta(metaObj["row_count"]),
      columnCount: numMeta(metaObj["column_count"]) ?? columns.length,
      hasPrimaryKey: boolMeta(metaObj["has_primary_key"]),
      uniqueKeyColumns: metaObj["unique_key_columns"] || undefined,
      grainDescription: metaObj["grain_description"] || undefined,
      refreshFrequency: (metaObj["refresh_frequency"]?.toUpperCase() as any) || undefined,
    };

    if (existingNode) {
      existingNode.columns = columns;
      existingNode.origin = existingNode.origin === 'STUB' ? 'EXCEL' : existingNode.origin;
      existingNode.metadata = {
        ...existingNode.metadata,
        ...Object.fromEntries(Object.entries(tableMeta).filter(([, v]) => v !== undefined)),
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
        metadata: tableMeta,
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
