const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
function row(id, title = 'Same title') {
  return `<div role="group" data-sidebar-archive-chatgpt-id="${id}"><a href="/c/${id}">${title}</a><button id="action-${id}" aria-label="Chat actions"></button></div>`;
}
function setup() {
  const dom = new JSDOM(`<div id="profile"><button aria-label="Open profile menu"></button><span>alice</span><span>Plus</span></div><nav aria-label="Chat history">${row(ID)}${row(OTHER)}</nav>`, { url: 'https://chatgpt.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  // jsdom has no layout engine; give rendered fixture elements browser-like geometry.
  w.HTMLElement.prototype.getClientRects = function () { return [this.getBoundingClientRect()]; };
  for (const path of ['src/core.js', 'src/adapter.js']) w.eval(fs.readFileSync(path, 'utf8'));
  const adapter = new w.CBCM.ChatGPTAdapter();
  adapter.identity = { verified: true, accountId: 'handle:@alice', workspaceId: 'personal' };
  adapter.profile = w.document.querySelector('button'); adapter.profileText = 'alicePlus';
  const clicks = [];
  function install({ wrongTitle = false, wrongMenu = false, pending = true, ariaPending = false, instantPending = false } = {}) {
    for (const chat of adapter.rows()) chat.action.onclick = () => {
      const menu = w.document.createElement('div'); menu.setAttribute('role', 'menu'); menu.dataset.state = 'open';
      menu.setAttribute('aria-labelledby', wrongMenu ? 'wrong' : chat.action.id);
      const button = w.document.createElement('button'); button.setAttribute('role', 'menuitem'); button.textContent = 'Delete';
      menu.append(button); chat.row.append(menu);
      button.onclick = () => {
        menu.remove();
        const dialog = w.document.createElement('div'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-labelledby', 'heading');
        dialog.innerHTML = `<h2 id="heading">Delete chat?</h2><p>This will permanently delete ${wrongTitle ? 'Other title' : chat.title}. This can't be undone.</p><label for="files">Also delete files uploaded or created in this chat</label><button id="files" role="checkbox" aria-checked="true"></button><button type="submit">Delete chat</button>`;
        w.document.body.append(dialog);
        const checkbox = dialog.querySelector('[role="checkbox"]');
        checkbox.onclick = () => checkbox.setAttribute('aria-checked', 'false');
        dialog.querySelector('[type="submit"]').onclick = () => {
          assert.equal(checkbox.getAttribute('aria-checked'), 'false'); clicks.push(chat.id);
          dialog.remove(); chat.row.remove();
          if (pending) {
            const placeholder = w.document.createElement(ariaPending ? 'div' : 'button');
            if (ariaPending) { placeholder.setAttribute('role', 'button'); placeholder.setAttribute('aria-disabled', 'true'); }
            else placeholder.disabled = true;
            placeholder.textContent = chat.title; adapter.sidebar().prepend(placeholder);
            if (instantPending) placeholder.remove(); else w.setTimeout(() => placeholder.remove(), 15);
          }
        };
      };
    }
  }
  return { dom, w, adapter, clicks, install, close: () => w.close() };
}
async function remove(f, id = ID, cancelled = () => false) {
  const context = await f.adapter.context(), proof = await f.adapter.verify(id, context);
  return f.adapter.remove(proof, () => f.adapter.verify(id, context), cancelled);
}

test('profile trigger responds to pointerdown rather than click (Radix regression)', async () => {
  const f = setup(); try {
    const d = f.w.document, button = d.querySelector('[aria-label="Open profile menu"]');
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.ctrlKey) return;
      button.setAttribute('aria-expanded', 'true'); button.setAttribute('aria-controls', 'pointer-menu');
      d.body.insertAdjacentHTML('beforeend', '<div id="pointer-menu" role="menu"><button role="menuitem">Settings</button></div>');
    });
    assert.equal((await f.adapter.openProfile()).id, 'pointer-menu');
  } finally { f.close(); }
});

test('already-open bound profile menu is reused without toggling it closed', async () => {
  const f = setup(); try {
    const d = f.w.document, trigger = d.querySelector('[aria-label="Open profile menu"]');
    trigger.id = 'profile-trigger'; trigger.setAttribute('aria-expanded', 'true');
    d.body.insertAdjacentHTML('beforeend', '<div id="bound" role="menu" aria-labelledby="profile-trigger"><button role="menuitem">Settings</button></div><div role="menu"><button role="menuitem">Unrelated</button></div>');
    let interactions = 0; trigger.onclick = () => interactions++;
    trigger.addEventListener('pointerdown', () => interactions++);
    assert.equal((await f.adapter.openProfile()).id, 'bound'); assert.equal(interactions, 0);
  } finally { f.close(); }
});

test('profile menu is resolved inside its controlled portal wrapper', async () => {
  const f = setup(); try {
    const d = f.w.document, trigger = d.querySelector('[aria-label="Open profile menu"]');
    trigger.onclick = () => {
      trigger.setAttribute('aria-expanded', 'true'); trigger.setAttribute('aria-controls', 'wrapper');
      d.body.insertAdjacentHTML('beforeend', '<div id="wrapper"><div id="nested" role="menu"><button role="menuitem">Settings</button></div></div>');
    };
    assert.equal((await f.adapter.openProfile()).id, 'nested');
  } finally { f.close(); }
});

test('hidden responsive profile duplicates do not create ambiguity', () => {
  const f = setup(); try {
    const d = f.w.document, actual = d.querySelector('[aria-label="Open profile menu"]');
    actual.dataset.state = 'closed';
    d.body.insertAdjacentHTML('beforeend', '<div style="display:none"><button aria-label="Open profile menu"></button></div><button hidden aria-label="Open profile menu"></button>');
    assert.equal(f.adapter.profileButton(), actual);
  } finally { f.close(); }
});

test('profile button arriving after sidebar hydration is awaited', async () => {
  const f = setup(); try {
    const d = f.w.document, button = d.querySelector('[aria-label="Open profile menu"]'), parent = button.parentElement;
    button.remove(); const pending = f.adapter.waitProfile();
    f.w.setTimeout(() => parent.prepend(button), 20);
    assert.equal(await pending, button);
  } finally { f.close(); }
});

test('multiple genuinely visible profile controls fail closed', async () => {
  const f = setup(); try {
    f.w.document.body.insertAdjacentHTML('beforeend', '<button aria-label="Open profile menu"></button>');
    await assert.rejects(f.adapter.openProfile(), /More than one visible/);
  } finally { f.close(); }
});

test('native dialog accessibility hiding does not invalidate the unchanged identity', async () => {
  const f = setup(); try {
    f.w.document.querySelector('#profile').setAttribute('aria-hidden', 'true');
    assert.equal(f.adapter.profileButton(), null);
    assert.equal((await f.adapter.context()).accountId, 'handle:@alice');
  } finally { f.close(); }
});

test('exact row UUID must match href; dynamic additions are discovered', () => {
  const f = setup();
  assert.equal(f.adapter.rows().length, 2);
  f.adapter.rows()[0].link.href = `/c/${OTHER}`; assert.equal(f.adapter.rows().length, 1);
  f.adapter.sidebar().insertAdjacentHTML('beforeend', row(ID)); assert.equal(f.adapter.rows().length, 2); f.close();
});
test('native deletion targets exact ID, excludes files, waits for pending completion', async () => {
  const f = setup(); try {
    f.install(); const receipt = await remove(f);
    assert.equal(receipt.id, ID); assert.equal(receipt.confirmed, true); assert.deepEqual(f.clicks, [ID]);
    assert.equal(f.adapter.rows().length, 1); assert.equal(f.adapter.rows()[0].id, OTHER);
  } finally { f.close(); }
});

for (const options of [{ ariaPending: true }, { instantPending: true }, { ariaPending: true, instantPending: true }])
test(`native receipt handles pending variant ${JSON.stringify(options)}`, async () => {
  const f = setup(); try {
    f.install(options); const receipt = await remove(f);
    assert.equal(receipt.confirmed, true); assert.deepEqual(f.clicks, [ID]);
    assert.equal(f.adapter.lastDeletion.sawPending, true);
    assert.equal(f.adapter.rows()[0].id, OTHER);
  } finally { f.close(); }
});

test('target disappearance alone remains uncertain and diagnostic report contains no IDs', async () => {
  const f = setup(); try {
    const timeout = f.w.setTimeout.bind(f.w);
    f.w.setTimeout = (fn, delay) => timeout(fn, delay === 15000 ? 25 : delay);
    f.install({ pending: false });
    await assert.rejects(remove(f), error => error.code === 'DELETION_UNCERTAIN');
    assert.equal(f.adapter.lastDeletion.submitted, true);
    assert.equal(f.adapter.lastDeletion.targetAbsent, true);
    assert.equal(f.adapter.lastDeletion.sawPending, false);
    assert(!JSON.stringify(f.adapter.diagnostics()).includes(ID));
  } finally { f.close(); }
});
test('two identical titles are independently deleted by UUID in sequence', async () => {
  const f = setup(); try {
    f.install(); await remove(f, ID); await remove(f, OTHER); assert.deepEqual(f.clicks, [ID, OTHER]);
  } finally { f.close(); }
});
test('wrong dialog title blocks final click', async () => {
  const f = setup(); try {
    f.install({ wrongTitle: true }); await assert.rejects(remove(f), /does not match/); assert.deepEqual(f.clicks, []);
  } finally { f.close(); }
});
test('foreign existing dialog blocks opening a delete menu', async () => {
  const f = setup(); try {
    f.w.document.body.insertAdjacentHTML('beforeend', '<div role="dialog">Unrelated</div>');
    f.install(); await assert.rejects(remove(f), /unrelated dialog/); assert.deepEqual(f.clicks, []);
  } finally { f.close(); }
});
test('cancellation prevents destructive clicks', async () => {
  const f = setup(); try {
    f.install(); await assert.rejects(remove(f, ID, () => true), /Stopped/); assert.deepEqual(f.clicks, []);
  } finally { f.close(); }
});
test('profile change invalidates active account', async () => {
  const f = setup(); try {
    f.w.document.querySelector('#profile span').textContent = 'bob';
    await assert.rejects(f.adapter.context(), /Account context changed/);
  } finally { f.close(); }
});
test('unverified context never restores or deletes', async () => {
  const f = setup(); try {
    f.adapter.invalidate(); await assert.rejects(f.adapter.context(), /Account context/);
    await assert.rejects(remove(f), /Account context/); assert.deepEqual(f.clicks, []);
  } finally { f.close(); }
});
test('saved handle must be corroborated by a loaded selected UUID before restore', async () => {
  const f = setup(); try {
    await f.adapter.validateRestore(new Map([[ID, {}]]));
    await assert.rejects(f.adapter.validateRestore(new Map([['33333333-3333-4333-8333-333333333333', {}]])), /Saved selections are locked/);
  } finally { f.close(); }
});
test('verify rejects missing and duplicated selected rows', async () => {
  const f = setup(); try {
    f.adapter.rows()[0].row.remove(); await assert.rejects(f.adapter.verify(ID, f.adapter.identity), /not loaded/);
    f.adapter.sidebar().insertAdjacentHTML('beforeend', row(OTHER)); await assert.rejects(f.adapter.verify(OTHER, f.adapter.identity), /ambiguous/);
  } finally { f.close(); }
});
test('visibility excludes viewport and ancestor-clipped rows', () => {
  const f = setup(); const entry = f.adapter.rows()[0];
  entry.link.getClientRects = () => [1];
  entry.link.getBoundingClientRect = () => ({ top: 10, bottom: 30, left: 10, right: 200 });
  assert(f.adapter.visible(entry));
  entry.row.style.overflowY = 'auto'; entry.row.getBoundingClientRect = () => ({ top: 40, bottom: 100, left: 0, right: 300 });
  assert(!f.adapter.visible(entry)); f.close();
});
for (const manual of [false, true]) for (const layout of ['inside', 'outside']) test(`native connection verifies identity (${manual ? 'manual' : 'automatic'} profile opening, ${layout} nav return)`, async () => {
  const f = setup(); try {
    f.adapter.invalidate(); const d = f.w.document;
    // Mounted but closed dialogs must not block connection.
    d.body.insertAdjacentHTML('beforeend', '<div role="dialog" hidden>Closed dialog</div>');
    const original = d.body.innerHTML;
    function profileActions() {
      const trigger = d.querySelector('[aria-label="Open profile menu"]');
      trigger.onclick = () => {
        trigger.setAttribute('aria-expanded', 'true'); trigger.setAttribute('aria-controls', 'profile-menu');
        const menu = d.createElement('div'); menu.id = 'profile-menu'; menu.setAttribute('role', 'menu'); menu.dataset.state = 'open';
        menu.innerHTML = '<button role="menuitem" aria-haspopup="menu">alicePlus</button><button role="menuitem">Settings</button>';
        d.body.append(menu);
        menu.children[0].onclick = () => menu.insertAdjacentHTML('beforeend', '<div role="menuitem" aria-current="true">Personal account</div>');
        menu.children[1].onclick = () => {
          const back = layout === 'inside' ? '<a id="back">Back to app</a>' : '';
          const outside = layout === 'outside' ? '<button id="back" aria-label="Back to app"><span>Back to app</span></button><div hidden><a>Back to app</a></div>' : '';
          d.body.innerHTML = `${outside}<nav aria-label="Settings">${back}<button>Account</button></nav><div><span>@alice</span><button aria-label="Edit username"></button></div>`;
          d.querySelector('#back').onclick = () => { d.body.innerHTML = original; profileActions(); };
        };
      };
    }
    profileActions();
    d.addEventListener('keydown', event => { if (event.key === 'Escape') { d.querySelector('#profile-menu')?.remove(); d.querySelector('[aria-label="Open profile menu"]').setAttribute('aria-expanded', 'false'); } });
    let requests = 0;
    f.adapter.onStep = () => {
      if (f.adapter.manualTarget) {
        requests++;
        const target = f.adapter.manualTarget;
        f.w.setTimeout(() => target.click(), 0);
      }
    };
    const context = await f.adapter.connect({ manual }); assert.equal(context.accountId, 'handle:@alice'); assert.equal(context.workspaceId, 'personal');
    assert.equal(requests, manual ? 3 : 0);
    assert.equal(f.adapter.manualTarget, null);
  } finally { f.close(); }
});

test('profile lookup survives the native menu hiding its trigger from accessibility', async () => {
  const f = setup(); try {
    const d = f.w.document, button = d.querySelector('[aria-label="Open profile menu"]');
    button.id = 'profile-button'; button.parentElement.setAttribute('aria-hidden', 'true');
    d.body.insertAdjacentHTML('beforeend', '<div role="menu" id="native" aria-labelledby="profile-button"><button role="menuitem">Settings</button></div>');
    assert.equal((await f.adapter.openProfile()).id, 'native');
  } finally { f.close(); }
});

test('diagnostics contain counts and states, not profile names or conversation IDs', () => {
  const f = setup(); try {
    const report = f.adapter.diagnostics();
    assert.equal(report.verifiedRows, 2);
    const serialized = JSON.stringify(report);
    assert(!serialized.includes('alice')); assert(!serialized.includes(ID)); assert(!serialized.includes('Same title'));
  } finally { f.close(); }
});

test('ambiguous visible Back to app controls are never clicked', async () => {
  const f = setup(); try {
    const d = f.w.document;
    d.body.innerHTML = '<button aria-label="Edit username"></button><a>Back to app</a><button>Back to app</button>';
    let clicks = 0; d.addEventListener('click', () => clicks++);
    await assert.rejects(f.adapter.returnToApp(), /More than one visible/);
    assert.equal(clicks, 0);
  } finally { f.close(); }
});

test('Back to app navigation is rejected outside verified Account settings', async () => {
  const f = setup(); try {
    const d = f.w.document; d.body.insertAdjacentHTML('beforeend', '<button>Back to app</button>');
    let clicks = 0; d.addEventListener('click', () => clicks++);
    await assert.rejects(f.adapter.returnToApp(), /Account settings changed/);
    assert.equal(clicks, 0);
  } finally { f.close(); }
});

test('already-open Account is read without clicking duplicate Account controls', async () => {
  const f = setup(); try {
    const d = f.w.document;
    d.body.innerHTML = '<nav aria-label="Settings"><button>Account</button><button>Account</button></nav><div><span>@alice</span><button aria-label="Edit username"></button></div>';
    let clicks = 0; d.addEventListener('click', () => clicks++);
    const editor = await f.adapter.openAccountSettings();
    assert.equal(editor.getAttribute('aria-label'), 'Edit username'); assert.equal(clicks, 0);
  } finally { f.close(); }
});

for (const tag of ['a', 'button']) test(`Account navigation accepts visible ${tag} and ignores hidden copies and icons`, async () => {
  const f = setup(); try {
    const d = f.w.document;
    d.body.innerHTML = `<nav aria-label="Settings" hidden><button>Account</button></nav><nav aria-label="Settings"><${tag} id="account"><svg><title>Account icon</title></svg>Account</${tag}></nav>`;
    let clicks = 0;
    d.querySelector('#account').onclick = () => { clicks++; d.body.insertAdjacentHTML('beforeend', '<button aria-label="Edit username"></button>'); };
    assert(await f.adapter.openAccountSettings()); assert.equal(clicks, 1);
  } finally { f.close(); }
});

test('delayed Account content is awaited without unnecessary navigation', async () => {
  const f = setup(); try {
    const d = f.w.document; d.body.innerHTML = '<nav aria-label="Settings"></nav>';
    const result = f.adapter.openAccountSettings();
    f.w.setTimeout(() => d.body.insertAdjacentHTML('beforeend', '<button aria-label="Edit username"></button>'), 20);
    assert(await result);
  } finally { f.close(); }
});

test('two visible Account navigation targets stop before clicking either', async () => {
  const f = setup(); try {
    const d = f.w.document; d.body.innerHTML = '<nav aria-label="Settings"><button>Account</button><a>Account</a></nav>';
    let clicks = 0; d.addEventListener('click', () => clicks++);
    await assert.rejects(f.adapter.openAccountSettings(), /More than one visible Account/); assert.equal(clicks, 0);
  } finally { f.close(); }
});

for (const [name, markup] of [
  ['literal prefix', '<span>@alice</span>'],
  ['presentation prefix', '<span>alice</span>'],
  ['nested value', '<span><span>@</span><b>alice</b></span>'],
  ['hidden helper text', '<span>@alice<span hidden>Username</span></span>'],
  ['formatting marks', '<span>\u200e@alice\u200b</span>'],
  ['decorative icon', '<span>alice<svg><title>Edit</title></svg></span>']
]) test(`username parsing accepts ${name} without reading other account fields`, () => {
  const f = setup(); try {
    const d = f.w.document;
    d.body.innerHTML = `<div>${markup}<button aria-label="Edit username"></button></div><div>private@example.com</div>`;
    assert.equal(f.adapter.readUsername(f.adapter.accountEditor()), '@alice');
  } finally { f.close(); }
});

for (const markup of ['<span></span>', '<span>@alice @bob</span>', '<span>alice@example.com</span>'])
test(`username parsing rejects invalid field ${markup}`, () => {
  const f = setup(); try {
    const d = f.w.document;
    d.body.innerHTML = `<div>${markup}<button aria-label="Edit username"></button></div>`;
    assert.throws(() => f.adapter.readUsername(f.adapter.accountEditor()), /could not be read reliably/);
  } finally { f.close(); }
});
