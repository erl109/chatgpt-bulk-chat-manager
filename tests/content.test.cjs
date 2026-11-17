const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
function row(id) { return `<div role="group" data-sidebar-archive-chatgpt-id="${id}"><a href="/c/${id}">Test chat</a><button id="actions-${id}" aria-label="Chat actions"></button></div>`; }
const tick = () => new Promise(resolve => setTimeout(resolve, 160));
async function setup(saved = {}) {
  const dom = new JSDOM(`<div><button aria-label="Open profile menu"></button><span>alicePlus</span></div><nav aria-label="Chat history">${row(ID)}</nav>`, { url: 'https://chatgpt.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, data = saved; let receiver, shadow;
  w.HTMLElement.prototype.getClientRects = function () { return [this.getBoundingClientRect()]; };
  const attach = w.Element.prototype.attachShadow;
  w.Element.prototype.attachShadow = function (options) { const root = attach.call(this, options); if (this.id === 'cbcm-host') shadow = root; return root; };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.chrome = {
    storage: { local: { get: async key => ({ [key]: data[key] }), set: async value => Object.assign(data, value) }, onChanged: { addListener() {}, removeListener() {} } },
    runtime: {
      onMessage: { addListener: fn => { receiver = fn; }, removeListener() {} },
      sendMessage: async request => {
        if (request.action === 'read') return { ok: true, value: { [request.key]: data[request.key] } };
        if (request.action === 'write') data[request.key] = structuredClone(request.entries);
        return { ok: true, value: true };
      }
    }
  };
  for (const file of ['src/core.js', 'src/client.js', 'src/adapter.js', 'src/ui.js']) w.eval(fs.readFileSync(file, 'utf8'));
  // Only identity navigation is stubbed. Content integration uses the real selection engine, DOM discovery and UI.
  w.CBCM.ChatGPTAdapter.prototype.connect = async function () {
    this.profile = w.document.querySelector('[aria-label="Open profile menu"]'); this.profileText = 'alicePlus';
    this.identity = { verified: true, accountId: 'handle:@alice', workspaceId: 'personal' }; return this.context();
  };
  w.eval(fs.readFileSync('content.js', 'utf8')); await tick();
  const button = name => [...shadow.querySelectorAll('button')].find(node => node.textContent === name);
  const connect = async () => { receiver({ channel: 'cbcm-ui', action: 'connect' }, {}, () => {}); await tick(); };
  return { w, data, shadow, button, connect, close: () => { w.dispatchEvent(new w.PageTransitionEvent('pagehide')); w.close(); } };
}
test('connect enables sibling checkbox; selecting does not activate conversation link', async () => {
  const f = await setup(); try {
    assert(f.w.document.querySelector('.cbcm-checkbox').disabled); await f.connect();
    const box = f.w.document.querySelector('.cbcm-checkbox'); assert(!box.disabled);
    assert.equal(box.closest('a'), null);
    let opened = 0; f.w.document.querySelector('a').onclick = () => { opened++; };
    box.click(); await tick(); assert.equal(opened, 0); assert.match(f.shadow.textContent, /Selected: 1/);
    assert.equal(Object.values(f.data).find(Array.isArray)[0].id, ID);
    box.click(); await tick(); assert.match(f.shadow.textContent, /Selected: 0/);
  } finally { f.close(); }
});
test('MutationObserver adds one checkbox to dynamic rows without duplicates', async () => {
  const f = await setup(); try {
    await f.connect(); f.w.document.querySelector('nav').insertAdjacentHTML('beforeend', row(OTHER)); await tick();
    assert.equal(f.w.document.querySelectorAll('.cbcm-checkbox').length, 2);
    f.w.document.querySelector('a').setAttribute('href', `/c/${ID}`); await tick();
    assert.equal(f.w.document.querySelectorAll('.cbcm-checkbox').length, 2);
  } finally { f.close(); }
});
test('Deselect All clears persisted selections from content UI', async () => {
  const f = await setup(); try {
    await f.connect(); f.w.document.querySelector('.cbcm-checkbox').click(); await tick();
    f.button('Deselect All').click(); await tick();
    assert.equal(Object.values(f.data).find(Array.isArray).length, 0); assert(!f.w.document.querySelector('.cbcm-checkbox').checked);
  } finally { f.close(); }
});
test('Dry Run report keeps selection storage unchanged', async () => {
  const f = await setup(); try {
    await f.connect(); f.w.document.querySelector('.cbcm-checkbox').click(); await tick();
    const before = JSON.stringify(f.data); f.button('Dry Run').click(); await tick();
    assert.equal(JSON.stringify(f.data), before); assert.match(f.shadow.textContent, /1 verified/);
    assert(f.w.document.querySelector(`a[href="/c/${ID}"]`));
  } finally { f.close(); }
});
test('cancel confirmation does not open native deletion UI', async () => {
  const f = await setup(); try {
    await f.connect(); f.w.document.querySelector('.cbcm-checkbox').click(); await tick();
    let native = 0; f.w.document.querySelector('[aria-label="Chat actions"]').onclick = () => { native++; };
    f.button('Delete Selected').click(); await tick(); f.button('Cancel').click(); await tick();
    assert.equal(native, 0); assert.equal(f.shadow.querySelectorAll('dialog').length, 0);
  } finally { f.close(); }
});
test('refresh restores selected UUID from persisted local data', async () => {
  const data = {}; let f = await setup(data);
  await f.connect(); f.w.document.querySelector('.cbcm-checkbox').click(); await tick(); f.close();
  f = await setup(data); try { await f.connect(); assert(f.w.document.querySelector('.cbcm-checkbox').checked); } finally { f.close(); }
});

test('selected review list shows exact selection and removes one item without deleting chats', async () => {
  const f = await setup(); try {
    await f.connect();
    f.w.document.querySelector('nav').insertAdjacentHTML('beforeend', row(OTHER)); await tick();
    for (const box of f.w.document.querySelectorAll('.cbcm-checkbox')) box.click();
    await tick();
    assert.equal(f.shadow.querySelectorAll('.selected-list li').length, 2);
    assert.match(f.shadow.querySelector('.selected-list').textContent, /11111111/);
    assert.match(f.shadow.querySelector('.selected-list').textContent, /22222222/);
    f.shadow.querySelector('.selected-list button').click(); await tick();
    assert.equal(f.shadow.querySelectorAll('.selected-list li').length, 1);
    assert.equal(f.w.document.querySelectorAll('nav a').length, 2);
    assert.equal(f.w.document.querySelectorAll('.cbcm-checkbox:checked').length, 1);
    assert.equal(Object.values(f.data).find(Array.isArray).length, 1);
  } finally { f.close(); }
});

test('connection controls collapse after connecting and selected chats are readable text', async () => {
  const f = await setup(); try {
    await f.connect();
    assert.equal(f.shadow.querySelector('.connection').open, false);
    f.w.document.querySelector('a').textContent = '<img src=x onerror=alert(1)>';
    f.w.document.querySelector('.cbcm-checkbox').click(); await tick();
    assert.equal(f.shadow.querySelector('.selected-list img'), null);
    assert.match(f.shadow.querySelector('.selected-list').textContent, /<img/);
    assert(f.w.document.querySelector('a').classList.contains('cbcm-chat-link'));
  } finally { f.close(); }
});
