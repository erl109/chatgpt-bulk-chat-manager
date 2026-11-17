(function () {
  'use strict';
  const CSS = `
    :host { font: 13px/1.5 system-ui,sans-serif; color: light-dark(#202123,#eee); }
    * { box-sizing: border-box; } button,input { font: inherit; }
    .panel { width: 340px; max-width: calc(100vw - 32px); max-height: calc(100dvh - 32px); overflow: auto; border: 1px solid light-dark(#ddd,#444); border-radius: 16px; background: light-dark(#fff,#232323); box-shadow: 0 8px 32px #0002; }
    summary { cursor: pointer; padding: 12px 16px; font-weight: 650; }
    .body { padding: 0 16px 14px; } .muted { opacity: .72; } .count { margin-bottom: 10px; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
    button { padding: 8px 11px; border: 1px solid light-dark(#d9d9d9,#555); border-radius: 8px; background: light-dark(#fafafa,#303030); color: inherit; cursor: pointer; }
    button:hover:enabled { background: light-dark(#eee,#444); } button:disabled { opacity: .45; cursor: not-allowed; }
    button:focus-visible,summary:focus-visible { outline: 2px solid #10a37f; outline-offset: 3px; }
    .danger { background: #b42332; color: white; border-color: #b42332; } .status { margin: 10px 0 0; font-size: 12px; overflow-wrap: anywhere; }
    progress { width: 100%; accent-color: #10a37f; margin-top: 10px; } [hidden] { display: none !important; }
    dialog { width: 520px; max-width: calc(100vw - 32px); max-height: 85vh; overflow: auto; padding: 24px; border: 1px solid light-dark(#ddd,#444); border-radius: 18px; background: light-dark(#fff,#232323); color: inherit; }
    dialog::backdrop { background: #0008; } h2 { margin: 0 0 12px; font-size: 20px; } ul { padding-left: 20px; max-height: 35vh; overflow: auto; } li { margin: 9px 0; overflow-wrap: anywhere; } small { display: block; opacity: .7; }
    .footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; } .warning { color: light-dark(#a21c2d,#ff9aa4); }
    .connection summary,.selection summary { padding: 8px 0; font-size: 12px; }
    .count { font-size: 17px; font-weight: 650; margin: 12px 0 0; }
    .selected-list { list-style: none; padding: 0; margin: 0 0 12px; max-height: 180px; overflow: auto; }
    .selected-list li { display: flex; align-items: center; gap: 8px; margin: 0; padding: 8px 0; border-bottom: 1px solid light-dark(#eee,#444); }
    .selected-list .title { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .selected-list .check { color: light-dark(#087f65,#5de0b9); font-weight: bold; }
    .selected-list button { padding: 2px 8px; font-size: 18px; flex-shrink: 0; }
  `;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  class UI {
    constructor(actions) {
      this.actions = actions; this.selectionSignature = null; this.wasConnected = false;
      this.host = el('div'); this.host.id = 'cbcm-host';
      this.root = this.host.attachShadow({ mode: 'closed' });
      this.root.append(el('style', CSS));
      const panel = el('details', '', 'panel'); panel.open = true;
      panel.append(el('summary', 'ChatGPT Bulk Chat Manager'));
      const body = el('div', '', 'body');
      this.connection = el('details', '', 'connection'); this.connection.open = true;
      this.connection.append(el('summary', 'Connection & settings'));
      const session = el('div', '', 'actions');
      this.connect = el('button', 'Connect'); this.connect.onclick = actions.connect;
      this.manual = el('button', 'Connect manually'); this.manual.onclick = actions.manual;
      this.disconnect = el('button', 'Disconnect addon'); this.disconnect.onclick = actions.disconnect;
      this.logout = el('button', 'Log out of ChatGPT'); this.logout.onclick = actions.logout;
      session.append(this.connect, this.manual, this.disconnect, this.logout); this.connection.append(session);
      const rememberLabel = el('label', '', 'status');
      this.remember = el('input'); this.remember.type = 'checkbox';
      this.remember.onchange = () => actions.remember(this.remember.checked);
      rememberLabel.append(this.remember, document.createTextNode(' Reconnect addon automatically'));
      this.connection.append(rememberLabel); body.append(this.connection);
      this.count = el('div', 'Selected: 0', 'count'); body.append(this.count);
      this.selection = el('details', '', 'selection'); this.selection.open = true;
      this.selection.append(el('summary', 'Selected chats — review or remove'));
      this.selectedList = el('ul', '', 'selected-list'); this.selection.append(this.selectedList); body.append(this.selection);
      const controls = el('div', '', 'actions'); this.buttons = {};
      for (const [name, label] of Object.entries({ all: 'Select All Visible', clear: 'Deselect All', dry: 'Dry Run', delete: 'Delete Selected' })) {
        const button = el('button', label, name === 'delete' ? 'danger' : '');
        button.type = 'button'; button.onclick = actions[name];
        this.buttons[name] = button; controls.append(button);
      }
      body.append(controls);
      this.progress = el('progress'); this.progress.hidden = true; body.append(this.progress);
      this.stop = el('button', 'Stop after current step'); this.stop.hidden = true; this.stop.onclick = actions.stop; body.append(this.stop);
      this.status = el('p', 'Checking account context…', 'status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite'); body.append(this.status);
      const diagnostics = el('button', 'Show diagnostics'); diagnostics.onclick = actions.diagnostics; body.append(diagnostics);
      panel.append(body); this.root.append(panel); document.body.append(this.host);
    }
    update(manager, message) {
      this.count.textContent = `Selected: ${manager.selected.size}`;
      if (!!manager.context !== this.wasConnected) {
        this.connection.open = !manager.context; this.wasConnected = !!manager.context;
      }
      this.selection.hidden = manager.selected.size === 0;
      const entries = [...manager.selected.values()];
      const signature = JSON.stringify(entries);
      if (signature !== this.selectionSignature) {
        this.selectionSignature = signature; this.selectedList.replaceChildren();
        for (const item of entries) {
          const li = el('li'); const title = el('span', item.title, 'title');
          title.title = item.id; title.append(el('small', `ID: …${item.id.slice(-8)}`));
          const remove = el('button', '×'); remove.type = 'button';
          remove.setAttribute('aria-label', `Deselect ${item.title}`);
          remove.onclick = () => this.actions.unselect(item);
          li.append(el('span', '✓', 'check'), title, remove); this.selectedList.append(li);
        }
      }
      for (const button of this.selectedList.querySelectorAll('button')) button.disabled = manager.busy || !manager.context;
      this.connect.disabled = manager.busy;
      this.manual.disabled = manager.busy;
      this.connect.textContent = manager.context ? 'Recheck account' : 'Connect';
      this.disconnect.disabled = manager.busy || !manager.context;
      this.logout.disabled = manager.busy;
      for (const [name, button] of Object.entries(this.buttons)) button.disabled = !manager.context || manager.busy || (name !== 'all' && !manager.selected.size);
      this.stop.hidden = !manager.busy; this.progress.hidden = !manager.busy;
      if (message) this.status.textContent = message;
    }
    tick(done, total, item) {
      this.progress.max = total; this.progress.value = done;
      this.status.textContent = item ? `Processing ${done + 1} of ${total}: ${item.title}` : `Processed ${done} of ${total}.`;
    }
    showDiagnostics(data) {
      const dialog = el('dialog');
      dialog.append(el('h2', 'Connection diagnostics'), el('p', 'Only interface counts and states. No names, emails, chat titles, IDs or credentials.'));
      const text = el('textarea'); text.readOnly = true; text.value = JSON.stringify(data, null, 2);
      text.style.cssText = 'width:100%;height:260px;font:12px monospace'; dialog.append(text);
      const close = el('button', 'Close'); close.onclick = () => { dialog.close(); dialog.remove(); };
      dialog.oncancel = event => { event.preventDefault(); close.click(); };
      dialog.append(close); this.root.append(dialog); dialog.showModal(); text.focus(); text.select();
    }
    async confirm(items) {
      return new Promise(resolve => {
        const dialog = el('dialog'); dialog.setAttribute('aria-label', 'Confirm selected chat deletion');
        dialog.append(el('h2', `Delete ${items.length} selected chats?`),
          el('p', 'Deletion is permanent and cannot be undone. Only the following IDs are authorized.', 'warning'));
        this.list(dialog, items);
        const label = el('label'); const consent = el('input'); consent.type = 'checkbox';
        label.append(consent, document.createTextNode(' I understand these chats will be permanently deleted.')); dialog.append(label);
        const footer = el('div', '', 'footer'); const cancel = el('button', 'Cancel'); const approve = el('button', 'Delete selected chats', 'danger'); approve.disabled = true;
        consent.onchange = () => { approve.disabled = !consent.checked; };
        const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
        cancel.onclick = () => finish(false); approve.onclick = () => finish(consent.checked);
        dialog.oncancel = event => { event.preventDefault(); finish(false); };
        footer.append(cancel, approve); dialog.append(footer); this.root.append(dialog); dialog.showModal(); cancel.focus();
      });
    }
    list(parent, items) {
      const list = el('ul');
      for (const item of items) {
        const li = el('li', item.title); li.append(el('small', item.id));
        if (item.status) li.append(el('small', item.status)); list.append(li);
      }
      parent.append(list);
    }
    report(result) {
      const dialog = el('dialog'); dialog.setAttribute('aria-label', 'Operation results');
      dialog.append(el('h2', result.dryRun ? 'Dry Run results' : 'Deletion results'));
      dialog.append(el('p', `${result.deleted} confirmed deleted · ${result.verified} verified · ${result.failed - (result.uncertain || 0)} errors · ${result.uncertain || 0} uncertain · ${result.notProcessed} not processed · 0 unselected chats targeted`));
      if (result.uncertain) dialog.append(el('p', 'ChatGPT may already have deleted the chat marked uncertain. The batch stopped and its selection was retained. Check it in ChatGPT before retrying; use × to remove it from the selection if it was deleted.', 'warning'));
      if (result.dryRun) dialog.append(el('p', 'No chats were deleted. Saved selections are unchanged.'));
      this.list(dialog, result.rows);
      const close = el('button', 'Close'); close.onclick = () => { dialog.close(); dialog.remove(); };
      dialog.oncancel = event => { event.preventDefault(); close.click(); };
      dialog.append(close); this.root.append(dialog); dialog.showModal(); close.focus();
    }
  }
  CBCM.UI = UI;
})();
