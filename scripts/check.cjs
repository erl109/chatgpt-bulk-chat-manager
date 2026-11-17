const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['storage']);
assert.deepEqual(manifest.content_scripts[0].matches, ['https://chatgpt.com/*']);
assert.equal(manifest.background.service_worker, 'background.js');
assert.deepEqual(manifest.host_permissions, ['https://chatgpt.com/*']);
assert(!manifest.externally_connectable && !manifest.web_accessible_resources);
for (const file of [...manifest.content_scripts[0].js, 'background.js', 'popup.js']) {
  const source = fs.readFileSync(file, 'utf8');
  new vm.Script(source, { filename: file });
  assert(!/\bfetch\s*\(|XMLHttpRequest|document\.cookie|localStorage|sessionStorage|sendBeacon|\beval\s*\(/.test(source), `Forbidden API in ${file}`);
}
for (const file of [...manifest.content_scripts[0].css, manifest.action.default_popup, 'popup.css']) assert(fs.existsSync(file), file);
console.log('Manifest, packaged files, JavaScript syntax and forbidden API checks passed.');
