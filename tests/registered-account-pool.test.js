const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background.js', 'utf8');

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

function extractConstDeclaration(name) {
  const start = source.indexOf(`const ${name} =`);
  if (start < 0) {
    throw new Error(`missing const ${name}`);
  }
  const end = source.indexOf('];', start);
  if (end < 0) {
    throw new Error(`missing const array end for ${name}`);
  }
  return source.slice(start, end + 2);
}

function createApi(initialState) {
  const bundle = [
    extractConstDeclaration('REGISTERED_ACCOUNT_MAIL_CONFIG_KEYS'),
    extractFunction('cloneRegisteredAccountMailConfigValue'),
    extractFunction('buildRegisteredAccountMailConfigSnapshot'),
    extractFunction('normalizeRegisteredAccountMailConfigSnapshot'),
    extractFunction('getRegisteredAccountMailConfigRestorePayload'),
    extractFunction('normalizeRegisteredAccountRecord'),
    extractFunction('normalizeRegisteredAccountPool'),
    extractFunction('saveRegisteredAccountAfterProfileSuccess'),
    extractFunction('removeRegisteredAccountFromPool'),
    extractFunction('removeCurrentRegisteredAccountAfterPlatformSuccess'),
    extractFunction('prepareRegisteredAccountResumeForAutoRun'),
    extractFunction('buildSettingsExportFilename'),
    extractFunction('exportSettingsBundle'),
    extractFunction('importSettingsBundle'),
  ].join('\n');

  return new Function('initialState', `
const REGISTERED_ACCOUNT_RESUME_STATUS = 'registered_pending_resume';
const FINAL_OAUTH_CHAIN_START_STEP = 7;
const SETTINGS_EXPORT_SCHEMA_VERSION = 1;
const SETTINGS_EXPORT_FILENAME_PREFIX = 'multipage-settings';
const STEP_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const PERSISTED_SETTING_DEFAULTS = {
  mailProvider: '163',
  emailGenerator: 'duck',
};
const PERSISTED_SETTING_KEYS = Object.keys(PERSISTED_SETTING_DEFAULTS);
const logs = [];
const broadcasts = [];
let currentState = {
  stepStatuses: {},
  accounts: [],
  ...initialState,
};

function normalizeMailProvider(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || '163';
}
function normalizeEmailGenerator(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || 'duck';
}
function normalizeMail2925Mode(value = '') {
  return String(value || '').trim().toLowerCase() === 'receive' ? 'receive' : 'provide';
}
function normalizeCloudflareTempEmailDomains(values) {
  return Array.isArray(values) ? [...values] : [];
}
function normalizeLuckmailPurchase(value) {
  return value && typeof value === 'object' ? { ...value } : {};
}
function normalizeLuckmailMailCursor(value) {
  return value && typeof value === 'object' ? { ...value } : {};
}
function normalizePersistentSettingValue(key, value) {
  if (key === 'mailProvider') return normalizeMailProvider(value);
  if (key === 'emailGenerator') return normalizeEmailGenerator(value);
  return value;
}
function buildPersistentSettingsPayload(input = {}, options = {}) {
  const payload = {};
  for (const key of PERSISTED_SETTING_KEYS) {
    if (input[key] !== undefined) {
      payload[key] = normalizePersistentSettingValue(key, input[key]);
    } else if (options.fillDefaults) {
      payload[key] = normalizePersistentSettingValue(key, PERSISTED_SETTING_DEFAULTS[key]);
    }
  }
  if (options.requireKnownKeys && !Object.keys(payload).length) {
    throw new Error('missing known keys');
  }
  return payload;
}
async function getPersistedSettings() {
  return buildPersistentSettingsPayload(currentState, { fillDefaults: true });
}
async function setPersistentSettings(updates) {
  currentState = { ...currentState, ...updates };
}
async function ensureManualInteractionAllowed() {
  return currentState;
}
function getMailConfig(state = {}) {
  const labels = {
    '2925': '2925 邮箱',
    'hotmail-api': 'Hotmail（API对接/本地助手）',
    'luckmail-api': 'LuckMail（API 购邮）',
  };
  return { label: labels[state.mailProvider] || state.mailProvider || '当前邮箱服务' };
}
function getAuthChainStartStepId() {
  return 7;
}
function getStepIdsForState() {
  return STEP_IDS;
}
function getStepDefinitionForState(stepId) {
  return { key: Number(stepId) === 5 ? 'fill-profile' : ` + "`step-${stepId}`" + ` };
}
async function getState() {
  return {
    ...currentState,
    stepStatuses: { ...(currentState.stepStatuses || {}) },
    accounts: Array.isArray(currentState.accounts)
      ? currentState.accounts.map((account) => ({ ...account, mailConfig: { ...(account.mailConfig || {}) } }))
      : [],
  };
}
async function setState(updates) {
  currentState = {
    ...currentState,
    ...updates,
    stepStatuses: updates.stepStatuses ? { ...updates.stepStatuses } : currentState.stepStatuses,
    accounts: updates.accounts
      ? updates.accounts.map((account) => ({ ...account, mailConfig: { ...(account.mailConfig || {}) } }))
      : currentState.accounts,
  };
}
function broadcastDataUpdate(payload) {
  broadcasts.push(payload);
}
async function addLog(message, level = 'info') {
  logs.push({ message, level });
}
const chrome = {
  runtime: {
    getManifest() {
      return { version: '1.0.0-test' };
    },
  },
};

${bundle}

return {
  exportSettingsBundle,
  importSettingsBundle,
  saveRegisteredAccountAfterProfileSuccess,
  prepareRegisteredAccountResumeForAutoRun,
  normalizeRegisteredAccountRecord,
  getRegisteredAccountMailConfigRestorePayload,
  snapshot: () => ({ currentState, logs, broadcasts }),
};
`)(initialState);
}

test('registered account pool stores the mailbox provider snapshot with a 2925 account', async () => {
  const api = createApi({
    email: 'registered@2925.com',
    password: 'Secret123!',
    mailProvider: '2925',
    emailGenerator: 'custom',
    mail2925Mode: 'receive',
    mail2925UseAccountPool: true,
    currentMail2925AccountId: 'mail2925-account-1',
    mail2925BaseEmail: 'base@2925.com',
  });

  const record = await api.saveRegisteredAccountAfterProfileSuccess();
  const { currentState } = api.snapshot();

  assert.equal(record.mailConfig.mailProvider, '2925');
  assert.equal(record.mailConfig.mail2925Mode, 'receive');
  assert.equal(record.mailConfig.mail2925UseAccountPool, true);
  assert.equal(record.mailConfig.currentMail2925AccountId, 'mail2925-account-1');
  assert.equal(record.mailConfig.mail2925BaseEmail, 'base@2925.com');
  assert.equal(currentState.accounts[0].mailConfig.mailProvider, '2925');
});

test('registered account resume restores the saved mailbox provider before continuing', async () => {
  const api = createApi({
    mailProvider: '163',
    currentHotmailAccountId: null,
    accounts: [{
      email: 'registered@hotmail.com',
      password: 'Secret123!',
      createdAt: 1,
      mailConfig: {
        mailProvider: 'hotmail-api',
        emailGenerator: 'duck',
        hotmailServiceMode: 'remote',
        hotmailRemoteBaseUrl: 'https://helper.example.com',
        currentHotmailAccountId: 'hotmail-account-7',
      },
    }],
    stepStatuses: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [String(index + 1), 'pending'])),
  });

  const result = await api.prepareRegisteredAccountResumeForAutoRun();
  const { currentState, broadcasts, logs } = api.snapshot();

  assert.equal(result.startStep, 6);
  assert.equal(currentState.email, 'registered@hotmail.com');
  assert.equal(currentState.password, 'Secret123!');
  assert.equal(currentState.mailProvider, 'hotmail-api');
  assert.equal(currentState.hotmailServiceMode, 'remote');
  assert.equal(currentState.currentHotmailAccountId, 'hotmail-account-7');
  assert.equal(currentState.stepStatuses[1], 'skipped');
  assert.equal(currentState.stepStatuses[5], 'skipped');
  assert.equal(currentState.stepStatuses[6], 'pending');
  assert.equal(broadcasts.at(-1).mailProvider, 'hotmail-api');
  assert.match(logs.at(-1).message, /Hotmail/);
});

test('settings export and import include the registered account reuse pool', async () => {
  const api = createApi({
    mailProvider: '2925',
    emailGenerator: 'duck',
    accounts: [{
      email: 'reuse@2925.com',
      password: 'Secret123!',
      createdAt: 1,
      updatedAt: 2,
      mailConfig: {
        mailProvider: '2925',
        mail2925Mode: 'receive',
        currentMail2925AccountId: 'mail2925-account-1',
      },
    }],
    stepStatuses: { 1: 'pending' },
  });

  const exported = await api.exportSettingsBundle();
  const exportedBundle = JSON.parse(exported.fileContent);
  assert.equal(exportedBundle.registeredAccounts.length, 1);
  assert.equal(exportedBundle.registeredAccounts[0].email, 'reuse@2925.com');
  assert.equal(exportedBundle.registeredAccounts[0].mailConfig.mailProvider, '2925');

  const importedApi = createApi({
    accounts: [],
    stepStatuses: { 1: 'pending' },
  });
  await importedApi.importSettingsBundle(exportedBundle);
  const { currentState, broadcasts } = importedApi.snapshot();
  assert.equal(currentState.accounts.length, 1);
  assert.equal(currentState.accounts[0].email, 'reuse@2925.com');
  assert.equal(currentState.accounts[0].mailConfig.currentMail2925AccountId, 'mail2925-account-1');
  assert.equal(broadcasts.at(-1).accounts[0].mailConfig.mailProvider, '2925');
});
