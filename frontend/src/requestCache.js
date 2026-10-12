// One cache per signed-in workspace. Expiration is checked on demand; no timers.
export function createRequestCache(fetcher, onData, { ttl = 60000, now = Date.now } = {}) {
  const cached = new Map();
  const pending = new Map();
  const revisions = new Map();
  const loaded = new Set();
  const revision = key => revisions.get(key) || 0;

  function invalidate(keys) {
    for (const key of keys) {
      cached.delete(key);
      revisions.set(key, revision(key) + 1);
    }
  }

  async function load(key) {
    const existing = cached.get(key);
    if (existing && now() - existing.time < ttl) return existing.data;
    const underway = pending.get(key);
    if (underway) {
      if (underway.revision === revision(key)) return underway.promise;
      // Let the pre-mutation read settle, then get a fresh result.
      await underway.promise.catch(() => {});
      return load(key);
    }
    const currentRevision = revision(key);
    const entry = { revision: currentRevision };
    entry.promise = (async () => {
      const response = await fetcher(key, { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status}).`);
      if (currentRevision === revision(key)) {
        cached.set(key, { data, time: now() });
        loaded.add(key);
        onData(key, data);
      }
      return data;
    })().finally(() => { if (pending.get(key) === entry) pending.delete(key); });
    pending.set(key, entry);
    return entry.promise;
  }

  async function loadMany(keys, { force = false } = {}) {
    const uniqueKeys = [...new Set(keys)];
    if (force) invalidate(uniqueKeys.filter(key => !pending.has(key)));
    const results = await Promise.allSettled(uniqueKeys.map(load));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  }

  return { loadMany, invalidate, hasLoaded: keys => keys.every(key => loaded.has(key)) };
}

export const WORKSPACE_RESOURCES = {
  status: '/api/status',
  leads: '/api/leads',
  mailboxStatus: '/api/mailbox/status',
  messages: '/api/mailbox/messages',
  outreach: '/api/mailbox/outreach',
  lifecycle: '/api/mailbox/lifecycle',
};

export const PAGE_RESOURCES = {
  dashboard: ['status', 'leads', 'mailboxStatus', 'outreach', 'messages'],
  search: ['status'],
  results: ['status', 'leads'],
  outreach: ['status', 'leads', 'mailboxStatus', 'outreach'],
  mailbox: ['status', 'mailboxStatus', 'messages', 'lifecycle'],
  analytics: ['status', 'leads', 'outreach', 'messages'],
  admin: [],
};

export const ADMIN_RESOURCES = {
  health: '/api/admin/system/health',
  users: '/api/admin/users',
  audit: '/api/admin/audit-logs?limit=100',
};

export const ADMIN_TAB_RESOURCES = {
  overview: ['health', 'users', 'audit'],
  users: ['health', 'users'],
  integrations: ['health'],
  audit: ['health', 'audit'],
};
