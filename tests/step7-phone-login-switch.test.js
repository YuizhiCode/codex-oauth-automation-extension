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
