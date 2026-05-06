const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('step definitions module exposes ordered normal and Plus step metadata', () => {
  const source = fs.readFileSync('data/step-definitions.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageStepDefinitions;`)(globalScope);
  const steps = api.getSteps();
  const phoneSteps = api.getSteps({ signupMethod: 'phone' });
  const gptOnlySteps = api.getSteps({ gptOnlyModeEnabled: true });
  const plusSteps = api.getSteps({ plusModeEnabled: true });
  const plusPhoneSteps = api.getSteps({ plusModeEnabled: true, signupMethod: 'phone' });

  assert.equal(Array.isArray(steps), true);
  assert.equal(steps.length, 10);
  assert.deepStrictEqual(
    steps.map((step) => step.order),
    steps.map((step) => step.order).slice().sort((left, right) => left - right)
  );
  assert.deepStrictEqual(
    steps.map((step) => step.key),
    [
      'open-chatgpt',
      'submit-signup-email',
      'fill-password',
      'fetch-signup-code',
      'fill-profile',
      'clear-login-cookies',
      'oauth-login',
      'fetch-login-code',
      'confirm-oauth',
      'platform-verify',
    ]
  );
  assert.deepStrictEqual(
    gptOnlySteps.map((step) => step.key),
    [
      'open-chatgpt',
      'submit-signup-email',
      'fill-password',
      'fetch-signup-code',
      'fill-profile',
      'clear-login-cookies',
    ]
  );
  assert.deepStrictEqual(
    plusSteps.map((step) => step.key),
    [
      'open-chatgpt',
      'submit-signup-email',
      'fill-password',
      'fetch-signup-code',
      'fill-profile',
      'plus-checkout-create',
      'plus-checkout-billing',
      'paypal-approve',
      'plus-checkout-return',
      'oauth-login',
      'fetch-login-code',
      'confirm-oauth',
      'platform-verify',
    ]
  );
  assert.equal(plusSteps.some((step) => step.key === 'clear-login-cookies'), false);
  assert.equal(gptOnlySteps.some((step) => step.key === 'oauth-login'), false);
  assert.equal(gptOnlySteps.some((step) => step.key === 'platform-verify'), false);
  assert.deepStrictEqual(api.getStepIds({ gptOnlyModeEnabled: true }), [1, 2, 3, 4, 5, 6]);
  assert.equal(api.getLastStepId({ gptOnlyModeEnabled: true }), 6);
  assert.equal(plusSteps.some((step) => step.key === 'fetch-login-code'), true);
  assert.deepStrictEqual(api.getStepIds({ plusModeEnabled: true }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(api.getLastStepId({ plusModeEnabled: true }), 13);
  assert.equal(phoneSteps.find((step) => step.key === 'submit-signup-email')?.title, '注册并输入手机号');
  assert.equal(phoneSteps.find((step) => step.key === 'fetch-signup-code')?.title, '获取手机验证码');
  assert.equal(plusPhoneSteps.find((step) => step.key === 'submit-signup-email')?.title, '注册并输入手机号');
  assert.equal(plusPhoneSteps.find((step) => step.key === 'fetch-signup-code')?.title, '获取手机验证码');
  assert.equal(api.normalizeSignupMethod('phone'), 'phone');
  assert.equal(api.normalizeSignupMethod('unknown'), 'email');
});

test('sidepanel html loads shared step definitions before sidepanel bootstrap', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const definitionsIndex = html.indexOf('<script src="../data/step-definitions.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');

  assert.notEqual(definitionsIndex, -1);
  assert.notEqual(sidepanelIndex, -1);
  assert.ok(definitionsIndex < sidepanelIndex);
});

test('sidepanel html exposes Plus mode and PayPal settings', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  assert.match(html, /id="input-plus-mode-enabled"/);
  assert.match(html, /id="input-gpt-only-mode-enabled"/);
  assert.match(html, /id="select-paypal-account"/);
  assert.match(html, /id="btn-add-paypal-account"/);
  assert.match(html, /id="shared-form-modal"/);
});

test('sidepanel html exposes signup method selector and signup phone runtime input', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');

  assert.match(html, /id="row-signup-method"/);
  assert.match(html, /data-signup-method="email"/);
  assert.match(html, /data-signup-method="phone"/);
  assert.match(html, /id="row-signup-phone"/);
  assert.match(html, /id="input-signup-phone"/);
});

test('sidepanel script passes syntax check after signup method wiring', async () => {
  const { execFile } = require('node:child_process');
  const { promisify } = require('node:util');
  const execFileAsync = promisify(execFile);

  await execFileAsync(process.execPath, ['--check', 'sidepanel/sidepanel.js'], {
    cwd: process.cwd(),
  });
});

test('sidepanel signup method defaults are declared before runtime state uses them', () => {
  const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');
  const defaultIndex = source.indexOf("const DEFAULT_SIGNUP_METHOD = SIGNUP_METHOD_EMAIL;");
  const runtimeIndex = source.indexOf("let currentSignupMethod = DEFAULT_SIGNUP_METHOD;");

  assert.notEqual(defaultIndex, -1);
  assert.notEqual(runtimeIndex, -1);
  assert.ok(defaultIndex < runtimeIndex);
});

test('sidepanel signup phone helpers exist for runtime sync and persistence', () => {
  const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

  assert.match(source, /function getRuntimeSignupPhoneValue\(/);
  assert.match(source, /function syncSignupPhoneInputFromState\(/);
  assert.match(source, /async function setRuntimeSignupPhoneState\(/);
  assert.match(source, /async function persistSignupPhoneInputValue\(/);
});

test('sidepanel step sync considers signupMethod changes for rerender', () => {
  const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

  assert.match(
    source,
    /const shouldRender = Boolean\(options\.render\)[\s\S]*\|\| nextSignupMethod !== currentSignupMethod/
  );
});
