// Offline-first queue for field reports. When a field officer is in a
// low/no-network district, reports are saved locally and flushed to the
// backend's /reports/sync batch endpoint once connectivity returns.

const QUEUE_KEY = 'ner_sahayak_offline_reports';

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function writeQueue(items) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export const offlineQueue = {
  add(report) {
    const items = readQueue();
    items.push({ ...report, clientId: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, queuedAt: new Date().toISOString() });
    writeQueue(items);
    return items.length;
  },
  count() {
    return readQueue().length;
  },
  all() {
    return readQueue();
  },
  clear() {
    writeQueue([]);
  },
  async flush(api) {
    const items = readQueue();
    if (items.length === 0) return { synced: 0, failed: [] };
    const result = await api.syncReports(items);
    // Remove successfully synced items (keep any that failed for retry)
    const failedIds = new Set((result.failed || []).map((f) => f.clientId));
    const remaining = items.filter((i) => failedIds.has(i.clientId));
    writeQueue(remaining);
    return result;
  },
};

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}
