// Reserve prompt + output tokens, then reconcile with actual provider usage.
export function createGroqPacer({ now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), budget = 7500 } = {}) {
  let gate = Promise.resolve();
  let entries = [];
  return async (request, onProgress) => {
    const tokens = Math.min(budget, Math.ceil(JSON.stringify(request.messages || []).length / 3) + (request.max_tokens || 1500));
    const slot = gate.then(async () => {
      while (true) {
        entries = entries.filter(entry => now() - entry.time < 60000);
        const wait = entries.length >= 25 || entries.reduce((sum, entry) => sum + entry.tokens, 0) + tokens > budget;
        if (!wait) break;
        const delay = Math.max(1, entries[0].time + 60000 - now());
        onProgress?.(`Waiting for AI capacity (about ${Math.ceil(delay / 1000)} seconds)...`);
        await sleep(delay);
      }
      const entry = { time: now(), tokens };
      entries.push(entry);
      onProgress?.('Generating draft with AI...');
      return usage => { if (Number.isFinite(usage) && usage > 0) entry.tokens = usage; };
    });
    gate = slot.catch(() => {});
    return slot;
  };
}
