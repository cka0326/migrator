import { ingestLineageJSON } from '../db/ingestion';

/**
 * Ingest a JSON lineage extract into a canvas.
 *
 * Uploads are intentionally **always additive**: we never supersede or delete a
 * prior upload's tables, columns, or connections during ingest — even if a file
 * with the same name was uploaded before. Combined with the content-derived,
 * idempotent edge ids in `ingestLineageJSON`, re-importing the same (or an
 * updated) extract UPSERTS rather than duplicates.
 *
 * Removing an upload's contribution remains available as an explicit, user-driven
 * action in the Upload History dialog (`Repository.deleteUpload`).
 */
export async function processLineageUpload(file: File, canvasId: string) {
  const content = await file.text();
  await ingestLineageJSON(content, file.name, canvasId);
}
