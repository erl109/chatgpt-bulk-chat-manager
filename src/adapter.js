/* UI-only adapter for the observed English personal-account interface. */
(function () {
  'use strict';
  const { assert, conversationId, contextKey } = CBCM;
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  function controlName(node) {
    if (node.hasAttribute('aria-label')) return norm(node.getAttribute('aria-label'));
    const copy = node.cloneNode(true);
    for (const decoration of copy.querySelectorAll('svg,[aria-hidden="true"],[hidden]')) decoration.remove();
    return norm(copy.textContent);
  }
  function shown(node) {
    if (!node?.isConnected) return false;
    for (let current = node; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (current.hidden || current.getAttribute('aria-hidden') === 'true' ||
        current.getAttribute('data-state') === 'closed' || style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }
  function rendered(node, allowObscured = false) {
    if (!node?.isConnected || !node.getClientRects().length) return false;
    for (let current = node; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      // data-state=closed on a trigger describes its MENU, not the button's visibility.
      if (current.hidden || (!allowObscured && (current.getAttribute('aria-hidden') === 'true' || current.inert)) ||
        style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }
  const one = (root, selector) => {
    const nodes = [...root.querySelectorAll(selector)];
    assert(nodes.length === 1, `Unsupported or ambiguous interface: ${selector}`);
    return nodes[0];
  };
  const named = (root, selector, text) => {
    const nodes = [...root.querySelectorAll(selector)].filter(node => norm(node.textContent) === text);
    assert(nodes.length === 1, `Expected exactly one “${text}” control.`); return nodes[0];
  };
  function waitFor(read, message, timeout = 8000) {
    return new Promise((resolve, reject) => {
      let observer, timer;
      const finish = (error, value) => { observer?.disconnect(); clearTimeout(timer); error ? reject(error) : resolve(value); };
      const check = () => { try { const value = read(); if (value) finish(null, value); } catch (error) { finish(error); } };
      observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      timer = setTimeout(() => finish(new Error(message)), timeout); check();
    });
  }
  class ChatGPTAdapter {
    constructor() { this.identity = null; this.profile = null; this.profileText = ''; this.ensureOwner = async () => {}; this.onStep = () => {}; this.manualTarget = null; this.manual = false; }
    profileButton(allowObscured = false) {
      const matches = [...document.querySelectorAll('button[aria-label="Open profile menu"]')].filter(node => rendered(node, allowObscured));
      assert(matches.length <= 1, 'More than one visible profile button was found. Connection stopped safely.');
      return matches[0] || null;
    }
    async waitProfile() {
      return waitFor(() => this.profileButton(), 'Profile button is not visible. Keep the sidebar expanded and the ChatGPT page active, then Connect again.', 12000);
    }
    accountEditor() {
      const editors = [...document.querySelectorAll('button[aria-label="Edit username"]')].filter(node => rendered(node));
      assert(editors.length <= 1, 'More than one visible username control. Connection stopped safely.');
      return editors[0] || null;
    }
    readUsername(edit) {
      assert(edit === this.accountEditor(), 'Username control changed during verification.');
      // Read only siblings in the username's value cell. The @ may be a CSS decoration,
      // and hidden accessibility/icon text must not become part of the account identifier.
      const text = node => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent;
        if (node.nodeType !== Node.ELEMENT_NODE || node === edit ||
          node.matches('button,svg,script,style,[aria-hidden="true"],[hidden]') || !shown(node)) return '';
        return [...node.childNodes].map(text).join('');
      };
      const raw = [...edit.parentElement.childNodes].filter(node => node !== edit).map(text).join('');
      const value = norm(raw.replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, ''));
      assert(/^@?[a-zA-Z0-9_.-]{2,64}$/.test(value),
        'The existing username could not be read reliably from its field. No account changes are needed.');
      return value.startsWith('@') ? value : `@${value}`;
    }
    async openAccountSettings() {
      // The Account page may already be open after a failed/previous connection.
      const ready = this.accountEditor(); if (ready) return ready;
      let settings = document.querySelector('nav[aria-label="Settings"]');
      if (!settings) {
        const menu = await this.openProfile();
        named(menu, '[role="menuitem"]', 'Settings').click();
        settings = await waitFor(() => document.querySelector('nav[aria-label="Settings"]'), 'Settings navigation did not load.');
      }
      const destination = await waitFor(() => {
        // Settings can finish rendering Account while the navigation is hydrating.
        const editor = this.accountEditor(); if (editor) return { editor };
        const matches = [...document.querySelectorAll('nav[aria-label="Settings"] button,nav[aria-label="Settings"] a,nav[aria-label="Settings"] [role="button"],nav[aria-label="Settings"] [role="link"]')]
          .filter(node => rendered(node) && controlName(node) === 'Account');
        assert(matches.length <= 1, 'More than one visible Account navigation control. Connection stopped safely.');
        return matches[0] ? { control: matches[0] } : null;
      }, 'Account navigation did not become visible. Open Account in ChatGPT Settings and Connect again.');
      if (destination.editor) return destination.editor;
      destination.control.click();
      return waitFor(() => this.accountEditor(), 'Account settings did not load. Use the English ChatGPT interface.');
    }
    async returnToApp() {
      // Account must already be visible and verified by connect(). The return control can
      // be a link or button outside the Settings nav in the responsive desktop layout.
      assert([...document.querySelectorAll('button[aria-label="Edit username"]')].some(node => rendered(node)),
        'Account settings changed before returning to chats.');
      const control = await waitFor(() => {
        const matches = [...document.querySelectorAll('a,button,[role="link"],[role="button"]')]
          .filter(node => rendered(node) && controlName(node) === 'Back to app');
        assert(matches.length <= 1, 'More than one visible Back to app control. Connection stopped safely.');
        return matches[0] || null;
      }, 'Back to app is not visible in Account settings.');
      control.click();
      await waitFor(() => this.sidebar(), 'Chat history did not return.');
    }
    diagnostics() {
      const profiles = [...document.querySelectorAll('button[aria-label="Open profile menu"]')];
      const menus = [...document.querySelectorAll('[role="menu"]')];
      return {
        version: '1.0.8',
        page: document.querySelector('nav[aria-label="Settings"]') ? 'settings' : this.sidebar() ? 'chat' : 'unknown',
        profileButtons: profiles.map(button => ({
          rendered: rendered(button, true), accessible: rendered(button), expanded: button.getAttribute('aria-expanded'),
          controlsPresent: !!button.getAttribute('aria-controls'),
          controlledElementExists: !!document.getElementById(button.getAttribute('aria-controls') || '')
        })),
        menus: menus.map(menu => ({ rendered: rendered(menu, true), shown: shown(menu),
          labelledByProfile: profiles.some(button => button.id && (menu.getAttribute('aria-labelledby') || '').split(/\s+/).includes(button.id)),
          itemCount: menu.querySelectorAll('[role="menuitem"]').length })),
        chatLinks: document.querySelectorAll('a[href^="/c/"]').length,
        verifiedRows: this.rows().length,
        lastDeletion: this.lastDeletion || null
      };
    }
    sidebar() { return document.querySelector('nav[aria-label="Chat history"]'); }
    rows() {
      const sidebar = this.sidebar(); if (!sidebar) return [];
      return [...sidebar.querySelectorAll('[data-sidebar-archive-chatgpt-id][role="group"]')].flatMap(row => {
        const links = [...row.querySelectorAll('a[href]')].filter(link => conversationId(link.getAttribute('href')));
        if (links.length !== 1) return [];
        const link = links[0], id = conversationId(link.getAttribute('href'));
        if (id !== row.getAttribute('data-sidebar-archive-chatgpt-id')) return [];
        const actions = row.querySelectorAll('button[aria-label="Chat actions"]');
        return actions.length === 1 ? [{ id, title: norm(link.textContent).slice(0, 300), link, row, action: actions[0] }] : [];
      });
    }
    visible({ link }) {
      if (!link.isConnected || !link.getClientRects().length) return false;
      const bounds = link.getBoundingClientRect();
      let top = Math.max(0, bounds.top), bottom = Math.min(innerHeight, bounds.bottom);
      let left = Math.max(0, bounds.left), right = Math.min(innerWidth, bounds.right);
      for (let parent = link; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
      }
      return bottom > top && right > left;
    }
    invalidate() { this.identity = null; }
    findProfileMenu() {
        // React may replace the trigger while opening. Resolve its current ARIA binding.
        const current = this.profileButton(true);
        if (!current) return null; // A route transition may temporarily unmount it.
        const id = current.getAttribute('aria-controls'), controlled = id && document.getElementById(id);
        const candidates = new Set();
        if (controlled?.getAttribute('role') === 'menu') candidates.add(controlled);
        for (const menu of controlled?.querySelectorAll('[role="menu"]') || []) candidates.add(menu);
        if (current.id) for (const menu of document.querySelectorAll('[role="menu"][aria-labelledby]')) {
          if (menu.getAttribute('aria-labelledby').split(/\s+/).includes(current.id)) candidates.add(menu);
        }
        const matches = [...candidates].filter(menu => shown(menu) && menu.querySelector('[role="menuitem"]'));
        assert(matches.length <= 1, 'Profile menu binding is ambiguous.');
        return matches[0] || null;
    }
    async openProfile() {
      const existingMenu = this.findProfileMenu(); if (existingMenu) return existingMenu;
      const button = await this.waitProfile();
      const readMenu = () => this.findProfileMenu();
      if (this.manual) {
        this.manualTarget = button;
        this.onStep('Click your profile at the bottom-left now. The addon will continue automatically.');
        try { return await waitFor(readMenu, 'Manual connection timed out. Click Connect manually to try again.', 45000); }
        finally { this.manualTarget = null; }
      }
      const existing = readMenu(); if (existing) return existing;
      if (button.getAttribute('aria-expanded') !== 'true') {
        // Radix DropdownMenu opens on primary pointerdown, not HTMLElement.click().
        // Use this only for the non-destructive profile trigger; never retry delete actions.
        const EventType = window.PointerEvent || window.MouseEvent;
        button.dispatchEvent(new EventType('pointerdown', { bubbles: true, cancelable: true, composed: true,
          button: 0, buttons: 1, ctrlKey: false, pointerType: 'mouse', pointerId: 1, isPrimary: true }));
        button.dispatchEvent(new EventType('pointerup', { bubbles: true, cancelable: true, composed: true,
          button: 0, buttons: 0, ctrlKey: false, pointerType: 'mouse', pointerId: 1, isPrimary: true }));
        // Let React commit before considering a click-only variant, avoiding a double toggle.
        await new Promise(resolve => setTimeout(resolve, 150));
        const current = await this.waitProfile();
        if (!readMenu() && current.getAttribute('aria-expanded') !== 'true') current.click();
      }
      return waitFor(readMenu, 'Could not open the profile menu. Open your profile at the bottom-left manually, then click Connect again.');
    }
    async connect(options = {}) {
      this.manual = options.manual === true;
      this.invalidate(); await this.ensureOwner();
      assert(![...document.querySelectorAll('[role="dialog"]')].some(shown), 'Close the open ChatGPT dialog first.');
      this.onStep('Opening Account settings…');
      const edit = await this.openAccountSettings();
      // Read only the public username marker, never the account email or other settings.
      const handle = this.readUsername(edit);
      this.onStep('Returning to chats and waiting for the profile button…');
      await this.returnToApp();
      const menu = await this.openProfile();
      this.onStep('Checking the active Personal account…');
      const accounts = [...menu.querySelectorAll('[role="menuitem"][aria-haspopup="menu"]')]
        .filter(node => norm(node.textContent).startsWith(handle.slice(1)));
      assert(accounts.length === 1, 'Account switcher is not recognized.');
      if (this.manual) {
        this.manualTarget = accounts[0];
        this.onStep('Click your account row at the top of the profile menu to reveal Personal account.');
      } else accounts[0].click();
      let personal;
      try { personal = await waitFor(() => [...document.querySelectorAll('[role="menuitem"][aria-current="true"]')]
        .find(node => norm(node.textContent) === 'Personal account'), 'Only a verified Personal account is supported.', this.manual ? 45000 : 8000); }
      finally { this.manualTarget = null; }
      assert(personal && document.querySelectorAll('[role="menuitem"][aria-current="true"]').length === 1, 'Workspace is ambiguous.');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      await waitFor(() => !document.querySelector('[role="menu"][data-state="open"]'), 'Close the profile menu and connect again.');
      this.profile = await this.waitProfile();
      this.profileText = norm(this.profile.parentElement.textContent);
      assert(this.profileText.startsWith(handle.slice(1)), 'Profile marker differs from the verified username.');
      this.identity = { verified: true, accountId: `handle:${handle.toLowerCase()}`, workspaceId: 'personal' };
      return this.context();
    }
    assertContext() {
      // A native confirmation hides background content from accessibility, not from identity checks.
      const current = this.profileButton(true);
      assert(this.identity && current && this.sidebar() &&
        norm(current.parentElement.textContent) === this.profileText,
        'Account context changed. Click Connect to verify again.');
      this.profile = current;
      return { ...this.identity };
    }
    async validateRestore(entries) {
      // A reused/renamed public handle alone cannot expose a previous user's saved selections.
      if (entries.size) assert(this.rows().some(row => entries.has(row.id)),
        'Saved selections are locked until at least one saved chat is loaded in this sidebar. Scroll your history and Connect again.');
    }
    async context() { await this.ensureOwner(); return this.assertContext(); }
    async verify(id, context) {
      assert(contextKey(await this.context()) === contextKey(context), 'Account/workspace changed.');
      const matches = this.rows().filter(row => row.id === id);
      assert(matches.length === 1, 'Selected chat is not loaded or is ambiguous. Scroll it into the sidebar and retry.');
      const row = matches[0];
      assert(!row.row.querySelector('[role="status"]'), 'The chat is still working. Wait before deleting.');
      return { ...row, contextKey: contextKey(context) };
    }
    checkProof(proof) {
      this.assertContext();
      assert(proof.row.isConnected && proof.link.isConnected && proof.action.isConnected &&
        proof.row.getAttribute('data-sidebar-archive-chatgpt-id') === proof.id &&
        conversationId(proof.link.getAttribute('href')) === proof.id && proof.row.contains(proof.action),
        'Exact conversation target changed.');
    }
    async remove(proof, recheck, cancelled) {
      await recheck(); this.checkProof(proof); assert(!cancelled(), 'Stopped before deletion.');
      assert(!document.querySelector('[role="dialog"]'), 'An unrelated dialog is already open.');
      assert(!document.querySelector('[role="menu"][data-state="open"]'), 'Close the open menu before deleting.');
      proof.action.click();
      const menu = await waitFor(() => {
        const candidate = proof.row.querySelector('[role="menu"][data-state="open"]');
        return candidate?.getAttribute('aria-labelledby') === proof.action.id && candidate.querySelector('[role="menuitem"]') ? candidate : null;
      }, 'Exact chat menu could not be identified.');
      await recheck(); this.checkProof(proof); assert(!cancelled(), 'Stopped before deletion.');
      named(menu, '[role="menuitem"]', 'Delete').click();
      const dialog = await waitFor(() => {
        const dialogs = [...document.querySelectorAll('[role="dialog"]')];
        assert(dialogs.length <= 1, 'Multiple native dialogs appeared.'); return dialogs[0];
      }, 'Native deletion confirmation did not appear.');
      const heading = one(dialog, 'h2');
      assert(norm(heading.textContent) === 'Delete chat?' && dialog.getAttribute('aria-labelledby') === heading.id, 'Unexpected native confirmation dialog.');
      assert(norm(one(dialog, 'p').textContent) === `This will permanently delete ${proof.title}. This can't be undone.`, 'Native confirmation does not match the selected chat.');
      // Titles corroborate the UUID-bound menu/dialog chain; they never identify a target.
      const checkbox = one(dialog, 'button[role="checkbox"]');
      const labels = [...dialog.querySelectorAll('label')].filter(label => label.htmlFor === checkbox.id);
      assert(labels.length === 1 && norm(labels[0].textContent) === 'Also delete files uploaded or created in this chat', 'Unknown deletion option.');
      if (checkbox.getAttribute('aria-checked') === 'true') checkbox.click();
      await waitFor(() => checkbox.getAttribute('aria-checked') === 'false', 'Could not disable file deletion.');
      const submit = named(dialog, 'button[type="submit"]', 'Delete chat');
      await recheck(); this.checkProof(proof);
      assert(!cancelled() && dialog.isConnected && !submit.disabled && checkbox.getAttribute('aria-checked') === 'false', 'Stopped before final confirmation.');
      const unaffected = this.rows().filter(row => row.id !== proof.id).map(row => row.id);
      // A missing UUID alone is NOT a receipt: require the observed native pending-to-settled transition.
      let sawPending = false;
      const pendingSelector = 'button:disabled,button[aria-disabled="true"],[role="button"][aria-disabled="true"]';
      const matchesPending = node => node?.nodeType === Node.ELEMENT_NODE &&
        ((node.matches(pendingSelector) && norm(node.textContent) === proof.title) ||
        [...node.querySelectorAll(pendingSelector)].some(child => norm(child.textContent) === proof.title));
      const sidebar = this.sidebar();
      const pending = () => matchesPending(sidebar);
      assert(!pending(), 'A matching chat operation is already pending. Wait before retrying.');
      const inspectChanges = records => {
        // A very fast pending placeholder can be added and removed before observer delivery.
        // Inspect the recorded nodes, not only the final document. Stay within this sidebar.
        if (pending() || records.some(record => [...record.addedNodes, ...record.removedNodes].some(matchesPending))) sawPending = true;
      };
      const monitor = new MutationObserver(inspectChanges);
      monitor.observe(sidebar, { subtree: true, childList: true, attributes: true });
      this.lastDeletion = { submitted: false, sawPending: false, targetAbsent: false, dialogClosed: false, otherRowsPresent: true };
      try {
        this.lastDeletion.submitted = true;
        submit.click();
        inspectChanges(monitor.takeRecords());
        await waitFor(() => {
          this.assertContext();
          const inFlight = pending(); if (inFlight) sawPending = true;
          const ids = new Set(this.rows().map(row => row.id));
          Object.assign(this.lastDeletion, { sawPending, targetAbsent: !ids.has(proof.id), dialogClosed: !dialog.isConnected,
            otherRowsPresent: unaffected.every(id => ids.has(id)), pending: !!inFlight });
          return sawPending && !inFlight && this.lastDeletion.dialogClosed && this.lastDeletion.targetAbsent && this.lastDeletion.otherRowsPresent;
        }, 'Deletion outcome is uncertain. Stopped; the ID remains selected. Check ChatGPT before retrying.', 15000);
        return { id: proof.id, confirmed: true };
      } catch (error) {
        error.code = 'DELETION_UNCERTAIN';
        throw error;
      } finally { monitor.disconnect(); }
    }
    async logout() {
      this.invalidate(); const menu = await this.openProfile(); named(menu, '[role="menuitem"]', 'Log out').click();
    }
  }
  CBCM.ChatGPTAdapter = ChatGPTAdapter;
  CBCM.BLOCKED = 'Click Connect to verify your signed-in Personal account. English ChatGPT interface required.';
  CBCM.dom = { waitFor, norm };
})();
