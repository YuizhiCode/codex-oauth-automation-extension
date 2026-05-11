const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/auto-run-controller.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundAutoRunController;`)(globalScope);

test('phone signup fresh auto-run does not resume from the registered account pool', async () => {
  const events = {
    resumeCalls: [],
    runStartSteps: [],
  };

  const defaultState = {
    stepStatuses: {},
    signupMethod: 'email',
    phoneVerificationEnabled: false,
    phoneSmsProvider: 'five-sim',
    phoneSmsProviderOrder: ['five-sim'],
    verificationResendCount: 2,
    phoneVerificationReplacementLimit: 3,
    phoneCodeWaitSeconds: 20,
    phoneCodeTimeoutWindows: 4,
    phoneCodePollIntervalSeconds: 5,
    phoneCodePollMaxRounds: 12,
    vpsUrl: 'https://example.com/vps',
    vpsPassword: 'secret',
    customPassword: '',
    autoRunSkipFailures: false,
    autoRunFallbackThreadIntervalMinutes: 0,
    autoRunDelayEnabled: false,
    autoRunDelayMinutes: 30,
    autoStepDelaySeconds: null,
    mailProvider: '163',
    emailGenerator: 'duck',
    gmailBaseEmail: '',
    mail2925BaseEmail: '',
    currentMail2925AccountId: '',
    emailPrefix: '',
    inbucketHost: '',
    inbucketMailbox: '',
    cloudflareDomain: '',
    cloudflareDomains: [],
    tabRegistry: {},
    sourceLastUrls: {},
    autoRunRoundSummaries: [],
  };

  let currentState = {
    ...defaultState,
    signupMethod: 'phone',
    phoneVerificationEnabled: true,
    phoneSmsProvider: 'hero-sms',
    phoneSmsProviderOrder: ['hero-sms', 'five-sim'],
    accounts: [{ email: 'registered@example.com', password: 'Secret123!', createdAt: 1 }],
  };

  const runtime = {
    state: {
      autoRunActive: false,
      autoRunCurrentRun: 0,
      autoRunTotalRuns: 1,
      autoRunAttemptRun: 0,
      autoRunSessionId: 0,
    },
    get() {
      return { ...this.state };
    },
    set(updates = {}) {
      this.state = { ...this.state, ...updates };
    },
  };

  let sessionSeed = 0;

  const cloneState = () => ({
    ...currentState,
    stepStatuses: { ...(currentState.stepStatuses || {}) },
    tabRegistry: { ...(currentState.tabRegistry || {}) },
    sourceLastUrls: { ...(currentState.sourceLastUrls || {}) },
    accounts: Array.isArray(currentState.accounts)
      ? currentState.accounts.map((account) => ({ ...account }))
      : [],
  });

  const controller = api.createAutoRunController({
    addLog: async () => {},
    appendAccountRunRecord: async () => null,
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    AUTO_RUN_RETRY_DELAY_MS: 3000,
    AUTO_RUN_TIMER_KIND_BEFORE_RETRY: 'before_retry',
    AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS: 'between_rounds',
    broadcastAutoRunStatus: async (phase, payload = {}) => {
      currentState = {
        ...currentState,
        autoRunning: ['scheduled', 'running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval'].includes(phase),
        autoRunPhase: phase,
        autoRunCurrentRun: payload.currentRun ?? runtime.state.autoRunCurrentRun,
        autoRunTotalRuns: payload.totalRuns ?? runtime.state.autoRunTotalRuns,
        autoRunAttemptRun: payload.attemptRun ?? runtime.state.autoRunAttemptRun,
        autoRunSessionId: payload.sessionId ?? runtime.state.autoRunSessionId,
      };
    },
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    clearStopRequest: () => {},
    createAutoRunSessionId: () => {
      sessionSeed += 1;
      return sessionSeed;
    },
    getAutoRunStatusPayload: (phase, payload = {}) => ({
      autoRunning: ['scheduled', 'running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval'].includes(phase),
      autoRunPhase: phase,
      autoRunCurrentRun: payload.currentRun ?? 0,
      autoRunTotalRuns: payload.totalRuns ?? 1,
      autoRunAttemptRun: payload.attemptRun ?? 0,
      autoRunSessionId: payload.sessionId ?? 0,
    }),
    getErrorMessage: (error) => error?.message || String(error || ''),
    getFirstUnfinishedStep: () => 1,
    getPendingAutoRunTimerPlan: () => null,
    getRunningSteps: () => [],
    getState: async () => cloneState(),
    getStopRequested: () => false,
    hasSavedProgress: () => false,
    isAddPhoneAuthFailure: () => false,
    isRestartCurrentAttemptError: () => false,
    isSignupUserAlreadyExistsFailure: () => false,
    isStopError: (error) => (error?.message || String(error || '')) === 'Flow stopped.',
    launchAutoRunTimerPlan: async () => false,
    normalizeAutoRunFallbackThreadIntervalMinutes: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    persistAutoRunTimerPlan: async () => ({}),
    prepareRegisteredAccountResumeForAutoRun: async (context = {}) => {
      events.resumeCalls.push({
        ...context,
        signupMethod: currentState.signupMethod,
        phoneVerificationEnabled: currentState.phoneVerificationEnabled,
      });
      if (currentState.signupMethod === 'phone' && currentState.phoneVerificationEnabled) {
        return null;
      }
      const account = currentState.accounts?.[0];
      if (!account) {
        return null;
      }
      await controllerDeps.setState({
        email: account.email,
        password: account.password,
      });
      return { startStep: 6, account };
    },
    resetState: async () => {
      const prev = cloneState();
      currentState = {
        ...defaultState,
        accounts: prev.accounts,
        stepStatuses: {},
        tabRegistry: {},
        sourceLastUrls: {},
      };
    },
    runAutoSequenceFromStep: async (startStep) => {
      events.runStartSteps.push(startStep);
      currentState = {
        ...currentState,
        stepStatuses: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [String(index + 1), 'completed'])),
      };
    },
    runtime,
    setState: async (updates = {}) => {
      currentState = {
        ...currentState,
        ...updates,
        stepStatuses: updates.stepStatuses ? { ...updates.stepStatuses } : currentState.stepStatuses,
        tabRegistry: updates.tabRegistry ? { ...updates.tabRegistry } : currentState.tabRegistry,
        sourceLastUrls: updates.sourceLastUrls ? { ...updates.sourceLastUrls } : currentState.sourceLastUrls,
        accounts: updates.accounts
          ? updates.accounts.map((account) => ({ ...account }))
          : currentState.accounts,
      };
    },
    sleepWithStop: async () => {},
    throwIfAutoRunSessionStopped: () => {},
    waitForRunningStepsToFinish: async () => cloneState(),
    throwIfStopped: () => {},
    chrome: {
      runtime: {
        sendMessage() {
          return Promise.resolve();
        },
      },
    },
  });

  const controllerDeps = {
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
  };

  await controller.autoRunLoop(1, {
    autoRunSkipFailures: false,
    mode: 'restart',
  });

  assert.deepEqual(events.runStartSteps, [1]);
  assert.equal(events.resumeCalls.length, 0);
  assert.equal(currentState.signupMethod, 'phone');
  assert.equal(currentState.phoneVerificationEnabled, true);
  assert.equal(currentState.email, undefined);
  assert.equal(currentState.accounts.length, 1);
});
