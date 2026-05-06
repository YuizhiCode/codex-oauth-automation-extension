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

test('signup verification transition can wait the full settle window before returning', async () => {
  const api = new Function(`
let now = 0;
const sleepCalls = [];
const Date = { now: () => now };

function throwIfStopped() {}
function inspectSignupVerificationState() {
  return { state: 'verification' };
}
async function sleep(ms) {
  sleepCalls.push(ms);
  now += ms;
}

${extractFunction('waitForSignupVerificationTransition')}

return {
  run: (timeout, options) => waitForSignupVerificationTransition(timeout, options),
  snapshot: () => ({ now, sleepCalls }),
};
`)();

  const result = await api.run(5000, { settleFullDuration: true });

  assert.equal(result.state, 'verification');
  assert.equal(api.snapshot().now, 5000);
  assert.equal(api.snapshot().sleepCalls.reduce((sum, value) => sum + value, 0), 5000);
});

test('signup verification transition still returns early by default', async () => {
  const api = new Function(`
let now = 0;
const sleepCalls = [];
const Date = { now: () => now };

function throwIfStopped() {}
function inspectSignupVerificationState() {
  return { state: 'verification' };
}
async function sleep(ms) {
  sleepCalls.push(ms);
  now += ms;
}

${extractFunction('waitForSignupVerificationTransition')}

return {
  run: (timeout, options) => waitForSignupVerificationTransition(timeout, options),
  snapshot: () => ({ now, sleepCalls }),
};
`)();

  const result = await api.run(5000);

  assert.equal(result.state, 'verification');
  assert.equal(api.snapshot().now, 0);
  assert.deepStrictEqual(api.snapshot().sleepCalls, []);
});
