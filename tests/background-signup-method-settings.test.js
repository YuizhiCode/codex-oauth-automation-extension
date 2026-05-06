const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/message-router.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundMessageRouter;`)(globalScope);

test('SAVE_SETTING clears resolvedSignupMethod and persists phone signup selection', async () => {
  const events = {
    persistentUpdates: [],
    stateUpdates: [],
  };

  const router = api.createMessageRouter({
    addLog: async () => {},
    appendAccountRunRecord: async () => null,
    batchUpdateLuckmailPurchases: async () => {},
    buildLocalhostCleanupPrefix: () => '',
    buildLuckmailSessionSettingsPayload: () => ({}),
    buildPersistentSettingsPayload: (payload) => ({ ...payload }),
    broadcastDataUpdate: () => {},
    applyIpProxySettingsFromState: async () => null,
    cancelScheduledAutoRun: async () => false,
    checkIcloudSession: async () => ({}),
    clearAccountRunHistory: async () => ({}),
    deleteAccountRunHistoryRecords: async () => ({}),
    clearAutoRunTimerAlarm: async () => {},
    clearLuckmailRuntimeState: async () => {},
    clearStopRequest: () => {},
    closeLocalhostCallbackTabs: async () => {},
    closeTabsByUrlPrefix: async () => {},
    deleteHotmailAccount: async () => {},
    deleteHotmailAccounts: async () => {},
    deleteIcloudAlias: async () => {},
    deleteUsedIcloudAliases: async () => {},
    disableUsedLuckmailPurchases: async () => {},
    doesStepUseCompletionSignal: () => false,
    ensureMail2925MailboxSession: async () => {},
    ensureManualInteractionAllowed: async () => ({ stepStatuses: {} }),
    executeStep: async () => {},
    executeStepViaCompletionSignal: async () => {},
    exportSettingsBundle: async () => ({}),
    fetchGeneratedEmail: async () => '',
    finalizePhoneActivationAfterSuccessfulFlow: async () => {},
    finalizeStep3Completion: async () => {},
    finalizeIcloudAliasAfterSuccessfulFlow: async () => {},
    removeCurrentRegisteredAccountAfterPlatformSuccess: async () => {},
    saveRegisteredAccountAfterProfileSuccess: async () => {},
    findHotmailAccount: async () => null,
    findPayPalAccount: async () => null,
    flushCommand: async () => {},
    getCurrentLuckmailPurchase: () => null,
    getCurrentPayPalAccount: () => null,
    getCurrentMail2925Account: () => null,
    getPendingAutoRunTimerPlan: () => null,
    getSourceLabel: () => '',
    getState: async () => ({
      phoneVerificationEnabled: true,
      plusModeEnabled: false,
      contributionMode: false,
      signupMethod: 'email',
      resolvedSignupMethod: 'email',
      stepStatuses: {},
    }),
    getStepDefinitionForState: () => null,
    getStepIdsForState: () => [1, 2, 3],
    getLastStepIdForState: () => 3,
    getTabId: async () => null,
    getStopRequested: () => false,
    handleAutoRunLoopUnhandledError: async () => {},
    importSettingsBundle: async () => {},
    invalidateDownstreamAfterStepRestart: async () => {},
    isCloudflareSecurityBlockedError: () => false,
    isAutoRunLockedState: () => false,
    isHotmailProvider: () => false,
    isLocalhostOAuthCallbackUrl: () => true,
    isLuckmailProvider: () => false,
    isStopError: () => false,
    isTabAlive: async () => false,
    launchAutoRunTimerPlan: async () => false,
    listIcloudAliases: async () => [],
    listLuckmailPurchasesForManagement: async () => [],
    refreshIpProxyPool: async () => ({}),
    normalizeHotmailAccounts: (items) => items,
    normalizeMail2925Accounts: (items) => items,
    normalizePayPalAccounts: (items) => items,
    normalizeRunCount: (value) => value,
    AUTO_RUN_TIMER_KIND_SCHEDULED_START: 'scheduled',
    notifyStepComplete: () => {},
    notifyStepError: () => {},
    patchMail2925Account: async () => {},
    patchHotmailAccount: async () => {},
    pollContributionStatus: async () => ({}),
    registerTab: async () => {},
    requestStop: async () => {},
    probeIpProxyExit: async () => ({}),
    handleCloudflareSecurityBlocked: async () => '',
    resetState: async () => {},
    resumeAutoRun: async () => {},
    scheduleAutoRun: async () => ({}),
    selectLuckmailPurchase: async () => {},
    switchIpProxy: async () => ({}),
    changeIpProxyExit: async () => ({}),
    setCurrentPayPalAccount: async () => {},
    setCurrentMail2925Account: async () => {},
    setCurrentHotmailAccount: async () => {},
    setContributionMode: async () => {},
    setEmailState: async () => {},
    setEmailStateSilently: async () => {},
    setIcloudAliasPreservedState: async () => {},
    setIcloudAliasUsedState: async () => {},
    setLuckmailPurchaseDisabledState: async () => {},
    setLuckmailPurchasePreservedState: async () => {},
    setLuckmailPurchaseUsedState: async () => {},
    setPersistentSettings: async (updates) => {
      events.persistentUpdates.push(updates);
    },
    setState: async (updates) => {
      events.stateUpdates.push(updates);
    },
    setStepStatus: async () => {},
    skipAutoRunCountdown: async () => false,
    skipStep: async () => ({}),
    startContributionFlow: async () => ({}),
    startAutoRunLoop: async () => {},
    deleteMail2925Account: async () => {},
    deleteMail2925Accounts: async () => {},
    syncHotmailAccounts: async () => {},
    syncPayPalAccounts: async () => {},
    testHotmailAccountMailAccess: async () => ({}),
    upsertPayPalAccount: async () => ({}),
    upsertMail2925Account: async () => ({}),
    upsertHotmailAccount: async () => ({}),
    verifyHotmailAccount: async () => ({}),
  });

  const response = await router.handleMessage({
    type: 'SAVE_SETTING',
    source: 'sidepanel',
    payload: {
      signupMethod: 'phone',
      phoneVerificationEnabled: true,
    },
  }, {});

  assert.equal(response.ok, true);
  assert.deepStrictEqual(events.persistentUpdates, [
    {
      signupMethod: 'phone',
      phoneVerificationEnabled: true,
    },
  ]);
  assert.equal(events.stateUpdates.length > 0, true);
  assert.equal(events.stateUpdates[0].resolvedSignupMethod, null);
  assert.equal(events.stateUpdates[0].signupMethod, 'phone');
});
