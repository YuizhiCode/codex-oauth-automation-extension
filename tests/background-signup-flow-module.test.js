const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background imports signup flow helper module', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /importScripts\([\s\S]*'background\/signup-flow-helpers\.js'/);
});

test('signup flow helper module exposes a factory', () => {
  const source = fs.readFileSync('background/signup-flow-helpers.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageSignupFlowHelpers;`)(globalScope);

  assert.equal(typeof api?.createSignupFlowHelpers, 'function');
});

test('phone signup with cloudflare temp email always regenerates instead of reusing stale state.email', async () => {
  const source = fs.readFileSync('background/signup-flow-helpers.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageSignupFlowHelpers;`)(globalScope);
  const generatedEmails = [];

  const helpers = api.createSignupFlowHelpers({
    addLog: async () => {},
    buildGeneratedAliasEmail: () => {
      throw new Error('should not build managed alias');
    },
    chrome: {},
    ensureContentScriptReadyOnTab: async () => {},
    ensureHotmailAccountForFlow: async () => {
      throw new Error('should not allocate hotmail account');
    },
    ensureMail2925AccountForFlow: async () => {
      throw new Error('should not allocate 2925 account');
    },
    ensureLuckmailPurchaseForFlow: async () => {
      throw new Error('should not allocate luckmail purchase');
    },
    fetchGeneratedEmail: async () => {
      generatedEmails.push('fresh@rand-sub.mail.example.com');
      return 'fresh@rand-sub.mail.example.com';
    },
    isGeneratedAliasProvider: () => false,
    isHotmailProvider: () => false,
    isLuckmailProvider: () => false,
    reuseOrCreateTab: async () => {},
    sendToContentScriptResilient: async () => ({}),
    setEmailState: async () => {},
    setState: async () => {},
    SIGNUP_ENTRY_URL: 'https://chatgpt.com/',
    SIGNUP_PAGE_INJECT_FILES: [],
    waitForTabUrlMatch: async () => {},
  });

  const resolvedEmail = await helpers.resolveSignupEmailForFlow({
    email: 'used-before@mail.example.com',
    signupMethod: 'phone',
    emailGenerator: 'cloudflare-temp-email',
    accountIdentifierType: 'phone',
    signupPhoneNumber: '+66812345678',
  });

  assert.equal(resolvedEmail, 'fresh@rand-sub.mail.example.com');
  assert.deepStrictEqual(generatedEmails, ['fresh@rand-sub.mail.example.com']);
});
