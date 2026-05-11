const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/phone-verification-flow.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundPhoneVerification;`)(globalScope);

function buildHeroSmsPricesPayload({ country = '52', service = 'dr', cost = 0.08, count = 25370, physicalCount = 14528 } = {}) {
  return JSON.stringify({
    [country]: {
      [service]: {
        cost,
        count,
        physicalCount,
      },
    },
  });
}

function buildHeroSmsStatusV2Payload({ smsCode = '', smsText = '', callCode = '' } = {}) {
  return JSON.stringify({
    verificationType: 2,
    sms: {
      dateTime: '2026-02-18T16:11:33+00:00',
      code: smsCode,
      text: smsText,
    },
    call: {
      code: callCode,
    },
  });
}

test('phone verification helper exports signup-phone flow helpers', () => {
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({}),
      text: async () => '{}',
    }),
    getState: async () => ({}),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  assert.equal(typeof helpers.prepareSignupPhoneActivation, 'function');
  assert.equal(typeof helpers.completeSignupPhoneVerificationFlow, 'function');
  assert.equal(typeof helpers.cancelSignupPhoneActivation, 'function');
});

test('signup phone helper clears stale phone state when activation record is missing', async () => {
  const logs = [];
  const broadcasts = [];
  let currentState = {
    signupPhoneNumber: '66959916439',
    signupPhoneActivation: null,
    signupPhoneVerificationRequestedAt: 123,
    signupPhoneVerificationPurpose: 'signup',
    currentPhoneVerificationCode: '111111',
    accountIdentifierType: 'phone',
    accountIdentifier: '66959916439',
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async (message, level = 'info') => {
      logs.push({ message, level });
    },
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async () => {
      throw new Error('network should not be used without an activation');
    },
    getState: async () => currentState,
    broadcastDataUpdate: (updates) => {
      broadcasts.push(updates);
    },
    sendToContentScriptResilient: async () => {
      throw new Error('content script should not be used without an activation');
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await assert.rejects(
    () => helpers.completeSignupPhoneVerificationFlow(77, { state: currentState }),
    /未找到当前注册手机号激活记录/
  );

  assert.equal(currentState.signupPhoneNumber, '');
  assert.equal(currentState.signupPhoneActivation, null);
  assert.equal(currentState.signupPhoneVerificationRequestedAt, null);
  assert.equal(currentState.signupPhoneVerificationPurpose, '');
  assert.equal(currentState.currentPhoneVerificationCode, '');
  assert.equal(currentState.accountIdentifier, '');
  assert.deepStrictEqual(broadcasts.at(-1), {
    signupPhoneNumber: '',
    signupPhoneActivation: null,
    signupPhoneCompletedActivation: null,
    signupPhoneVerificationRequestedAt: null,
    signupPhoneVerificationPurpose: '',
    currentPhoneVerificationCode: '',
    accountIdentifier: '',
    accountIdentifierType: null,
  });
  assert.equal(logs.some((entry) => /重新执行步骤 2 时将重新获取手机号/.test(entry.message)), true);
});

test('signup phone helper broadcasts the acquired registration phone number', async () => {
  const broadcasts = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    heroSmsCountryId: 52,
    heroSmsCountryLabel: 'Thailand',
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    broadcastDataUpdate: (updates) => {
      broadcasts.push(updates);
    },
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }
      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:123456:66959916439',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => currentState,
    sendToContentScriptResilient: async () => ({}),
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.prepareSignupPhoneActivation(currentState);

  assert.equal(activation.phoneNumber, '66959916439');
  assert.equal(currentState.signupPhoneNumber, '66959916439');
  assert.deepStrictEqual(broadcasts.at(-1), {
    signupPhoneNumber: '66959916439',
    signupPhoneActivation: activation,
    signupPhoneVerificationRequestedAt: null,
    signupPhoneVerificationPurpose: 'signup',
    accountIdentifierType: 'phone',
    accountIdentifier: '66959916439',
  });
});

test('phone verification helper requests a 5sim number with configured country/operator/product', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: new URL(url), options });
      return {
        ok: true,
        json: async () => ({
          id: '5sim-123456',
          phone: '+66881234567',
          status: 'PENDING',
        }),
        text: async () => JSON.stringify({
          id: '5sim-123456',
          phone: '+66881234567',
          status: 'PENDING',
        }),
      };
    },
    getState: async () => ({
      phoneSmsProvider: '5sim',
      fiveSimApiKey: 'five-sim-key',
      fiveSimCountryOrder: ['thailand'],
      fiveSimOperator: 'any',
      fiveSimProduct: 'openai',
    }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({
    phoneSmsProvider: '5sim',
    fiveSimApiKey: 'five-sim-key',
    fiveSimCountryOrder: ['thailand'],
    fiveSimOperator: 'any',
    fiveSimProduct: 'openai',
  });

  assert.deepStrictEqual(activation, {
    activationId: '5sim-123456',
    phoneNumber: '66881234567',
    provider: '5sim',
    serviceCode: 'openai',
    countryId: 'thailand',
    successfulUses: 0,
    maxUses: 3,
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.origin, 'https://5sim.net');
  assert.equal(requests[0].url.pathname, '/v1/guest/prices');
  assert.equal(requests[0].url.searchParams.get('country'), 'thailand');
  assert.equal(requests[0].url.searchParams.get('product'), 'openai');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer five-sim-key');
  assert.equal(requests[1].url.pathname, '/v1/user/buy/activation/thailand/any/openai');
  assert.equal(requests[1].options.method, 'GET');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer five-sim-key');
});

test('phone verification helper polls NexSMS messages until it extracts the sms code', async () => {
  const requests = [];
  let pollCount = 0;
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: new URL(url), options });
      pollCount += 1;
      const payload = pollCount === 1
        ? { success: false, message: 'pending' }
        : { success: true, data: { text: 'Your OpenAI code is 654321' } };
      return {
        ok: true,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      };
    },
    getState: async () => ({
      phoneSmsProvider: 'nexsms',
      nexSmsApiKey: 'nex-key',
      nexSmsCountryOrder: [1],
      nexSmsServiceCode: 'ot',
    }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const code = await helpers.pollPhoneActivationCode(
    {
      phoneSmsProvider: 'nexsms',
      nexSmsApiKey: 'nex-key',
      nexSmsCountryOrder: [1],
      nexSmsServiceCode: 'ot',
    },
    {
      activationId: 'nex-123',
      phoneNumber: '66881122334',
      provider: 'nexsms',
      serviceCode: 'ot',
      countryId: 1,
    },
    {
      timeoutMs: 5000,
      intervalMs: 1,
      maxRounds: 3,
    }
  );

  assert.equal(code, '654321');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.origin, 'https://api.nexsms.net');
  assert.equal(requests[0].url.pathname, '/api/sms/messages');
  assert.equal(requests[0].url.searchParams.get('phoneNumber'), '66881122334');
  assert.equal(requests[0].url.searchParams.get('format'), 'json_latest');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer nex-key');
});

test('signup phone helper uses timeout windows, page resend, and step 4 submit payload', async () => {
  const contentMessages = [];
  const statusActions = [];
  const logs = [];
  let getStatusCount = 0;
  let currentState = {
    heroSmsApiKey: 'demo-key',
    phoneCodeWaitSeconds: 15,
    phoneCodeTimeoutWindows: 2,
    phoneCodePollIntervalSeconds: 1,
    phoneCodePollMaxRounds: 1,
    signupPhoneNumber: '66959916439',
    signupPhoneVerificationPurpose: 'signup',
    signupPhoneActivation: {
      activationId: 'signup-123',
      phoneNumber: '66959916439',
      provider: 'hero-sms',
      serviceCode: 'dr',
      countryId: 52,
      successfulUses: 0,
      maxUses: 3,
    },
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async (message, level = 'info') => {
      logs.push({ message, level });
    },
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'getStatus') {
        getStatusCount += 1;
        return {
          ok: true,
          text: async () => (getStatusCount === 1 ? 'STATUS_WAIT_CODE' : 'STATUS_OK:123456'),
        };
      }
      if (action === 'setStatus') {
        statusActions.push(parsedUrl.searchParams.get('status'));
        return {
          ok: true,
          text: async () => 'ACCESS_READY',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (fallback) => fallback,
    getState: async () => currentState,
    sendToContentScriptResilient: async (_source, message) => {
      contentMessages.push(message);
      if (message.type === 'RESEND_VERIFICATION_CODE') {
        return { resent: true };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return { success: true };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completeSignupPhoneVerificationFlow(77, {
    state: currentState,
    signupProfile: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      year: 1995,
      month: 1,
      day: 2,
    },
  });

  assert.deepStrictEqual(result, { success: true, code: '123456' });
  assert.equal(getStatusCount, 2);
  assert.deepStrictEqual(statusActions, ['3', '6']);
  assert.deepStrictEqual(contentMessages.map((message) => ({
    type: message.type,
    step: message.step,
    code: message.payload?.code,
    purpose: message.payload?.purpose,
    signupProfile: message.payload?.signupProfile || null,
  })), [
    {
      type: 'RESEND_VERIFICATION_CODE',
      step: 4,
      code: undefined,
      purpose: undefined,
      signupProfile: null,
    },
    {
      type: 'SUBMIT_PHONE_VERIFICATION_CODE',
      step: 4,
      code: '123456',
      purpose: 'signup',
      signupProfile: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        year: 1995,
        month: 1,
        day: 2,
      },
    },
  ]);
  assert.equal(currentState.signupPhoneActivation, null);
  assert.equal(currentState.signupPhoneCompletedActivation.phoneNumber, '66959916439');
  assert.equal(currentState.signupPhoneVerificationPurpose, '');
  assert.equal(currentState.currentPhoneVerificationCode, '');
  assert.equal(logs.some((entry) => /准备请求重发/.test(entry.message)), true);
});

test('signup phone helper clears auto-acquired phone identity after timeout so step 2 reacquires a number', async () => {
  const statusActions = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    phoneCodeWaitSeconds: 15,
    phoneCodeTimeoutWindows: 1,
    phoneCodePollIntervalSeconds: 1,
    phoneCodePollMaxRounds: 1,
    signupPhoneNumber: '66959916439',
    signupPhoneVerificationPurpose: 'signup',
    signupPhoneActivation: {
      activationId: 'signup-timeout-123',
      phoneNumber: '66959916439',
      provider: 'hero-sms',
      serviceCode: 'dr',
      countryId: 52,
      successfulUses: 0,
      maxUses: 3,
    },
    accountIdentifierType: 'phone',
    accountIdentifier: '66959916439',
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'getStatus') {
        return {
          ok: true,
          text: async () => 'STATUS_WAIT_CODE',
        };
      }
      if (action === 'setStatus') {
        statusActions.push(parsedUrl.searchParams.get('status'));
        return {
          ok: true,
          text: async () => 'STATUS_UPDATED',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (fallback) => fallback,
    getState: async () => currentState,
    sendToContentScriptResilient: async (_source, message) => {
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await assert.rejects(
    () => helpers.completeSignupPhoneVerificationFlow(77, { state: currentState }),
    /Timed out waiting for the phone verification code\. Last HeroSMS status: STATUS_WAIT_CODE/
  );

  assert.deepStrictEqual(statusActions, ['8']);
  assert.equal(currentState.signupPhoneActivation, null);
  assert.equal(currentState.signupPhoneNumber, '');
  assert.equal(currentState.signupPhoneVerificationPurpose, '');
  assert.equal(currentState.currentPhoneVerificationCode, '');
  assert.equal(currentState.accountIdentifierType, null);
  assert.equal(currentState.accountIdentifier, '');
});

test('phone verification helper acquires a number from 5sim with fallback countries', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url, options = {}) => {
      const parsedUrl = new URL(url);
      requests.push({
        pathname: parsedUrl.pathname,
        search: parsedUrl.searchParams,
        headers: options?.headers || {},
      });

      if (parsedUrl.pathname === '/v1/guest/prices') {
        const country = parsedUrl.searchParams.get('country');
        if (country === 'thailand') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              openai: {
                thailand: {
                  any: {
                    cost: 0.08,
                    count: 12,
                  },
                },
              },
            }),
          };
        }
        if (country === 'england') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              openai: {
                england: {
                  any: {
                    cost: 0.05,
                    count: 8,
                  },
                },
              },
            }),
          };
        }
      }

      if (parsedUrl.pathname === '/v1/user/buy/activation/thailand/any/openai') {
        return {
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ message: 'no free phones' }),
        };
      }

      if (parsedUrl.pathname === '/v1/user/buy/activation/england/any/openai') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            id: 9876543,
            phone: '+447911123456',
            country: 'england',
            country_name: 'England',
            product: 'openai',
          }),
        };
      }

      throw new Error(`Unexpected 5sim request: ${parsedUrl.pathname}`);
    },
    getState: async () => ({
      phoneSmsProvider: '5sim',
      fiveSimApiKey: 'five-token',
      fiveSimCountryOrder: ['thailand', 'england'],
      fiveSimOperator: 'any',
      fiveSimProduct: 'openai',
      heroSmsMaxPrice: '0.1',
      heroSmsActivationRetryRounds: 1,
    }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({
    phoneSmsProvider: '5sim',
    fiveSimApiKey: 'five-token',
    fiveSimCountryOrder: ['thailand', 'england'],
    fiveSimOperator: 'any',
    fiveSimProduct: 'openai',
    heroSmsMaxPrice: '0.1',
    heroSmsActivationRetryRounds: 1,
  });

  assert.deepStrictEqual(activation, {
    activationId: '9876543',
    phoneNumber: '447911123456',
    provider: '5sim',
    serviceCode: 'openai',
    countryId: 'england',
    countryLabel: 'England',
    successfulUses: 0,
    maxUses: 3,
  });

  const buyPaths = requests
    .filter((entry) => entry.pathname.startsWith('/v1/user/buy/activation/'))
    .map((entry) => entry.pathname);
  assert.deepStrictEqual(buyPaths, [
    '/v1/user/buy/activation/thailand/any/openai',
    '/v1/user/buy/activation/england/any/openai',
  ]);
});

test('phone verification helper reuses 5sim number via product-plus-number endpoint', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl.pathname);
      if (parsedUrl.pathname !== '/v1/user/reuse/openai/447911123456') {
        throw new Error(`Unexpected 5sim request: ${parsedUrl.pathname}`);
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: 700002,
          phone: '+44 7911-123-456',
          country: 'england',
          country_name: 'England',
          product: 'openai',
        }),
      };
    },
    getState: async () => ({
      phoneSmsProvider: '5sim',
      fiveSimApiKey: 'five-token',
      fiveSimCountryOrder: ['england'],
      fiveSimOperator: 'any',
      fiveSimProduct: 'openai',
    }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const nextActivation = await helpers.reactivatePhoneActivation(
    {
      phoneSmsProvider: '5sim',
      fiveSimApiKey: 'five-token',
      fiveSimCountryOrder: ['england'],
      fiveSimOperator: 'any',
      fiveSimProduct: 'openai',
    },
    {
      activationId: '600001',
      phoneNumber: '+44 7911-123-456',
      provider: '5sim',
      serviceCode: 'openai',
      countryId: 'england',
      maxUses: 1,
      successfulUses: 0,
    }
  );

  assert.deepStrictEqual(nextActivation, {
    activationId: '700002',
    phoneNumber: '447911123456',
    provider: '5sim',
    serviceCode: 'openai',
    countryId: 'england',
    countryLabel: 'England',
    successfulUses: 0,
    maxUses: 1,
  });
  assert.deepStrictEqual(requests, ['/v1/user/reuse/openai/447911123456']);
});

test('phone verification helper acquires a number from NexSMS with ordered fallback countries', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url, options = {}) => {
      const parsedUrl = new URL(url);
      const method = String(options?.method || 'GET').toUpperCase();
      const body = options?.body ? JSON.parse(options.body) : null;
      requests.push({
        pathname: parsedUrl.pathname,
        search: parsedUrl.searchParams,
        method,
        body,
        headers: options?.headers || {},
      });

      if (parsedUrl.pathname === '/api/getCountryByService') {
        const countryId = Number(parsedUrl.searchParams.get('countryId'));
        if (countryId === 1) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              code: 0,
              data: {
                countryId: 1,
                countryName: 'Ukraine',
                minPrice: 0.06,
                priceMap: { '0.06': 1 },
              },
            }),
          };
        }
        if (countryId === 6) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              code: 0,
              data: {
                countryId: 6,
                countryName: 'Indonesia',
                minPrice: 0.05,
                priceMap: { '0.05': 2 },
              },
            }),
          };
        }
      }

      if (parsedUrl.pathname === '/api/order/purchase') {
        if (body?.countryId === 1) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              code: 1001,
              msg: 'NO_NUMBERS',
            }),
          };
        }
        if (body?.countryId === 6) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              code: 0,
              data: {
                countryId: 6,
                countryName: 'Indonesia',
                serviceCode: 'ot',
                phoneNumbers: ['+6281234567890'],
              },
            }),
          };
        }
      }

      throw new Error(`Unexpected NexSMS request: ${parsedUrl.pathname}`);
    },
    getState: async () => ({
      phoneSmsProvider: 'nexsms',
      nexSmsApiKey: 'nex-key',
      nexSmsCountryOrder: [1, 6],
      nexSmsServiceCode: 'ot',
      heroSmsActivationRetryRounds: 1,
    }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({
    phoneSmsProvider: 'nexsms',
    nexSmsApiKey: 'nex-key',
    nexSmsCountryOrder: [1, 6],
    nexSmsServiceCode: 'ot',
    heroSmsActivationRetryRounds: 1,
  });

  assert.deepStrictEqual(activation, {
    activationId: '6281234567890',
    phoneNumber: '6281234567890',
    provider: 'nexsms',
    serviceCode: 'ot',
    countryId: 6,
    countryLabel: 'Indonesia',
    successfulUses: 0,
    maxUses: 1,
  });
  assert.equal(requests[0].pathname, '/api/getCountryByService');
  assert.equal(requests[0].search.get('apiKey'), 'nex-key');
  assert.equal(requests[0].search.get('serviceCode'), 'ot');
  assert.equal(requests[0].search.get('countryId'), '1');
  assert.equal(requests[1].pathname, '/api/order/purchase');
  assert.equal(requests[1].method, 'POST');
  assert.equal(requests[1].body?.countryId, 1);
  assert.equal(requests[2].pathname, '/api/getCountryByService');
  assert.equal(requests[2].search.get('countryId'), '6');
  assert.equal(requests[3].pathname, '/api/order/purchase');
  assert.equal(requests[3].body?.countryId, 6);
});

test('phone verification helper skips page resend for 5sim timeouts and rotates number directly', async () => {
  const requests = [];
  const messages = [];
  let currentState = {
    phoneSmsProvider: '5sim',
    fiveSimApiKey: 'five-token',
    fiveSimCountryOrder: ['indonesia'],
    fiveSimOperator: 'any',
    fiveSimProduct: 'openai',
    verificationResendCount: 0,
    phoneVerificationReplacementLimit: 2,
    phoneCodeWaitSeconds: 60,
    phoneCodeTimeoutWindows: 2,
    phoneCodePollIntervalSeconds: 1,
    phoneCodePollMaxRounds: 1,
    heroSmsActivationRetryRounds: 1,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };

  const numbers = [
    { activationId: '500001', phoneNumber: '+628111111111' },
    { activationId: '500002', phoneNumber: '+628222222222' },
  ];
  let numberIndex = 0;

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl.pathname);
      if (parsedUrl.pathname === '/v1/guest/prices') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            openai: {
              indonesia: {
                any: {
                  cost: 0.08,
                  count: 12,
                },
              },
            },
          }),
        };
      }
      if (parsedUrl.pathname === '/v1/user/buy/activation/indonesia/any/openai') {
        const next = numbers[Math.min(numberIndex, numbers.length - 1)];
        numberIndex += 1;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            id: next.activationId,
            phone: next.phoneNumber,
            country: 'indonesia',
            country_name: 'Indonesia',
            product: 'openai',
          }),
        };
      }
      if (parsedUrl.pathname === '/v1/user/check/500001') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ status: 'PENDING', sms: [] }),
        };
      }
      if (parsedUrl.pathname === '/v1/user/check/500002') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            status: 'RECEIVED',
            sms: [{ text: 'Your OpenAI code is 556677' }],
          }),
        };
      }
      throw new Error(`Unexpected 5sim request: ${parsedUrl.pathname}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      messages.push(message.type);
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'RETURN_TO_ADD_PHONE') {
        return {
          addPhonePage: true,
          phoneVerificationPage: false,
          url: 'https://auth.openai.com/add-phone',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      if (message.type === 'RESEND_PHONE_VERIFICATION_CODE') {
        throw new Error('5sim flow should not trigger page resend.');
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.equal(messages.includes('RESEND_PHONE_VERIFICATION_CODE'), false);
  assert.equal(messages.filter((type) => type === 'SUBMIT_PHONE_NUMBER').length, 2);
  assert.equal(
    requests.filter((pathname) => pathname === '/v1/user/check/500001').length,
    2,
    'first 5sim number should be polled across both timeout windows before replacement'
  );
});

test('phone verification helper requests HeroSMS numbers with fixed OpenAI and Thailand parameters', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }
      return {
        ok: true,
        text: async () => 'ACCESS_NUMBER:123456:66959916439',
      };
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({ heroSmsApiKey: 'demo-key' });

  assert.deepStrictEqual(activation, {
    activationId: '123456',
    phoneNumber: '66959916439',
    provider: 'hero-sms',
    serviceCode: 'dr',
    countryId: 52,
    countryLabel: 'Thailand',
    successfulUses: 0,
    maxUses: 3,
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get('action'), 'serviceCountRent');
  assert.equal(requests[0].searchParams.get('service'), 'dr');
  assert.equal(requests[0].searchParams.get('country'), '52');
  assert.equal(requests[0].searchParams.get('api_key'), 'demo-key');
  assert.equal(requests[1].searchParams.get('action'), 'getNumber');
  assert.equal(requests[1].searchParams.get('maxPrice'), '0.08');
  assert.equal(requests[1].searchParams.get('fixedPrice'), 'true');
  assert.equal(requests[1].searchParams.get('service'), 'dr');
  assert.equal(requests[1].searchParams.get('country'), '52');
  assert.equal(requests[1].searchParams.get('api_key'), 'demo-key');
});

test('phone verification helper retries HeroSMS serviceCountRent until it receives a usable lowest price', async () => {
  const requests = [];
  let serviceCountRentAttempt = 0;
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'serviceCountRent') {
        serviceCountRentAttempt += 1;
        return serviceCountRentAttempt < 3
          ? {
            ok: true,
            text: async () => JSON.stringify({ unavailable: true }),
          }
          : {
            ok: true,
            text: async () => buildHeroSmsPricesPayload({ cost: 0.09 }),
          };
      }
      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:123456:66959916439',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await helpers.requestPhoneActivation({ heroSmsApiKey: 'demo-key' });

  assert.equal(requests.length, 4);
  assert.equal(requests[0].searchParams.get('action'), 'serviceCountRent');
  assert.equal(requests[1].searchParams.get('action'), 'serviceCountRent');
  assert.equal(requests[2].searchParams.get('action'), 'serviceCountRent');
  assert.equal(requests[3].searchParams.get('action'), 'getNumber');
  assert.equal(requests[3].searchParams.get('maxPrice'), '0.09');
  assert.equal(requests[3].searchParams.get('fixedPrice'), 'true');
});

test('phone verification helper falls back to plain getNumber only after HeroSMS serviceCountRent fails three times', async () => {
  const requests = [];
  let serviceCountRentAttempt = 0;
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'serviceCountRent') {
        serviceCountRentAttempt += 1;
        return {
          ok: true,
          text: async () => JSON.stringify({ unavailable: serviceCountRentAttempt }),
        };
      }
      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:123456:66959916439',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await helpers.requestPhoneActivation({ heroSmsApiKey: 'demo-key' });

  assert.equal(requests.length, 4);
  assert.equal(requests[0].searchParams.get('action'), 'serviceCountRent');
  assert.equal(requests[1].searchParams.get('action'), 'serviceCountRent');
  assert.equal(requests[2].searchParams.get('action'), 'serviceCountRent');
  assert.equal(requests[2].searchParams.get('service'), 'dr');
  assert.equal(requests[2].searchParams.get('country'), '52');
  assert.equal(requests[2].searchParams.get('api_key'), 'demo-key');
  assert.equal(requests[3].searchParams.get('action'), 'getNumber');
  assert.equal(requests[3].searchParams.get('maxPrice'), null);
  assert.equal(requests[3].searchParams.get('fixedPrice'), null);
});

test('phone verification helper does not request a second HeroSMS number in the same round after getNumber reports NO_NUMBERS', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload({ country: '16' }),
        };
      }
      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => 'NO_NUMBERS',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key', heroSmsCountryId: 16 }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await assert.rejects(
    () => helpers.requestPhoneActivation({
      heroSmsApiKey: 'demo-key',
      heroSmsCountryId: 16,
      heroSmsActivationRetryRounds: 1,
    }),
    /HeroSMS no numbers available/i
  );

  assert.equal(requests.length, 4);
  assert.equal(requests[0].searchParams.get('action'), 'serviceCountRent');
  assert.equal(requests[0].searchParams.get('country'), '16');
  assert.equal(requests[1].searchParams.get('action'), 'getNumber');
  assert.equal(requests[1].searchParams.get('country'), '16');
  assert.equal(requests[1].searchParams.get('maxPrice'), '0.08');
  assert.equal(requests[1].searchParams.get('fixedPrice'), 'true');
  assert.equal(requests[2].searchParams.get('action'), 'serviceCountRent');
  assert.equal(requests[2].searchParams.get('country'), '16');
  assert.equal(requests[3].searchParams.get('action'), 'getNumber');
  assert.equal(requests[3].searchParams.get('country'), '16');
  assert.equal(requests[3].searchParams.get('maxPrice'), '0.08');
  assert.equal(requests[3].searchParams.get('fixedPrice'), 'true');
});

test('phone verification helper applies ordered fallback countries when primary country has no numbers', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const country = parsedUrl.searchParams.get('country');

      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            [country]: {
              dr: {
                cost: 0.08,
                count: 100,
              },
            },
          }),
        };
      }

      if (action === 'getNumber') {
        if (country === '52') {
          return { ok: true, text: async () => 'NO_NUMBERS' };
        }
        if (country === '16') {
          return { ok: true, text: async () => 'ACCESS_NUMBER:861234:447955001122' };
        }
      }

      throw new Error(`Unexpected HeroSMS action: ${action} @ country ${country}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key', heroSmsCountryId: 52 }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({
    heroSmsApiKey: 'demo-key',
    heroSmsCountryId: 52,
    heroSmsCountryLabel: 'Thailand',
    heroSmsCountryFallback: [{ id: 16, label: 'United Kingdom' }],
  });

  assert.equal(activation.countryId, 16);
  assert.equal(activation.phoneNumber, '447955001122');
  const actionTrace = requests.map((requestUrl) => `${requestUrl.searchParams.get('action')}:${requestUrl.searchParams.get('country')}`);
  assert.deepStrictEqual(actionTrace, [
    'serviceCountRent:52',
    'getNumber:52',
    'serviceCountRent:16',
    'getNumber:16',
  ]);
});

test('phone verification helper honors price-priority acquisition mode across selected countries', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const country = parsedUrl.searchParams.get('country');

      if (action === 'serviceCountRent') {
        const cost = country === '52' ? 0.08 : 0.05;
        return {
          ok: true,
          text: async () => JSON.stringify({
            [country]: {
              dr: {
                cost,
                count: 100,
              },
            },
          }),
        };
      }

      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => `ACCESS_NUMBER:${country}001:44795500${country}`,
        };
      }

      throw new Error(`Unexpected HeroSMS action: ${action} @ country ${country}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key', heroSmsCountryId: 52 }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({
    heroSmsApiKey: 'demo-key',
    heroSmsCountryId: 52,
    heroSmsCountryLabel: 'Thailand',
    heroSmsCountryFallback: [{ id: 16, label: 'United Kingdom' }],
    heroSmsAcquirePriority: 'price',
  });

  assert.equal(activation.countryId, 16);
  const actionTrace = requests.map((requestUrl) => `${requestUrl.searchParams.get('action')}:${requestUrl.searchParams.get('country')}`);
  assert.deepStrictEqual(actionTrace, [
    'serviceCountRent:52',
    'serviceCountRent:16',
    'getNumber:16',
  ]);
});

test('phone verification helper retries acquisition rounds when at least one country reports transient NO_NUMBERS', async () => {
  const requests = [];
  const logs = [];
  const sleeps = [];
  let thailandGetNumberCalls = 0;

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async (message, level) => {
      logs.push({ message, level });
    },
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const country = parsedUrl.searchParams.get('country');

      if (action === 'serviceCountRent') {
        if (country === '52') {
          return {
            ok: true,
            text: async () => buildHeroSmsPricesPayload({ country: '52', cost: 0.05, count: 20 }),
          };
        }
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload({ country, cost: 0.3, count: 20 }),
        };
      }

      if (action === 'getNumber' || action === 'getNumberV2') {
        if (country === '52') {
          if (action === 'getNumber') {
            thailandGetNumberCalls += 1;
            if (thailandGetNumberCalls >= 2) {
              return {
                ok: true,
                text: async () => 'ACCESS_NUMBER:991122:66951112233',
              };
            }
          }
          return { ok: true, text: async () => 'NO_NUMBERS: Numbers Not Found. Try Later' };
        }
        return { ok: true, text: async () => 'NO_NUMBERS: Numbers Not Found. Try Later' };
      }

      throw new Error(`Unexpected HeroSMS action: ${action} @ country ${country}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async (ms) => {
      sleeps.push(ms);
    },
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({
    heroSmsApiKey: 'demo-key',
    heroSmsMaxPrice: '0.06',
    heroSmsCountryId: 52,
    heroSmsCountryLabel: 'Thailand',
    heroSmsCountryFallback: [
      { id: 6, label: 'Canada' },
      { id: 5, label: 'Japan' },
    ],
    // Simulate stale state value; helper should still perform at least 2 rounds.
    heroSmsActivationRetryRounds: 1,
  });

  assert.equal(activation.countryId, 52);
  assert.equal(activation.phoneNumber, '66951112233');
  assert.equal(sleeps.length, 1);
  assert.equal(sleeps[0], 2000);
  assert.equal(
    logs.filter((entry) => String(entry.message || '').includes('HeroSMS acquiring phone number')).length >= 2,
    true
  );
  assert.equal(
    logs.some((entry) => String(entry.message || '').includes('HeroSMS has no available numbers (round 1/2); retrying')),
    true
  );
});

test('phone verification helper uses HeroSMS getStatus after acquiring a number', async () => {
  const requests = [];
  const stateUpdates = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    heroSmsCountryId: 16,
    heroSmsCountryLabel: 'United Kingdom',
    verificationResendCount: 0,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };
  let statusPollCount = 0;

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload({ country: '16' }),
        };
      }
      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:654321:447911123456',
        };
      }
      if (action === 'getStatus') {
        statusPollCount += 1;
        return {
          ok: true,
          text: async () => (
            statusPollCount === 1 ? 'STATUS_WAIT_CODE' : 'STATUS_OK:112233'
          ),
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => 'ACCESS_ACTIVATION',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      stateUpdates.push(updates);
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.equal(Array.isArray(stateUpdates[0]?.heroSmsLastPriceTiers), true);
  assert.equal(stateUpdates[0]?.heroSmsLastPriceCountryId, 16);
  assert.equal(stateUpdates[0]?.heroSmsLastPriceCountryLabel, 'United Kingdom');
  assert.deepStrictEqual(stateUpdates.slice(1), [
    {
      currentPhoneActivation: {
        activationId: '654321',
        phoneNumber: '447911123456',
        provider: 'hero-sms',
        serviceCode: 'dr',
        countryId: 16,
        countryLabel: 'United Kingdom',
        successfulUses: 0,
        maxUses: 3,
      },
      currentPhoneVerificationCode: '',
    },
    {
      currentPhoneVerificationCode: '112233',
    },
    {
      reusablePhoneActivation: {
        activationId: '654321',
        phoneNumber: '447911123456',
        provider: 'hero-sms',
        serviceCode: 'dr',
        countryId: 16,
        countryLabel: 'United Kingdom',
        successfulUses: 1,
        maxUses: 3,
      },
    },
    {
      currentPhoneActivation: null,
      currentPhoneVerificationCode: '',
    },
  ]);
  const actions = requests.map((url) => url.searchParams.get('action'));
  assert.deepStrictEqual(actions, [
    'serviceCountRent',
    'getNumber',
    'getStatus',
    'getStatus',
  ]);
});

test('phone verification helper refreshes maxPrice when HeroSMS returns WRONG_MAX_PRICE', async () => {
  const requests = [];
  let getNumberAttempt = 0;
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }
      if (action === 'getNumber') {
        getNumberAttempt += 1;
        return getNumberAttempt === 1
          ? {
            ok: false,
            text: async () => 'WRONG_MAX_PRICE:0.09',
          }
          : {
            ok: true,
            text: async () => 'ACCESS_NUMBER:123456:66959916439',
          };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({ heroSmsApiKey: 'demo-key' });

  assert.deepStrictEqual(activation, {
    activationId: '123456',
    phoneNumber: '66959916439',
    provider: 'hero-sms',
    serviceCode: 'dr',
    countryId: 52,
    countryLabel: 'Thailand',
    successfulUses: 0,
    maxUses: 3,
  });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].searchParams.get('action'), 'serviceCountRent');
  assert.equal(requests[1].searchParams.get('action'), 'getNumber');
  assert.equal(requests[1].searchParams.get('maxPrice'), '0.08');
  assert.equal(requests[2].searchParams.get('action'), 'getNumber');
  assert.equal(requests[2].searchParams.get('maxPrice'), '0.09');
  assert.equal(requests[2].searchParams.get('fixedPrice'), 'true');
});

test('phone verification helper climbs price tiers when NO_NUMBERS is returned at lower prices', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const maxPrice = parsedUrl.searchParams.get('maxPrice');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            52: {
              dr: {
                starter: { cost: 0.08, count: 100 },
                premium: { cost: 0.12, count: 100 },
              },
            },
          }),
        };
      }
      if (action === 'getNumber' && maxPrice === '0.08') {
        return {
          ok: true,
          text: async () => 'NO_NUMBERS',
        };
      }
      if (action === 'getNumber' && maxPrice === '0.12') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:989898:66951112222',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action} @ ${maxPrice || 'no-price'}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({ heroSmsApiKey: 'demo-key' });
  assert.equal(activation.activationId, '989898');
  const actions = requests.map((requestUrl) => `${requestUrl.searchParams.get('action')}:${requestUrl.searchParams.get('maxPrice') || ''}`);
  assert.deepStrictEqual(actions, [
    'serviceCountRent:',
    'getNumber:0.08',
    'getNumber:0.12',
  ]);
});

test('phone verification helper skips price tiers below configured HeroSMS min price', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const maxPrice = parsedUrl.searchParams.get('maxPrice');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            52: {
              dr: {
                low: { cost: 0.04, count: 100 },
                allowed: { cost: 0.06, count: 100 },
              },
            },
          }),
        };
      }
      if (action === 'getNumber' && maxPrice === '0.06') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:565656:66950000001',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action} @ ${maxPrice || 'no-price'}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({
    heroSmsApiKey: 'demo-key',
    heroSmsMinPrice: '0.05',
  });
  assert.equal(activation.activationId, '565656');
  const actions = requests.map((requestUrl) => `${requestUrl.searchParams.get('action')}:${requestUrl.searchParams.get('maxPrice') || ''}`);
  assert.deepStrictEqual(actions, [
    'serviceCountRent:',
    'getNumber:0.06',
  ]);
});

test('phone verification helper selects the nearest returned price tier at or above configured HeroSMS min price', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const maxPrice = parsedUrl.searchParams.get('maxPrice');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            6: {
              2: {
                count: 157,
                price: 0.0518,
              },
              4: {
                count: 157,
                price: 0.054,
              },
              12: {
                count: 157,
                price: 0.0675,
              },
              24: {
                count: 157,
                price: 0.0855,
              },
            },
          }),
        };
      }
      if (action === 'getNumber' && maxPrice === '0.0518') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:505050:628500000001',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action} @ ${maxPrice || 'no-price'}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({
    heroSmsApiKey: 'demo-key',
    heroSmsCountryId: 6,
    heroSmsCountryLabel: '印度尼西亚 (Indonesia)',
    heroSmsMinPrice: '0.05',
  });
  assert.equal(activation.activationId, '505050');
  const actions = requests.map((requestUrl) => `${requestUrl.searchParams.get('action')}:${requestUrl.searchParams.get('maxPrice') || ''}`);
  assert.deepStrictEqual(actions, [
    'serviceCountRent:',
    'getNumber:0.0518',
  ]);
});

test('phone verification helper reads alternate HeroSMS price fields above configured min price', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const maxPrice = parsedUrl.searchParams.get('maxPrice');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            6: {
              dr: [
                { price: 0.045, count: 100 },
                { price: 0.052, count: 100 },
                { amount: 0.07, available: 100 },
              ],
            },
          }),
        };
      }
      if (action === 'getNumber' && maxPrice === '0.052') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:606060:628500000002',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action} @ ${maxPrice || 'no-price'}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({
    heroSmsApiKey: 'demo-key',
    heroSmsCountryId: 6,
    heroSmsCountryLabel: '印度尼西亚 (Indonesia)',
    heroSmsMinPrice: '0.05',
  });
  assert.equal(activation.activationId, '606060');
  const actions = requests.map((requestUrl) => `${requestUrl.searchParams.get('action')}:${requestUrl.searchParams.get('maxPrice') || ''}`);
  assert.deepStrictEqual(actions, [
    'serviceCountRent:',
    'getNumber:0.052',
  ]);
});

test('phone verification helper does not invent a price tier when all returned prices are below HeroSMS min price', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            6: {
              dr: {
                prices: {
                  0.04: 100,
                  0.045: 100,
                },
              },
            },
          }),
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await assert.rejects(
    helpers.requestPhoneActivation({
      heroSmsApiKey: 'demo-key',
      heroSmsCountryId: 6,
      heroSmsCountryLabel: '印度尼西亚 (Indonesia)',
      heroSmsMinPrice: '0.05',
      heroSmsActivationRetryRounds: 1,
    }),
    /no numbers within minPrice=0\.05; lowest listed=0\.04/i
  );
  const actions = requests.map((requestUrl) => `${requestUrl.searchParams.get('action')}:${requestUrl.searchParams.get('maxPrice') || ''}`);
  assert.deepStrictEqual(actions, ['serviceCountRent:']);
});

test('phone verification helper stops when WRONG_MAX_PRICE exceeds configured max price limit', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload({ cost: 0.08 }),
        };
      }
      if (action === 'getNumber') {
        return {
          ok: false,
          text: async () => 'WRONG_MAX_PRICE:0.08',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key', heroSmsMaxPrice: '0.05' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await assert.rejects(
    helpers.requestPhoneActivation({ heroSmsApiKey: 'demo-key', heroSmsMaxPrice: '0.05' }),
    /exceeds configured maxPrice=0\.05/i
  );

  const actions = requests.map((requestUrl) => `${requestUrl.searchParams.get('action')}:${requestUrl.searchParams.get('maxPrice') || ''}`);
  assert.deepStrictEqual(actions, [
    'serviceCountRent:',
    'getNumber:0.05',
  ]);
});

test('phone verification helper falls back to plain getNumber when priced request fails to fetch', async () => {
  const requests = [];
  let getNumberAttempt = 0;
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }
      if (action === 'getNumber') {
        getNumberAttempt += 1;
        if (getNumberAttempt === 1) {
          throw new TypeError('Failed to fetch');
        }
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:123456:66959916439',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({ heroSmsApiKey: 'demo-key' });

  assert.deepStrictEqual(activation, {
    activationId: '123456',
    phoneNumber: '66959916439',
    provider: 'hero-sms',
    serviceCode: 'dr',
    countryId: 52,
    countryLabel: 'Thailand',
    successfulUses: 0,
    maxUses: 3,
  });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].searchParams.get('action'), 'serviceCountRent');
  assert.equal(requests[1].searchParams.get('action'), 'getNumber');
  assert.equal(requests[1].searchParams.get('maxPrice'), '0.08');
  assert.equal(requests[1].searchParams.get('fixedPrice'), 'true');
  assert.equal(requests[2].searchParams.get('action'), 'getNumber');
  assert.equal(requests[2].searchParams.get('maxPrice'), null);
  assert.equal(requests[2].searchParams.get('fixedPrice'), null);
});

test('phone verification helper completes add-phone flow, clears current activation, and stores reusable number state', async () => {
  const requests = [];
  const stateUpdates = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    verificationResendCount: 1,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }
      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:123456:66959916439',
        };
      }
      if (action === 'getStatus') {
        return {
          ok: true,
          text: async () => 'STATUS_OK:654321',
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => 'ACCESS_ACTIVATION',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      stateUpdates.push(updates);
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.equal(Array.isArray(stateUpdates[0]?.heroSmsLastPriceTiers), true);
  assert.equal(stateUpdates[0]?.heroSmsLastPriceCountryId, 52);
  assert.equal(stateUpdates[0]?.heroSmsLastPriceCountryLabel, 'Thailand');
  assert.deepStrictEqual(stateUpdates.slice(1), [
    {
      currentPhoneActivation: {
        activationId: '123456',
        phoneNumber: '66959916439',
        provider: 'hero-sms',
        serviceCode: 'dr',
        countryId: 52,
        countryLabel: 'Thailand',
        successfulUses: 0,
        maxUses: 3,
      },
      currentPhoneVerificationCode: '',
    },
    {
      currentPhoneVerificationCode: '654321',
    },
    {
      reusablePhoneActivation: {
        activationId: '123456',
        phoneNumber: '66959916439',
        provider: 'hero-sms',
        serviceCode: 'dr',
        countryId: 52,
        countryLabel: 'Thailand',
        successfulUses: 1,
        maxUses: 3,
      },
    },
    {
      currentPhoneActivation: null,
      currentPhoneVerificationCode: '',
    },
  ]);

  const actions = requests.map((url) => url.searchParams.get('action'));
  assert.deepStrictEqual(actions, ['serviceCountRent', 'getNumber', 'getStatus']);
});

test('phone verification helper uses the configured HeroSMS country for both number acquisition and add-phone submission', async () => {
  const requests = [];
  const submittedPayloads = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    heroSmsCountryId: 16,
    heroSmsCountryLabel: 'United Kingdom',
    verificationResendCount: 0,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload({ country: '16' }),
        };
      }
      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:654321:447911123456',
        };
      }
      if (action === 'getStatus') {
        return {
          ok: true,
          text: async () => 'STATUS_OK:112233',
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => 'ACCESS_ACTIVATION',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        submittedPayloads.push(message.payload);
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.equal(requests[0].searchParams.get('action'), 'serviceCountRent');
  assert.equal(requests[0].searchParams.get('country'), '16');
  assert.equal(requests[1].searchParams.get('action'), 'getNumber');
  assert.equal(requests[1].searchParams.get('country'), '16');
  assert.equal(requests[1].searchParams.get('maxPrice'), '0.08');
  assert.equal(requests[1].searchParams.get('fixedPrice'), 'true');
  assert.deepStrictEqual(submittedPayloads, [{
    phoneNumber: '447911123456',
    countryId: 16,
    countryLabel: 'United Kingdom',
  }]);
});

test('phone verification helper skips reusable activation when reuse toggle is disabled', async () => {
  const requests = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    heroSmsReuseEnabled: false,
    verificationResendCount: 0,
    currentPhoneActivation: null,
    reusablePhoneActivation: {
      activationId: 'reuse-001',
      phoneNumber: '66950012345',
      provider: 'hero-sms',
      serviceCode: 'dr',
      countryId: 52,
      successfulUses: 0,
      maxUses: 3,
    },
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'reactivate') {
        throw new Error('reactivate should not be called when reuse is disabled');
      }
      if (action === 'serviceCountRent') {
        return { ok: true, text: async () => buildHeroSmsPricesPayload() };
      }
      if (action === 'getNumber') {
        return { ok: true, text: async () => 'ACCESS_NUMBER:900001:66958887777' };
      }
      if (action === 'getStatus') {
        return { ok: true, text: async () => 'STATUS_OK:777111' };
      }
      if (action === 'setStatus') {
        return { ok: true, text: async () => 'STATUS_UPDATED' };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.equal(result.success, true);
  assert.equal(requests.some((requestUrl) => requestUrl.searchParams.get('action') === 'reactivate'), false);
  assert.equal(currentState.reusablePhoneActivation, null);
});

test('phone verification helper replaces numbers in step 9 and stops after replacement limit when SMS never arrives', async () => {
  const requests = [];
  const messages = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    verificationResendCount: 0,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };
  const statusCallsById = {};
  const realDateNow = Date.now;
  let fakeNow = 0;
  Date.now = () => fakeNow;

  try {
    const helpers = api.createPhoneVerificationHelpers({
      addLog: async () => {},
      ensureStep8SignupPageReady: async () => {},
      fetchImpl: async (url) => {
        const parsedUrl = new URL(url);
        requests.push(parsedUrl);
        const action = parsedUrl.searchParams.get('action');
        const id = parsedUrl.searchParams.get('id');

        if (action === 'serviceCountRent') {
          return {
            ok: true,
            text: async () => buildHeroSmsPricesPayload(),
          };
        }

        if (action === 'getNumber') {
          return {
            ok: true,
            text: async () => 'ACCESS_NUMBER:123456:66959916439',
          };
        }

        if (action === 'getStatus') {
          statusCallsById[id] = (statusCallsById[id] || 0) + 1;
          return {
            ok: true,
            text: async () => 'STATUS_WAIT_CODE',
          };
        }

        if (action === 'setStatus') {
          return {
            ok: true,
            text: async () => 'ACCESS_ACTIVATION',
          };
        }

        throw new Error(`Unexpected HeroSMS action: ${action}`);
      },
      getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
      getState: async () => ({ ...currentState }),
      sendToContentScriptResilient: async (_source, message) => {
        messages.push(message.type);
        if (message.type === 'SUBMIT_PHONE_NUMBER') {
          return {
            phoneVerificationPage: true,
            url: 'https://auth.openai.com/phone-verification',
          };
        }
        if (message.type === 'RESEND_PHONE_VERIFICATION_CODE') {
          return {
            resent: true,
            url: 'https://auth.openai.com/phone-verification',
          };
        }
        throw new Error(`Unexpected content-script message: ${message.type}`);
      },
      setState: async (updates) => {
        currentState = { ...currentState, ...updates };
      },
      sleepWithStop: async () => {
        fakeNow += 61000;
      },
      throwIfStopped: () => {},
    });

    await assert.rejects(
      helpers.completePhoneVerificationFlow(1, {
        addPhonePage: true,
        phoneVerificationPage: false,
        url: 'https://auth.openai.com/add-phone',
      }),
      /did not succeed after 3 number replacements/i
    );
    assert.ok(statusCallsById['123456'] >= 2, 'first number should be polled twice before being replaced');
    assert.ok(messages.includes('SUBMIT_PHONE_NUMBER'));
    assert.ok(messages.includes('RESEND_PHONE_VERIFICATION_CODE'));
    assert.ok(messages.filter((type) => type === 'SUBMIT_PHONE_NUMBER').length > 1);

    const actions = requests.map((url) => `${url.searchParams.get('action')}:${url.searchParams.get('id') || ''}`);
    assert.ok(actions.filter((action) => action === 'getNumber:').length > 1);
    assert.ok(actions.filter((action) => action === 'getStatus:123456').length >= 2);
    assert.ok(actions.filter((action) => action === 'setStatus:123456').length >= 2);
    assert.equal(currentState.currentPhoneActivation, null);
  } finally {
    Date.now = realDateNow;
  }
});

test('phone verification helper honors timeout-window and poll-round settings before replacing numbers', async () => {
  const requests = [];
  const messages = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    verificationResendCount: 0,
    phoneVerificationReplacementLimit: 1,
    phoneCodeWaitSeconds: 60,
    phoneCodeTimeoutWindows: 1,
    phoneCodePollIntervalSeconds: 1,
    phoneCodePollMaxRounds: 1,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'serviceCountRent') {
        return { ok: true, text: async () => buildHeroSmsPricesPayload() };
      }
      if (action === 'getNumber') {
        return { ok: true, text: async () => 'ACCESS_NUMBER:500001:66957776666' };
      }
      if (action === 'getStatus') {
        return { ok: true, text: async () => 'STATUS_WAIT_CODE' };
      }
      if (action === 'setStatus') {
        return { ok: true, text: async () => 'STATUS_UPDATED' };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      messages.push(message.type);
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'RETURN_TO_ADD_PHONE') {
        return {
          addPhonePage: true,
          url: 'https://auth.openai.com/add-phone',
        };
      }
      if (message.type === 'RESEND_PHONE_VERIFICATION_CODE') {
        throw new Error('resend should not be called when timeout windows is 1');
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await assert.rejects(
    helpers.completePhoneVerificationFlow(1, {
      addPhonePage: true,
      phoneVerificationPage: false,
      url: 'https://auth.openai.com/add-phone',
    }),
    /did not succeed after 1 number replacements/i
  );

  assert.equal(messages.includes('RESEND_PHONE_VERIFICATION_CODE'), false);
  assert.ok(
    requests.filter((requestUrl) => requestUrl.searchParams.get('action') === 'getStatus').length >= 2,
    'each replacement attempt should still poll HeroSMS at least once'
  );
});

test('phone verification helper respects configured number replacement limit', async () => {
  const requests = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    verificationResendCount: 0,
    phoneVerificationReplacementLimit: 1,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };
  let submitCodeCount = 0;
  const numbers = [
    { activationId: '411111', phoneNumber: '66950000111' },
    { activationId: '422222', phoneNumber: '66950000222' },
  ];
  let numberIndex = 0;

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const id = parsedUrl.searchParams.get('id');
      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }
      if (action === 'getNumber') {
        const nextNumber = numbers[numberIndex];
        numberIndex += 1;
        return {
          ok: true,
          text: async () => `ACCESS_NUMBER:${nextNumber.activationId}:${nextNumber.phoneNumber}`,
        };
      }
      if (action === 'getStatus') {
        return {
          ok: true,
          text: async () => 'STATUS_OK:654321',
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => `STATUS_UPDATED:${id}`,
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        submitCodeCount += 1;
        return {
          invalidCode: true,
          errorText: `This phone number is already linked to the maximum number of accounts. (${submitCodeCount})`,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'RETURN_TO_ADD_PHONE') {
        return {
          addPhonePage: true,
          url: 'https://auth.openai.com/add-phone',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await assert.rejects(
    helpers.completePhoneVerificationFlow(1, {
      addPhonePage: true,
      phoneVerificationPage: false,
      url: 'https://auth.openai.com/add-phone',
    }),
    /did not succeed after 1 number replacements/i
  );

  const actions = requests.map((requestUrl) => requestUrl.searchParams.get('action'));
  assert.deepStrictEqual(actions, [
    'serviceCountRent',
    'getNumber',
    'getStatus',
    'setStatus',
    'serviceCountRent',
    'getNumber',
    'getStatus',
    'setStatus',
  ]);
});

test('phone verification helper reuses the current number first when code submission returns to add-phone', async () => {
  const requests = [];
  const messages = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    verificationResendCount: 1,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };

  const numbers = [
    { activationId: '111111', phoneNumber: '66950000001' },
    { activationId: '222222', phoneNumber: '66950000002' },
  ];
  let numberIndex = 0;
  let submitCodeCount = 0;

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const id = parsedUrl.searchParams.get('id');

      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }

      if (action === 'getNumber') {
        const nextNumber = numbers[numberIndex];
        numberIndex += 1;
        return {
          ok: true,
          text: async () => `ACCESS_NUMBER:${nextNumber.activationId}:${nextNumber.phoneNumber}`,
        };
      }
      if (action === 'getStatus') {
        return {
          ok: true,
          text: async () => 'STATUS_OK:654321',
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => `STATUS_UPDATED:${id}`,
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      messages.push(message.type);
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        submitCodeCount += 1;
        return submitCodeCount === 1
          ? {
            returnedToAddPhone: true,
            url: 'https://auth.openai.com/add-phone',
          }
          : {
            success: true,
            consentReady: true,
            url: 'https://auth.openai.com/authorize',
          };
      }
      if (message.type === 'RESEND_PHONE_VERIFICATION_CODE') {
        return {
          resent: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.deepStrictEqual(messages, [
    'SUBMIT_PHONE_NUMBER',
    'SUBMIT_PHONE_VERIFICATION_CODE',
    'SUBMIT_PHONE_NUMBER',
    'SUBMIT_PHONE_VERIFICATION_CODE',
  ]);

  const actions = requests.map((url) => `${url.searchParams.get('action')}:${url.searchParams.get('id') || ''}`);
  assert.deepStrictEqual(actions, [
    'serviceCountRent:',
    'getNumber:',
    'getStatus:111111',
    'getStatus:111111',
  ]);
  assert.deepStrictEqual(currentState.currentPhoneActivation, null);
  assert.deepStrictEqual(currentState.reusablePhoneActivation, {
    activationId: '111111',
    phoneNumber: '66950000001',
    provider: 'hero-sms',
    serviceCode: 'dr',
    countryId: 52,
    countryLabel: 'Thailand',
    successfulUses: 1,
    maxUses: 3,
  });
});

test('phone verification helper immediately replaces number when page says the phone number was already used', async () => {
  const requests = [];
  const messages = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    verificationResendCount: 1,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };

  const numbers = [
    { activationId: '311111', phoneNumber: '66950000011' },
    { activationId: '322222', phoneNumber: '66950000022' },
  ];
  let numberIndex = 0;
  let submitCodeCount = 0;

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const id = parsedUrl.searchParams.get('id');

      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }
      if (action === 'getNumber') {
        const nextNumber = numbers[numberIndex];
        numberIndex += 1;
        return {
          ok: true,
          text: async () => `ACCESS_NUMBER:${nextNumber.activationId}:${nextNumber.phoneNumber}`,
        };
      }
      if (action === 'getStatus') {
        return {
          ok: true,
          text: async () => 'STATUS_OK:654321',
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => `STATUS_UPDATED:${id}`,
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      messages.push(message.type);
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        submitCodeCount += 1;
        if (submitCodeCount === 1) {
          return {
            invalidCode: true,
            errorText: 'This phone number is already linked to the maximum number of accounts.',
            url: 'https://auth.openai.com/phone-verification',
          };
        }
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      if (message.type === 'RETURN_TO_ADD_PHONE') {
        return {
          addPhonePage: true,
          url: 'https://auth.openai.com/add-phone',
        };
      }
      if (message.type === 'RESEND_PHONE_VERIFICATION_CODE') {
        throw new Error('should not resend for already-used number');
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.deepStrictEqual(messages, [
    'SUBMIT_PHONE_NUMBER',
    'SUBMIT_PHONE_VERIFICATION_CODE',
    'RETURN_TO_ADD_PHONE',
    'SUBMIT_PHONE_NUMBER',
    'SUBMIT_PHONE_VERIFICATION_CODE',
  ]);
});

test('phone verification helper reuses the same number up to three successful registrations', async () => {
  const requests = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    verificationResendCount: 0,
    currentPhoneActivation: null,
    reusablePhoneActivation: {
      activationId: '123456',
      phoneNumber: '66959916439',
      provider: 'hero-sms',
      serviceCode: 'dr',
      countryId: 52,
      successfulUses: 2,
      maxUses: 3,
    },
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'reactivate') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            activationId: '222333',
            phoneNumber: '66959916439',
          }),
        };
      }
      if (action === 'getStatus') {
        return {
          ok: true,
          text: async () => 'STATUS_OK:654321',
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => 'ACCESS_ACTIVATION',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.equal(requests[0].searchParams.get('action'), 'reactivate');
  assert.equal(requests[0].searchParams.get('id'), '123456');
  assert.equal(requests.some((url) => url.searchParams.get('action') === 'setStatus' && url.searchParams.get('status') === '6'), true);
  assert.deepStrictEqual(currentState.reusablePhoneActivation, null);
});

test('phone verification helper keeps maxUses behavior for reused V2 activations', async () => {
  const requests = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    heroSmsCountryId: 16,
    heroSmsCountryLabel: 'United Kingdom',
    verificationResendCount: 0,
    currentPhoneActivation: null,
    reusablePhoneActivation: {
      activationId: '123456',
      phoneNumber: '447911123456',
      provider: 'hero-sms',
      serviceCode: 'dr',
      countryId: 16,
      successfulUses: 2,
      maxUses: 3,
      statusAction: 'getStatusV2',
    },
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'reactivate') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            activationId: '222333',
            phoneNumber: '447911123456',
          }),
        };
      }
      if (action === 'getStatusV2') {
        return {
          ok: true,
          text: async () => buildHeroSmsStatusV2Payload({ smsCode: '654321', smsText: 'Your code is 654321' }),
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => 'ACCESS_ACTIVATION',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  const actions = requests.map((url) => url.searchParams.get('action'));
  assert.deepStrictEqual(actions, ['reactivate', 'getStatusV2', 'setStatus']);
  assert.equal(requests.at(-1).searchParams.get('status'), '6');
  assert.deepStrictEqual(currentState.reusablePhoneActivation, null);
});

test('phone verification helper keeps reusable HeroSMS activation before the third successful use', async () => {
  const requests = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    verificationResendCount: 0,
    currentPhoneActivation: null,
    reusablePhoneActivation: {
      activationId: '123456',
      phoneNumber: '66959916439',
      provider: 'hero-sms',
      serviceCode: 'dr',
      countryId: 52,
      successfulUses: 1,
      maxUses: 3,
    },
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'reactivate') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            activationId: '222333',
            phoneNumber: '66959916439',
          }),
        };
      }
      if (action === 'getStatus') {
        return {
          ok: true,
          text: async () => 'STATUS_OK:654321',
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => 'ACCESS_ACTIVATION',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.deepStrictEqual(currentState.reusablePhoneActivation, {
    activationId: '222333',
    phoneNumber: '66959916439',
    provider: 'hero-sms',
    serviceCode: 'dr',
    countryId: 52,
    successfulUses: 2,
    maxUses: 3,
  });
  assert.equal(requests.some((url) => url.searchParams.get('action') === 'setStatus' && url.searchParams.get('status') === '6'), false);
});

test('phone verification helper replaces number immediately when resend is throttled and does not spam resend clicks', async () => {
  const requests = [];
  const messages = [];
  let resendCalls = 0;
  let currentState = {
    heroSmsApiKey: 'demo-key',
    heroSmsCountryId: 52,
    heroSmsCountryLabel: 'Thailand',
    verificationResendCount: 0,
    phoneVerificationReplacementLimit: 2,
    phoneCodeWaitSeconds: 60,
    phoneCodeTimeoutWindows: 3,
    phoneCodePollIntervalSeconds: 1,
    phoneCodePollMaxRounds: 1,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };

  const numbers = [
    { activationId: '900001', phoneNumber: '66951110001' },
    { activationId: '900002', phoneNumber: '66951110002' },
  ];
  let numberIndex = 0;

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const id = parsedUrl.searchParams.get('id');
      if (action === 'serviceCountRent') {
        return { ok: true, text: async () => buildHeroSmsPricesPayload() };
      }
      if (action === 'getNumber') {
        const nextNumber = numbers[numberIndex];
        numberIndex += 1;
        return { ok: true, text: async () => `ACCESS_NUMBER:${nextNumber.activationId}:${nextNumber.phoneNumber}` };
      }
      if (action === 'getStatus') {
        if (id === '900001') {
          return { ok: true, text: async () => 'STATUS_WAIT_CODE' };
        }
        return { ok: true, text: async () => 'STATUS_OK:654321' };
      }
      if (action === 'setStatus') {
        return { ok: true, text: async () => `STATUS_UPDATED:${id}` };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      messages.push(message.type);
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'RESEND_PHONE_VERIFICATION_CODE') {
        resendCalls += 1;
        throw new Error('PHONE_RESEND_THROTTLED::Tried to resend too many times. Please try again later.');
      }
      if (message.type === 'RETURN_TO_ADD_PHONE') {
        return {
          addPhonePage: true,
          url: 'https://auth.openai.com/add-phone',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.equal(resendCalls, 1, 'resend should be attempted once for the number before replacement');
  assert.equal(messages.filter((type) => type === 'SUBMIT_PHONE_NUMBER').length, 2);
  assert.equal(messages.includes('RETURN_TO_ADD_PHONE'), true);
});

test('phone verification helper falls back to the next country after repeated sms timeout on the same country', async () => {
  const requests = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    heroSmsCountryId: 52,
    heroSmsCountryLabel: 'Thailand',
    heroSmsCountryFallback: [{ id: 16, label: 'United Kingdom' }],
    verificationResendCount: 0,
    phoneVerificationReplacementLimit: 3,
    phoneCodeWaitSeconds: 60,
    phoneCodeTimeoutWindows: 1,
    phoneCodePollIntervalSeconds: 1,
    phoneCodePollMaxRounds: 1,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };

  let thailandAcquireIndex = 0;

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const id = parsedUrl.searchParams.get('id');
      const country = parsedUrl.searchParams.get('country');

      if (action === 'serviceCountRent') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            [country]: {
              dr: {
                cost: country === '52' ? 0.08 : 0.09,
                count: 100,
              },
            },
          }),
        };
      }

      if (action === 'getNumber') {
        if (country === '52') {
          thailandAcquireIndex += 1;
          return {
            ok: true,
            text: async () => `ACCESS_NUMBER:52${thailandAcquireIndex}:66950000${thailandAcquireIndex}`,
          };
        }
        if (country === '16') {
          return {
            ok: true,
            text: async () => 'ACCESS_NUMBER:160001:447955001122',
          };
        }
      }

      if (action === 'getStatus') {
        if (id === '160001') {
          return { ok: true, text: async () => 'STATUS_OK:888999' };
        }
        return { ok: true, text: async () => 'STATUS_WAIT_CODE' };
      }

      if (action === 'setStatus') {
        return { ok: true, text: async () => 'STATUS_UPDATED' };
      }

      throw new Error(`Unexpected HeroSMS action: ${action} @ country ${country || 'n/a'}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'RETURN_TO_ADD_PHONE') {
        return {
          addPhonePage: true,
          phoneVerificationPage: false,
          url: 'https://auth.openai.com/add-phone',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });

  const getNumberCountries = requests
    .filter((requestUrl) => requestUrl.searchParams.get('action') === 'getNumber')
    .map((requestUrl) => requestUrl.searchParams.get('country'));
  assert.deepStrictEqual(getNumberCountries, ['52', '52', '16']);
});
