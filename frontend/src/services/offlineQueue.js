/**
 * NER-SAHAYAK — Offline Report Queue & Synchronization Engine
 *
 * Provides resilient offline operations for Field Officers in remote NER corridors:
 * - Persists offline reports locally in localStorage across page reloads
 * - Implements stable idempotency keys (clientId)
 * - Manages queue item state transitions: pending -> syncing -> synced / failed
 * - Safely synchronizes batches via POST /api/reports/sync upon network recovery
 * - Preserves server incident IDs upon confirmation
 * - Handles retries with exponential backoff and error tracking
 */

const QUEUE_KEY = 'ner_sahayak_offline_reports';

// Fallback in-memory store for Node.js test environments
const nodeMemoryStore = new Map();

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof global !== 'undefined' && global.localStorage) {
    return global.localStorage;
  }
  return {
    getItem: (key) => (nodeMemoryStore.has(key) ? nodeMemoryStore.get(key) : null),
    setItem: (key, val) => nodeMemoryStore.set(key, String(val)),
    removeItem: (key) => nodeMemoryStore.delete(key),
    clear: () => nodeMemoryStore.clear(),
  };
}

function readQueue() {
  try {
    const storage = getStorage();
    const raw = storage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function writeQueue(items) {
  try {
    const storage = getStorage();
    storage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('[OfflineQueue] Storage write error:', err.message);
  }
}

export const offlineQueue = {
  /**
   * Enqueues an incident report locally while offline.
   * Assigns a stable idempotency clientId if not provided.
   */
  add(report) {
    const items = readQueue();
    const clientId = report.clientId || `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // If item with same clientId already in queue, update it instead of duplicating
    const existingIdx = items.findIndex((i) => i.clientId === clientId);

    const rawLat = report.lat;
    const rawLng = report.lng;
    const hasValidLat = rawLat !== undefined && rawLat !== null && rawLat !== '' && !isNaN(Number(rawLat));
    const hasValidLng = rawLng !== undefined && rawLng !== null && rawLng !== '' && !isNaN(Number(rawLng));
    const hasGps = Boolean(hasValidLat && hasValidLng);
    const lat = hasGps ? Number(rawLat) : null;
    const lng = hasGps ? Number(rawLng) : null;

    const photo = (report.photoDataUrl && typeof report.photoDataUrl === 'string' && report.photoDataUrl.trim().length > 0)
      ? report.photoDataUrl.trim()
      : null;

    const queueItem = {
      clientId,
      category: report.category || 'road_block',
      severity: report.severity || 'moderate',
      title: (report.title || '').trim(),
      description: report.description || '',
      road: report.road || '',
      fromNode: report.fromNode || null,
      toNode: report.toNode || null,
      affectedMode: report.affectedMode || 'road',
      estimatedDelayMinutes: report.estimatedDelayMinutes !== undefined ? report.estimatedDelayMinutes : 45,
      lat,
      lng,
      hasGps,
      photoDataUrl: photo,
      createdAt: report.createdAt || new Date().toISOString(),
      queuedAt: new Date().toISOString(),
      syncStatus: 'pending',
      syncState: 'pending',
      retryCount: 0,
      lastError: null,
      serverIncidentId: null,
    };

    if (existingIdx >= 0) {
      items[existingIdx] = { ...items[existingIdx], ...queueItem };
    } else {
      items.push(queueItem);
    }

    writeQueue(items);
    return queueItem;
  },

  /**
   * Returns count of pending/unsynced reports waiting for upload.
   */
  count() {
    return readQueue().filter((i) => i.syncStatus !== 'synced').length;
  },

  /**
   * Total items currently in local storage (including synced history if retained).
   */
  totalCount() {
    return readQueue().length;
  },

  /**
   * Retrieves all items in the queue.
   */
  all() {
    return readQueue();
  },

  /**
   * Returns only unsynced / pending items.
   */
  getPending() {
    return readQueue().filter((i) => i.syncStatus !== 'synced');
  },

  /**
   * Returns confirmed synced items.
   */
  getSynced() {
    return readQueue().filter((i) => i.syncStatus === 'synced');
  },

  /**
   * Returns items currently in-flight.
   */
  getSyncing() {
    return readQueue().filter((i) => i.syncStatus === 'syncing');
  },

  /**
   * Marks a specific item as synced with its canonical server incident ID.
   */
  markSynced(clientId, serverIncident = {}) {
    const items = readQueue();
    const item = items.find((i) => i.clientId === clientId);
    if (item) {
      item.syncStatus = 'synced';
      item.syncState = 'synced';
      item.serverIncidentId = serverIncident.id || serverIncident.serverIncidentId || item.serverIncidentId;
      item.lastError = null;
      writeQueue(items);
    }
  },

  /**
   * Marks an item as failed with error details and increments retry count.
   */
  markFailed(clientId, errorMessage) {
    const items = readQueue();
    const item = items.find((i) => i.clientId === clientId);
    if (item) {
      item.syncStatus = 'failed';
      item.syncState = 'failed';
      item.retryCount = (item.retryCount || 0) + 1;
      item.lastError = errorMessage || 'Sync failed';
      writeQueue(items);
    }
  },

  /**
   * Marks items as currently syncing.
   */
  markSyncing(clientIds = []) {
    const items = readQueue();
    const set = new Set(clientIds);
    items.forEach((item) => {
      if (set.has(item.clientId)) {
        item.syncStatus = 'syncing';
        item.syncState = 'syncing';
      }
    });
    writeQueue(items);
  },

  /**
   * Clears all items from the queue.
   */
  clear() {
    writeQueue([]);
  },

  /**
   * Clears only successfully synced reports.
   */
  clearSynced() {
    const items = readQueue().filter((i) => i.syncStatus !== 'synced');
    writeQueue(items);
  },

  /**
   * Removes a specific item by clientId.
   */
  remove(clientId) {
    const items = readQueue().filter((i) => i.clientId !== clientId);
    writeQueue(items);
  },

  /**
   * Flushes all pending reports to the server in a single batch.
   * Updates queue items in-place with sync states and canonical server incident IDs.
   */
  async flush(api) {
    const items = readQueue();
    const pending = items.filter((i) => i.syncStatus !== 'synced');
    if (pending.length === 0) {
      return { synced: 0, failed: [], reports: [] };
    }

    // Mark pending items as syncing
    this.markSyncing(pending.map((p) => p.clientId));

    try {
      const payload = pending.map((item) => ({
        clientId: item.clientId,
        category: item.category,
        severity: item.severity,
        title: item.title,
        description: item.description,
        road: item.road,
        fromNode: item.fromNode,
        toNode: item.toNode,
        affectedMode: item.affectedMode,
        estimatedDelayMinutes: item.estimatedDelayMinutes,
        lat: item.lat,
        lng: item.lng,
        photoDataUrl: item.photoDataUrl,
        createdAt: item.createdAt,
      }));

      const result = await api.syncReports(payload);
      const savedReports = result.reports || [];
      const failedItems = result.failed || [];

      // Update in-memory fresh items from storage
      const currentItems = readQueue();

      // Process successful items
      savedReports.forEach((saved) => {
        const target = currentItems.find((i) => i.clientId === saved.clientId || (saved.id && i.serverIncidentId === saved.id));
        if (target) {
          target.syncStatus = 'synced';
          target.syncState = 'synced';
          target.serverIncidentId = saved.id || saved.serverIncidentId;
          target.lastError = null;
        }
      });

      // Process failed items
      failedItems.forEach((failed) => {
        const target = currentItems.find((i) => i.clientId === failed.clientId);
        if (target) {
          target.syncStatus = 'failed';
          target.syncState = 'failed';
          target.retryCount = (target.retryCount || 0) + 1;
          target.lastError = failed.error || 'Server rejected report';
        }
      });

      writeQueue(currentItems);
      return result;
    } catch (err) {
      // Network failure or 5xx server error during sync flush
      const currentItems = readQueue();
      pending.forEach((p) => {
        const target = currentItems.find((i) => i.clientId === p.clientId);
        if (target && target.syncStatus === 'syncing') {
          target.syncStatus = 'failed';
          target.syncState = 'failed';
          target.retryCount = (target.retryCount || 0) + 1;
          target.lastError = err.message || 'Network connection unavailable';
        }
      });
      writeQueue(currentItems);
      throw err;
    }
  },

  /**
   * Resets a specific failed item to 'pending' and initiates flush.
   */
  async retry(clientId, api) {
    const items = readQueue();
    const item = items.find((i) => i.clientId === clientId);
    if (item) {
      item.syncStatus = 'pending';
      item.syncState = 'pending';
      writeQueue(items);
      return this.flush(api);
    }
    return { synced: 0, failed: [] };
  },
};

const RESPONSE_QUEUE_KEY = 'ner_sahayak_offline_responses';

function readResponseQueue() {
  try {
    const storage = getStorage();
    const raw = storage.getItem(RESPONSE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function writeResponseQueue(items) {
  try {
    const storage = getStorage();
    storage.setItem(RESPONSE_QUEUE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('[OfflineResponseQueue] Storage write error:', err.message);
  }
}

export const offlineResponseQueue = {
  add(action) {
    const items = readResponseQueue();
    const clientId = action.clientId || `resp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const existingIdx = items.findIndex((i) => i.clientId === clientId);

    const queueItem = {
      clientId,
      alertId: action.alertId,
      actionType: action.actionType,
      note: action.note || '',
      newStatus: action.newStatus || null,
      assignedTo: action.assignedTo || null,
      queuedAt: new Date().toISOString(),
      syncStatus: 'pending',
      retryCount: 0,
      lastError: null,
      serverResponseId: null,
    };

    if (existingIdx >= 0) {
      items[existingIdx] = { ...items[existingIdx], ...queueItem };
    } else {
      items.push(queueItem);
    }
    writeResponseQueue(items);
    return queueItem;
  },

  count() {
    return readResponseQueue().filter((i) => i.syncStatus !== 'synced').length;
  },

  all() {
    return readResponseQueue();
  },

  getPending() {
    return readResponseQueue().filter((i) => i.syncStatus !== 'synced');
  },

  clear() {
    writeResponseQueue([]);
  },

  async flush(api) {
    const items = readResponseQueue();
    const pending = items.filter((i) => i.syncStatus !== 'synced');
    if (pending.length === 0) {
      return { synced: [], errors: [], count: 0 };
    }

    try {
      const payload = pending.map((item) => ({
        clientId: item.clientId,
        alertId: item.alertId,
        actionType: item.actionType,
        note: item.note,
        newStatus: item.newStatus,
        assignedTo: item.assignedTo,
      }));

      const result = await api.syncAlertResponses(payload);
      const synced = result.synced || [];
      const errors = result.errors || [];

      const currentItems = readResponseQueue();
      synced.forEach((s) => {
        const target = currentItems.find((i) => i.clientId === s.clientId);
        if (target) {
          target.syncStatus = 'synced';
          target.serverResponseId = s.serverResponseId;
          target.lastError = null;
        }
      });

      errors.forEach((e) => {
        const target = currentItems.find((i) => i.clientId === e.clientId);
        if (target) {
          target.syncStatus = 'failed';
          target.retryCount = (target.retryCount || 0) + 1;
          target.lastError = e.error || 'Sync failed';
        }
      });

      writeResponseQueue(currentItems);
      return result;
    } catch (err) {
      const currentItems = readResponseQueue();
      pending.forEach((p) => {
        const target = currentItems.find((i) => i.clientId === p.clientId);
        if (target) {
          target.syncStatus = 'failed';
          target.lastError = err.message || 'Network unavailable';
        }
      });
      writeResponseQueue(currentItems);
      throw err;
    }
  },
};

/**
 * Returns whether the client currently has network connectivity.
 */
export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export const offlineReportQueue = offlineQueue;
export default offlineQueue;
