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
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
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

test('waitForSignupEntryState switches from phone mode to email mode before step 2 fills the address', async () => {
  const api = new Function(`
const logs = [];
const clicks = [];
let phase = 'phone';
let now = 0;

const phoneInput = {
  kind: 'phone',
  getAttribute(name) {
    if (name === 'type') return 'tel';
    return '';
  },
};

const switchButton = {
  textContent: 'Continue using email address',
  value: '',
  disabled: false,
  getAttribute(name) {
    if (name === 'type') return 'button';
    return '';
  },
  getBoundingClientRect() {
    return { width: 200, height: 48 };
  },
};

const emailInput = {
  kind: 'email',
  getAttribute(name) {
    if (name === 'type') return 'email';
    return '';
  },
};

const document = {
  readyState: 'complete',
  body: {},
  querySelector(selector) {
    if (selector === SIGNUP_EMAIL_INPUT_SELECTOR) {
      return phase === 'email' ? emailInput : null;
    }
    if (selector === SIGNUP_PHONE_INPUT_SELECTOR) {
      return phase === 'phone' ? phoneInput : null;
    }
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'button, a, [role="button"], [role="link"]') {
      return phase === 'phone' ? [switchButton] : [];
    }
    if (selector === 'a, button, [role="button"], [role="link"]') {
      return [];
    }
    if (selector === 'input') {
      return phase === 'phone' ? [phoneInput] : [emailInput];
    }
    return [];
  },
};

const location = {
  href: 'https://chatgpt.com/',
};

const Date = {
  now() {
    return now;
  },
};

${extractConst('SIGNUP_ENTRY_TRIGGER_PATTERN')}
${extractConst('SIGNUP_EMAIL_INPUT_SELECTOR')}
${extractConst('SIGNUP_PHONE_INPUT_SELECTOR')}
${extractConst('SIGNUP_SWITCH_TO_EMAIL_PATTERN')}
${extractConst('SIGNUP_SWITCH_ACTION_PATTERN')}
${extractConst('SIGNUP_EMAIL_ACTION_PATTERN')}
${extractConst('SIGNUP_PHONE_ACTION_PATTERN')}
${extractConst('SIGNUP_SWITCH_TO_PHONE_PATTERN')}
${extractConst('SIGNUP_WORK_EMAIL_PATTERN')}

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

function getSignupPasswordInput() {
  return null;
}

function isSignupPasswordPage() {
  return false;
}

function getSignupPasswordSubmitButton() {
  return null;
}

function findSignupEntryTrigger() {
  return null;
}

function getSignupPasswordDisplayedEmail() {
  return '';
}

function throwIfStopped() {}

function log(message, level = 'info') {
  logs.push({ message, level });
}

async function humanPause() {}

function simulateClick(target) {
  clicks.push(getActionText(target));
  if (target === switchButton) {
    phase = 'email';
  }
}

async function sleep(ms) {
  now += ms;
}

${extractFunction('getSignupInputHints')}
${extractFunction('isExplicitSignupEmailInput')}
${extractFunction('isGenericSignupUsernameInput')}
${extractFunction('isLikelySignupPhoneInput')}
${extractFunction('getSignupEmailInput')}
${extractFunction('getSignupPhoneInput')}
${extractFunction('findSignupUseEmailTrigger')}
${extractFunction('findSignupUsePhoneTrigger')}
${extractFunction('getSignupEmailContinueButton')}
${extractFunction('inspectSignupEntryState')}
${extractFunction('isDocumentReadyForAction')}
${extractFunction('isElementConnectedToDocument')}
${extractFunction('waitForStableButtonRect')}
${extractFunction('waitForActionReady')}
${extractFunction('clickActionWhenReady')}
${extractFunction('waitForSignupEntryState')}

return {
  async run() {
    return waitForSignupEntryState({ timeout: 5000, autoOpenEntry: true });
  },
  getClicks() {
    return clicks.slice();
  },
  getLogs() {
    return logs.slice();
  },
};
`)();

  const snapshot = await api.run();

  assert.equal(snapshot.state, 'email_entry');
  assert.deepEqual(api.getClicks(), ['Continue using email address']);
  assert.equal(api.getLogs().length > 0, true);
});

test('waitForSignupEntryState also recognizes the Chinese switch-to-email button text', async () => {
  const api = new Function(`
const logs = [];
const clicks = [];
let phase = 'phone';
let now = 0;

const phoneInput = {
  kind: 'phone',
  getAttribute(name) {
    if (name === 'type') return 'tel';
    return '';
  },
};

const switchButton = {
  textContent: '\\u7ee7\\u7eed\\u4f7f\\u7528\\u7535\\u5b50\\u90ae\\u4ef6\\u5730\\u5740\\u767b\\u5f55',
  value: '',
  disabled: false,
  getAttribute(name) {
    if (name === 'type') return 'button';
    return '';
  },
  getBoundingClientRect() {
    return { width: 200, height: 48 };
  },
};

const workEmailButton = {
  textContent: '\\u7ee7\\u7eed\\u4f7f\\u7528\\u5de5\\u4f5c\\u7535\\u5b50\\u90ae\\u4ef6\\u5730\\u5740\\u767b\\u5f55',
  value: '',
  disabled: false,
  getAttribute(name) {
    if (name === 'type') return 'button';
    return '';
  },
  getBoundingClientRect() {
    return { width: 200, height: 48 };
  },
};

const emailInput = {
  kind: 'email',
  getAttribute(name) {
    if (name === 'type') return 'email';
    return '';
  },
};

const document = {
  readyState: 'complete',
  body: {},
  querySelector(selector) {
    if (selector === SIGNUP_EMAIL_INPUT_SELECTOR) {
      return phase === 'email' ? emailInput : null;
    }
    if (selector === SIGNUP_PHONE_INPUT_SELECTOR) {
      return phase === 'phone' ? phoneInput : null;
    }
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'button, a, [role="button"], [role="link"]') {
      return phase === 'phone' ? [switchButton, workEmailButton] : [];
    }
    if (selector === 'a, button, [role="button"], [role="link"]') {
      return [];
    }
    if (selector === 'input') {
      return phase === 'phone' ? [phoneInput] : [emailInput];
    }
    return [];
  },
};

const location = {
  href: 'https://chatgpt.com/',
};

const Date = {
  now() {
    return now;
  },
};

${extractConst('SIGNUP_ENTRY_TRIGGER_PATTERN')}
${extractConst('SIGNUP_EMAIL_INPUT_SELECTOR')}
${extractConst('SIGNUP_PHONE_INPUT_SELECTOR')}
${extractConst('SIGNUP_SWITCH_TO_EMAIL_PATTERN')}
${extractConst('SIGNUP_SWITCH_ACTION_PATTERN')}
${extractConst('SIGNUP_EMAIL_ACTION_PATTERN')}
${extractConst('SIGNUP_PHONE_ACTION_PATTERN')}
${extractConst('SIGNUP_SWITCH_TO_PHONE_PATTERN')}
${extractConst('SIGNUP_WORK_EMAIL_PATTERN')}

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

function getSignupPasswordInput() {
  return null;
}

function isSignupPasswordPage() {
  return false;
}

function getSignupPasswordSubmitButton() {
  return null;
}

function findSignupEntryTrigger() {
  return null;
}

function getSignupPasswordDisplayedEmail() {
  return '';
}

function throwIfStopped() {}

function log(message, level = 'info') {
  logs.push({ message, level });
}

async function humanPause() {}

function simulateClick(target) {
  clicks.push(getActionText(target));
  if (target === switchButton) {
    phase = 'email';
  }
}

async function sleep(ms) {
  now += ms;
}

${extractFunction('getSignupInputHints')}
${extractFunction('isExplicitSignupEmailInput')}
${extractFunction('isGenericSignupUsernameInput')}
${extractFunction('isLikelySignupPhoneInput')}
${extractFunction('getSignupEmailInput')}
${extractFunction('getSignupPhoneInput')}
${extractFunction('findSignupUseEmailTrigger')}
${extractFunction('findSignupUsePhoneTrigger')}
${extractFunction('getSignupEmailContinueButton')}
${extractFunction('inspectSignupEntryState')}
${extractFunction('isDocumentReadyForAction')}
${extractFunction('isElementConnectedToDocument')}
${extractFunction('waitForStableButtonRect')}
${extractFunction('waitForActionReady')}
${extractFunction('clickActionWhenReady')}
${extractFunction('waitForSignupEntryState')}

return {
  async run() {
    return waitForSignupEntryState({ timeout: 5000, autoOpenEntry: true });
  },
  getClicks() {
    return clicks.slice();
  },
};
`)();

  const snapshot = await api.run();

  assert.equal(snapshot.state, 'email_entry');
  assert.deepEqual(api.getClicks(), ['继续使用电子邮件地址登录']);
});

test('getSignupEmailInput recognizes localized email placeholders in text inputs', () => {
  const api = new Function(`
const localizedEmailInput = {
  kind: 'localized-email',
  getAttribute(name) {
    if (name === 'placeholder') return '电子邮件地址';
    if (name === 'type') return 'text';
    return '';
  },
};

const document = {
  querySelector() {
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'input') {
      return [localizedEmailInput];
    }
    return [];
  },
};

${extractConst('SIGNUP_EMAIL_INPUT_SELECTOR')}

function isVisibleElement(el) {
  return Boolean(el);
}

${extractFunction('getSignupInputHints')}
${extractFunction('isExplicitSignupEmailInput')}
${extractFunction('isGenericSignupUsernameInput')}
${extractFunction('isLikelySignupPhoneInput')}
${extractFunction('getSignupEmailInput')}

return {
  run() {
    return getSignupEmailInput();
  },
};
`)();

  assert.equal(api.run()?.kind, 'localized-email');
});

test('findSignupUsePhoneTrigger recognizes Chinese continue-with-phone action text', () => {
  const api = new Function(`
const phoneSignupButton = {
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
  querySelectorAll(selector) {
    if (selector === 'button, a, [role="button"], [role="link"]') {
      return [phoneSignupButton];
    }
    return [];
  },
};

${extractConst('SIGNUP_SWITCH_ACTION_PATTERN')}
${extractConst('SIGNUP_PHONE_ACTION_PATTERN')}
${extractConst('SIGNUP_SWITCH_TO_PHONE_PATTERN')}

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

${extractFunction('findSignupUsePhoneTrigger')}

return {
  run() {
    return findSignupUsePhoneTrigger();
  },
};
`)();

  assert.equal(Boolean(api.run()), true);
});

test('findSignupUsePhoneTrigger recognizes Chinese phone signup action text', () => {
  const api = new Function(`
const phoneSignupButton = {
  textContent: '\\u624b\\u673a\\u53f7\\u6ce8\\u518c',
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
  querySelectorAll(selector) {
    if (selector === 'button, a, [role="button"], [role="link"]') {
      return [phoneSignupButton];
    }
    return [];
  },
};

${extractConst('SIGNUP_SWITCH_ACTION_PATTERN')}
${extractConst('SIGNUP_PHONE_ACTION_PATTERN')}
${extractConst('SIGNUP_SWITCH_TO_PHONE_PATTERN')}

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

${extractFunction('findSignupUsePhoneTrigger')}

return {
  run() {
    return findSignupUsePhoneTrigger();
  },
};
`)();

  assert.equal(Boolean(api.run()), true);
});

test('inspectSignupEntryState treats username autocomplete input with switch-to-email action as phone entry', () => {
  const api = new Function(`
const phoneInput = {
  kind: 'phone-username',
  getAttribute(name) {
    if (name === 'type') return 'text';
    if (name === 'autocomplete') return 'username';
    return '';
  },
};

const switchToEmailButton = {
  textContent: 'Continue using email address',
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
  querySelector(selector) {
    if (selector === SIGNUP_EMAIL_INPUT_SELECTOR) {
      return phoneInput;
    }
    if (selector === SIGNUP_PHONE_INPUT_SELECTOR) {
      return null;
    }
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'input') {
      return [phoneInput];
    }
    if (selector === 'button, a, [role="button"], [role="link"]') {
      return [switchToEmailButton];
    }
    if (selector === 'a, button, [role="button"], [role="link"]') {
      return [];
    }
    return [];
  },
};

const location = {
  href: 'https://chatgpt.com/create-account',
};

${extractConst('SIGNUP_ENTRY_TRIGGER_PATTERN')}
${extractConst('SIGNUP_EMAIL_INPUT_SELECTOR')}
${extractConst('SIGNUP_PHONE_INPUT_SELECTOR')}
${extractConst('SIGNUP_SWITCH_TO_EMAIL_PATTERN')}
${extractConst('SIGNUP_SWITCH_ACTION_PATTERN')}
${extractConst('SIGNUP_EMAIL_ACTION_PATTERN')}
${extractConst('SIGNUP_PHONE_ACTION_PATTERN')}
${extractConst('SIGNUP_SWITCH_TO_PHONE_PATTERN')}
${extractConst('SIGNUP_WORK_EMAIL_PATTERN')}

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

function getSignupPasswordInput() {
  return null;
}

function isSignupPasswordPage() {
  return false;
}

function getSignupPasswordSubmitButton() {
  return null;
}

function findSignupEntryTrigger() {
  return null;
}

function getSignupPasswordDisplayedEmail() {
  return '';
}

function getSignupEmailContinueButton() {
  return null;
}

${extractFunction('getSignupInputHints')}
${extractFunction('isExplicitSignupEmailInput')}
${extractFunction('isGenericSignupUsernameInput')}
${extractFunction('isLikelySignupPhoneInput')}
${extractFunction('getSignupEmailInput')}
${extractFunction('getSignupPhoneInput')}
${extractFunction('findSignupUseEmailTrigger')}
${extractFunction('findSignupUsePhoneTrigger')}
${extractFunction('inspectSignupEntryState')}

return {
  run() {
    return inspectSignupEntryState();
  },
};
`)();

  const snapshot = api.run();

  assert.equal(snapshot.state, 'phone_entry');
  assert.equal(snapshot.phoneInput?.kind, 'phone-username');
  assert.equal(Boolean(snapshot.switchToEmailTrigger), true);
});

test('waitForSignupPhoneEntryState switches from email mode and recognizes returned phone username input', async () => {
  const api = new Function(`
const logs = [];
const clicks = [];
let phase = 'email';
let now = 0;

const emailInput = {
  kind: 'email',
  getAttribute(name) {
    if (name === 'type') return 'email';
    return '';
  },
};

const phoneInput = {
  kind: 'phone-username',
  getAttribute(name) {
    if (name === 'type') return 'text';
    if (name === 'autocomplete') return 'username';
    return '';
  },
};

const switchToPhoneButton = {
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

const switchToEmailButton = {
  textContent: 'Continue using email address',
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
  querySelector(selector) {
    if (selector === SIGNUP_EMAIL_INPUT_SELECTOR) {
      return phase === 'email' ? emailInput : phoneInput;
    }
    if (selector === SIGNUP_PHONE_INPUT_SELECTOR) {
      return null;
    }
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'input') {
      return [phase === 'email' ? emailInput : phoneInput];
    }
    if (selector === 'button, a, [role="button"], [role="link"]') {
      return phase === 'email' ? [switchToPhoneButton] : [switchToEmailButton];
    }
    if (selector === 'a, button, [role="button"], [role="link"]') {
      return [];
    }
    return [];
  },
};

const location = {
  href: 'https://chatgpt.com/create-account',
};

const Date = {
  now() {
    return now;
  },
};

${extractConst('SIGNUP_ENTRY_TRIGGER_PATTERN')}
${extractConst('SIGNUP_EMAIL_INPUT_SELECTOR')}
${extractConst('SIGNUP_PHONE_INPUT_SELECTOR')}
${extractConst('SIGNUP_SWITCH_TO_EMAIL_PATTERN')}
${extractConst('SIGNUP_SWITCH_ACTION_PATTERN')}
${extractConst('SIGNUP_EMAIL_ACTION_PATTERN')}
${extractConst('SIGNUP_PHONE_ACTION_PATTERN')}
${extractConst('SIGNUP_SWITCH_TO_PHONE_PATTERN')}
${extractConst('SIGNUP_MORE_OPTIONS_PATTERN')}
${extractConst('SIGNUP_WORK_EMAIL_PATTERN')}

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

function getSignupPasswordInput() {
  return null;
}

function isSignupPasswordPage() {
  return false;
}

function getSignupPasswordSubmitButton() {
  return null;
}

function findSignupEntryTrigger() {
  return null;
}

function getSignupPasswordDisplayedEmail() {
  return '';
}

function getSignupEmailContinueButton() {
  return null;
}

function throwIfStopped() {}

function log(message, level = 'info') {
  logs.push({ message, level });
}

async function humanPause() {}

function simulateClick(target) {
  clicks.push(getActionText(target));
  if (target === switchToPhoneButton) {
    phase = 'phone';
  }
}

async function sleep(ms) {
  now += ms;
}

function getSignupEntryStateSummary(snapshot) {
  return { state: snapshot?.state || 'unknown' };
}

function getSignupEntryDiagnostics() {
  return { phase };
}

${extractFunction('getSignupInputHints')}
${extractFunction('isExplicitSignupEmailInput')}
${extractFunction('isGenericSignupUsernameInput')}
${extractFunction('isLikelySignupPhoneInput')}
${extractFunction('getSignupEmailInput')}
${extractFunction('getSignupPhoneInput')}
${extractFunction('findSignupUseEmailTrigger')}
${extractFunction('findSignupUsePhoneTrigger')}
${extractFunction('findSignupMoreOptionsTrigger')}
${extractFunction('inspectSignupEntryState')}
${extractFunction('isDocumentReadyForAction')}
${extractFunction('isElementConnectedToDocument')}
${extractFunction('waitForStableButtonRect')}
${extractFunction('waitForActionReady')}
${extractFunction('clickActionWhenReady')}
${extractFunction('waitForSignupPhoneEntryState')}

return {
  async run() {
    return waitForSignupPhoneEntryState({ timeout: 5000, step: 2 });
  },
  getClicks() {
    return clicks.slice();
  },
  getLogs() {
    return logs.slice();
  },
};
`)();

  const snapshot = await api.run();

  assert.equal(snapshot.state, 'phone_entry');
  assert.equal(snapshot.phoneInput?.kind, 'phone-username');
  assert.deepEqual(api.getClicks(), ['使用电话号码继续']);
});
