import { z } from 'zod';

export const ExtractSchema = z.object({
  extract_id: z.string(),
  source_system: z.enum(["LEGACY", "TARGET"]),
  source_file_name: z.string(),
  default_namespace: z.string().optional(),
  generated_by: z.string().optional(),
  generated_at: z.string().optional()
});

export const DatasetSchema = z.object({
  dataset_id: z.string(),
  system: z.enum(["LEGACY", "TARGET"]),
  namespace: z.string(),
  name: z.string(),
  qualified_name: z.string(),
  object_type: z.enum(["TABLE", "VIEW", "EXTERNAL", "DATASET"]).optional(),
  role: z.enum(["SOURCE", "INTERMEDIATE", "TARGET"]).optional(),
  is_temporary: z.boolean().optional(),
  resolved: z.boolean().optional(),
  quoted: z.boolean().optional(),
  columns: z.array(z.object({
    name: z.string(),
    data_type: z.string(),
    ordinal: z.number().optional(),
    quoted: z.boolean().optional()
  })).optional()
});

export const ProcessSchema = z.object({
  process_id: z.string(),
  sequence: z.number().optional(),
  name: z.string().optional(),
  operation_type: z.string(),
  source_file: z.string(),
  code_location: z.object({
    start_line: z.number().nullable().optional(),
    end_line: z.number().nullable().optional()
  }).optional(),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  description: z.string().optional(),
  snippet: z.string().optional()
});

export const TableEdgeSchema = z.object({
  edge_id: z.string(),
  from_dataset: z.string(),
  to_dataset: z.string(),
  process_id: z.string()
});

export const ColumnEdgeSchema = z.object({
  edge_id: z.string(),
  target: z.object({
    dataset_id: z.string(),
    column: z.string()
  }),
  sources: z.array(z.object({
    dataset_id: z.string(),
    column: z.string()
  })),
  process_id: z.string(),
  transformation_type: z.enum(["DIRECT", "RENAME", "CAST", "EXPRESSION", "AGGREGATION", "WINDOW", "CASE", "CONSTANT", "UNKNOWN"]),
  expression: z.string().optional(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional()
});

export const LineageExtractSchema = z.object({
  schema_version: z.string().refine(val => val === "1.0", { message: "Only schema_version 1.0 is supported" }),
  extract: ExtractSchema,
  datasets: z.array(DatasetSchema).optional().default([]),
  processes: z.array(ProcessSchema).optional().default([]),
  table_edges: z.array(TableEdgeSchema).optional().default([]),
  column_edges: z.array(ColumnEdgeSchema).optional().default([])
});

export type LineageExtract = z.infer<typeof LineageExtractSchema>;
