// Open a read-only table/column comparison in a *new browser tab* so several can
// be opened side by side. The comparison is stashed in localStorage (shared across
// same-origin tabs) under a short id, and only that id travels in the URL — this
// keeps datasetIds (which contain "::") out of the query string and the URL short.
// The new tab reads it on boot via readEphemeralComparisonFromUrl (see initSession).

import type { EphemeralComparison } from '../store/useStore';

const KEY_PREFIX = 'ephemeral-cmp:';
const PARAM = 'compare';
const MAX_STASHED = 40;

export function openComparisonInNewTab(cmp: EphemeralComparison) {
  const id = Math.random().toString(36).slice(2, 10);
  try {
    localStorage.setItem(KEY_PREFIX + id, JSON.stringify(cmp));
    pruneOld();
  } catch { /* storage unavailable — the tab just won't have anything to read */ }
  const url = `${window.location.pathname}?${PARAM}=${id}`;
  window.open(url, '_blank', 'noopener');
}

export function readEphemeralComparisonFromUrl(): EphemeralComparison | null {
  const id = new URLSearchParams(window.location.search).get(PARAM);
  if (!id) return null;
  try {
    const raw = localStorage.getItem(KEY_PREFIX + id);
    return raw ? (JSON.parse(raw) as EphemeralComparison) : null;
  } catch { return null; }
}

// Cap how many stashed comparisons we keep so storage doesn't grow without bound.
function pruneOld() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(KEY_PREFIX));
    if (keys.length <= MAX_STASHED) return;
    for (const k of keys.slice(0, keys.length - MAX_STASHED)) localStorage.removeItem(k);
  } catch { /* ignore */ }
}
