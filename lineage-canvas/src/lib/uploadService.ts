import { parseLineageExtract, ingestParsedModel } from '../db/ingestion';
import type { ParsedImportModel } from './importModel';
import type { System } from '../types/models';

/** Parse a JSON extract file into the editable import model (no DB writes). */
export async function parseLineageJSON(file: File): Promise<{ model: ParsedImportModel; rawPayload: string }> {
  const content = await file.text();
  return { model: parseLineageExtract(content), rawPayload: content };
}

/**
 * Convenience: parse + additively ingest a JSON extract into a canvas/system.
 * The interactive flow (Header) parses first and lets the user review/edit the model
 * in the validation dialog before calling ingestParsedModel directly; this helper
 * keeps a one-call path for additive imports.
 */
export async function processLineageUpload(file: File, canvasId: string, system: System) {
  const { model, rawPayload } = await parseLineageJSON(file);
  return ingestParsedModel(model, { canvasId, defaultSystem: system }, {
    mode: 'additive',
    fileName: file.name,
    kind: 'LINEAGE_JSON',
    rawPayload,
  });
}
