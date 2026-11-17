const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const core = require('../src/core.js');
function fixture() {
  let listener, removed; const local = {}, session = {}, live = new Set([1, 2]);
  const storage = data => ({ get: async key => ({ [key]: data[key] }), set: async values => Object.assign(data, structuredClone(values)), remove: async key => { delete data[key]; } });
  const chrome = { storage: { local: storage(local), session: storage(session) },
    runtime: { onMessage: { addListener: fn => { listener = fn; } } },
    tabs: { get: async id => { if (!live.has(id)) throw new Error('Closed'); return { id }; }, onRemoved: { addListener: fn => { removed = fn; } } } };
  function restart() { const scope = vm.createContext({ CBCM: core, chrome, URL, importScripts() {} }); vm.runInContext(fs.readFileSync('background.js', 'utf8'), scope); }
  restart();
  const send = (action, tabId = 1, documentId = 'doc1', data = {}, url = 'https://chatgpt.com/') => new Promise(resolve => listener({ channel: 'cbcm', action, ...data }, { tab: { id: tabId }, frameId: 0, documentId, url }, resolve));
  return { send, local, session, restart, live, close: id => { live.delete(id); removed(id); } };
}
test('one controlling tab; another tab cannot claim, read, or write', async () => {
  const f = fixture(); assert((await f.send('claim')).ok);
  assert.equal((await f.send('claim', 2)).ok, false);
  assert.equal((await f.send('read', 2, 'doc2', { key: 'cbcm:v1:account' })).ok, false);
  assert.equal((await f.send('write', 2, 'doc2', { key: 'cbcm:v1:account', entries: [] })).ok, false);
});
test('service worker restart retains ownership in session storage', async () => {
  const f = fixture(); await f.send('claim'); f.restart();
  assert((await f.send('guard')).ok); assert.equal((await f.send('claim', 2)).ok, false);
});
test('new document in same tab supersedes stale document', async () => {
  const f = fixture(); await f.send('claim'); await f.send('claim', 1, 'doc2');
  assert.equal((await f.send('guard', 1, 'doc1')).ok, false); assert((await f.send('guard', 1, 'doc2')).ok);
});
test('closing owner tab releases ownership; unrelated close does not', async () => {
  const f = fixture(); await f.send('claim'); f.close(2); assert((await f.send('guard')).ok);
  f.close(1); f.live.add(2); assert((await f.send('claim', 2)).ok);
});
test('concurrent claims are serialized', async () => {
  const f = fixture(); const results = await Promise.all([f.send('claim', 1), f.send('claim', 2)]);
  assert.equal(results.filter(result => result.ok).length, 1);
});
test('only ChatGPT top-frame documents can acquire ownership', async () => {
  const f = fixture(); assert.equal((await f.send('claim', 1, 'doc1', {}, 'https://evil.example/')).ok, false);
});
test('broker writes minimal validated selections and rejects malformed IDs', async () => {
  const f = fixture(); await f.send('claim');
  const key = 'cbcm:v1:["handle:@alice","personal"]';
  assert((await f.send('write', 1, 'doc1', { key, entries: [{ id: '11111111-1111-4111-8111-111111111111', title: 'Test', content: 'must not persist' }] })).ok);
  assert.deepEqual(Object.keys(f.local[key][0]).sort(), ['id', 'title']);
  assert.equal((await f.send('write', 1, 'doc1', { key, entries: [{ id: 'invalid', title: 'Test' }] })).ok, false);
});
