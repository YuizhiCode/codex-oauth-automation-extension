const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('sidepanel html removes the header contribution button but keeps the update hint layer', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const matches = html.match(/id="btn-contribution-mode"/g) || [];
  const serviceIndex = html.indexOf('<script src="contribution-content-update-service.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');

  assert.equal(matches.length, 0);
  assert.match(html, /<\/header>\s*<div id="contribution-update-layer"/);
  assert.match(html, /id="contribution-update-layer"/);
  assert.match(html, /id="contribution-update-hint"/);
  assert.match(html, /id="contribution-update-hint-text"/);
  assert.match(html, /公告 \/ 使用教程有更新了。/);
  assert.match(html, /id="btn-dismiss-contribution-update-hint"/);
  assert.notEqual(serviceIndex, -1);
  assert.notEqual(sidepanelIndex, -1);
  assert.ok(serviceIndex < sidepanelIndex);
});

test('sidepanel source no longer keeps the legacy upload-page handler on the header contribution button', () => {
  const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

  assert.doesNotMatch(source, /openContributionUploadPage/);
  assert.doesNotMatch(source, /await openContributionUploadPage\(\)/);
});
