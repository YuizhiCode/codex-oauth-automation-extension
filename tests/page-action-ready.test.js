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

function extractFunctionIfPresent(name) {
  try {
    return extractFunction(name);
  } catch {
    return '';
  }
}

function extractConstIfPresent(name) {
  const pattern = new RegExp(`const\\s+${name}\\s*=\\s*[\\s\\S]*?;`);
  const match = source.match(pattern);
  return match ? match[0] : '';
}

test('waitForActionReady waits for visible page loading indicator to disappear before returning a button', async () => {
  const api = new Function(`
let now = 0;
let spinnerVisible = true;
const sleeps = [];

const continueButton = {
  textContent: 'Continue',
  disabled: false,
  hidden: false,
  getAttribute(name) {
    if (name === 'aria-disabled') return 'false';
    return '';
  },
  scrollIntoView() {},
  focus() {},
  getBoundingClientRect() {
    return { left: 12, top: 20, width: 220, height: 44 };
  },
};

const spinner = {
  className: 'spinner',
  hidden: false,
  getAttribute(name) {
    if (name === 'class') return 'spinner';
    if (name === 'aria-label') return 'Loading';
    return '';
  },
  getBoundingClientRect() {
    return spinnerVisible
      ? { left: 0, top: 0, width: 24, height: 24 }
      : { left: 0, top: 0, width: 0, height: 0 };
  },
};

const document = {
  readyState: 'complete',
  body: {
    contains(el) {
      return el === continueButton || el === spinner;
    },
  },
  documentElement: {},
  querySelectorAll(selector) {
    if (/spinner|loading|progressbar|aria-busy/.test(selector)) {
      return spinnerVisible ? [spinner] : [];
    }
    return [];
  },
};

const location = {
  href: 'https://auth.openai.com/create-account/password',
};

const Date = {
  now() {
    return now;
  },
};

const window = {};

function throwIfStopped() {}

function isVisibleElement(el) {
  if (!el || el.hidden) return false;
  const rect = el.getBoundingClientRect?.();
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function isActionEnabled(el) {
  return Boolean(el) && !el.disabled && el.getAttribute?.('aria-disabled') !== 'true';
}

async function sleep(ms) {
  sleeps.push(ms);
  now += ms;
  if (now >= 500) {
    spinnerVisible = false;
  }
}

${extractConstIfPresent('PAGE_ACTION_BUSY_SELECTOR')}
${extractFunction('isDocumentReadyForAction')}
${extractFunction('isElementConnectedToDocument')}
${extractFunctionIfPresent('getPageActionLoadState')}
${extractFunctionIfPresent('markPageActionLoadStateChanged')}
${extractFunctionIfPresent('installPageActionLoadWatchers')}
${extractFunctionIfPresent('describePageBusyIndicator')}
${extractFunctionIfPresent('getVisiblePageBusyIndicators')}
${extractFunctionIfPresent('getPageActionReadiness')}
${extractFunctionIfPresent('waitForPageActionReady')}
${extractFunction('waitForStableButtonRect')}
${extractFunction('waitForActionReady')}

return {
  async run() {
    const action = await waitForActionReady(
      () => continueButton,
      {
        timeout: 2000,
        pollInterval: 100,
        stableRectTimeout: 0,
        pageStableMs: 200,
        minUrlStableMs: 0,
      }
    );
    return { action, now, sleeps };
  },
};
`)();

  const result = await api.run();

  assert.equal(result.action?.textContent, 'Continue');
  assert.equal(result.now >= 700, true);
  assert.equal(result.sleeps.length >= 7, true);
});
