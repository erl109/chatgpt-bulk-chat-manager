/* Single controlling document prevents concurrent selection writes and double deletion. */
importScripts('src/core.js');
let queue = Promise.resolve();
function serialized(task) { const work = queue.then(task); queue = work.catch(() => {}); return work; }
async function owner() { return (await chrome.storage.session.get('owner')).owner; }
function same(a, b) { return a?.tabId === b?.tabId && a?.documentId === b?.documentId; }
function source(sender) {
  CBCM.assert(sender.tab?.id != null && sender.frameId === 0 && sender.documentId && new URL(sender.url).origin === 'https://chatgpt.com', 'Invalid message source.');
  return { tabId: sender.tab.id, documentId: sender.documentId };
}
async function handle(message, sender) {
  const who = source(sender), current = await owner();
  if (message.action === 'claim') {
    if (current && current.tabId !== who.tabId) {
      let exists = true; try { await chrome.tabs.get(current.tabId); } catch { exists = false; }
      CBCM.assert(!exists, 'Addon is connected in another tab. Close that tab or disconnect there first.');
    }
    await chrome.storage.session.set({ owner: who }); return true;
  }
  CBCM.assert(same(who, current), 'This tab no longer controls the addon. Connect again.');
  if (message.action === 'guard') return true;
  if (message.action === 'release') { await chrome.storage.session.remove('owner'); return true; }
  CBCM.assert(typeof message.key === 'string' && message.key.startsWith('cbcm:v1:'), 'Invalid selection key.');
  if (message.action === 'read') return await chrome.storage.local.get(message.key);
  if (message.action === 'write') {
    await chrome.storage.local.set({ [message.key]: [...CBCM.clean(message.entries).values()] }); return true;
  }
  throw new Error('Unknown addon request.');
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.channel !== 'cbcm') return;
  serialized(() => handle(message, sender)).then(value => reply({ ok: true, value }), error => reply({ ok: false, error: error.message }));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => { serialized(async () => { if ((await owner())?.tabId === tabId) await chrome.storage.session.remove('owner'); }); });
