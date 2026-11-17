/* Shared with the offline tests; no page globals, network, or authentication access. */
(function (root) {
  'use strict';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const assert = (value, message) => { if (!value) throw new Error(message); };
  function conversationId(href) {
    try {
      const url = new URL(href, 'https://chatgpt.com');
      if (url.origin !== 'https://chatgpt.com') return null;
      const match = url.pathname.match(/^\/c\/([^/]+)\/?$/);
      return match && UUID.test(match[1]) ? match[1].toLowerCase() : null;
    } catch { return null; }
  }
  function contextKey(context) {
    assert(context?.verified === true && typeof context.accountId === 'string' &&
      typeof context.workspaceId === 'string' && context.accountId.length > 0 &&
      context.workspaceId.length > 0, 'Active account/workspace cannot be verified.');
    return 'cbcm:v1:' + JSON.stringify([context.accountId, context.workspaceId]);
  }
  function clean(entries) {
    assert(Array.isArray(entries), 'Invalid saved selections.');
    const result = new Map();
    for (const item of entries) {
      assert(item && UUID.test(item.id) && typeof item.title === 'string', 'Invalid saved conversation.');
      result.set(item.id.toLowerCase(), { id: item.id.toLowerCase(), title: item.title.slice(0, 300) });
    }
    return result;
  }
  class SelectionStore {
    constructor(storage) { this.storage = storage; }
    async read(context) {
      const key = contextKey(context);
      const data = await this.storage.get(key);
      return clean(data[key] ?? []);
    }
    async write(context, entries) {
      const key = contextKey(context);
      await this.storage.set({ [key]: [...clean([...entries.values()]).values()] });
    }
  }
  class Manager {
    constructor(store, adapter) {
      this.store = store; this.adapter = adapter; this.selected = new Map();
      this.context = null; this.busy = false; this.cancelled = false;
    }
    async activate() {
      this.context = null; this.selected.clear();
      const context = await this.adapter.context();
      const key = contextKey(context);
      const entries = await this.store.read(context);
      if (this.adapter.validateRestore) await this.adapter.validateRestore(entries);
      assert(contextKey(await this.adapter.context()) === key, 'Account changed during restore.');
      this.context = context; this.selected = entries;
    }
    async guard() {
      const key = contextKey(this.context);
      assert(contextKey(await this.adapter.context()) === key, 'Account/workspace changed. Operation stopped.');
    }
    async setMany(items, selected = true) {
      assert(!this.busy, 'An operation is already running.');
      await this.guard();
      const next = new Map(this.selected);
      for (const item of clean(items).values()) selected ? next.set(item.id, item) : next.delete(item.id);
      await this.store.write(this.context, next);
      this.selected = next;
    }
    async clear() {
      assert(!this.busy, 'An operation is already running.');
      await this.guard();
      await this.store.write(this.context, new Map());
      this.selected.clear();
    }
    snapshot() { return [...this.selected.values()].map(item => ({ ...item })); }
    async verify(item) {
      await this.guard();
      assert(UUID.test(item.id) && this.selected.has(item.id), 'Conversation is not selected.');
      const proof = await this.adapter.verify(item.id, this.context);
      assert(proof?.id === item.id && proof.contextKey === contextKey(this.context),
        'Conversation ownership or target could not be verified.');
      return proof;
    }
    stop() { this.cancelled = true; }
    async run({ dryRun = false, confirmed = null, progress = () => {} } = {}) {
      assert(!this.busy, 'An operation is already running.');
      // Acquire before the first await so simultaneous calls cannot both pass the guard.
      this.busy = true;
      try {
      await this.guard();
      const items = this.snapshot();
      assert(items.length > 0, 'Select at least one conversation.');
      if (!dryRun) {
        assert(Array.isArray(confirmed) && confirmed.length === items.length &&
          items.every((item, i) => item.id === confirmed[i]), 'Selection changed. Confirm again.');
      }
      this.cancelled = false;
      const result = { dryRun, total: items.length, deleted: 0, verified: 0, failed: 0, uncertain: 0, untouched: 0, rows: [] };
        for (let i = 0; i < items.length; i++) {
          if (this.cancelled) break;
          const item = items[i];
          progress(i, items.length, item);
          try {
            const proof = await this.verify(item);
            if (this.cancelled) break;
            if (dryRun) {
              result.verified++;
              result.rows.push({ ...item, status: 'Verified — would delete' });
            } else {
              // Adapter must recheck identity and exact target synchronously before EVERY destructive click.
              await this.guard();
              assert(this.selected.has(item.id), 'Selection was removed.');
              const receipt = await this.adapter.remove(proof, () => this.verify(item), () => this.cancelled);
              if (receipt?.id !== item.id || receipt.confirmed !== true) {
                const error = new Error('Deletion outcome is uncertain. Stopped; selection retained.');
                error.code = 'DELETION_UNCERTAIN'; throw error;
              }
              result.deleted++;
              const next = new Map(this.selected); next.delete(item.id);
              await this.store.write(this.context, next);
              this.selected = next;
              result.rows.push({ ...item, status: 'Deleted' });
            }
          } catch (error) {
            result.failed++;
            if (error.code === 'DELETION_UNCERTAIN') result.uncertain++;
            result.rows.push({ ...item, status: error.message });
            // Dry runs can report every unverifiable row, but never cross a changed identity.
            if (!dryRun) break;
            try { await this.guard(); } catch { break; }
          }
        }
      result.notProcessed = items.length - result.rows.length;
      progress(items.length - result.notProcessed, items.length, null);
      return result;
      } finally { this.busy = false; }
    }
  }
  const api = { UUID, assert, conversationId, contextKey, clean, SelectionStore, Manager };
  root.CBCM = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
