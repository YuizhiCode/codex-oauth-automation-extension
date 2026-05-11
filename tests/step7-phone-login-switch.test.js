const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') {
      parenDepth += 1;
    } else if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (char === '{' && signatureEnded) {
      braceStart = index;
      break;
    }
  }
  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const char = source[end];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

function extractConst(name) {
  const pattern = new RegExp(`const\\s+${name}\\s*=\\s*[\\s\\S]*?;`);
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`missing const ${name}`);
  }
  return match[0];
}

function extractFunctionIfPresent(name) {
  try {
    return extractFunction(name);
  } catch (error) {
    const message = String(error?.message || '');
    if (
      message.includes(`missing function ${name}`)
      || message.includes(`missing body for function ${name}`)
    ) {
      return '';
    }
    throw error;
  }
}

test('findLoginPhoneEntryTrigger recognizes Chinese continue-with-phone action text', () => {
  const api = new Function(`
const phoneLoginButton = {
  textContent: '\\u4f7f\\u7528\\u7535\\u8bdd\\u53f7\\u7801\\u7ee7\\u7eed',
  value: '',
  disabled: false,
  getAttribute(name) {
    if (name === 'type') return 'button';
    return '';
  },
  getBoundingClientRect() {
    return { width: 220, height: 44 };
  },
};

const document = {
  readyState: 'complete',
  body: {},
  querySelectorAll(selector) {
    if (selector === 'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]') {
      return [phoneLoginButton];
    }
    return [];
  },
};

${extractConst('LOGIN_SWITCH_TO_PHONE_PATTERN')}
${extractConst('LOGIN_PHONE_ACTION_PATTERN')}
${extractConst('LOGIN_EXTERNAL_IDP_PATTERN')}
${extractConst('LOGIN_CODE_ONLY_ACTION_PATTERN')}

function isVisibleElement(el) {
  return Boolean(el);
}

function isActionEnabled(el) {
  return Boolean(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
}

function getActionText(el) {
  return [el?.textContent, el?.value, el?.getAttribute?.('aria-label'), el?.getAttribute?.('title')]
    .filter(Boolean)
    .join(' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function log() {}

${extractFunction('findLoginPhoneEntryTrigger')}

return {
  run() {
    return findLoginPhoneEntryTrigger();
  },
};
`)();

  assert.equal(Boolean(api.run()), true);
});

test('inspectLoginAuthState treats phone-only login action as entry page', () => {
  const api = new Function(`
const phoneLoginButton = {
  textContent: '\\u4f7f\\u7528\\u7535\\u8bdd\\u53f7\\u7801\\u7ee7\\u7eed',
  value: '',
  disabled: false,
  getAttribute(name) {
    if (name === 'type') return 'button';
    return '';
  },
  getBoundingClientRect() {
    return { width: 220, height: 44 };
  },
};

const location = {
  href: 'https://auth.openai.com/log-in',
  pathname: '/log-in',
};

const document = {
  readyState: 'complete',
  body: {},
  querySelectorAll(selector) {
    if (selector === 'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]') {
      return [phoneLoginButton];
    }
    return [];
  },
};

${extractConst('LOGIN_SWITCH_TO_PHONE_PATTERN')}
${extractConst('LOGIN_PHONE_ACTION_PATTERN')}
${extractConst('LOGIN_EXTERNAL_IDP_PATTERN')}
${extractConst('LOGIN_CODE_ONLY_ACTION_PATTERN')}

function isVisibleElement(el) { return Boolean(el); }
function isActionEnabled(el) {
  return Boolean(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
}
function getActionText(el) {
  return [el?.textContent, el?.value, el?.getAttribute?.('aria-label'), el?.getAttribute?.('title')]
    .filter(Boolean)
    .join(' ')
    .replace(/\\s+/g, ' ')
    .trim();
}
function log() {}
function getLoginTimeoutErrorPageState() { return null; }
function getVerificationCodeTarget() { return null; }
function getLoginPasswordInput() { return null; }
function getLoginEmailInput() { return null; }
function getLoginPhoneInput() { return null; }
function findOneTimeCodeLoginTrigger() { return null; }
function findLoginEntryTrigger() { return null; }
function findLoginMoreOptionsTrigger() { return null; }
function getLoginSubmitButton() { return null; }
function isVerificationPageStillVisible() { return false; }
function isAddPhonePageReady() { return false; }
function isAddEmailPageReady() { return false; }
function isPhoneVerificationPageReady() { return false; }
function isStep8Ready() { return false; }
function isOAuthConsentPage() { return false; }
function getLoginVerificationDisplayedEmail() { return ''; }

${extractFunction('findLoginPhoneEntryTrigger')}
${extractFunction('inspectLoginAuthState')}

return {
  run() {
    return inspectLoginAuthState();
  },
};
`)();

  const snapshot = api.run();

  assert.equal(snapshot.state, 'entry_page');
  assert.equal(Boolean(snapshot.phoneEntryTrigger), true);
});

test('inspectLoginAuthState treats visible email input as email page when phone option is present', () => {
  const api = new Function(`
const emailInput = {
  tagName: 'INPUT',
  type: 'email',
  name: 'username',
  id: 'username',
  value: '',
  getAttribute(name) {
    if (name === 'type') return this.type;
    if (name === 'name') return this.name;
    if (name === 'id') return this.id;
    if (name === 'placeholder') return 'Email address';
    return '';
  },
  getBoundingClientRect() {
    return { width: 260, height: 44 };
  },
};
const phoneLoginButton = {
  textContent: 'Continue with phone number',
  value: '',
  disabled: false,
  getAttribute(name) {
    if (name === 'type') return 'button';
    return '';
  },
  getBoundingClientRect() {
    return { width: 220, height: 44 };
  },
};

const location = {
  href: 'https://auth.openai.com/log-in',
  pathname: '/log-in',
};

const document = {
  body: {
    innerText: 'Email address Continue with phone number',
    textContent: 'Email address Continue with phone number',
  },
  querySelector(selector) {
    if (String(selector).includes('input[type="email"]')) {
      return emailInput;
    }
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]') {
      return [phoneLoginButton];
    }
    return [];
  },
};

${extractConst('LOGIN_PHONE_ENTRY_PAGE_PATTERN')}
${extractConst('LOGIN_CODE_ONLY_ACTION_PATTERN')}
${extractConst('LOGIN_EXTERNAL_IDP_PATTERN')}

function isVisibleElement(el) { return Boolean(el); }
function isActionEnabled(el) {
  return Boolean(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
}
function getActionText(el) {
  return [el?.textContent, el?.value, el?.getAttribute?.('aria-label'), el?.getAttribute?.('title')]
    .filter(Boolean)
    .join(' ')
    .replace(/\\s+/g, ' ')
    .trim();
}
function getPageTextSnapshot() {
  return String(document.body.innerText || document.body.textContent || '');
}
function isAddPhonePageReady() { return false; }
function isPhoneVerificationPageReady() { return false; }
function getLoginTimeoutErrorPageState() { return null; }
function getVerificationCodeTarget() { return null; }
function getLoginPasswordInput() { return null; }
function getLoginPhoneInput() { return null; }
function findOneTimeCodeLoginTrigger() { return null; }
function findLoginEntryTrigger() { return null; }
function findLoginPhoneEntryTrigger() { return phoneLoginButton; }
function findLoginMoreOptionsTrigger() { return null; }
function getLoginSubmitButton() { return null; }
function isVerificationPageStillVisible() { return false; }
function isAddEmailPageReady() { return false; }
function isStep8Ready() { return false; }
function isOAuthConsentPage() { return false; }
function getLoginVerificationDisplayedEmail() { return ''; }

${extractFunction('isLoginPhoneUsernameKind')}
${extractFunction('isLoginPhoneEntryPageText')}
${extractFunction('getLoginEmailInput')}
${extractFunction('inspectLoginAuthState')}

return {
  run() {
    return inspectLoginAuthState();
  },
};
`)();

  const snapshot = api.run();

  assert.equal(snapshot.state, 'email_page');
  assert.equal(Boolean(snapshot.emailInput), true);
  assert.equal(Boolean(snapshot.phoneEntryTrigger), true);
});

test('step 7 phone login switches from email login page to phone login', async () => {
  const api = new Function(`
let switchCalls = [];

async function waitForKnownLoginAuthState() {
  return {
    state: 'email_page',
    url: 'https://auth.openai.com/log-in',
  };
}

function normalizeStep6Snapshot(snapshot) { return snapshot; }
function log() {}
function throwForStep6FatalState() {}
async function step6LoginFromEmailPage() {
  throw new Error('should not submit email in phone login mode');
}
async function step6LoginFromPhonePage(payload, snapshot) {
  return { branch: 'phone', payload, snapshot };
}
async function step6LoginFromPasswordPage(payload, snapshot) {
  return { branch: 'password', payload, snapshot };
}
async function switchFromEmailPageToPhoneLogin(payload, snapshot) {
  switchCalls.push({ payload, snapshot });
  return { branch: 'switch_to_phone', payload, snapshot };
}
async function createStep6LoginTimeoutRecoveryTransition() {
  throw new Error('should not recover timeout');
}
async function finalizeStep6VerificationReady(options) {
  return { branch: 'verification', options };
}
function createStep6OAuthConsentSuccessResult(snapshot, options) {
  return { branch: 'oauth', snapshot, options };
}

${extractFunction('step6_login')}

return {
  async run() {
    const result = await step6_login({
      email: '',
      phoneNumber: '+66812345678',
      loginIdentifierType: 'phone',
      visibleStep: 7,
    });
    return { result, switchCalls };
  },
};
`)();

  const { result, switchCalls } = await api.run();

  assert.equal(result.branch, 'switch_to_phone');
  assert.equal(switchCalls.length, 1);
  assert.equal(switchCalls[0].payload.phoneNumber, '+66812345678');
  assert.equal(switchCalls[0].snapshot.state, 'email_page');
});

test('step 7 phone login clicks phone action when auth page is entry page', async () => {
  const api = new Function(`
let openCalls = [];
const phoneLoginButton = {
  textContent: '\\u4f7f\\u7528\\u7535\\u8bdd\\u53f7\\u7801\\u7ee7\\u7eed',
};

async function waitForKnownLoginAuthState() {
  return {
    state: 'entry_page',
    phoneEntryTrigger: phoneLoginButton,
    loginEntryTrigger: null,
    url: 'https://auth.openai.com/log-in',
  };
}

function normalizeStep6Snapshot(snapshot) { return snapshot; }
function log() {}
function throwForStep6FatalState() {}
async function step6LoginFromEmailPage() {
  throw new Error('should not submit email in phone login mode');
}
async function step6LoginFromPhonePage(payload, snapshot) {
  return { branch: 'phone', payload, snapshot };
}
async function step6LoginFromPasswordPage(payload, snapshot) {
  return { branch: 'password', payload, snapshot };
}
async function step6OpenLoginEntry(payload, snapshot) {
  openCalls.push({ payload, snapshot });
  return { branch: 'open_entry', payload, snapshot };
}
async function switchFromEmailPageToPhoneLogin() {
  throw new Error('entry page should use step6OpenLoginEntry first');
}
async function createStep6LoginTimeoutRecoveryTransition() {
  throw new Error('should not recover timeout');
}
async function finalizeStep6VerificationReady(options) {
  return { branch: 'verification', options };
}
function createStep6OAuthConsentSuccessResult(snapshot, options) {
  return { branch: 'oauth', snapshot, options };
}

${extractFunction('step6_login')}

return {
  async run() {
    const result = await step6_login({
      email: '',
      phoneNumber: '+66812345678',
      loginIdentifierType: 'phone',
      visibleStep: 7,
    });
    return { result, openCalls };
  },
};
`)();

  const { result, openCalls } = await api.run();

  assert.equal(result.branch, 'open_entry');
  assert.equal(openCalls.length, 1);
  assert.equal(openCalls[0].snapshot.state, 'entry_page');
  assert.equal(Boolean(openCalls[0].snapshot.phoneEntryTrigger), true);
});

test('step 7 email login waits for default email input when entry page has no email button', async () => {
  const api = new Function(`
let waitedForDefaultEmailInput = 0;
const emailInput = { id: 'email' };
const phoneLoginButton = { textContent: 'Continue with phone number' };

function normalizeStep6Snapshot(snapshot) { return snapshot; }
function findLoginPhoneEntryTrigger() { return phoneLoginButton; }
function findLoginEntryTrigger() { return null; }
function isActionEnabled(el) { return Boolean(el); }
function getActionText(el) { return el?.textContent || ''; }
function log() {}
async function humanPause() {}
async function waitForLoginPhoneEntryTriggerReady() {
  throw new Error('email login should not wait for phone entry trigger');
}
async function clickActionWhenReady() {
  throw new Error('email login should not click an entry trigger');
}
async function activateLoginPhoneEntryTrigger() {
  throw new Error('email login should not activate phone entry trigger');
}
async function waitForLoginEntryOpenTransition() {
  waitedForDefaultEmailInput += 1;
  return { state: 'email_page', emailInput, url: 'https://auth.openai.com/log-in' };
}
async function step6LoginFromEmailPage(payload, snapshot) {
  return { branch: 'email', payload, snapshot };
}
async function switchFromEmailPageToPhoneLogin() {
  throw new Error('should not switch email login to phone');
}
async function step6LoginFromPasswordPage() {
  throw new Error('should not submit password');
}
async function step6LoginFromPhonePage() {
  throw new Error('should not submit phone');
}
async function finalizeStep6VerificationReady() {
  throw new Error('should not finalize verification');
}
function createStep6OAuthConsentSuccessResult() {
  throw new Error('should not create oauth success');
}
function createStep6AddEmailSuccessResult() {
  throw new Error('should not create add email success');
}
async function createStep6LoginTimeoutRecoveryTransition() {
  throw new Error('should not recover timeout');
}
function createStep6RecoverableResult(reason, snapshot, options = {}) {
  return { step6Outcome: 'recoverable', reason, snapshot, ...options };
}

${extractFunction('step6OpenLoginEntry')}

return {
  async run() {
    const result = await step6OpenLoginEntry({
      email: 'user@example.com',
      loginIdentifierType: 'email',
      visibleStep: 7,
    }, {
      state: 'entry_page',
      loginEntryTrigger: null,
      phoneEntryTrigger: phoneLoginButton,
    });
    return { result, waitedForDefaultEmailInput };
  },
};
`)();

  const { result, waitedForDefaultEmailInput } = await api.run();

  assert.equal(result.branch, 'email');
  assert.equal(result.snapshot.emailInput.id, 'email');
  assert.equal(waitedForDefaultEmailInput, 1);
});

test('switchFromEmailPageToPhoneLogin clicks visible Chinese continue-with-phone button', async () => {
  const api = new Function(`
const clicks = [];
const phoneLoginButton = {
  textContent: '\\u4f7f\\u7528\\u7535\\u8bdd\\u53f7\\u7801\\u7ee7\\u7eed',
  value: '',
  disabled: false,
  getAttribute(name) {
    if (name === 'type') return 'button';
    return '';
  },
  getBoundingClientRect() {
    return { left: 12, top: 20, width: 220, height: 44 };
  },
};

const document = {
  readyState: 'complete',
  body: {},
  querySelectorAll(selector) {
    if (selector === 'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]') {
      return [phoneLoginButton];
    }
    return [];
  },
};

const location = {
  href: 'https://auth.openai.com/log-in',
};

${extractConst('LOGIN_SWITCH_TO_PHONE_PATTERN')}
${extractConst('LOGIN_PHONE_ACTION_PATTERN')}
${extractConst('LOGIN_EXTERNAL_IDP_PATTERN')}
${extractConst('LOGIN_CODE_ONLY_ACTION_PATTERN')}
${extractConst('LOGIN_MORE_OPTIONS_PATTERN')}

function normalizeStep6Snapshot(snapshot) { return snapshot; }
function isVisibleElement(el) { return Boolean(el); }
function isActionEnabled(el) { return Boolean(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; }
function getActionText(el) {
  return [el?.textContent, el?.value, el?.getAttribute?.('aria-label'), el?.getAttribute?.('title')]
    .filter(Boolean)
    .join(' ')
    .replace(/\\s+/g, ' ')
    .trim();
}
function log() {}
async function humanPause() {}
function throwIfStopped() {}
function simulateClick(target) {
  clicks.push(getActionText(target));
}
async function sleep() {}
function inspectLoginAuthState() {
  return { state: 'email_page', phoneEntryTrigger: phoneLoginButton };
}
async function waitForPhoneLoginEntrySwitchTransition() {
  return { state: 'phone_entry_page', phoneInput: { id: 'phone' } };
}
async function step6LoginFromPhonePage(payload, snapshot) {
  return { branch: 'phone', payload, snapshot };
}
async function step6LoginFromPasswordPage() {
  throw new Error('should not go to password');
}
async function finalizeStep6VerificationReady() {
  throw new Error('should not finalize verification');
}
function createStep6OAuthConsentSuccessResult() {
  throw new Error('should not go to oauth consent');
}
function createStep6AddEmailSuccessResult() {
  throw new Error('should not go to add email');
}
async function createStep6LoginTimeoutRecoveryTransition() {
  throw new Error('should not recover timeout');
}
function createStep6RecoverableResult(reason, snapshot, options = {}) {
  return { step6Outcome: 'recoverable', reason, snapshot, ...options };
}
function getLoginAuthStateLabel(snapshot) {
  return snapshot?.state || 'unknown';
}

${extractFunction('findLoginPhoneEntryTrigger')}
${extractFunction('findLoginMoreOptionsTrigger')}
${extractFunction('isDocumentReadyForAction')}
${extractFunction('isElementConnectedToDocument')}
${extractFunction('waitForStableButtonRect')}
${extractFunction('waitForActionReady')}
${extractFunction('clickActionWhenReady')}
${extractFunction('waitForLoginPhoneEntryTriggerReady')}
${extractFunction('dispatchActivationEvent')}
${extractFunction('activateLoginPhoneEntryTrigger')}
${extractFunction('switchFromEmailPageToPhoneLogin')}

return {
  async run() {
    const result = await switchFromEmailPageToPhoneLogin({
      phoneNumber: '+66812345678',
      loginIdentifierType: 'phone',
      visibleStep: 7,
    }, {
      state: 'email_page',
      phoneEntryTrigger: null,
      moreOptionsTrigger: null,
    });
    return { result, clicks };
  },
};
`)();

  const { result, clicks } = await api.run();

  assert.deepEqual(clicks, ['使用电话号码继续']);
  assert.equal(result.branch, 'phone');
  assert.equal(result.snapshot.state, 'phone_entry_page');
});

test('switchFromEmailPageToPhoneLogin waits for delayed Chinese continue-with-phone button', async () => {
  const api = new Function(`
const clicks = [];
let now = 0;
let phoneButtonVisible = false;

const phoneLoginButton = {
  textContent: '\\u4f7f\\u7528\\u7535\\u8bdd\\u53f7\\u7801\\u7ee7\\u7eed',
  value: '',
  disabled: false,
  getAttribute(name) {
    if (name === 'type') return 'button';
    return '';
  },
  scrollIntoView() {},
  focus() {},
  getBoundingClientRect() {
    return { left: 12, top: 20, width: 220, height: 44 };
  },
};

const document = {
  readyState: 'complete',
  body: {},
  querySelectorAll(selector) {
    if (selector === 'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]') {
      return phoneButtonVisible ? [phoneLoginButton] : [];
    }
    return [];
  },
};

const location = {
  href: 'https://auth.openai.com/log-in',
};

const Date = {
  now() {
    return now;
  },
};

${extractConst('LOGIN_SWITCH_TO_PHONE_PATTERN')}
${extractConst('LOGIN_PHONE_ACTION_PATTERN')}
${extractConst('LOGIN_EXTERNAL_IDP_PATTERN')}
${extractConst('LOGIN_CODE_ONLY_ACTION_PATTERN')}
${extractConst('LOGIN_MORE_OPTIONS_PATTERN')}

function normalizeStep6Snapshot(snapshot) { return snapshot; }
function isVisibleElement(el) { return Boolean(el); }
function isActionEnabled(el) { return Boolean(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; }
function getActionText(el) {
  return [el?.textContent, el?.value, el?.getAttribute?.('aria-label'), el?.getAttribute?.('title')]
    .filter(Boolean)
    .join(' ')
    .replace(/\\s+/g, ' ')
    .trim();
}
function log() {}
async function humanPause() {}
function throwIfStopped() {}
function simulateClick(target) {
  clicks.push(getActionText(target));
}
async function sleep(ms) {
  now += ms;
  if (now >= 650) phoneButtonVisible = true;
}
function inspectLoginAuthState() {
  return {
    state: 'email_page',
    phoneEntryTrigger: findLoginPhoneEntryTrigger(),
    moreOptionsTrigger: null,
  };
}
async function waitForPhoneLoginEntrySwitchTransition() {
  return { state: 'phone_entry_page', phoneInput: { id: 'phone' } };
}
async function step6LoginFromPhonePage(payload, snapshot) {
  return { branch: 'phone', payload, snapshot };
}
async function step6LoginFromPasswordPage() {
  throw new Error('should not go to password');
}
async function finalizeStep6VerificationReady() {
  throw new Error('should not finalize verification');
}
function createStep6OAuthConsentSuccessResult() {
  throw new Error('should not go to oauth consent');
}
function createStep6AddEmailSuccessResult() {
  throw new Error('should not go to add email');
}
async function createStep6LoginTimeoutRecoveryTransition() {
  throw new Error('should not recover timeout');
}
function createStep6RecoverableResult(reason, snapshot, options = {}) {
  return { step6Outcome: 'recoverable', reason, snapshot, ...options };
}
function getLoginAuthStateLabel(snapshot) {
  return snapshot?.state || 'unknown';
}

${extractFunction('findLoginPhoneEntryTrigger')}
${extractFunction('findLoginMoreOptionsTrigger')}
${extractFunction('isDocumentReadyForAction')}
${extractFunction('isElementConnectedToDocument')}
${extractFunctionIfPresent('waitForStableButtonRect')}
${extractFunctionIfPresent('waitForDocumentActionReady')}
${extractFunctionIfPresent('waitForActionReady')}
${extractFunctionIfPresent('clickActionWhenReady')}
${extractFunctionIfPresent('waitForLoginPhoneEntryTriggerReady')}
${extractFunctionIfPresent('dispatchActivationEvent')}
${extractFunctionIfPresent('activateLoginPhoneEntryTrigger')}
${extractFunction('switchFromEmailPageToPhoneLogin')}

return {
  async run() {
    const result = await switchFromEmailPageToPhoneLogin({
      phoneNumber: '+66812345678',
      loginIdentifierType: 'phone',
      visibleStep: 7,
    }, {
      state: 'email_page',
      phoneEntryTrigger: null,
      moreOptionsTrigger: null,
    });
    return { result, clicks, now };
  },
};
`)();

  const { result, clicks, now } = await api.run();

  assert.deepEqual(clicks, ['使用电话号码继续']);
  assert.equal(result.branch, 'phone');
  assert.equal(result.snapshot.state, 'phone_entry_page');
  assert.equal(now >= 650, true);
});

test('switchFromEmailPageToPhoneLogin uses native click for Chinese continue-with-phone button', async () => {
  const api = new Function(`
const clicks = [];
const logs = [];
let nativeClickCount = 0;
let dispatchedEvents = [];
const phoneLoginButton = {
  tagName: 'BUTTON',
  textContent: '\\u4f7f\\u7528\\u7535\\u8bdd\\u53f7\\u7801\\u7ee7\\u7eed',
  value: '',
  disabled: false,
  getAttribute(name) {
    if (name === 'type') return 'button';
    return '';
  },
  scrollIntoView() {},
  focus() {},
  click() {
    nativeClickCount += 1;
  },
  dispatchEvent(event) {
    dispatchedEvents.push(event.type);
    return true;
  },
  getBoundingClientRect() {
    return { left: 12, top: 20, width: 220, height: 44 };
  },
};

function PointerEvent(type, init = {}) {
  this.type = type;
  Object.assign(this, init);
}
function MouseEvent(type, init = {}) {
  this.type = type;
  Object.assign(this, init);
}
function KeyboardEvent(type, init = {}) {
  this.type = type;
  Object.assign(this, init);
}

const document = {
  readyState: 'complete',
  body: {},
  querySelectorAll(selector) {
    if (selector === 'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]') {
      return [phoneLoginButton];
    }
    return [];
  },
};

const location = {
  href: 'https://auth.openai.com/log-in',
};

${extractConst('LOGIN_SWITCH_TO_PHONE_PATTERN')}
${extractConst('LOGIN_PHONE_ACTION_PATTERN')}
${extractConst('LOGIN_EXTERNAL_IDP_PATTERN')}
${extractConst('LOGIN_CODE_ONLY_ACTION_PATTERN')}
${extractConst('LOGIN_MORE_OPTIONS_PATTERN')}

function normalizeStep6Snapshot(snapshot) { return snapshot; }
function isVisibleElement(el) { return Boolean(el); }
function isActionEnabled(el) { return Boolean(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; }
function getActionText(el) {
  return [el?.textContent, el?.value, el?.getAttribute?.('aria-label'), el?.getAttribute?.('title')]
    .filter(Boolean)
    .join(' ')
    .replace(/\\s+/g, ' ')
    .trim();
}
function log(message, level = 'info') { logs.push({ message, level }); }
async function humanPause() {}
function throwIfStopped() {}
function simulateClick(target) {
  clicks.push(getActionText(target));
}
async function sleep() {}
function inspectLoginAuthState() {
  return { state: 'email_page', phoneEntryTrigger: phoneLoginButton };
}
async function waitForPhoneLoginEntrySwitchTransition() {
  return { state: 'phone_entry_page', phoneInput: { id: 'phone' } };
}
async function step6LoginFromPhonePage(payload, snapshot) {
  return { branch: 'phone', payload, snapshot };
}
async function step6LoginFromPasswordPage() {
  throw new Error('should not go to password');
}
async function finalizeStep6VerificationReady() {
  throw new Error('should not finalize verification');
}
function createStep6OAuthConsentSuccessResult() {
  throw new Error('should not go to oauth consent');
}
function createStep6AddEmailSuccessResult() {
  throw new Error('should not go to add email');
}
async function createStep6LoginTimeoutRecoveryTransition() {
  throw new Error('should not recover timeout');
}
function createStep6RecoverableResult(reason, snapshot, options = {}) {
  return { step6Outcome: 'recoverable', reason, snapshot, ...options };
}
function getLoginAuthStateLabel(snapshot) {
  return snapshot?.state || 'unknown';
}

${extractFunction('findLoginPhoneEntryTrigger')}
${extractFunction('findLoginMoreOptionsTrigger')}
${extractFunction('isDocumentReadyForAction')}
${extractFunction('isElementConnectedToDocument')}
${extractFunction('waitForStableButtonRect')}
${extractFunction('waitForActionReady')}
${extractFunction('clickActionWhenReady')}
${extractFunction('waitForLoginPhoneEntryTriggerReady')}
${extractFunction('dispatchActivationEvent')}
${extractFunction('activateLoginPhoneEntryTrigger')}
${extractFunction('switchFromEmailPageToPhoneLogin')}

return {
  async run() {
    const result = await switchFromEmailPageToPhoneLogin({
      phoneNumber: '+66812345678',
      loginIdentifierType: 'phone',
      visibleStep: 7,
    }, {
      state: 'email_page',
      phoneEntryTrigger: null,
      moreOptionsTrigger: null,
    });
    return { result, clicks, logs, nativeClickCount, dispatchedEvents };
  },
};
`)();

  const { result, clicks, logs, nativeClickCount, dispatchedEvents } = await api.run();

  assert.deepEqual(clicks, []);
  assert.equal(nativeClickCount, 1);
  assert.ok(dispatchedEvents.includes('click'));
  assert.ok(logs.some(({ message }) => /准备点击手机号登录按钮/.test(message)));
  assert.ok(logs.some(({ message }) => /已执行手机号登录按钮点击/.test(message)));
  assert.equal(result.branch, 'phone');
});

test('switchFromEmailPageToPhoneLogin still clicks matched phone button when document contains check fails', async () => {
  const api = new Function(`
const clicks = [];
const logs = [];
let now = 0;
let nativeClickCount = 0;
let containsChecks = 0;
const phoneLoginButton = {
  tagName: 'BUTTON',
  textContent: '\\u4f7f\\u7528\\u7535\\u8bdd\\u53f7\\u7801\\u7ee7\\u7eed',
  value: '',
  disabled: false,
  getAttribute(name) {
    if (name === 'type') return 'button';
    return '';
  },
  scrollIntoView() {},
  focus() {},
  click() {
    nativeClickCount += 1;
  },
  dispatchEvent() {
    return true;
  },
  getBoundingClientRect() {
    return { left: 12, top: 20, width: 220, height: 44 };
  },
};

function MouseEvent(type, init = {}) {
  this.type = type;
  Object.assign(this, init);
}
function KeyboardEvent(type, init = {}) {
  this.type = type;
  Object.assign(this, init);
}

const document = {
  readyState: 'complete',
  body: {
    contains() {
      containsChecks += 1;
      return false;
    },
  },
  querySelectorAll(selector) {
    if (selector === 'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]') {
      return [phoneLoginButton];
    }
    return [];
  },
};

const location = {
  href: 'https://auth.openai.com/log-in',
};

const Date = {
  now() {
    return now;
  },
};

${extractConst('LOGIN_SWITCH_TO_PHONE_PATTERN')}
${extractConst('LOGIN_PHONE_ACTION_PATTERN')}
${extractConst('LOGIN_EXTERNAL_IDP_PATTERN')}
${extractConst('LOGIN_CODE_ONLY_ACTION_PATTERN')}
${extractConst('LOGIN_MORE_OPTIONS_PATTERN')}

function normalizeStep6Snapshot(snapshot) { return snapshot; }
function isVisibleElement(el) { return Boolean(el); }
function isActionEnabled(el) { return Boolean(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; }
function getActionText(el) {
  return [el?.textContent, el?.value, el?.getAttribute?.('aria-label'), el?.getAttribute?.('title')]
    .filter(Boolean)
    .join(' ')
    .replace(/\\s+/g, ' ')
    .trim();
}
function log(message, level = 'info') { logs.push({ message, level }); }
async function humanPause() {}
function throwIfStopped() {}
function simulateClick(target) {
  clicks.push(getActionText(target));
}
async function sleep(ms = 0) {
  now += ms || 1;
}
function inspectLoginAuthState() {
  return { state: 'email_page', phoneEntryTrigger: findLoginPhoneEntryTrigger(), moreOptionsTrigger: null };
}
async function waitForPhoneLoginEntrySwitchTransition() {
  return { state: 'phone_entry_page', phoneInput: { id: 'phone' } };
}
async function step6LoginFromPhonePage(payload, snapshot) {
  return { branch: 'phone', payload, snapshot };
}
async function step6LoginFromPasswordPage() {
  throw new Error('should not go to password');
}
async function finalizeStep6VerificationReady() {
  throw new Error('should not finalize verification');
}
function createStep6OAuthConsentSuccessResult() {
  throw new Error('should not go to oauth consent');
}
function createStep6AddEmailSuccessResult() {
  throw new Error('should not go to add email');
}
async function createStep6LoginTimeoutRecoveryTransition() {
  throw new Error('should not recover timeout');
}
function createStep6RecoverableResult(reason, snapshot, options = {}) {
  return { step6Outcome: 'recoverable', reason, snapshot, ...options };
}
function getLoginAuthStateLabel(snapshot) {
  return snapshot?.state || 'unknown';
}

${extractFunction('findLoginPhoneEntryTrigger')}
${extractFunction('findLoginMoreOptionsTrigger')}
${extractFunction('isDocumentReadyForAction')}
${extractFunction('isElementConnectedToDocument')}
${extractFunction('waitForStableButtonRect')}
${extractFunction('waitForActionReady')}
${extractFunction('clickActionWhenReady')}
${extractFunction('waitForLoginPhoneEntryTriggerReady')}
${extractFunction('dispatchActivationEvent')}
${extractFunction('activateLoginPhoneEntryTrigger')}
${extractFunction('switchFromEmailPageToPhoneLogin')}

return {
  async run() {
    const result = await switchFromEmailPageToPhoneLogin({
      phoneNumber: '+66812345678',
      loginIdentifierType: 'phone',
      visibleStep: 7,
    }, {
      state: 'email_page',
      phoneEntryTrigger: null,
      moreOptionsTrigger: null,
    });
    return { result, clicks, logs, nativeClickCount, containsChecks };
  },
};
`)();

  const { result, clicks, logs, nativeClickCount, containsChecks } = await api.run();

  assert.equal(result.branch, 'phone');
  assert.equal(nativeClickCount, 1);
  assert.deepEqual(clicks, []);
  assert.equal(containsChecks, 0);
  assert.ok(logs.some(({ message }) => /已找到手机号登录按钮/.test(message)));
});

test('step 7 phone login continues directly when already on phone entry page', async () => {
  const api = new Function(`
async function waitForKnownLoginAuthState() {
  return {
    state: 'phone_entry_page',
    url: 'https://auth.openai.com/log-in?usernameKind=phone_number',
  };
}

function normalizeStep6Snapshot(snapshot) { return snapshot; }
function log() {}
function throwForStep6FatalState() {}
async function step6LoginFromEmailPage() {
  throw new Error('should not submit email in phone login mode');
}
async function step6LoginFromPhonePage(payload, snapshot) {
  return { branch: 'phone', payload, snapshot };
}
async function step6LoginFromPasswordPage(payload, snapshot) {
  return { branch: 'password', payload, snapshot };
}
async function switchFromEmailPageToPhoneLogin() {
  throw new Error('should not switch when already on phone page');
}
async function createStep6LoginTimeoutRecoveryTransition() {
  throw new Error('should not recover timeout');
}
async function finalizeStep6VerificationReady(options) {
  return { branch: 'verification', options };
}
function createStep6OAuthConsentSuccessResult(snapshot, options) {
  return { branch: 'oauth', snapshot, options };
}

${extractFunction('step6_login')}

return {
  run() {
    return step6_login({
      phoneNumber: '+66812345678',
      loginIdentifierType: 'phone',
      visibleStep: 7,
    });
  },
};
`)();

  const result = await api.run();

  assert.equal(result.branch, 'phone');
  assert.equal(result.payload.phoneNumber, '+66812345678');
  assert.equal(result.snapshot.state, 'phone_entry_page');
});

test('step 7 phone login resolves dial code from displayed phone selector or phone number', () => {
  const api = new Function(`
const document = {};

function extractDialCodeFromText(value) {
  const match = String(value || '').match(/\\+\\s*(\\d{1,4})\\b/);
  return String(match?.[1] || '').trim();
}

function getPageTextSnapshot() {
  return '';
}

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\\D+/g, '');
}

${extractFunction('resolveSignupPhoneDialCodeFromNumber')}
function getSignupPhoneDisplayedDialCode(phoneInput = null) {
  const text = String(phoneInput?.closest?.()?.textContent || '').trim();
  return extractDialCodeFromText(text);
}
function resolveSignupPhoneDialCode(phoneInput, options = {}) {
  const displayedDialCode = getSignupPhoneDisplayedDialCode(phoneInput);
  if (displayedDialCode) return displayedDialCode;
  const countryText = String(options.countryLabel || '').trim();
  if (/thailand/i.test(countryText)) return '66';
  return '';
}
${extractFunction('getLoginPhoneDisplayedDialCode')}
${extractFunction('resolveLoginPhoneDialCode')}

return {
  fromDisplayed() {
    return resolveLoginPhoneDialCode({
      closest() {
        return { textContent: 'Thailand +66' };
      },
    }, {
      phoneNumber: '66812345678',
      countryLabel: '',
    });
  },
  fromCountry() {
    return resolveLoginPhoneDialCode(null, {
      phoneNumber: '66812345678',
      countryLabel: 'Thailand',
    });
  },
  fromNumber() {
    return resolveLoginPhoneDialCode(null, {
      phoneNumber: '+66812345678',
      countryLabel: '',
    });
  },
  fromFallbackNumber() {
    return resolveLoginPhoneDialCode(null, {
      phoneNumber: '+393331234567',
      countryLabel: '',
    });
  },
};
`)();

  assert.equal(api.fromDisplayed(), '66');
  assert.equal(api.fromCountry(), '66');
  assert.equal(api.fromNumber(), '66');
  assert.equal(api.fromFallbackNumber(), '39');
});

test('phone country selection does not trust hidden select while visible country button is stale', () => {
  const api = new Function(`
const targetOption = { value: 'TH', textContent: 'Thailand +66' };
const selectedOption = targetOption;

function resolveSignupPhoneTargetDialCode() { return '66'; }
function getSignupPhoneCountryButton() { return { textContent: 'United States' }; }
function getSignupPhoneCountryButtonText() { return 'United States'; }
function extractDialCodeFromText(value) {
  const match = String(value || '').match(/\\+\\s*(\\d{1,4})\\b/);
  return String(match?.[1] || '').trim();
}
function doesSignupPhoneCountryTextMatchTarget(text) {
  return /thailand|\\+66/i.test(String(text || ''));
}
function isVisibleElement() { return true; }
function getSignupPhoneSelectedCountryOption() { return selectedOption; }
function isSameSignupCountryOption(left, right) { return left === right; }

${extractFunction('isSignupPhoneCountrySelectionSynced')}

return {
  staleVisibleButton() {
    return isSignupPhoneCountrySelectionSynced({}, targetOption, { phoneNumber: '66812345678', countryLabel: 'Thailand' });
  },
};
`)();

  assert.equal(api.staleVisibleButton(), false);
});

test('step 7 phone country selection resolves Chile from +56 phone number', () => {
  const api = new Function(`
const document = {};
const chileOption = {
  value: 'CL',
  textContent: 'Chile',
  label: 'Chile',
};
const thailandOption = {
  value: 'TH',
  textContent: 'Thailand',
  label: 'Thailand',
};
const select = {
  options: [thailandOption, chileOption],
};

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\\D+/g, '');
}
function extractDialCodeFromText(value) {
  const match = String(value || '').match(/\\+\\s*(\\d{1,4})\\b/);
  return String(match?.[1] || '').trim();
}
function getPageTextSnapshot() {
  return '';
}
${extractFunction('normalizeSignupCountryLabel')}
${extractFunction('getSignupCountryLabelAliases')}
${extractFunction('getSignupPhoneCountryCandidateEntries')}
${extractFunction('getSignupPhoneCountryCandidateLabels')}
${extractFunction('getSignupCountryAliasesByDialCode')}
${extractFunction('getSignupPhoneOptionLabel')}
${extractFunction('normalizeSignupCountryOptionValue')}
function getSignupRegionDisplayName(regionCode) {
  if (regionCode === 'CL') return 'Chile';
  if (regionCode === 'TH') return 'Thailand';
  return '';
}
${extractFunction('getSignupPhoneCountryMatchLabels')}
${extractFunction('resolveSignupPhoneDialCodeFromNumber')}
${extractFunction('resolveSignupPhoneTargetDialCode')}
function getSignupPhoneCountrySelect() {
  return select;
}
${extractFunction('findSignupPhoneCountryOptionByPhoneNumber')}
${extractFunction('getSignupPhoneCountryTargetLabels')}
${extractFunction('doesSignupPhoneCountryTextMatchTarget')}

return {
  byNumber() {
    return findSignupPhoneCountryOptionByPhoneNumber({}, '56946391679');
  },
  textMatch() {
    return doesSignupPhoneCountryTextMatchTarget('Chile', null, {
      phoneNumber: '56946391679',
      countryLabel: '',
    });
  },
};
`)();

  assert.equal(api.byNumber()?.value, 'CL');
  assert.equal(api.textMatch(), true);
});

test('step 7 phone country selection can use HeroSMS selected fallback countries', () => {
  const api = new Function(`
const document = {};
const chileOption = {
  value: 'CL',
  textContent: 'Chile',
  label: 'Chile',
};
const thailandOption = {
  value: 'TH',
  textContent: 'Thailand',
  label: 'Thailand',
};
const select = {
  options: [thailandOption, chileOption],
};

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\\D+/g, '');
}
function extractDialCodeFromText(value) {
  const match = String(value || '').match(/\\+\\s*(\\d{1,4})\\b/);
  return String(match?.[1] || '').trim();
}
function getPageTextSnapshot() {
  return '';
}
${extractFunction('normalizeSignupCountryLabel')}
${extractFunction('getSignupCountryLabelAliases')}
${extractFunction('getSignupCountryAliasesByDialCode')}
${extractFunction('getSignupPhoneCountryCandidateEntries')}
${extractFunction('getSignupPhoneCountryCandidateLabels')}
${extractFunction('getSignupPhoneOptionLabel')}
${extractFunction('normalizeSignupCountryOptionValue')}
function getSignupRegionDisplayName(regionCode) {
  if (regionCode === 'CL') return 'Chile';
  if (regionCode === 'TH') return 'Thailand';
  return '';
}
${extractFunction('getSignupPhoneCountryMatchLabels')}
${extractFunction('resolveSignupPhoneDialCodeFromNumber')}
function getSignupPhoneCountrySelect() {
  return select;
}
${extractFunction('findSignupPhoneCountryOptionByPhoneNumber')}

return {
  byFallbackCountry() {
    return findSignupPhoneCountryOptionByPhoneNumber({}, '56946391679', {
      countryLabel: '',
      heroSmsCountryId: 52,
      heroSmsCountryLabel: 'Thailand',
      heroSmsCountryFallback: [{ id: 'CL', label: 'Chile' }],
    });
  },
};
`)();

  assert.equal(api.byFallbackCountry()?.value, 'CL');
});

test('step 7 phone login selects country before filling phone number', async () => {
  const api = new Function(`
const phoneInput = {
  tagName: 'INPUT',
  type: 'tel',
  name: 'phone',
  id: 'phone',
  value: '',
  getAttribute(name) { return this[name] || ''; },
};
let selectedCountryPayload = null;
let fillPayload = null;
let submitted = false;

function normalizeStep6Snapshot(snapshot) { return snapshot; }
function createStep6RecoverableResult(reason, snapshot, options = {}) {
  return { step6Outcome: 'recoverable', reason, snapshot, ...options };
}
async function selectCountryForPhoneInput(input, phoneNumber, countryLabel, options) {
  selectedCountryPayload = { input, phoneNumber, countryLabel, options };
  return '66';
}
function resolveLoginPhoneDialCode() {
  throw new Error('should use selected country dial code');
}
function getLoginPhoneInput() { return phoneInput; }
function toNationalPhoneNumber(phoneNumber, dialCode) {
  return String(phoneNumber).replace(new RegExp('^' + dialCode), '');
}
function getPhoneInputRenderedValue(input) { return input.value || ''; }
function getLoginPhoneInputCandidateDiagnostics() { return []; }
function log() {}
async function humanPause() {}
async function fillLoginPhoneInputAndConfirm(input, options) {
  fillPayload = { input, options };
  input.value = '812345678';
  return { input, inputValue: '812345678', attemptedValue: '812345678' };
}
async function sleep() {}
function syncPhoneHiddenFormValue() { return null; }
function getLoginSubmitButton() { return {}; }
function getPhoneHiddenValueInput() { return null; }
function getLoginPhoneSubmitButtonDiagnostics() { return { present: true }; }
function isPhoneInputValueComplete() { return true; }
function normalizePhoneDigits(value) { return String(value || '').replace(/\\D+/g, ''); }
async function triggerLoginSubmitAction() { submitted = true; }
async function waitForStep6PostSubmitTransition() {
  return {
    action: 'done',
    result: {
      step6Outcome: 'success',
      skipLoginVerificationStep: true,
      via: 'phone_submit',
    },
  };
}
async function finalizeStep6VerificationReady() {
  throw new Error('should return skip result');
}

${extractFunction('step6LoginFromPhonePage')}

return {
  async run() {
    const result = await step6LoginFromPhonePage({
      phoneNumber: '66812345678',
      countryLabel: 'Thailand',
      countryId: 52,
      visibleStep: 7,
    }, {
      state: 'phone_entry_page',
      phoneInput,
      submitButton: {},
    });
    return { result, selectedCountryPayload, fillPayload, submitted };
  },
};
`)();

  const { result, selectedCountryPayload, fillPayload, submitted } = await api.run();

  assert.equal(selectedCountryPayload.phoneNumber, '66812345678');
  assert.equal(selectedCountryPayload.countryLabel, 'Thailand');
  assert.equal(selectedCountryPayload.options.countryId, 52);
  assert.equal(fillPayload.options.dialCode, '66');
  assert.equal(fillPayload.options.phoneNumber, '66812345678');
  assert.equal(submitted, true);
  assert.equal(result.step6Outcome, 'success');
});

test('login password page with phone text is not treated as add-phone page', () => {
  const api = new Function(`
const location = {
  pathname: '/log-in/password',
  href: 'https://auth.openai.com/log-in/password',
};
const document = {
  querySelector(selector) {
    if (selector === 'form[action*="/add-phone" i]') return null;
    return null;
  },
  body: {
    innerText: 'Enter your password for this phone number',
    textContent: 'Enter your password for this phone number',
  },
};
const ADD_PHONE_PAGE_PATTERN = /add[\\s-]*phone|添加手机号|手机号码|手机号|phone\\s+number|telephone/i;

function isVisibleElement() { return true; }
function getLoginPasswordInput() { return { type: 'password' }; }
function isPhoneVerificationPageReady() { return false; }
function getPageTextSnapshot() {
  return String(document.body.innerText || document.body.textContent || '');
}

${extractFunction('isAddPhonePageReady')}

return { isAddPhonePageReady };
`)();

  assert.equal(api.isAddPhonePageReady(), false);
});

test('step 7 fills add-email after phone login password submit', async () => {
  const api = new Function(`
let finalized = false;
let addEmailPayload = null;
const passwordInput = { value: '' };
const submitButton = {};

function normalizeStep6Snapshot(snapshot) { return snapshot; }
function log() {}
async function humanPause() {}
function fillInput(input, value) { input.value = value; }
async function sleep() {}
async function triggerLoginSubmitAction() {}
function inspectLoginAuthState() { return { state: 'password_page', passwordInput, submitButton }; }
function findOneTimeCodeLoginTrigger() { return null; }
async function step6SwitchToOneTimeCodeLogin() {
  throw new Error('should not switch to one-time code');
}
function createStep6RecoverableResult(reason, snapshot, options = {}) {
  return { step6Outcome: 'recoverable', reason, snapshot, ...options };
}
async function waitForStep6PasswordSubmitTransition() {
  return {
    action: 'done',
    result: {
      step6Outcome: 'success',
      addEmailPage: true,
      state: 'add_email_page',
      via: 'password_submit_add_email',
      loginVerificationRequestedAt: null,
    },
  };
}
async function finalizeStep6VerificationReady() {
  finalized = true;
  throw new Error('should not finalize as verification page');
}
async function completeAddEmailDuringStep7(payload, options) {
  addEmailPayload = { payload, options };
  return {
    step6Outcome: 'success',
    state: 'verification_page',
    via: options.via,
    loginVerificationRequestedAt: 12345,
  };
}
async function step6LoginFromEmailPage() {
  throw new Error('should not go to email login');
}

${extractFunction('step6LoginFromPasswordPage')}

return {
  async run() {
    const result = await step6LoginFromPasswordPage({ password: 'Secret123!' }, {
      state: 'password_page',
      passwordInput,
      submitButton,
    });
    return { result, finalized, passwordValue: passwordInput.value, addEmailPayload };
  },
};
`)();

  const { result, finalized, passwordValue, addEmailPayload } = await api.run();

  assert.equal(result.state, 'verification_page');
  assert.equal(result.via, 'password_submit_add_email');
  assert.equal(finalized, false);
  assert.equal(passwordValue, 'Secret123!');
  assert.equal(addEmailPayload.options.via, 'password_submit_add_email');
});

test('step 7 fills already-open add-email page before completing', async () => {
  const api = new Function(`
let addEmailPayload = null;
async function waitForKnownLoginAuthState() {
  return {
    state: 'add_email_page',
    url: 'https://auth.openai.com/add-email',
  };
}

function normalizeStep6Snapshot(snapshot) { return snapshot; }
function log() {}
function throwForStep6FatalState() {}
async function completeAddEmailDuringStep7(payload, options = {}) {
  addEmailPayload = { payload, options };
  return {
    step6Outcome: 'success',
    state: 'verification_page',
    via: options.via,
  };
}
async function step6LoginFromEmailPage() {
  throw new Error('should not submit email');
}
async function step6LoginFromPhonePage() {
  throw new Error('should not submit phone');
}
async function step6LoginFromPasswordPage() {
  throw new Error('should not submit password');
}
async function switchFromEmailPageToPhoneLogin() {
  throw new Error('should not switch');
}
async function createStep6LoginTimeoutRecoveryTransition() {
  throw new Error('should not recover timeout');
}
async function finalizeStep6VerificationReady() {
  throw new Error('should not finalize verification');
}
function createStep6OAuthConsentSuccessResult() {
  throw new Error('should not create oauth success');
}

${extractFunction('step6_login')}

return {
  async run() {
    const result = await step6_login({
      email: 'bind@example.com',
      phoneNumber: '+66812345678',
      loginIdentifierType: 'phone',
      visibleStep: 7,
    });
    return { result, addEmailPayload };
  },
};
`)();

  const { result, addEmailPayload } = await api.run();

  assert.equal(result.step6Outcome, 'success');
  assert.equal(result.state, 'verification_page');
  assert.equal(result.via, 'already_on_add_email_page');
  assert.equal(addEmailPayload.payload.email, 'bind@example.com');
});
