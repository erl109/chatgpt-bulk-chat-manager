(function () {
  'use strict';
  if (document.getElementById('cbcm-host')) return;
  const adapter = new CBCM.ChatGPTAdapter();
  adapter.ensureOwner = () => CBCM.request('guard');
  const manager = new CBCM.Manager(new CBCM.SelectionStore(CBCM.brokerStorage), adapter);
  let pending = Promise.resolve(), disposed = false, timer = null, connecting = false, modalPending = false;
  let auto = false, autoAttempted = false, running = false;
  function lock(message) {
    manager.stop(); manager.context = null; manager.selected.clear(); adapter.invalidate();
    ui.update(manager, message); sync();
  }
  const enqueue = action => {
    pending = pending.then(action).catch(error => { lock(error.message); }); return pending;
  };
  const ui = new CBCM.UI({
    connect: () => enqueue(connect),
    manual: () => enqueue(() => connect(true)),
    diagnostics: () => ui.showDiagnostics(adapter.diagnostics()),
    unselect: item => enqueue(async () => {
      CBCM.assert(!modalPending && !connecting && !running, 'Finish the current operation first.');
      await manager.setMany([item], false); sync();
    }),
    disconnect: () => enqueue(() => disconnect(false)),
    logout: () => enqueue(() => disconnect(true)),
    remember: value => enqueue(async () => { auto = value; await chrome.storage.local.set({ 'cbcm:auto': value }); }),
    all: () => enqueue(async () => {
      await manager.setMany(adapter.rows().filter(row => adapter.visible(row)).map(({ id, title }) => ({ id, title })));
      sync();
    }),
    clear: () => enqueue(async () => { await manager.clear(); sync(); }),
    dry: () => enqueue(() => run(true)), delete: () => enqueue(() => run(false)), stop: () => manager.stop()
  });
  adapter.onStep = message => {
    ui.update(manager, message);
    if (connecting) { ui.connect.disabled = true; ui.manual.disabled = true; }
  };
  async function connect(manual = false) {
    if (connecting || running) return;
    autoAttempted = true;
    connecting = true; ui.connect.disabled = true; ui.update(manager, 'Verifying username and Personal account through native settings…');
    try {
      await CBCM.request('claim'); await adapter.connect({ manual: manual === true }); await manager.activate();
      ui.update(manager, 'Connected · Personal account. Select chats using the checkboxes.');
    } finally { adapter.manualTarget = null; connecting = false; sync(); }
  }
  async function disconnect(logout) {
    auto = false; ui.remember.checked = false;
    await chrome.storage.local.set({ 'cbcm:auto': false });
    lock('Addon disconnected. Saved selections remain isolated in local storage.');
    try { if (logout) { await adapter.logout(); ui.update(manager, 'Logout requested. Complete any confirmation shown by ChatGPT.'); } }
    finally { await CBCM.request('release').catch(() => {}); }
  }
  async function run(dryRun) {
    await manager.guard(); const snapshot = manager.snapshot();
    if (!dryRun) {
      modalPending = true;
      let confirmed; try { confirmed = await ui.confirm(snapshot); } finally { modalPending = false; }
      if (!confirmed) return;
    }
    running = true;
    try {
      const result = await manager.run({ dryRun, confirmed: snapshot.map(item => item.id), progress: (done, total, item) => {
        ui.update(manager); ui.tick(done, total, item); syncCheckboxes();
      } });
      ui.report(result);
    } finally { running = false; sync(); }
  }
  function syncCheckboxes() {
    for (const row of adapter.rows()) {
      row.link.classList.add('cbcm-chat-link');
      // Sibling of the link: keyboard focus and clicks never activate the anchor/router.
      let checkbox = row.row.querySelector(':scope > .cbcm-checkbox');
      if (!checkbox) {
        checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'cbcm-checkbox';
        for (const type of ['click', 'pointerdown', 'mousedown', 'keydown']) checkbox.addEventListener(type, event => event.stopPropagation());
        checkbox.addEventListener('change', event => {
          event.stopPropagation();
          const id = CBCM.conversationId(row.link.getAttribute('href')), selected = checkbox.checked;
          enqueue(async () => {
            CBCM.assert(!modalPending && id && checkbox.dataset.chatId === id && row.row.getAttribute('data-sidebar-archive-chatgpt-id') === id, 'Sidebar target changed.');
            await manager.setMany([{ id, title: (row.link.textContent || 'Untitled chat').trim() }], selected); sync();
          });
        }); row.row.prepend(checkbox); row.row.classList.add('cbcm-row');
      }
      checkbox.dataset.chatId = row.id;
      checkbox.setAttribute('aria-label', `Select ${row.title}`);
      checkbox.title = manager.context ? `Select ${row.title}` : CBCM.BLOCKED;
      checkbox.disabled = !manager.context || manager.busy || connecting || modalPending;
      checkbox.checked = manager.selected.has(row.id);
      row.row.classList.toggle('cbcm-selected', checkbox.checked);
    }
  }
  function sync() {
    if (disposed) return;
    if (!ui.host.isConnected) document.body.append(ui.host);
    ui.host.style.colorScheme = document.documentElement.classList.contains('dark') ? 'dark' :
      document.documentElement.classList.contains('light') ? 'light' : 'light dark';
    if (manager.context && !connecting) {
      try { adapter.assertContext(); } catch (error) {
        manager.stop(); manager.context = null; manager.selected.clear(); adapter.invalidate(); ui.update(manager, error.message);
      }
    }
    syncCheckboxes(); ui.update(manager); if (connecting) { ui.connect.disabled = true; ui.manual.disabled = true; }
    if (auto && !autoAttempted && !connecting && document.querySelector('button[aria-label="Open profile menu"]')) {
      autoAttempted = true; enqueue(connect);
    }
  }
  const observer = new MutationObserver(records => {
    if (!records.some(record => !ui.host.contains(record.target) && !record.target.closest?.('.cbcm-checkbox') &&
      (record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(node =>
        !(node.nodeType === 1 && (node.id === 'cbcm-host' || node.classList?.contains('cbcm-checkbox'))))))) return;
    if (!timer) timer = setTimeout(() => { timer = null; sync(); }, 100);
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'data-sidebar-archive-chatgpt-id'] });
  const themeObserver = new MutationObserver(sync);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  // Prevent competing user actions while native menus/dialogs are being driven.
  const interaction = event => {
    if (!event.isTrusted || event.composedPath().includes(ui.host)) return;
    if (running || connecting) {
      // Manual connection allows only the specific non-destructive native control requested by the adapter.
      if (connecting && adapter.manualTarget && event.composedPath().includes(adapter.manualTarget)) return;
      if (event.type === 'keydown' && event.key === 'Escape') manager.stop();
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    const target = event.target;
    if (manager.context && (target.closest?.('button[aria-label="Open profile menu"]') ||
      target.closest?.('[role="menuitem"]') || target.closest?.('nav[aria-label="Settings"]'))) lock('Account controls opened. Connect again after finishing.');
  };
  for (const type of ['click', 'pointerdown', 'keydown', 'wheel']) document.addEventListener(type, interaction, { capture: true, passive: false });
  const incoming = (message, sender, reply) => {
    if (message?.channel !== 'cbcm-ui') return;
    if (message.action === 'status') { reply({ connected: !!manager.context, busy: manager.busy || connecting, count: manager.selected.size, message: ui.status.textContent }); return; }
    if (message.action === 'connect') { enqueue(connect); reply({ ok: true }); }
    if (message.action === 'logout') { if (!running && !connecting) enqueue(() => disconnect(true)); reply({ ok: !running && !connecting }); }
  };
  chrome.runtime.onMessage.addListener(incoming);
  const changed = (changes, area) => {
    if (area === 'local' && changes['cbcm:auto']) { auto = changes['cbcm:auto'].newValue === true; ui.remember.checked = auto; }
  };
  chrome.storage.onChanged.addListener(changed);
  const cleanup = event => {
    manager.stop();
    if (event.persisted) { lock('Page restored from cache. Connect again.'); return; }
    disposed = true; observer.disconnect(); themeObserver.disconnect(); clearTimeout(timer);
    chrome.storage.onChanged.removeListener(changed); chrome.runtime.onMessage.removeListener(incoming);
    for (const type of ['click', 'pointerdown', 'keydown', 'wheel']) document.removeEventListener(type, interaction, true);
  };
  window.addEventListener('pagehide', cleanup);
  enqueue(async () => {
    auto = (await chrome.storage.local.get('cbcm:auto'))['cbcm:auto'] === true;
    ui.remember.checked = auto; ui.update(manager, CBCM.BLOCKED); sync();
  });
})();
