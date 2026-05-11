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
    if (ch === '(') parenDepth += 1;
    if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) signatureEnded = true;
    }
    if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
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

test('runAutoSequenceFromStep skips auto email fetch for phone signup mode', async () => {
  const bundle = [
    extractFunction('normalizeSignupMethod'),
    extractFunction('canUsePhoneSignup'),
    extractFunction('resolveSignupMethod'),
    extractFunction('ensureResolvedSignupMethodForRun'),
    extractFunction('runAutoSequenceFromStep'),
  ].join('\n');

  const api = new Function(`
const SIGNUP_METHOD_EMAIL = 'email';
const SIGNUP_METHOD_PHONE = 'phone';
const AUTO_STEP_DELAYS = { 1: 0, 2: 0, 3: 0 };
const STEP6_MAX_ATTEMPTS = 3;
const LAST_STEP_ID = 10;
let ensureAutoEmailReadyCalls = 0;
const logs = [];
let state = {
  signupMethod: 'phone',
  resolvedSignupMethod: null,
  phoneVerificationEnabled: true,
  plusModeEnabled: false,
  contributionMode: false,
  stepStatuses: { 3: 'pending' },
};

async function getState() { return { ...state, stepStatuses: { ...state.stepStatuses } }; }
async function setState(updates) { state = { ...state, ...updates, stepStatuses: updates.stepStatuses ? { ...updates.stepStatuses } : state.stepStatuses }; }
async function addLog(message, level = 'info') { logs.push({ message, level }); }
async function ensureAutoEmailReady() { ensureAutoEmailReadyCalls += 1; throw new Error('should skip email prefetch in phone mode'); }
async function executeStepAndWait(step) { return { step }; }
async function broadcastAutoRunStatus() {}
function isStepDoneStatus(status) { return status === 'completed' || status === 'manual_completed' || status === 'skipped'; }
function isSignupUserAlreadyExistsFailure() { return false; }
function isGoPayCheckoutRestartRequiredFailure() { return false; }
function isStopError() { return false; }
function getErrorMessage(error) { return error?.message || String(error || ''); }
async function invalidateDownstreamAfterStepRestart() {}
async function getTabId() { return null; }
const chrome = { tabs: { update: async () => {} } };
async function throwIfStopped() {}

${bundle}

return {
  async run() {
    await runAutoSequenceFromStep(1, { targetRun: 1, totalRuns: 1, attemptRuns: 1, continued: false });
    return { ensureAutoEmailReadyCalls, logs, state };
  },
};
`)();

  const result = await api.run();

  assert.equal(result.ensureAutoEmailReadyCalls, 0);
  assert.equal(result.state.resolvedSignupMethod, 'phone');
  assert.equal(result.logs.some((entry) => /将跳过邮箱预获取/.test(entry.message)), true);
});
