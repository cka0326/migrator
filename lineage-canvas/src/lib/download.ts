// Trigger a browser download for an in-memory blob.
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Slugify a name for use in a filename (no spaces/slashes/etc.).
export function slugify(name: string): string {
  return (name || 'untitled').trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'untitled';
}
