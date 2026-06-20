import { z } from 'zod';

// v1.0 lineage extract — intentionally minimal (mirrors the Excel template). It
// carries only TABLES, clearly-referenced COLUMNS (+ data types), TABLE→TABLE
// connections, and COLUMN→COLUMN connections. No system, no metadata, no processes
// — the user picks project/canvas/system and edits namespaces/metadata in the
// validation screen at upload time. Tables are referenced everywhere by `name`,
// which must be unique within one extract. See public/extraction/lineage-extract.schema.json.

const ColumnSchema = z.object({
  name: z.string(),
  data_type: z.string().optional(),
});

const TableSchema = z.object({
  name: z.string(),
  namespace: z.string().optional(),
  columns: z.array(ColumnSchema).optional().default([]),
});

const TableConnectionSchema = z.object({
  from: z.string(),
  to: z.string(),
});

const ColumnRefSchema = z.object({
  table: z.string(),
  column: z.string(),
});

const ColumnConnectionSchema = z.object({
  target: ColumnRefSchema,
  sources: z.array(ColumnRefSchema).min(1),
});

export const LineageExtractSchema = z.object({
  schema_version: z.string().refine(val => val === '1.0', { message: 'Only schema_version 1.0 is supported' }),
  tables: z.array(TableSchema).optional().default([]),
  table_connections: z.array(TableConnectionSchema).optional().default([]),
  column_connections: z.array(ColumnConnectionSchema).optional().default([]),
});

export type LineageExtract = z.infer<typeof LineageExtractSchema>;
