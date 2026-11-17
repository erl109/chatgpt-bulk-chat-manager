const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Manager, SelectionStore, contextKey, conversationId } = require('../src/core.js');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const item = id => ({ id, title: 'Identical title' });
async function fixture() {
  const data = {};
  const storage = {
    async get(key) { return structuredClone({ [key]: data[key] }); },
    async set(value) { Object.assign(data, structuredClone(value)); }
  };
  let context = { verified: true, accountId: 'account-a', workspaceId: 'personal-a' };
  const deleted = [];
  const adapter = {
    async context() { return { ...context }; },
    async verify(id) { return { id, contextKey: contextKey(context) }; },
    async remove(proof, recheck, cancelled) {
      await recheck();
      if (cancelled()) throw new Error('Cancelled');
      deleted.push(proof.id);
      return { id: proof.id, confirmed: true };
    }
  };
  const store = new SelectionStore(storage);
  const manager = new Manager(store, adapter); await manager.activate();
  return { data, storage, adapter, manager, store, deleted, change: value => { context = { ...context, ...value }; } };
}
test('single and multiple selections persist minimal fields', async () => {
  const f = await fixture(); await f.manager.setMany([item(A)]); await f.manager.setMany([item(B)]);
  assert.equal(f.manager.selected.size, 2);
  assert.deepEqual(Object.keys(Object.values(f.data)[0][0]).sort(), ['id', 'title']);
});
test('individual deselection leaves other ID despite identical titles', async () => {
  const f = await fixture(); await f.manager.setMany([item(A), item(B)]); await f.manager.setMany([item(A)], false);
  assert.deepEqual(f.manager.snapshot(), [item(B)]);
});
test('Select All Visible accepts only supplied visible IDs and deduplicates', async () => {
  const f = await fixture(); await f.manager.setMany([item(C)]);
  await f.manager.setMany([item(A), item(B), item(A)]);
  assert.equal(f.manager.selected.size, 3);
});
test('Deselect All empties both memory and persisted selections', async () => {
  const f = await fixture(); await f.manager.setMany([item(A)]); await f.manager.clear();
  assert.equal(f.manager.selected.size, 0); assert.deepEqual(Object.values(f.data)[0], []);
});
for (const scenario of ['refresh', 'browser restart (storage mock)', 'navigation']) {
  test(`restore after ${scenario}`, async () => {
    const f = await fixture(); await f.manager.setMany([item(A), item(B)]);
    const restored = new Manager(new SelectionStore(f.storage), f.adapter); await restored.activate();
    assert.equal(restored.selected.size, 2);
  });
}
test('Dry Run uses verification without removal or storage writes', async () => {
  const f = await fixture(); await f.manager.setMany([item(A), item(B)]);
  const before = JSON.stringify(f.data); const result = await f.manager.run({ dryRun: true });
  assert.equal(result.verified, 2); assert.deepEqual(f.deleted, []); assert.equal(JSON.stringify(f.data), before);
});
test('Dry Run reports unverifiable IDs', async () => {
  const f = await fixture(); await f.manager.setMany([item(A), item(B)]);
  f.adapter.verify = async id => { if (id === A) throw new Error('Missing row'); return { id, contextKey: contextKey(f.manager.context) }; };
  const result = await f.manager.run({ dryRun: true });
  assert.equal(result.failed, 1); assert.equal(result.verified, 1); assert.equal(f.manager.selected.size, 2);
});
test('missing confirmation cannot trigger deletion', async () => {
  const f = await fixture(); await f.manager.setMany([item(A)]);
  await assert.rejects(f.manager.run(), /Confirm again/); assert.deepEqual(f.deleted, []);
});
test('changed selection invalidates confirmation', async () => {
  const f = await fixture(); await f.manager.setMany([item(A)]); const confirmed = [A];
  await f.manager.setMany([item(B)]); await assert.rejects(f.manager.run({ confirmed }), /Confirm again/);
});
test('successful deletion removes IDs from storage and never targets unselected chats', async () => {
  const f = await fixture(); await f.manager.setMany([item(A), item(B)]);
  const result = await f.manager.run({ confirmed: [A, B] });
  assert.equal(result.deleted, 2); assert.deepEqual(f.deleted, [A, B]); assert(!f.deleted.includes(C));
  assert.deepEqual(Object.values(f.data)[0], []);
});
test('unexpected deletion failure stops sequence and retains pending selections', async () => {
  const f = await fixture(); await f.manager.setMany([item(A), item(B), item(C)]);
  const remove = f.adapter.remove;
  f.adapter.remove = async (...args) => { if (args[0].id === B) throw new Error('Unexpected dialog'); return remove(...args); };
  const result = await f.manager.run({ confirmed: [A, B, C] });
  assert.equal(result.deleted, 1); assert.equal(result.failed, 1); assert.equal(result.notProcessed, 1);
  assert.deepEqual([...f.manager.selected.keys()], [B, C]); assert.deepEqual(f.deleted, [A]);
});
test('wrong conversation proof blocks deletion', async () => {
  const f = await fixture(); await f.manager.setMany([item(A)]);
  f.adapter.verify = async () => ({ id: B, contextKey: contextKey(f.manager.context) });
  assert.equal((await f.manager.run({ confirmed: [A] })).failed, 1); assert.deepEqual(f.deleted, []);
});
test('wrong ownership blocks deletion', async () => {
  const f = await fixture(); await f.manager.setMany([item(A)]);
  f.adapter.verify = async () => ({ id: A, contextKey: 'other-account' });
  assert.equal((await f.manager.run({ confirmed: [A] })).failed, 1); assert.deepEqual(f.deleted, []);
});
for (const change of [{ accountId: 'account-b' }, { workspaceId: 'team-b' }]) {
  test(`isolation on ${Object.keys(change)[0]} switch`, async () => {
    const f = await fixture(); await f.manager.setMany([item(A)]); f.change(change);
    await assert.rejects(f.manager.run({ confirmed: [A] }), /changed/);
    await f.manager.activate(); assert.equal(f.manager.selected.size, 0);
    assert.deepEqual(Object.values(f.data)[0], [item(A)]);
  });
}
test('unknown identity neither restores nor writes', async () => {
  const f = await fixture(); await f.manager.setMany([item(A)]); f.change({ verified: false });
  await assert.rejects(f.manager.activate(), /cannot be verified/);
  assert.equal(f.manager.selected.size, 0); assert.equal(f.manager.context, null);
  await assert.rejects(f.manager.setMany([item(B)]));
});
test('account switch during restoration discards saved IDs', async () => {
  const f = await fixture(); await f.manager.setMany([item(A)]);
  const read = f.store.read.bind(f.store); f.store.read = async context => { const value = await read(context); f.change({ accountId: 'b' }); return value; };
  await assert.rejects(f.manager.activate(), /changed during restore/);
  assert.equal(f.manager.selected.size, 0); assert.equal(f.manager.context, null);
});
test('account switch between proof and removal is detected', async () => {
  const f = await fixture(); await f.manager.setMany([item(A)]);
  f.adapter.verify = async id => { const proof = { id, contextKey: contextKey(f.manager.context) }; f.change({ accountId: 'b' }); return proof; };
  assert.equal((await f.manager.run({ confirmed: [A] })).failed, 1); assert.deepEqual(f.deleted, []);
});
test('uncertain deletion outcome retains selection and stops', async () => {
  const f = await fixture(); await f.manager.setMany([item(A), item(B)]);
  f.adapter.remove = async proof => ({ id: proof.id, confirmed: false });
  const result = await f.manager.run({ confirmed: [A, B] });
  assert.equal(result.failed, 1); assert.equal(result.notProcessed, 1); assert.equal(f.manager.selected.size, 2);
});
test('stop prevents next operation', async () => {
  const f = await fixture(); await f.manager.setMany([item(A), item(B)]);
  const remove = f.adapter.remove;
  f.adapter.remove = async (...args) => { const result = await remove(...args); f.manager.stop(); return result; };
  const result = await f.manager.run({ confirmed: [A, B] });
  assert.deepEqual(f.deleted, [A]); assert.equal(result.notProcessed, 1);
});
test('selection storage failures do not commit memory', async () => {
  const f = await fixture(); f.storage.set = async () => { throw new Error('Quota exceeded'); };
  await assert.rejects(f.manager.setMany([item(A)]), /Quota/); assert.equal(f.manager.selected.size, 0);
});
test('corrupt storage is rejected', async () => {
  const f = await fixture(); f.data[contextKey(f.manager.context)] = [{ id: 'wrong', title: 'x' }];
  await assert.rejects(f.manager.activate(), /Invalid saved/); assert.equal(f.manager.context, null);
});
test('parallel operations and mutation during operation are rejected', async () => {
  const f = await fixture(); await f.manager.setMany([item(A)]);
  f.manager.busy = true;
  await assert.rejects(f.manager.run({ dryRun: true }), /already running/);
  await assert.rejects(f.manager.clear(), /already running/);
  await assert.rejects(f.manager.setMany([item(B)]), /already running/);
});
test('conversation identification rejects title URLs, other hosts and malformed IDs', () => {
  assert.equal(conversationId(`/c/${A}`), A);
  assert.equal(conversationId(`https://evil.example/c/${A}`), null);
  assert.equal(conversationId('/c/Identical-title'), null);
  assert.equal(conversationId(`/c/${A}/unexpected`), null);
  assert.equal(conversationId('javascript:alert(1)'), null);
});
test('simultaneous run calls acquire the operation lock before awaiting identity', async () => {
  const f = await fixture(); await f.manager.setMany([item(A)]);
  const first = f.manager.run({ dryRun: true });
  await assert.rejects(f.manager.run({ dryRun: true }), /already running/);
  assert.equal((await first).verified, 1); assert.equal(f.manager.busy, false);
});
test('early validation failures release operation lock', async () => {
  const f = await fixture(); await assert.rejects(f.manager.run({ dryRun: true }), /Select at least/);
  assert.equal(f.manager.busy, false); await f.manager.setMany([item(A)]);
  await assert.rejects(f.manager.run(), /Confirm again/); assert.equal(f.manager.busy, false);
});
