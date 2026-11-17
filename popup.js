'use strict';
const status = document.getElementById('status');
const remember = document.getElementById('remember');
let tab;
async function findTab() {
  const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
  const owner = (await chrome.storage.session.get('owner')).owner;
  return tabs.find(item => item.id === owner?.tabId) || tabs.find(item => item.active) || tabs[0];
}
async function refresh() {
  tab = await findTab();
  remember.checked = (await chrome.storage.local.get('cbcm:auto'))['cbcm:auto'] === true;
  if (!tab) { status.textContent = 'Open ChatGPT and sign in on its official page.'; return; }
  try {
    const state = await chrome.tabs.sendMessage(tab.id, { channel: 'cbcm-ui', action: 'status' });
    status.textContent = state.connected ? `Connected · Selected: ${state.count}` : state.message;
  } catch { status.textContent = 'Refresh the ChatGPT tab after updating this extension.'; }
}
document.getElementById('open').onclick = async () => {
  try {
    tab = await findTab();
    if (tab) { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); }
    else tab = await chrome.tabs.create({ url: 'https://chatgpt.com/' });
    status.textContent = 'Sign in on ChatGPT if needed, then click Connect in the page toolbar.';
    try { await chrome.tabs.sendMessage(tab.id, { channel: 'cbcm-ui', action: 'connect' }); } catch { /* New tab is still loading. */ }
  } catch (error) { status.textContent = error.message; }
};
document.getElementById('logout').onclick = async () => {
  try {
    tab = await findTab(); if (!tab) throw new Error('Open ChatGPT first.');
    await chrome.tabs.update(tab.id, { active: true });
    const result = await chrome.tabs.sendMessage(tab.id, { channel: 'cbcm-ui', action: 'logout' });
    status.textContent = result.ok ? 'Logout requested. Complete any confirmation on ChatGPT.' : 'Stop the current operation first.';
  } catch (error) { status.textContent = error.message; }
};
remember.onchange = async () => {
  try { await chrome.storage.local.set({ 'cbcm:auto': remember.checked }); }
  catch (error) { status.textContent = error.message; }
};
refresh().catch(error => { status.textContent = error.message; });
