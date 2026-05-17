const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  normalizeIcloudForwardMailProvider,
  normalizeIcloudTargetMailboxType,
} = require('../mail-provider-utils');

const sidepanelSource = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => sidepanelSource.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < sidepanelSource.length; i += 1) {
    const ch = sidepanelSource[i];
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

  let depth = 0;
  let end = braceStart;
  for (; end < sidepanelSource.length; end += 1) {
    const ch = sidepanelSource[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return sidepanelSource.slice(start, end);
}

test('sidepanel html exposes phone verification toggle and dedicated HeroSMS rows', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');

  assert.match(html, /id="btn-toggle-settings-section"/);
  assert.match(html, /id="input-settings-section-expanded"/);
  assert.match(html, /id="row-settings-section-fold"/);
  assert.match(html, /id="row-phone-verification-enabled"/);
  assert.match(html, /id="btn-toggle-phone-verification-section"/);
  assert.match(html, /id="row-phone-verification-fold"/);
  assert.match(html, /id="input-phone-verification-enabled"/);
  assert.match(html, /id="row-signup-phone-pool-enabled"/);
  assert.match(html, /id="input-signup-phone-pool-enabled"/);
  assert.match(html, /id="row-phone-sms-provider"/);
  assert.match(html, /id="select-phone-sms-provider"/);
  assert.match(html, /id="row-phone-sms-provider-order"/);
  assert.match(html, /id="select-phone-sms-provider-order"[^>]*multiple/);
  assert.match(html, /id="btn-phone-sms-provider-order-menu"/);
  assert.match(html, /id="row-phone-sms-provider-order-actions"/);
  assert.match(html, /id="btn-phone-sms-provider-order-reset"/);
  assert.match(html, /id="row-hero-sms-platform"/);
  assert.match(html, /id="row-hero-sms-country"/);
  assert.match(html, /id="row-hero-sms-country-fallback"/);
  assert.match(html, /id="row-hero-sms-acquire-priority"/);
  assert.match(html, /id="select-hero-sms-acquire-priority"/);
  assert.match(html, /id="select-hero-sms-country"[^>]*multiple/);
  assert.match(html, /id="hero-sms-country-selected"/);
  assert.doesNotMatch(html, /id="select-hero-sms-country-fallback"/);
  assert.match(html, /id="row-hero-sms-api-key"/);
  assert.match(html, /id="row-smsbower-api-key"/);
  assert.match(html, /id="input-smsbower-api-key"/);
  assert.match(html, /value="smsbower">SMSBower/);
  assert.match(html, /id="row-hero-sms-max-price"/);
  assert.match(html, /id="input-hero-sms-min-price"/);
  assert.match(html, /id="input-hero-sms-max-price"/);
  assert.match(html, /id="row-five-sim-api-key"/);
  assert.match(html, /id="input-five-sim-api-key"/);
  assert.match(html, /id="row-five-sim-country"/);
  assert.match(html, /id="select-five-sim-country"[^>]*multiple/);
  assert.match(html, /id="row-five-sim-country-fallback"/);
  assert.match(html, /id="row-five-sim-operator"/);
  assert.match(html, /id="input-five-sim-operator"/);
  assert.match(html, /id="row-five-sim-product"/);
  assert.match(html, /id="input-five-sim-product"/);
  assert.match(html, /id="row-nex-sms-api-key"/);
  assert.match(html, /id="input-nex-sms-api-key"/);
  assert.match(html, /id="row-nex-sms-country"/);
  assert.match(html, /id="select-nex-sms-country"[^>]*multiple/);
  assert.match(html, /id="row-nex-sms-country-fallback"/);
  assert.match(html, /id="row-nex-sms-service-code"/);
  assert.match(html, /id="input-nex-sms-service-code"/);
  assert.match(html, /id="row-hero-sms-current-number"/);
  assert.match(html, /id="row-hero-sms-price-tiers"/);
  assert.match(html, /id="row-hero-sms-current-code"/);
  assert.match(html, /id="row-phone-replacement-limit"/);
  assert.match(html, /id="row-phone-verification-resend-count"/);
  assert.match(html, /id="row-phone-code-wait-seconds"/);
  assert.match(html, /id="row-phone-code-timeout-windows"/);
  assert.match(html, /id="row-phone-code-poll-interval-seconds"/);
  assert.match(html, /id="row-phone-code-poll-max-rounds"/);
  assert.doesNotMatch(html, /id="input-account-run-history-text-enabled"/);
});

test('settings section expansion state defaults to expanded on first open and then persists explicit user choice', () => {
  const api = new Function(`
let settingsSectionExpanded = false;
const SETTINGS_SECTION_EXPANDED_STORAGE_KEY = 'multipage-settings-section-expanded';
const localStorageState = new Map();
const globalThis = {
  localStorage: {
    getItem(key) {
      return localStorageState.has(key) ? localStorageState.get(key) : null;
    },
    setItem(key, value) {
      localStorageState.set(key, String(value));
    },
    removeItem(key) {
      localStorageState.delete(key);
    },
  },
};
const btnToggleSettingsSection = {
  textContent: '',
  title: '',
  attrs: {},
  setAttribute(name, value) {
    this.attrs[name] = String(value);
  },
};
const inputSettingsSectionExpanded = { checked: false };
const rowSettingsSectionFold = { style: { display: 'none' } };

${extractFunction('readSettingsSectionExpanded')}
${extractFunction('persistSettingsSectionExpanded')}
${extractFunction('updateSettingsSectionUI')}
${extractFunction('setSettingsSectionExpanded')}
${extractFunction('toggleSettingsSectionExpanded')}
${extractFunction('initSettingsSectionExpandedState')}

return {
  btnToggleSettingsSection,
  inputSettingsSectionExpanded,
  rowSettingsSectionFold,
  localStorageState,
  initSettingsSectionExpandedState,
  setSettingsSectionExpanded,
  toggleSettingsSectionExpanded,
  readSettingsSectionExpanded,
};
`)();

  api.initSettingsSectionExpandedState();
  assert.equal(api.rowSettingsSectionFold.style.display, '');
  assert.equal(api.btnToggleSettingsSection.textContent, '收起设置');
  assert.equal(api.btnToggleSettingsSection.title, '收起插件设置');
  assert.equal(api.btnToggleSettingsSection.attrs['aria-expanded'], 'true');
  assert.equal(api.inputSettingsSectionExpanded.checked, true);
  assert.equal(api.localStorageState.has('multipage-settings-section-expanded'), false);

  api.toggleSettingsSectionExpanded();
  assert.equal(api.rowSettingsSectionFold.style.display, 'none');
  assert.equal(api.btnToggleSettingsSection.textContent, '展开设置');
  assert.equal(api.btnToggleSettingsSection.title, '展开插件设置');
  assert.equal(api.btnToggleSettingsSection.attrs['aria-expanded'], 'false');
  assert.equal(api.inputSettingsSectionExpanded.checked, false);
  assert.equal(api.localStorageState.get('multipage-settings-section-expanded'), '0');

  api.setSettingsSectionExpanded(true);
  assert.equal(api.rowSettingsSectionFold.style.display, '');
  assert.equal(api.btnToggleSettingsSection.textContent, '收起设置');
  assert.equal(api.btnToggleSettingsSection.title, '收起插件设置');
  assert.equal(api.btnToggleSettingsSection.attrs['aria-expanded'], 'true');
  assert.equal(api.inputSettingsSectionExpanded.checked, true);
  assert.equal(api.localStorageState.get('multipage-settings-section-expanded'), '1');
});

test('updatePhoneVerificationSettingsUI toggles HeroSMS rows from the sms switch', () => {
  const api = new Function(`
const phoneVerificationSectionExpanded = true;
let latestState = {};
let currentSignupMethod = 'email';
const inputPhoneVerificationEnabled = { checked: false };
const inputPlusModeEnabled = { checked: false };
const rowSignupMethod = { style: { display: 'none' } };
const rowSignupPhonePoolEnabled = { style: { display: 'none' } };
const inputSignupPhonePoolEnabled = { checked: false };
const rowSignupPhonePool = { style: { display: 'none' } };
const inputSignupPhonePool = { value: '' };
const rowSignupPhone = { style: { display: 'none' } };
const inputSignupPhone = { value: '' };
const signupMethodButtons = [
  {
    dataset: { signupMethod: 'email' },
    disabled: false,
    title: '',
    attrs: {},
    classList: {
      values: new Set(['is-active']),
      toggle(name, active) {
        if (active) this.values.add(name); else this.values.delete(name);
      },
      contains(name) {
        return this.values.has(name);
      },
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
  },
  {
    dataset: { signupMethod: 'phone' },
    disabled: false,
    title: '',
    attrs: {},
    classList: {
      values: new Set(),
      toggle(name, active) {
        if (active) this.values.add(name); else this.values.delete(name);
      },
      contains(name) {
        return this.values.has(name);
      },
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
  },
];
const rowPhoneVerificationEnabled = { style: { display: 'none' } };
const rowPhoneVerificationFold = { style: { display: 'none' } };
const rowPhoneSmsProvider = { style: { display: 'none' } };
const rowPhoneSmsProviderOrder = { style: { display: 'none' } };
const rowPhoneSmsProviderOrderActions = { style: { display: 'none' } };
const selectPhoneSmsProvider = { value: 'hero-sms' };
const btnTogglePhoneVerificationSection = {
  disabled: false,
  textContent: '',
  title: '',
  setAttribute: () => {},
};
function resolveNormalizedProviderOrderForRuntime(state = {}) {
  const rawOrder = Array.isArray(state?.phoneSmsProviderOrder) ? state.phoneSmsProviderOrder : [];
  if (rawOrder.length) {
    return rawOrder;
  }
  return [String(state?.phoneSmsProvider || selectPhoneSmsProvider.value || 'hero-sms').trim().toLowerCase() || 'hero-sms'];
}
function updatePhoneSmsProviderOrderSummary() {}
function isAutoRunLockedPhase() { return false; }
function isAutoRunPausedPhase() { return false; }
function isAutoRunScheduledPhase() { return false; }
function syncLatestState(patch = {}) { latestState = { ...latestState, ...patch }; }
function syncStepDefinitionsForMode() {}
function showToast() {}
function getRuntimeSignupPhoneValue() { return ''; }
function getSignupPhoneInputValue() { return String(inputSignupPhone.value || '').trim(); }
function syncSignupPhoneInputFromState() {
  rowSignupPhone.style.display = 'none';
}
const SIGNUP_METHOD_EMAIL = 'email';
const SIGNUP_METHOD_PHONE = 'phone';
const DEFAULT_SIGNUP_METHOD = 'email';
${extractFunction('normalizeSignupMethod')}
${extractFunction('getSelectedSignupMethod')}
${extractFunction('setSignupMethod')}
${extractFunction('canSelectPhoneSignupMethod')}
${extractFunction('isSignupMethodSwitchLocked')}
${extractFunction('updateSignupMethodUI')}
const rowHeroSmsPlatform = { style: { display: 'none' } };
const rowHeroSmsCountry = { style: { display: 'none' } };
const rowHeroSmsCountryFallback = { style: { display: 'none' } };
const rowHeroSmsAcquirePriority = { style: { display: 'none' } };
const rowHeroSmsApiKey = { style: { display: 'none' } };
const rowHeroSmsMaxPrice = { style: { display: 'none' } };
const rowHeroSmsCurrentNumber = { style: { display: 'none' } };
const rowHeroSmsPriceTiers = { style: { display: 'none' } };
const rowHeroSmsCurrentCode = { style: { display: 'none' } };
const rowPhoneVerificationResendCount = { style: { display: 'none' } };
const rowPhoneReplacementLimit = { style: { display: 'none' } };
const rowPhoneCodeWaitSeconds = { style: { display: 'none' } };
const rowPhoneCodeTimeoutWindows = { style: { display: 'none' } };
const rowPhoneCodePollIntervalSeconds = { style: { display: 'none' } };
const rowPhoneCodePollMaxRounds = { style: { display: 'none' } };
const rowFiveSimApiKey = { style: { display: 'none' } };
const rowFiveSimCountry = { style: { display: 'none' } };
const rowFiveSimCountryFallback = { style: { display: 'none' } };
const rowFiveSimOperator = { style: { display: 'none' } };
const rowFiveSimProduct = { style: { display: 'none' } };
const rowNexSmsApiKey = { style: { display: 'none' } };
const rowNexSmsCountry = { style: { display: 'none' } };
const rowNexSmsCountryFallback = { style: { display: 'none' } };
const rowNexSmsServiceCode = { style: { display: 'none' } };

${extractFunction('updatePhoneVerificationSettingsUI')}

return {
  setLatestState: (state) => { latestState = state || {}; },
  rowPhoneVerificationEnabled,
  rowPhoneVerificationFold,
  rowSignupMethod,
  rowSignupPhonePoolEnabled,
  inputSignupPhonePoolEnabled,
  rowSignupPhonePool,
  inputSignupPhonePool,
  signupMethodButtons,
  rowPhoneSmsProvider,
  rowPhoneSmsProviderOrder,
  rowPhoneSmsProviderOrderActions,
  selectPhoneSmsProvider,
  btnTogglePhoneVerificationSection,
  inputPhoneVerificationEnabled,
  rowHeroSmsPlatform,
  rowHeroSmsCountry,
  rowHeroSmsCountryFallback,
  rowHeroSmsAcquirePriority,
  rowHeroSmsApiKey,
  rowHeroSmsMaxPrice,
  rowHeroSmsCurrentNumber,
  rowHeroSmsPriceTiers,
  rowHeroSmsCurrentCode,
  rowPhoneVerificationResendCount,
  rowPhoneReplacementLimit,
  rowPhoneCodeWaitSeconds,
  rowPhoneCodeTimeoutWindows,
  rowPhoneCodePollIntervalSeconds,
  rowPhoneCodePollMaxRounds,
  rowFiveSimApiKey,
  rowFiveSimCountry,
  rowFiveSimCountryFallback,
  rowFiveSimOperator,
  rowFiveSimProduct,
  rowNexSmsApiKey,
  rowNexSmsCountry,
  rowNexSmsCountryFallback,
  rowNexSmsServiceCode,
  updatePhoneVerificationSettingsUI,
};
`)();

  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowPhoneVerificationEnabled.style.display, '');
  assert.equal(api.rowPhoneVerificationFold.style.display, 'none');
  assert.equal(api.rowSignupPhonePoolEnabled.style.display, 'none');
  assert.equal(api.rowSignupPhonePool.style.display, 'none');
  assert.equal(api.rowPhoneSmsProvider.style.display, 'none');
  assert.equal(api.rowPhoneSmsProviderOrder.style.display, 'none');
  assert.equal(api.rowPhoneSmsProviderOrderActions.style.display, 'none');
  assert.equal(api.btnTogglePhoneVerificationSection.disabled, true);
  assert.equal(api.btnTogglePhoneVerificationSection.textContent, '展开设置');
  assert.equal(api.rowHeroSmsPlatform.style.display, 'none');
  assert.equal(api.rowHeroSmsCountry.style.display, 'none');
  assert.equal(api.rowHeroSmsCountryFallback.style.display, 'none');
  assert.equal(api.rowHeroSmsAcquirePriority.style.display, 'none');
  assert.equal(api.rowHeroSmsApiKey.style.display, 'none');
  assert.equal(api.rowHeroSmsMaxPrice.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentNumber.style.display, 'none');
  assert.equal(api.rowHeroSmsPriceTiers.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentCode.style.display, 'none');
  assert.equal(api.rowPhoneVerificationResendCount.style.display, 'none');
  assert.equal(api.rowPhoneReplacementLimit.style.display, 'none');
  assert.equal(api.rowPhoneCodeWaitSeconds.style.display, 'none');
  assert.equal(api.rowPhoneCodeTimeoutWindows.style.display, 'none');
  assert.equal(api.rowPhoneCodePollIntervalSeconds.style.display, 'none');
  assert.equal(api.rowPhoneCodePollMaxRounds.style.display, 'none');
  assert.equal(api.rowFiveSimApiKey.style.display, 'none');
  assert.equal(api.rowFiveSimCountry.style.display, 'none');
  assert.equal(api.rowFiveSimCountryFallback.style.display, 'none');
  assert.equal(api.rowFiveSimOperator.style.display, 'none');
  assert.equal(api.rowFiveSimProduct.style.display, 'none');
  assert.equal(api.rowNexSmsApiKey.style.display, 'none');
  assert.equal(api.rowNexSmsCountry.style.display, 'none');
  assert.equal(api.rowNexSmsCountryFallback.style.display, 'none');
  assert.equal(api.rowNexSmsServiceCode.style.display, 'none');

  api.inputPhoneVerificationEnabled.checked = true;
  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowPhoneVerificationFold.style.display, '');
  assert.equal(api.rowSignupMethod.style.display, '');
  assert.equal(api.rowSignupPhonePoolEnabled.style.display, 'none');
  assert.equal(api.rowSignupPhonePool.style.display, 'none');
  assert.equal(api.rowPhoneSmsProvider.style.display, '');
  assert.equal(api.rowPhoneSmsProviderOrder.style.display, '');
  assert.equal(api.rowPhoneSmsProviderOrderActions.style.display, '');
  assert.equal(api.btnTogglePhoneVerificationSection.disabled, false);
  assert.equal(api.btnTogglePhoneVerificationSection.textContent, '收起设置');
  assert.equal(api.rowHeroSmsPlatform.style.display, '');
  assert.equal(api.rowHeroSmsCountry.style.display, '');
  assert.equal(api.rowHeroSmsCountryFallback.style.display, '');
  assert.equal(api.rowHeroSmsAcquirePriority.style.display, '');
  assert.equal(api.rowHeroSmsApiKey.style.display, '');
  assert.equal(api.rowHeroSmsMaxPrice.style.display, '');
  assert.equal(api.rowHeroSmsCurrentNumber.style.display, '');
  assert.equal(api.rowHeroSmsPriceTiers.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentCode.style.display, '');
  assert.equal(api.rowPhoneVerificationResendCount.style.display, '');
  assert.equal(api.rowPhoneReplacementLimit.style.display, '');
  assert.equal(api.rowPhoneCodeWaitSeconds.style.display, '');
  assert.equal(api.rowPhoneCodeTimeoutWindows.style.display, '');
  assert.equal(api.rowPhoneCodePollIntervalSeconds.style.display, '');
  assert.equal(api.rowPhoneCodePollMaxRounds.style.display, '');
  assert.equal(api.rowFiveSimApiKey.style.display, 'none');
  assert.equal(api.rowNexSmsApiKey.style.display, 'none');

  api.signupMethodButtons[0].classList.toggle('is-active', false);
  api.signupMethodButtons[1].classList.toggle('is-active', true);
  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowSignupPhonePoolEnabled.style.display, '');
  assert.equal(api.rowSignupPhonePool.style.display, 'none');

  api.selectPhoneSmsProvider.value = '5sim';
  api.setLatestState({ phoneSmsProvider: '5sim', phoneSmsProviderOrder: ['5sim'] });
  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowHeroSmsCountry.style.display, 'none');
  assert.equal(api.rowHeroSmsApiKey.style.display, 'none');
  assert.equal(api.rowFiveSimApiKey.style.display, '');
  assert.equal(api.rowFiveSimCountry.style.display, '');
  assert.equal(api.rowFiveSimCountryFallback.style.display, '');
  assert.equal(api.rowFiveSimOperator.style.display, '');
  assert.equal(api.rowFiveSimProduct.style.display, '');
  assert.equal(api.rowNexSmsApiKey.style.display, 'none');

  api.selectPhoneSmsProvider.value = 'nexsms';
  api.setLatestState({ phoneSmsProvider: 'nexsms', phoneSmsProviderOrder: ['nexsms'] });
  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowFiveSimApiKey.style.display, 'none');
  assert.equal(api.rowNexSmsApiKey.style.display, '');
  assert.equal(api.rowNexSmsCountry.style.display, '');
  assert.equal(api.rowNexSmsCountryFallback.style.display, '');
  assert.equal(api.rowNexSmsServiceCode.style.display, '');
});

test('setSignupMethod switches the active signup method to phone', () => {
  const api = new Function(`
const SIGNUP_METHOD_EMAIL = 'email';
const SIGNUP_METHOD_PHONE = 'phone';
const DEFAULT_SIGNUP_METHOD = SIGNUP_METHOD_EMAIL;
let currentSignupMethod = DEFAULT_SIGNUP_METHOD;
let latestState = {};
const signupMethodButtons = [
  {
    dataset: { signupMethod: 'email' },
    attrs: {},
    classList: {
      values: new Set(['is-active']),
      toggle(name, active) {
        if (active) this.values.add(name); else this.values.delete(name);
      },
      contains(name) {
        return this.values.has(name);
      },
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
  },
  {
    dataset: { signupMethod: 'phone' },
    attrs: {},
    classList: {
      values: new Set(),
      toggle(name, active) {
        if (active) this.values.add(name); else this.values.delete(name);
      },
      contains(name) {
        return this.values.has(name);
      },
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
  },
];
function syncLatestState(patch = {}) {
  latestState = { ...latestState, ...patch };
}
${extractFunction('normalizeSignupMethod')}
${extractFunction('setSignupMethod')}
return {
  signupMethodButtons,
  setSignupMethod,
  getLatestState() {
    return latestState;
  },
};
`)();

  const resolved = api.setSignupMethod('phone');

  assert.equal(resolved, 'phone');
  assert.equal(api.signupMethodButtons[0].classList.contains('is-active'), false);
  assert.equal(api.signupMethodButtons[1].classList.contains('is-active'), true);
  assert.equal(api.getLatestState().signupMethod, 'phone');
  assert.equal(api.signupMethodButtons[1].attrs['aria-pressed'], 'true');
});

test('phone sms provider order menu renders selected providers instead of opening an empty dropdown', () => {
  const api = new Function(`
const PHONE_SMS_PROVIDER_HERO = 'hero-sms';
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const PHONE_SMS_PROVIDER_NEXSMS = 'nexsms';
const PHONE_SMS_PROVIDER_SMSBOWER = 'smsbower';
const DEFAULT_PHONE_SMS_PROVIDER = PHONE_SMS_PROVIDER_HERO;
const DEFAULT_PHONE_SMS_PROVIDER_ORDER = [
  PHONE_SMS_PROVIDER_HERO,
  PHONE_SMS_PROVIDER_FIVE_SIM,
  PHONE_SMS_PROVIDER_NEXSMS,
  PHONE_SMS_PROVIDER_SMSBOWER,
];

class FakeClassList {
  constructor() {
    this.values = new Set();
  }
  add(...names) {
    names.forEach((name) => this.values.add(String(name)));
  }
  remove(...names) {
    names.forEach((name) => this.values.delete(String(name)));
  }
  toggle(name, force) {
    if (force === undefined) {
      if (this.values.has(name)) {
        this.values.delete(name);
        return false;
      }
      this.values.add(name);
      return true;
    }
    if (force) {
      this.values.add(name);
      return true;
    }
    this.values.delete(name);
    return false;
  }
  contains(name) {
    return this.values.has(String(name));
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.value = '';
    this.selected = false;
    this.dataset = {};
    this.style = {};
    this.classList = new FakeClassList();
    this._className = '';
    Object.defineProperty(this, 'className', {
      get: () => this._className,
      set: (value) => {
        this._className = String(value || '');
        this.classList = new FakeClassList();
        this._className
          .split(/\\s+/)
          .map((name) => String(name || '').trim())
          .filter(Boolean)
          .forEach((name) => this.classList.add(name));
      },
    });
    this.attributes = {};
    this.listeners = new Map();
  }
  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }
  querySelectorAll(selector) {
    if (selector === '.phone-sms-provider-order-menu-item') {
      return this.children.filter((child) => child.classList.contains('phone-sms-provider-order-menu-item'));
    }
    if (selector === '.phone-sms-provider-order-menu-item-badge') {
      return this.children
        .flatMap((child) => child.children || [])
        .filter((child) => child.classList.contains('phone-sms-provider-order-menu-item-badge'));
    }
    return [];
  }
}

const document = {
  createElement(tagName) {
    return new FakeElement(tagName);
  },
};

const selectPhoneSmsProvider = { value: '5sim' };
const selectPhoneSmsProviderOrder = {
  options: [
    { value: 'hero-sms', textContent: 'HeroSMS', selected: true },
    { value: '5sim', textContent: '5sim', selected: true },
    { value: 'nexsms', textContent: 'NexSMS', selected: false },
    { value: 'smsbower', textContent: 'SMSBower', selected: false },
  ],
};
const phoneSmsProviderOrderMenu = new FakeElement('div');
const btnPhoneSmsProviderOrderMenu = { textContent: '', setAttribute() {} };
const displayPhoneSmsProviderOrder = { textContent: '' };
let phoneSmsProviderOrderSelection = [];

${extractFunction('normalizePhoneSmsProviderValue')}
${extractFunction('normalizePhoneSmsProviderOrderValue')}
${extractFunction('getPhoneSmsProviderLabel')}
${extractFunction('formatPhoneSmsProviderOrderSummary')}
${extractFunction('updatePhoneSmsProviderOrderSummary')}
${extractFunction('renderPhoneSmsProviderOrderMenu')}
${extractFunction('getSelectedPhoneSmsProvider')}
${extractFunction('syncPhoneSmsProviderOrderFromSelect')}
${extractFunction('applyPhoneSmsProviderOrderSelection')}

return {
  btnPhoneSmsProviderOrderMenu,
  displayPhoneSmsProviderOrder,
  phoneSmsProviderOrderMenu,
  applyPhoneSmsProviderOrderSelection,
};
`)();

  api.applyPhoneSmsProviderOrderSelection(['5sim', 'hero-sms'], {
    ensureDefault: true,
    syncProvider: false,
  });

  const items = api.phoneSmsProviderOrderMenu.querySelectorAll('.phone-sms-provider-order-menu-item');
  assert.equal(items.length, 4);
  assert.equal(items[0].children[0].textContent, 'NexSMS');
  assert.equal(items[0].children[1].textContent, '');
  assert.equal(items[1].children[0].textContent, 'SMSBower');
  assert.equal(items[1].children[1].textContent, '');
  assert.equal(items[2].children[0].textContent, '5sim');
  assert.equal(items[2].children[1].textContent, '✓ 1');
  assert.equal(items[3].children[0].textContent, 'HeroSMS');
  assert.equal(items[3].children[1].textContent, '✓ 2');
  assert.equal(api.btnPhoneSmsProviderOrderMenu.textContent, '5sim / HeroSMS (2/4)');
  assert.equal(api.displayPhoneSmsProviderOrder.textContent, '1. 5sim → 2. HeroSMS');
});

test('phone sms provider order menu keeps selected providers at the end, shows checkmark order, and closes on outside click', () => {
  const api = new Function(`
const PHONE_SMS_PROVIDER_HERO = 'hero-sms';
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const PHONE_SMS_PROVIDER_NEXSMS = 'nexsms';
const PHONE_SMS_PROVIDER_SMSBOWER = 'smsbower';
const DEFAULT_PHONE_SMS_PROVIDER = PHONE_SMS_PROVIDER_HERO;
const DEFAULT_PHONE_SMS_PROVIDER_ORDER = [
  PHONE_SMS_PROVIDER_HERO,
  PHONE_SMS_PROVIDER_FIVE_SIM,
  PHONE_SMS_PROVIDER_NEXSMS,
  PHONE_SMS_PROVIDER_SMSBOWER,
];

class FakeClassList {
  constructor() {
    this.values = new Set();
  }
  add(...names) {
    names.forEach((name) => this.values.add(String(name)));
  }
  remove(...names) {
    names.forEach((name) => this.values.delete(String(name)));
  }
  toggle(name, force) {
    if (force === undefined) {
      if (this.values.has(name)) {
        this.values.delete(name);
        return false;
      }
      this.values.add(name);
      return true;
    }
    if (force) {
      this.values.add(name);
      return true;
    }
    this.values.delete(name);
    return false;
  }
  contains(name) {
    return this.values.has(String(name));
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.value = '';
    this.selected = false;
    this.dataset = {};
    this.style = {};
    this.classList = new FakeClassList();
    this._className = '';
    Object.defineProperty(this, 'className', {
      get: () => this._className,
      set: (value) => {
        this._className = String(value || '');
        this.classList = new FakeClassList();
        this._className
          .split(/\\s+/)
          .map((name) => String(name || '').trim())
          .filter(Boolean)
          .forEach((name) => this.classList.add(name));
      },
    });
    this.attributes = {};
    this.listeners = new Map();
  }
  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }
  contains(target) {
    if (!target) return false;
    if (target === this) return true;
    return this.children.some((child) => typeof child.contains === 'function' && child.contains(target));
  }
  querySelectorAll(selector) {
    if (selector === '.phone-sms-provider-order-menu-item') {
      return this.children.filter((child) => child.classList.contains('phone-sms-provider-order-menu-item'));
    }
    return [];
  }
}

const documentListeners = new Map();
const document = {
  createElement(tagName) {
    return new FakeElement(tagName);
  },
  addEventListener(type, handler) {
    if (!documentListeners.has(type)) {
      documentListeners.set(type, []);
    }
    documentListeners.get(type).push(handler);
  },
};

const selectPhoneSmsProvider = { value: 'hero-sms' };
const selectPhoneSmsProviderOrder = {
  options: [
    { value: 'hero-sms', textContent: 'HeroSMS', selected: true },
    { value: '5sim', textContent: '5sim', selected: false },
    { value: 'nexsms', textContent: 'NexSMS', selected: true },
    { value: 'smsbower', textContent: 'SMSBower', selected: false },
  ],
};
const phoneSmsProviderOrderMenuShell = new FakeElement('div');
const phoneSmsProviderOrderMenu = new FakeElement('div');
phoneSmsProviderOrderMenuShell.appendChild(phoneSmsProviderOrderMenu);
const btnPhoneSmsProviderOrderMenu = new FakeElement('button');
btnPhoneSmsProviderOrderMenu.setAttribute('aria-expanded', 'false');
phoneSmsProviderOrderMenuShell.appendChild(btnPhoneSmsProviderOrderMenu);
const outsideTarget = new FakeElement('div');
const displayPhoneSmsProviderOrder = { textContent: '' };
let phoneSmsProviderOrderSelection = [];
let configMenuOpen = false;
const configMenuShell = { contains: () => false };
const heroSmsCountryMenuShell = { contains: () => false };
const fiveSimCountryMenuShell = { contains: () => false };
const nexSmsCountryMenuShell = { contains: () => false };
const btnHeroSmsCountryMenu = { getAttribute: () => 'false' };
const btnFiveSimCountryMenu = { getAttribute: () => 'false' };
const btnNexSmsCountryMenu = { getAttribute: () => 'false' };
function closeConfigMenu() {}
function setHeroSmsCountryMenuOpen() {}
function setFiveSimCountryMenuOpen() {}
function setNexSmsCountryMenuOpen() {}

${extractFunction('normalizePhoneSmsProviderValue')}
${extractFunction('normalizePhoneSmsProviderOrderValue')}
${extractFunction('getPhoneSmsProviderLabel')}
${extractFunction('formatPhoneSmsProviderOrderSummary')}
${extractFunction('updatePhoneSmsProviderOrderSummary')}
${extractFunction('renderPhoneSmsProviderOrderMenu')}
${extractFunction('getSelectedPhoneSmsProvider')}
${extractFunction('syncPhoneSmsProviderOrderFromSelect')}
${extractFunction('applyPhoneSmsProviderOrderSelection')}

function setPhoneSmsProviderOrderMenuOpen(open) {
  const nextOpen = Boolean(open);
  btnPhoneSmsProviderOrderMenu.setAttribute('aria-expanded', String(nextOpen));
  phoneSmsProviderOrderMenu.hidden = !nextOpen;
}

document.addEventListener('click', (event) => {
  const clickedInsideConfigMenu = Boolean(configMenuShell?.contains(event.target));
  const clickedInsideCountryMenu = Boolean(heroSmsCountryMenuShell?.contains(event.target));
  const clickedInsideFiveSimCountryMenu = Boolean(fiveSimCountryMenuShell?.contains(event.target));
  const clickedInsideNexSmsCountryMenu = Boolean(nexSmsCountryMenuShell?.contains(event.target));
  const clickedInsideProviderOrderMenu = Boolean(phoneSmsProviderOrderMenuShell?.contains(event.target));

  if (configMenuOpen && !clickedInsideConfigMenu) {
    closeConfigMenu();
  }

  const countryMenuOpen = btnHeroSmsCountryMenu?.getAttribute('aria-expanded') === 'true';
  if (countryMenuOpen && !clickedInsideCountryMenu) {
    setHeroSmsCountryMenuOpen(false);
  }
  const fiveSimCountryMenuOpen = btnFiveSimCountryMenu?.getAttribute('aria-expanded') === 'true';
  if (fiveSimCountryMenuOpen && !clickedInsideFiveSimCountryMenu) {
    setFiveSimCountryMenuOpen(false);
  }
  const nexSmsCountryMenuOpen = btnNexSmsCountryMenu?.getAttribute('aria-expanded') === 'true';
  if (nexSmsCountryMenuOpen && !clickedInsideNexSmsCountryMenu) {
    setNexSmsCountryMenuOpen(false);
  }
  const providerOrderMenuOpen = btnPhoneSmsProviderOrderMenu?.getAttribute('aria-expanded') === 'true';
  if (providerOrderMenuOpen && !clickedInsideProviderOrderMenu) {
    setPhoneSmsProviderOrderMenuOpen(false);
  }
});

return {
  btnPhoneSmsProviderOrderMenu,
  outsideTarget,
  phoneSmsProviderOrderMenu,
  displayPhoneSmsProviderOrder,
  applyPhoneSmsProviderOrderSelection,
  setPhoneSmsProviderOrderMenuOpen,
  fireDocumentClick(target) {
    const listeners = documentListeners.get('click') || [];
    listeners.forEach((listener) => listener({ target }));
  },
};
`)();

  api.applyPhoneSmsProviderOrderSelection(['nexsms', 'hero-sms'], {
    ensureDefault: false,
    syncProvider: false,
  });

  const items = api.phoneSmsProviderOrderMenu.querySelectorAll('.phone-sms-provider-order-menu-item');
  assert.equal(items.length, 4);
  assert.equal(items[0].children[0].textContent, '5sim');
  assert.equal(items[0].children[1].textContent, '');
  assert.equal(items[1].children[0].textContent, 'SMSBower');
  assert.equal(items[1].children[1].textContent, '');
  assert.equal(items[2].children[0].textContent, 'NexSMS');
  assert.equal(items[2].children[1].textContent, '✓ 1');
  assert.equal(items[3].children[0].textContent, 'HeroSMS');
  assert.equal(items[3].children[1].textContent, '✓ 2');

  api.setPhoneSmsProviderOrderMenuOpen(true);
  assert.equal(api.btnPhoneSmsProviderOrderMenu.getAttribute('aria-expanded'), 'true');

  api.fireDocumentClick(api.outsideTarget);
  assert.equal(api.btnPhoneSmsProviderOrderMenu.getAttribute('aria-expanded'), 'false');
});

test('phone sms provider order menu reuses full-width country menu layout so the badge can align to the far right', () => {
  const source = sidepanelSource;
  assert.match(
    source,
    /item\.className\s*=\s*['"]header-dropdown-item hero-sms-country-menu-item phone-sms-provider-order-menu-item['"]/
  );
  assert.match(
    source,
    /label(?:Text)?\.className\s*=\s*['"]hero-sms-country-menu-item-label phone-sms-provider-order-menu-item-label['"]/
  );
  assert.match(
    source,
    /badge\.className\s*=\s*['"]hero-sms-country-menu-item-badge phone-sms-provider-order-menu-item-badge['"]/
  );
});

test('HeroSMS price preview formats all returned price tiers with stock counts', () => {
  const api = new Function(`
${extractFunction('normalizeHeroSmsPriceForPreview')}
${extractFunction('formatHeroSmsPriceForPreview')}
${extractFunction('collectHeroSmsPriceEntriesForPreview')}
${extractFunction('formatHeroSmsPriceTierSummaryForPreview')}
return {
  collectHeroSmsPriceEntriesForPreview,
  formatHeroSmsPriceTierSummaryForPreview,
};
`)();

  const payload = {
    52: {
      dr: [
        { price: 0.025, count: 0 },
        { price: 0.0263, count: 7 },
        { price: 0.028, physicalCount: 11 },
        { cost: 0.028, count: 4 },
        { amount: 0.03, available: 2 },
      ],
    },
  };

  const entries = api.collectHeroSmsPriceEntriesForPreview(payload, []);
  assert.deepStrictEqual(
    api.formatHeroSmsPriceTierSummaryForPreview(entries),
    [
      '0.0263 × 7',
      '0.028 × 15',
      '0.03 × 2',
    ]
  );
});

test('HeroSMS price preview button output shows every returned tier and phone count', async () => {
  const displayHeroSmsPriceTiers = { textContent: '' };
  const rowHeroSmsPriceTiers = { style: { display: 'none' } };
  const inputHeroSmsMinPrice = { value: '0.026' };
  const inputHeroSmsMaxPrice = { value: '' };
  const inputHeroSmsApiKey = { value: 'demo-key' };
  const requests = [];
  const fetch = async (url) => {
    const parsedUrl = new URL(url);
    requests.push(parsedUrl);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        52: {
          dr: [
            { price: 0.025, count: 1 },
            { price: 0.0263, count: 7 },
            { price: 0.028, physicalCount: 11 },
          ],
        },
      }),
    };
  };

  const api = new Function('fetch', 'displayHeroSmsPriceTiers', 'rowHeroSmsPriceTiers', 'inputHeroSmsMinPrice', 'inputHeroSmsMaxPrice', 'inputHeroSmsApiKey', `
const DEFAULT_HERO_SMS_MIN_PRICE = '0.05';
const DEFAULT_HERO_SMS_COUNTRY_ID = 52;
const DEFAULT_HERO_SMS_COUNTRY_LABEL = 'Thailand';
function syncHeroSmsFallbackSelectionOrderFromSelect() {
  return [{ id: 52, label: 'Thailand' }];
}
function getSelectedHeroSmsCountryOption() {
  return { id: 52, label: 'Thailand' };
}
function getHeroSmsCountryLabelById() {
  return 'Thailand';
}
${extractFunction('normalizeHeroSmsMaxPriceValue')}
${extractFunction('normalizeHeroSmsMinPriceValue')}
${extractFunction('normalizeHeroSmsCountryId')}
${extractFunction('normalizeHeroSmsCountryLabel')}
${extractFunction('normalizeHeroSmsFetchErrorMessage')}
${extractFunction('normalizeHeroSmsPriceForPreview')}
${extractFunction('formatHeroSmsPriceForPreview')}
${extractFunction('isHeroSmsPreviewEmptyPayload')}
${extractFunction('collectHeroSmsPriceEntriesForPreview')}
${extractFunction('formatHeroSmsPriceTierSummaryForPreview')}
${extractFunction('describeHeroSmsPreviewPayload')}
${extractFunction('summarizeHeroSmsPreviewError')}
${extractFunction('previewHeroSmsPriceTiers')}
return { previewHeroSmsPriceTiers };
`)(fetch, displayHeroSmsPriceTiers, rowHeroSmsPriceTiers, inputHeroSmsMinPrice, inputHeroSmsMaxPrice, inputHeroSmsApiKey);

  await api.previewHeroSmsPriceTiers();

  assert.equal(requests[0].searchParams.get('action'), 'serviceCountRent');
  assert.equal(requests[0].searchParams.get('service'), 'dr');
  assert.equal(requests[0].searchParams.get('country'), '52');
  assert.equal(displayHeroSmsPriceTiers.textContent, 'Thailand: 0.025 × 1，0.0263 × 7，0.028 × 11');
  assert.equal(rowHeroSmsPriceTiers.style.display, '');
});

test('HeroSMS price preview button output shows zero-stock tiers instead of lowest-price summary', async () => {
  const displayHeroSmsPriceTiers = { textContent: '' };
  const rowHeroSmsPriceTiers = { style: { display: 'none' } };
  const inputHeroSmsMinPrice = { value: '0.026' };
  const inputHeroSmsMaxPrice = { value: '' };
  const inputHeroSmsApiKey = { value: 'demo-key' };
  const fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      53: {
        dr: [
          { price: 0.025, count: 0 },
          { price: 0.0263, physicalCount: 0 },
          { price: 0.028, available: 0 },
        ],
      },
    }),
  });

  const api = new Function('fetch', 'displayHeroSmsPriceTiers', 'rowHeroSmsPriceTiers', 'inputHeroSmsMinPrice', 'inputHeroSmsMaxPrice', 'inputHeroSmsApiKey', `
const DEFAULT_HERO_SMS_MIN_PRICE = '0.05';
const DEFAULT_HERO_SMS_COUNTRY_ID = 52;
const DEFAULT_HERO_SMS_COUNTRY_LABEL = 'Thailand';
function syncHeroSmsFallbackSelectionOrderFromSelect() {
  return [{ id: 53, label: '智利 (Chile)' }];
}
function getSelectedHeroSmsCountryOption() {
  return { id: 53, label: '智利 (Chile)' };
}
function getHeroSmsCountryLabelById() {
  return '智利 (Chile)';
}
${extractFunction('normalizeHeroSmsMaxPriceValue')}
${extractFunction('normalizeHeroSmsMinPriceValue')}
${extractFunction('normalizeHeroSmsCountryId')}
${extractFunction('normalizeHeroSmsCountryLabel')}
${extractFunction('normalizeHeroSmsFetchErrorMessage')}
${extractFunction('normalizeHeroSmsPriceForPreview')}
${extractFunction('formatHeroSmsPriceForPreview')}
${extractFunction('isHeroSmsPreviewEmptyPayload')}
${extractFunction('collectHeroSmsPriceEntriesForPreview')}
${extractFunction('formatHeroSmsPriceTierSummaryForPreview')}
${extractFunction('describeHeroSmsPreviewPayload')}
${extractFunction('summarizeHeroSmsPreviewError')}
${extractFunction('previewHeroSmsPriceTiers')}
return { previewHeroSmsPriceTiers };
`)(fetch, displayHeroSmsPriceTiers, rowHeroSmsPriceTiers, inputHeroSmsMinPrice, inputHeroSmsMaxPrice, inputHeroSmsApiKey);

  await api.previewHeroSmsPriceTiers();

  assert.equal(displayHeroSmsPriceTiers.textContent, '智利 (Chile): 0.025 × 0，0.0263 × 0，0.028 × 0');
});

test('collectSettingsPayload keeps local helper sync enabled while persisting sms toggle state', () => {
  const api = new Function('normalizeIcloudTargetMailboxType', 'normalizeIcloudForwardMailProvider', `
let latestState = {
  contributionMode: false,
  mail2925UseAccountPool: false,
  currentMail2925AccountId: '',
};
let cloudflareDomainEditMode = false;
let cloudflareTempEmailDomainEditMode = false;
const selectCfDomain = { value: '' };
const selectTempEmailDomain = { value: '' };
const selectPanelMode = { value: 'cpa' };
const inputVpsUrl = { value: '' };
const inputVpsPassword = { value: '' };
const inputSub2ApiUrl = { value: '' };
const inputSub2ApiEmail = { value: '' };
const inputSub2ApiPassword = { value: '' };
const inputSub2ApiGroup = { value: '' };
const inputSub2ApiDefaultProxy = { value: '' };
const inputCodex2ApiUrl = { value: '' };
const inputCodex2ApiAdminKey = { value: '' };
const inputPassword = { value: '' };
const inputPlusModeEnabled = { checked: false };
const inputGptOnlyModeEnabled = { checked: true };
const selectMailProvider = { value: '163' };
const selectEmailGenerator = { value: 'duck' };
const checkboxAutoDeleteIcloud = { checked: false };
const selectIcloudHostPreference = { value: 'auto' };
const inputMail2925UseAccountPool = { checked: false };
const inputInbucketHost = { value: '' };
const inputInbucketMailbox = { value: '' };
const inputHotmailRemoteBaseUrl = { value: '' };
const inputHotmailLocalBaseUrl = { value: '' };
const inputLuckmailApiKey = { value: '' };
const inputLuckmailBaseUrl = { value: '' };
const selectLuckmailEmailType = { value: 'ms_graph' };
const inputLuckmailDomain = { value: '' };
const inputTempEmailBaseUrl = { value: '' };
const inputTempEmailAdminAuth = { value: '' };
const inputTempEmailCustomAuth = { value: '' };
const inputTempEmailReceiveMailbox = { value: '' };
const inputTempEmailUseRandomSubdomain = { checked: false };
const inputTempEmailCustomSubdomainPrefix = { value: 'edu' };
const inputAutoSkipFailures = { checked: false };
const inputAutoSkipFailuresThreadIntervalMinutes = { value: '0' };
const inputAutoDelayEnabled = { checked: false };
const inputAutoDelayMinutes = { value: '30' };
const inputAutoStepDelaySeconds = { value: '' };
const inputPhoneVerificationEnabled = { checked: true };
const inputSignupPhonePoolEnabled = { checked: true };
const inputSignupPhonePool = { value: '+66812345678\\n+447700900123' };
function normalizeSignupMethod(value = '') {
  return String(value || '').trim().toLowerCase() === 'phone' ? 'phone' : 'email';
}
function getSelectedSignupMethod() { return 'phone'; }
const inputVerificationResendCount = { value: '4' };
const selectPhoneSmsProvider = { value: '5sim' };
const inputFiveSimApiKey = { value: 'five-sim-key' };
const inputFiveSimOperator = { value: 'any' };
const inputFiveSimProduct = { value: 'openai' };
const inputNexSmsApiKey = { value: 'nex-key' };
const inputNexSmsServiceCode = { value: 'ot' };
const inputHeroSmsApiKey = { value: 'demo-key' };
const inputSmsbowerApiKey = { value: 'sms-key' };
const inputHeroSmsReuseEnabled = { checked: true };
const selectHeroSmsAcquirePriority = { value: 'price' };
const inputHeroSmsMinPrice = { value: '0.05' };
const inputHeroSmsMaxPrice = { value: '0.12' };
const inputPhoneReplacementLimit = { value: '5' };
const inputPhoneCodeWaitSeconds = { value: '75' };
const inputPhoneCodeTimeoutWindows = { value: '3' };
const inputPhoneCodePollIntervalSeconds = { value: '6' };
const inputPhoneCodePollMaxRounds = { value: '18' };
const inputAccountRunHistoryHelperBaseUrl = { value: 'http://127.0.0.1:17373' };
const DEFAULT_VERIFICATION_RESEND_COUNT = 4;
const DEFAULT_PHONE_VERIFICATION_REPLACEMENT_LIMIT = 3;
const DEFAULT_PHONE_CODE_WAIT_SECONDS = 60;
const DEFAULT_PHONE_CODE_TIMEOUT_WINDOWS = 2;
const DEFAULT_PHONE_CODE_POLL_INTERVAL_SECONDS = 5;
const DEFAULT_PHONE_CODE_POLL_MAX_ROUNDS = 4;
const PHONE_CODE_WAIT_SECONDS_MIN = 15;
const PHONE_CODE_WAIT_SECONDS_MAX = 300;
const PHONE_CODE_TIMEOUT_WINDOWS_MIN = 1;
const PHONE_CODE_TIMEOUT_WINDOWS_MAX = 10;
const PHONE_CODE_POLL_INTERVAL_SECONDS_MIN = 1;
const PHONE_CODE_POLL_INTERVAL_SECONDS_MAX = 30;
const PHONE_CODE_POLL_MAX_ROUNDS_MIN = 1;
const PHONE_CODE_POLL_MAX_ROUNDS_MAX = 120;
const DEFAULT_HERO_SMS_REUSE_ENABLED = true;
const HERO_SMS_ACQUIRE_PRIORITY_COUNTRY = 'country';
const HERO_SMS_ACQUIRE_PRIORITY_PRICE = 'price';
const DEFAULT_HERO_SMS_ACQUIRE_PRIORITY = HERO_SMS_ACQUIRE_PRIORITY_COUNTRY;
const DEFAULT_HERO_SMS_MIN_PRICE = '0.05';
const PHONE_REPLACEMENT_LIMIT_MIN = 1;
const PHONE_REPLACEMENT_LIMIT_MAX = 20;
const DEFAULT_HERO_SMS_COUNTRY_ID = 52;
const DEFAULT_HERO_SMS_COUNTRY_LABEL = 'Thailand';
const PHONE_SMS_PROVIDER_HERO = 'hero-sms';
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const PHONE_SMS_PROVIDER_NEXSMS = 'nexsms';
const PHONE_SMS_PROVIDER_SMSBOWER = 'smsbower';
const selectHeroSmsCountry = {
  value: '52',
  selectedIndex: 0,
  options: [{ textContent: 'Thailand' }],
};
function normalizePhoneSmsProviderValue(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === '5sim') return '5sim';
  if (normalized === 'nexsms') return 'nexsms';
  if (normalized === 'smsbower' || normalized === 'sms-bower') return 'smsbower';
  return 'hero-sms';
}
function normalizePhoneSmsProviderOrderValue(value = [], fallbackOrder = []) {
  const source = Array.isArray(value) ? value : [];
  if (source.length) {
    return source.map((entry) => normalizePhoneSmsProviderValue(entry)).slice(0, 4);
  }
  return Array.isArray(fallbackOrder)
    ? fallbackOrder.map((entry) => normalizePhoneSmsProviderValue(entry)).slice(0, 4)
    : [];
}
function getSelectedPhoneSmsProvider() { return normalizePhoneSmsProviderValue(selectPhoneSmsProvider.value); }
function getSelectedPhoneSmsProviderOrder() { return ['5sim', 'hero-sms']; }
function normalizeFiveSimCountryOrderValue(value = []) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean).slice(0, 10)
    : [];
}
function getSelectedFiveSimCountries() {
  return [
    { code: 'thailand', label: 'Thailand' },
    { code: 'england', label: 'England' },
  ];
}
function normalizeFiveSimOperatorValue(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'any';
}
function normalizeFiveSimProductValue(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'openai';
}
function normalizeNexSmsServiceCodeValue(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'ot';
}
function getCloudflareDomainsFromState() { return { domains: [], activeDomain: '' }; }
function normalizeCloudflareDomainValue(value) { return String(value || '').trim(); }
function getCloudflareTempEmailDomainsFromState() { return { domains: [], activeDomain: '' }; }
function normalizeCloudflareTempEmailDomainValue(value) { return String(value || '').trim(); }
function getSelectedLocalCpaStep9Mode() { return 'submit'; }
function getSelectedMail2925Mode() { return 'provide'; }
function getSelectedHotmailServiceMode() { return 'local'; }
function buildManagedAliasBaseEmailPayload() { return { gmailBaseEmail: '', mail2925BaseEmail: '', emailPrefix: '' }; }
function normalizeLuckmailBaseUrl(value) { return String(value || '').trim(); }
function normalizeLuckmailEmailType(value) { return String(value || '').trim() || 'ms_graph'; }
function normalizeCloudflareTempEmailBaseUrlValue(value) { return String(value || '').trim(); }
function normalizeCloudflareTempEmailReceiveMailboxValue(value) { return String(value || '').trim(); }
function normalizeCloudflareTempEmailCustomSubdomainPrefixValue(value) { return String(value || '').trim().toLowerCase().replace(/^\.+|\.+$/g, ''); }
function normalizeAccountRunHistoryHelperBaseUrlValue(value) { return String(value || '').trim(); }
function normalizeAutoRunThreadIntervalMinutes(value) { return Number(value) || 0; }
function normalizeAutoDelayMinutes(value) { return Number(value) || 30; }
function normalizeAutoStepDelaySeconds(value) { return value === '' ? null : Number(value); }
function normalizeVerificationResendCount(value, fallback) { return Number(value) || fallback; }
${extractFunction('normalizeHeroSmsMaxPriceValue')}
${extractFunction('normalizeHeroSmsMinPriceValue')}
${extractFunction('normalizePhoneVerificationReplacementLimit')}
${extractFunction('normalizePhoneCodeWaitSecondsValue')}
${extractFunction('normalizePhoneCodeTimeoutWindowsValue')}
${extractFunction('normalizePhoneCodePollIntervalSecondsValue')}
${extractFunction('normalizePhoneCodePollMaxRoundsValue')}
${extractFunction('normalizeHeroSmsReuseEnabledValue')}
${extractFunction('normalizeHeroSmsAcquirePriority')}
${extractFunction('normalizeHeroSmsCountryId')}
${extractFunction('normalizeHeroSmsCountryLabel')}
${extractFunction('getSelectedHeroSmsCountryOption')}
function syncHeroSmsFallbackSelectionOrderFromSelect() {
  return [{ id: 52, label: 'Thailand' }, { id: 16, label: 'United Kingdom' }];
}
${extractFunction('collectSettingsPayload')}
return { collectSettingsPayload };
`)(normalizeIcloudTargetMailboxType, normalizeIcloudForwardMailProvider);

  const payload = api.collectSettingsPayload();

  assert.equal(payload.phoneVerificationEnabled, true);
  assert.equal(payload.signupPhonePoolEnabled, true);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'signupPhonePool'), false);
  assert.equal(payload.signupMethod, 'phone');
  assert.equal(payload.accountRunHistoryTextEnabled, true);
  assert.equal(payload.accountRunHistoryHelperBaseUrl, 'http://127.0.0.1:17373');
  assert.equal(payload.gptOnlyModeEnabled, true);
  assert.equal(payload.phoneSmsProvider, '5sim');
  assert.deepStrictEqual(payload.phoneSmsProviderOrder, ['5sim', 'hero-sms']);
  assert.equal(payload.heroSmsApiKey, 'demo-key');
  assert.equal(payload.smsbowerApiKey, 'sms-key');
  assert.equal(payload.fiveSimApiKey, 'five-sim-key');
  assert.deepStrictEqual(payload.fiveSimCountryOrder, ['thailand', 'england']);
  assert.equal(payload.fiveSimOperator, 'any');
  assert.equal(payload.fiveSimProduct, 'openai');
  assert.equal(payload.nexSmsApiKey, 'nex-key');
  assert.equal(payload.nexSmsServiceCode, 'ot');
  assert.equal(payload.heroSmsReuseEnabled, true);
  assert.equal(payload.heroSmsAcquirePriority, 'price');
  assert.equal(payload.heroSmsMinPrice, '0.05');
  assert.equal(payload.heroSmsMaxPrice, '0.12');
  assert.equal(payload.phoneVerificationReplacementLimit, 5);
  assert.equal(payload.phoneCodeWaitSeconds, 75);
  assert.equal(payload.phoneCodeTimeoutWindows, 3);
  assert.equal(payload.phoneCodePollIntervalSeconds, 6);
  assert.equal(payload.phoneCodePollMaxRounds, 18);
  assert.equal(payload.heroSmsCountryId, 52);
  assert.equal(payload.heroSmsCountryLabel, 'Thailand');
  assert.deepStrictEqual(payload.heroSmsCountryFallback, [{ id: 16, label: 'United Kingdom' }]);
});

test('collectSettingsPayload disables gpt-only mode when Plus mode is enabled', () => {
  const api = new Function('normalizeIcloudTargetMailboxType', 'normalizeIcloudForwardMailProvider', `
let latestState = {
  contributionMode: false,
  mail2925UseAccountPool: false,
  currentMail2925AccountId: '',
};
let cloudflareDomainEditMode = false;
let cloudflareTempEmailDomainEditMode = false;
const selectCfDomain = { value: '' };
const selectTempEmailDomain = { value: '' };
const selectPanelMode = { value: 'cpa' };
const inputVpsUrl = { value: '' };
const inputVpsPassword = { value: '' };
const inputSub2ApiUrl = { value: '' };
const inputSub2ApiEmail = { value: '' };
const inputSub2ApiPassword = { value: '' };
const inputSub2ApiGroup = { value: '' };
const inputSub2ApiDefaultProxy = { value: '' };
const inputCodex2ApiUrl = { value: '' };
const inputCodex2ApiAdminKey = { value: '' };
const inputPassword = { value: '' };
const inputPlusModeEnabled = { checked: true };
const inputGptOnlyModeEnabled = { checked: true };
const selectMailProvider = { value: '163' };
const selectEmailGenerator = { value: 'duck' };
const checkboxAutoDeleteIcloud = { checked: false };
const selectIcloudHostPreference = { value: 'auto' };
const inputMail2925UseAccountPool = { checked: false };
const inputInbucketHost = { value: '' };
const inputInbucketMailbox = { value: '' };
const inputHotmailRemoteBaseUrl = { value: '' };
const inputHotmailLocalBaseUrl = { value: '' };
const inputLuckmailApiKey = { value: '' };
const inputLuckmailBaseUrl = { value: '' };
const selectLuckmailEmailType = { value: 'ms_graph' };
const inputLuckmailDomain = { value: '' };
const inputTempEmailBaseUrl = { value: '' };
const inputTempEmailAdminAuth = { value: '' };
const inputTempEmailCustomAuth = { value: '' };
const inputTempEmailReceiveMailbox = { value: '' };
const inputTempEmailUseRandomSubdomain = { checked: false };
const inputTempEmailCustomSubdomainPrefix = { value: '' };
const inputAutoSkipFailures = { checked: false };
const inputAutoSkipFailuresThreadIntervalMinutes = { value: '0' };
const inputAutoDelayEnabled = { checked: false };
const inputAutoDelayMinutes = { value: '30' };
const inputAutoStepDelaySeconds = { value: '' };
const inputPhoneVerificationEnabled = { checked: false };
const inputSignupPhonePoolEnabled = { checked: false };
const inputSignupPhonePool = { value: '' };
function normalizeSignupMethod(value = '') {
  return String(value || '').trim().toLowerCase() === 'phone' ? 'phone' : 'email';
}
function getSelectedSignupMethod() { return 'email'; }
const inputVerificationResendCount = { value: '4' };
const inputHeroSmsApiKey = { value: '' };
const inputHeroSmsReuseEnabled = { checked: true };
const selectHeroSmsAcquirePriority = { value: 'country' };
const inputHeroSmsMinPrice = { value: '0.05' };
const inputHeroSmsMaxPrice = { value: '' };
const inputPhoneReplacementLimit = { value: '3' };
const inputPhoneCodeWaitSeconds = { value: '60' };
const inputPhoneCodeTimeoutWindows = { value: '2' };
const inputPhoneCodePollIntervalSeconds = { value: '5' };
const inputPhoneCodePollMaxRounds = { value: '4' };
const inputAccountRunHistoryHelperBaseUrl = { value: 'http://127.0.0.1:17373' };
const DEFAULT_VERIFICATION_RESEND_COUNT = 4;
const DEFAULT_PHONE_VERIFICATION_REPLACEMENT_LIMIT = 3;
const DEFAULT_PHONE_CODE_WAIT_SECONDS = 60;
const DEFAULT_PHONE_CODE_TIMEOUT_WINDOWS = 2;
const DEFAULT_PHONE_CODE_POLL_INTERVAL_SECONDS = 5;
const DEFAULT_PHONE_CODE_POLL_MAX_ROUNDS = 4;
const PHONE_CODE_WAIT_SECONDS_MIN = 15;
const PHONE_CODE_WAIT_SECONDS_MAX = 300;
const PHONE_CODE_TIMEOUT_WINDOWS_MIN = 1;
const PHONE_CODE_TIMEOUT_WINDOWS_MAX = 10;
const PHONE_CODE_POLL_INTERVAL_SECONDS_MIN = 1;
const PHONE_CODE_POLL_INTERVAL_SECONDS_MAX = 30;
const PHONE_CODE_POLL_MAX_ROUNDS_MIN = 1;
const PHONE_CODE_POLL_MAX_ROUNDS_MAX = 120;
const PHONE_REPLACEMENT_LIMIT_MIN = 1;
const PHONE_REPLACEMENT_LIMIT_MAX = 20;
const DEFAULT_HERO_SMS_REUSE_ENABLED = true;
const HERO_SMS_ACQUIRE_PRIORITY_COUNTRY = 'country';
const HERO_SMS_ACQUIRE_PRIORITY_PRICE = 'price';
const DEFAULT_HERO_SMS_ACQUIRE_PRIORITY = HERO_SMS_ACQUIRE_PRIORITY_COUNTRY;
const DEFAULT_HERO_SMS_MIN_PRICE = '0.05';
const DEFAULT_HERO_SMS_COUNTRY_ID = 52;
const DEFAULT_HERO_SMS_COUNTRY_LABEL = 'Thailand';
const selectHeroSmsCountry = {
  value: '52',
  selectedIndex: 0,
  options: [{ textContent: 'Thailand' }],
};
function getCloudflareDomainsFromState() { return { domains: [], activeDomain: '' }; }
function normalizeCloudflareDomainValue(value) { return String(value || '').trim(); }
function getCloudflareTempEmailDomainsFromState() { return { domains: [], activeDomain: '' }; }
function normalizeCloudflareTempEmailDomainValue(value) { return String(value || '').trim(); }
function getSelectedLocalCpaStep9Mode() { return 'submit'; }
function getSelectedMail2925Mode() { return 'provide'; }
function getSelectedHotmailServiceMode() { return 'local'; }
function buildManagedAliasBaseEmailPayload() { return { gmailBaseEmail: '', mail2925BaseEmail: '', emailPrefix: '' }; }
function normalizeLuckmailBaseUrl(value) { return String(value || '').trim(); }
function normalizeLuckmailEmailType(value) { return String(value || '').trim() || 'ms_graph'; }
function normalizeCloudflareTempEmailBaseUrlValue(value) { return String(value || '').trim(); }
function normalizeCloudflareTempEmailReceiveMailboxValue(value) { return String(value || '').trim(); }
function normalizeCloudflareTempEmailCustomSubdomainPrefixValue(value) { return String(value || '').trim().toLowerCase().replace(/^\.+|\.+$/g, ''); }
function normalizeAccountRunHistoryHelperBaseUrlValue(value) { return String(value || '').trim(); }
function normalizeAutoRunThreadIntervalMinutes(value) { return Number(value) || 0; }
function normalizeAutoDelayMinutes(value) { return Number(value) || 30; }
function normalizeAutoStepDelaySeconds(value) { return value === '' ? null : Number(value); }
function normalizeVerificationResendCount(value, fallback) { return Number(value) || fallback; }
${extractFunction('normalizeHeroSmsMaxPriceValue')}
${extractFunction('normalizeHeroSmsMinPriceValue')}
${extractFunction('normalizePhoneVerificationReplacementLimit')}
${extractFunction('normalizePhoneCodeWaitSecondsValue')}
${extractFunction('normalizePhoneCodeTimeoutWindowsValue')}
${extractFunction('normalizePhoneCodePollIntervalSecondsValue')}
${extractFunction('normalizePhoneCodePollMaxRoundsValue')}
${extractFunction('normalizeHeroSmsReuseEnabledValue')}
${extractFunction('normalizeHeroSmsAcquirePriority')}
${extractFunction('normalizeHeroSmsCountryId')}
${extractFunction('normalizeHeroSmsCountryLabel')}
${extractFunction('getSelectedHeroSmsCountryOption')}
function syncHeroSmsFallbackSelectionOrderFromSelect() {
  return [{ id: 52, label: 'Thailand' }];
}
${extractFunction('collectSettingsPayload')}
return { collectSettingsPayload };
`)(normalizeIcloudTargetMailboxType, normalizeIcloudForwardMailProvider);

  const payload = api.collectSettingsPayload();

  assert.equal(payload.plusModeEnabled, true);
  assert.equal(payload.gptOnlyModeEnabled, false);
});
