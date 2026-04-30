const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('registered account pool renders delete action for each reusable account', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

  assert.match(html, /id="input-registered-account-pool-search"/);
  assert.match(html, /id="registered-account-pool-meta"/);
  assert.match(html, /id="checkbox-registered-account-pool-select-all"/);
  assert.match(html, /id="btn-registered-account-pool-clear-search"/);
  assert.match(html, /id="btn-registered-account-pool-clear-selection"/);
  assert.match(html, /id="btn-delete-selected-registered-accounts"/);
  assert.match(html, /id="btn-registered-account-pool-load-more"/);
  assert.match(source, /data-registered-account-delete=/);
  assert.match(source, /data-registered-account-select=/);
  assert.match(source, /删除<\/button>/);
  assert.match(source, /function isRegisteredAccountPoolInteractionLocked\(/);
  assert.match(source, /function deleteRegisteredAccountFromPool\(/);
  assert.match(source, /function deleteSelectedRegisteredAccounts\(/);
});
