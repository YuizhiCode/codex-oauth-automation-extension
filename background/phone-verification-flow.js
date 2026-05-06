(function attachBackgroundPhoneVerification(root, factory) {
  root.MultiPageBackgroundPhoneVerification = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundPhoneVerificationModule() {
  function createPhoneVerificationHelpers(deps = {}) {
    const {
      addLog,
      ensureStep8SignupPageReady,
      fetchImpl = (...args) => fetch(...args),
      getOAuthFlowStepTimeoutMs,
      getState,
      sendToContentScriptResilient,
      setState,
      sleepWithStop,
      throwIfStopped,
      DEFAULT_FIVE_SIM_BASE_URL = 'https://5sim.net/v1',
      DEFAULT_FIVE_SIM_COUNTRY_ORDER = ['thailand'],
      DEFAULT_FIVE_SIM_OPERATOR = 'any',
      DEFAULT_FIVE_SIM_PRODUCT = 'openai',
      DEFAULT_HERO_SMS_BASE_URL = 'https://hero-sms.com/stubs/handler_api.php',
      DEFAULT_HERO_SMS_REUSE_ENABLED = true,
      DEFAULT_NEX_SMS_BASE_URL = 'https://api.nexsms.net',
      DEFAULT_NEX_SMS_COUNTRY_ORDER = [1],
      DEFAULT_NEX_SMS_SERVICE_CODE = 'ot',
      HERO_SMS_COUNTRY_ID = 52,
      HERO_SMS_COUNTRY_LABEL = 'Thailand',
      HERO_SMS_SERVICE_CODE = 'dr',
      HERO_SMS_SERVICE_LABEL = 'OpenAI',
      DEFAULT_PHONE_CODE_WAIT_SECONDS = 60,
      DEFAULT_PHONE_CODE_TIMEOUT_WINDOWS = 2,
      DEFAULT_PHONE_CODE_POLL_INTERVAL_SECONDS = 5,
      DEFAULT_PHONE_CODE_POLL_ROUNDS = 4,
    } = deps;

    const PHONE_ACTIVATION_STATE_KEY = 'currentPhoneActivation';
    const PHONE_VERIFICATION_CODE_STATE_KEY = 'currentPhoneVerificationCode';
    const REUSABLE_PHONE_ACTIVATION_STATE_KEY = 'reusablePhoneActivation';
    const HERO_SMS_LAST_PRICE_TIERS_KEY = 'heroSmsLastPriceTiers';
    const HERO_SMS_LAST_PRICE_COUNTRY_ID_KEY = 'heroSmsLastPriceCountryId';
    const HERO_SMS_LAST_PRICE_COUNTRY_LABEL_KEY = 'heroSmsLastPriceCountryLabel';
    const HERO_SMS_LAST_PRICE_USER_LIMIT_KEY = 'heroSmsLastPriceUserLimit';
    const HERO_SMS_LAST_PRICE_AT_KEY = 'heroSmsLastPriceAt';
    const PHONE_CODE_WAIT_SECONDS_MIN = 15;
    const PHONE_CODE_WAIT_SECONDS_MAX = 300;
    const PHONE_CODE_TIMEOUT_WINDOWS_MIN = 1;
    const PHONE_CODE_TIMEOUT_WINDOWS_MAX = 10;
    const PHONE_CODE_POLL_INTERVAL_SECONDS_MIN = 1;
    const PHONE_CODE_POLL_INTERVAL_SECONDS_MAX = 30;
    const PHONE_CODE_POLL_ROUNDS_MIN = 1;
    const PHONE_CODE_POLL_ROUNDS_MAX = 120;
    const DEFAULT_PHONE_POLL_INTERVAL_MS = DEFAULT_PHONE_CODE_POLL_INTERVAL_SECONDS * 1000;
    const DEFAULT_PHONE_POLL_TIMEOUT_MS = 180000;
    const DEFAULT_PHONE_REQUEST_TIMEOUT_MS = 20000;
    const DEFAULT_PHONE_SUBMIT_ATTEMPTS = 3;
    const DEFAULT_PHONE_NUMBER_MAX_USES = 3;
    const DEFAULT_PHONE_NUMBER_REPLACEMENT_LIMIT = 3;
    const DEFAULT_PHONE_PRICE_LOOKUP_ATTEMPTS = 3;
    const MAX_PHONE_PRICE_CANDIDATES = 8;
    const DEFAULT_PHONE_ACTIVATION_RETRY_ROUNDS = 3;
    const PHONE_ACTIVATION_RETRY_ROUNDS_MIN = 1;
    const PHONE_ACTIVATION_RETRY_ROUNDS_MAX = 10;
    const DEFAULT_PHONE_ACTIVATION_RETRY_DELAY_MS = 2000;
    const HERO_SMS_ACQUIRE_PRIORITY_COUNTRY = 'country';
    const HERO_SMS_ACQUIRE_PRIORITY_PRICE = 'price';
    const PHONE_SMS_PROVIDER_HERO = 'hero-sms';
    const PHONE_SMS_PROVIDER_5SIM = '5sim';
    const PHONE_SMS_PROVIDER_NEXSMS = 'nexsms';
    const DEFAULT_PHONE_SMS_PROVIDER = PHONE_SMS_PROVIDER_HERO;
    const PHONE_CODE_TIMEOUT_ERROR_PREFIX = 'PHONE_CODE_TIMEOUT::';
    const PHONE_RESTART_STEP7_ERROR_PREFIX = 'PHONE_RESTART_STEP7::';
    const PHONE_RESEND_THROTTLED_ERROR_PREFIX = 'PHONE_RESEND_THROTTLED::';
    const PHONE_SMS_FAILURE_SKIP_THRESHOLD = 2;

    function normalizeUrl(value, fallback = DEFAULT_HERO_SMS_BASE_URL) {
      const trimmed = String(value || '').trim();
      if (!trimmed) {
        return fallback;
      }
      try {
        return new URL(trimmed).toString();
      } catch {
        return fallback;
      }
    }

    function normalizeApiKey(value) {
      return String(value || '').trim();
    }

    function normalizePhoneSmsProvider(value = '') {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized === PHONE_SMS_PROVIDER_5SIM) {
        return PHONE_SMS_PROVIDER_5SIM;
      }
      if (normalized === PHONE_SMS_PROVIDER_NEXSMS) {
        return PHONE_SMS_PROVIDER_NEXSMS;
      }
      return PHONE_SMS_PROVIDER_HERO;
    }

    function normalizeFiveSimBaseUrl(value, fallback = DEFAULT_FIVE_SIM_BASE_URL) {
      return normalizeUrl(value, fallback).replace(/\/$/, '');
    }

    function normalizeFiveSimCountryCode(value = '', fallback = DEFAULT_FIVE_SIM_COUNTRY_ORDER[0] || 'thailand') {
      const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
      return normalized || fallback;
    }

    function normalizeFiveSimCountryOrder(value = []) {
      const source = Array.isArray(value)
        ? value
        : String(value || '')
          .split(/[\r\n,，;；]+/)
          .map((entry) => String(entry || '').trim())
          .filter(Boolean);
      const normalized = [];
      const seen = new Set();
      source.forEach((entry) => {
        const code = normalizeFiveSimCountryCode(
          entry && typeof entry === 'object' && !Array.isArray(entry)
            ? (entry.code || entry.country || entry.id || '')
            : entry,
          ''
        );
        if (!code || seen.has(code)) {
          return;
        }
        seen.add(code);
        normalized.push(code);
      });
      return normalized.slice(0, 10);
    }

    function normalizeFiveSimOperator(value = '', fallback = DEFAULT_FIVE_SIM_OPERATOR) {
      return normalizeFiveSimCountryCode(value, fallback);
    }

    function normalizeFiveSimProduct(value = '', fallback = DEFAULT_FIVE_SIM_PRODUCT) {
      return normalizeFiveSimCountryCode(value, fallback);
    }

    function normalizeNexSmsBaseUrl(value, fallback = DEFAULT_NEX_SMS_BASE_URL) {
      return normalizeUrl(value, fallback).replace(/\/$/, '');
    }

    function normalizeNexSmsCountryId(value, fallback = 0) {
      const parsed = Math.floor(Number(value));
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
      const fallbackParsed = Math.floor(Number(fallback));
      if (Number.isFinite(fallbackParsed) && fallbackParsed >= 0) {
        return fallbackParsed;
      }
      return 0;
    }

    function normalizeNexSmsCountryOrder(value = []) {
      const source = Array.isArray(value)
        ? value
        : String(value || '')
          .split(/[\r\n,，;；]+/)
          .map((entry) => String(entry || '').trim())
          .filter(Boolean);
      const normalized = [];
      const seen = new Set();
      source.forEach((entry) => {
        const id = normalizeNexSmsCountryId(
          entry && typeof entry === 'object' && !Array.isArray(entry)
            ? (entry.id || entry.countryId || entry.country || '')
            : entry,
          -1
        );
        if (id < 0 || seen.has(id)) {
          return;
        }
        seen.add(id);
        normalized.push(id);
      });
      return normalized.slice(0, 10);
    }

    function normalizeNexSmsServiceCode(value = '', fallback = DEFAULT_NEX_SMS_SERVICE_CODE) {
      const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
      if (normalized) {
        return normalized;
      }
      const fallbackNormalized = String(fallback || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
      return fallbackNormalized || 'ot';
    }

    function normalizePhoneNumberForProvider(value = '', provider = PHONE_SMS_PROVIDER_HERO) {
      const trimmed = String(value || '').trim();
      if (!trimmed) {
        return '';
      }
      if (provider === PHONE_SMS_PROVIDER_5SIM || provider === PHONE_SMS_PROVIDER_NEXSMS) {
        return trimmed.replace(/[^\d]/g, '');
      }
      return trimmed;
    }

    function resolveFiveSimCountryCandidates(state = {}) {
      return normalizeFiveSimCountryOrder(state?.fiveSimCountryOrder).map((code) => ({
        id: code,
        code,
        label: code,
      }));
    }

    function resolveNexSmsCountryCandidates(state = {}) {
      return normalizeNexSmsCountryOrder(state?.nexSmsCountryOrder).map((id) => ({
        id,
        label: `Country #${id}`,
      }));
    }

    function normalizeUseCount(value) {
      return Math.max(0, Math.floor(Number(value) || 0));
    }

    function normalizePhoneReplacementLimit(value) {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PHONE_NUMBER_REPLACEMENT_LIMIT;
      }
      return Math.max(1, Math.min(20, parsed));
    }

    function normalizePhoneActivationRetryRounds(value) {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PHONE_ACTIVATION_RETRY_ROUNDS;
      }
      return Math.max(PHONE_ACTIVATION_RETRY_ROUNDS_MIN, Math.min(PHONE_ACTIVATION_RETRY_ROUNDS_MAX, parsed));
    }

    function normalizePhoneActivationRetryDelayMs(value) {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PHONE_ACTIVATION_RETRY_DELAY_MS;
      }
      return Math.max(500, Math.min(30000, parsed));
    }

    function normalizeHeroSmsPriceLimit(value) {
      if (value === undefined || value === null || String(value).trim() === '') {
        return null;
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
      }
      return Math.round(parsed * 10000) / 10000;
    }

    function isPhoneNumberUsedError(value) {
      const text = String(value || '').trim();
      if (!text) {
        return false;
      }
      return /already\s+linked\s+to\s+the\s+maximum\s+number\s+of\s+accounts|phone\s+number\s+is\s+already\s+(?:in\s+use|linked|registered)|phone\s+number\s+has\s+already\s+been\s+used|already\s+associated\s+with\s+another\s+account|not\s+eligible\s+to\s+be\s+used|cannot\s+be\s+used\s+for\s+verification|号码.*(?:已|被).*(?:使用|占用|绑定|注册)|手机号.*(?:已|被).*(?:使用|占用|绑定|注册)|该手机号.*(?:已|被).*(?:使用|占用|绑定|注册)/i.test(text);
    }

    function normalizeCountryId(value, fallback = HERO_SMS_COUNTRY_ID) {
      const parsed = Math.floor(Number(value));
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
      const fallbackParsed = Math.floor(Number(fallback));
      if (Number.isFinite(fallbackParsed) && fallbackParsed > 0) {
        return fallbackParsed;
      }
      return 0;
    }

    function normalizeCountryLabel(value = '', fallback = HERO_SMS_COUNTRY_LABEL) {
      return String(value || '').trim() || fallback;
    }

    function normalizePhoneCodeWaitSeconds(value) {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PHONE_CODE_WAIT_SECONDS;
      }
      return Math.max(PHONE_CODE_WAIT_SECONDS_MIN, Math.min(PHONE_CODE_WAIT_SECONDS_MAX, parsed));
    }

    function normalizePhoneCodeTimeoutWindows(value) {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PHONE_CODE_TIMEOUT_WINDOWS;
      }
      return Math.max(PHONE_CODE_TIMEOUT_WINDOWS_MIN, Math.min(PHONE_CODE_TIMEOUT_WINDOWS_MAX, parsed));
    }

    function normalizePhoneCodePollIntervalSeconds(value) {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PHONE_CODE_POLL_INTERVAL_SECONDS;
      }
      return Math.max(PHONE_CODE_POLL_INTERVAL_SECONDS_MIN, Math.min(PHONE_CODE_POLL_INTERVAL_SECONDS_MAX, parsed));
    }

    function normalizePhoneCodePollMaxRounds(value) {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PHONE_CODE_POLL_ROUNDS;
      }
      return Math.max(PHONE_CODE_POLL_ROUNDS_MIN, Math.min(PHONE_CODE_POLL_ROUNDS_MAX, parsed));
    }

    function normalizeHeroSmsReuseEnabled(value) {
      if (value === undefined || value === null) {
        return Boolean(DEFAULT_HERO_SMS_REUSE_ENABLED);
      }
      return Boolean(value);
    }

    function normalizeHeroSmsAcquirePriority(value = '') {
      return String(value || '').trim().toLowerCase() === HERO_SMS_ACQUIRE_PRIORITY_PRICE
        ? HERO_SMS_ACQUIRE_PRIORITY_PRICE
        : HERO_SMS_ACQUIRE_PRIORITY_COUNTRY;
    }

    function normalizeCountryFallbackList(value = []) {
      const source = Array.isArray(value)
        ? value
        : String(value || '')
          .split(/[\r\n,，;；]+/)
          .map((entry) => String(entry || '').trim())
          .filter(Boolean);
      const seen = new Set();
      const normalized = [];

      for (const entry of source) {
        let id = 0;
        let label = '';

        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          id = normalizeCountryId(entry.id ?? entry.countryId, 0);
          label = String((entry.label ?? entry.countryLabel) || '').trim();
        } else {
          const text = String(entry || '').trim();
          const structured = text.match(/^(\d+)\s*(?:[:|/-]\s*(.+))?$/);
          if (structured) {
            id = normalizeCountryId(structured[1], 0);
            label = String(structured[2] || '').trim();
          } else {
            id = normalizeCountryId(text, 0);
          }
        }

        if (!Number.isFinite(id) || id <= 0 || seen.has(id)) {
          continue;
        }
        seen.add(id);
        normalized.push({
          id,
          label: label || `Country #${id}`,
        });
      }

      return normalized;
    }

    function resolveCountryConfig(state = {}) {
      return {
        id: normalizeCountryId(state.heroSmsCountryId, HERO_SMS_COUNTRY_ID),
        label: normalizeCountryLabel(state.heroSmsCountryLabel, HERO_SMS_COUNTRY_LABEL),
      };
    }

    function resolveCountryCandidates(state = {}) {
      const primary = resolveCountryConfig(state);
      const fallbackList = normalizeCountryFallbackList(state.heroSmsCountryFallback);
      const seen = new Set([primary.id]);
      const candidates = [primary];

      fallbackList.forEach((entry) => {
        const nextId = normalizeCountryId(entry.id, 0);
        if (!Number.isFinite(nextId) || nextId <= 0 || seen.has(nextId)) {
          return;
        }
        seen.add(nextId);
        candidates.push({
          id: nextId,
          label: normalizeCountryLabel(entry.label, `Country #${nextId}`),
        });
      });

      return candidates;
    }

    function normalizeActivation(record) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return null;
      }
      const provider = normalizePhoneSmsProvider(record.provider || '');
      const activationId = String(
        record.activationId ?? record.id ?? record.activation ?? ''
      ).trim();
      const rawPhoneNumber = String(
        record.phoneNumber ?? record.number ?? record.phone ?? ''
      ).trim();
      const phoneNumber = normalizePhoneNumberForProvider(rawPhoneNumber, provider);
      if (!activationId || !phoneNumber) {
        return null;
      }
      const statusAction = String(record.statusAction || '').trim();
      const countryLabel = String(record.countryLabel || '').trim();
      const countryCode = normalizeFiveSimCountryCode(
        record.countryCode ?? record.country ?? record.countryId ?? '',
        provider === PHONE_SMS_PROVIDER_5SIM ? (DEFAULT_FIVE_SIM_COUNTRY_ORDER[0] || 'thailand') : ''
      );
      const defaultServiceCode = provider === PHONE_SMS_PROVIDER_5SIM
        ? DEFAULT_FIVE_SIM_PRODUCT
        : (provider === PHONE_SMS_PROVIDER_NEXSMS ? DEFAULT_NEX_SMS_SERVICE_CODE : HERO_SMS_SERVICE_CODE);
      return {
        activationId,
        phoneNumber,
        provider,
        serviceCode: String(record.serviceCode || defaultServiceCode).trim() || defaultServiceCode,
        countryId: provider === PHONE_SMS_PROVIDER_5SIM
          ? countryCode
          : (
            provider === PHONE_SMS_PROVIDER_NEXSMS
              ? normalizeNexSmsCountryId(record.countryId ?? record.country, 0)
              : normalizeCountryId(record.countryId, HERO_SMS_COUNTRY_ID)
          ),
        ...(provider === PHONE_SMS_PROVIDER_5SIM && countryCode ? { countryCode } : {}),
        ...(countryLabel ? { countryLabel } : {}),
        successfulUses: normalizeUseCount(record.successfulUses),
        maxUses: Math.max(
          1,
          Math.floor(
            Number(record.maxUses)
            || (provider === PHONE_SMS_PROVIDER_NEXSMS ? 1 : DEFAULT_PHONE_NUMBER_MAX_USES)
          )
        ),
        ...(statusAction ? { statusAction } : {}),
      };
    }

    function normalizeActivationFallback(record) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return null;
      }

      const fallback = {};
      const provider = normalizePhoneSmsProvider(record.provider || '');
      const serviceCode = String(record.serviceCode || '').trim();
      const countryId = provider === PHONE_SMS_PROVIDER_5SIM
        ? normalizeFiveSimCountryCode(record.countryId || record.countryCode || record.country || '', '')
        : (
          provider === PHONE_SMS_PROVIDER_NEXSMS
            ? normalizeNexSmsCountryId(record.countryId ?? record.country, -1)
            : Math.floor(Number(record.countryId))
        );
      const countryLabel = String(record.countryLabel || '').trim();
      const statusAction = String(record.statusAction || '').trim();

      if (provider) {
        fallback.provider = provider;
      }
      if (serviceCode) {
        fallback.serviceCode = serviceCode;
      }
      if (
        (provider === PHONE_SMS_PROVIDER_5SIM && countryId)
        || (provider === PHONE_SMS_PROVIDER_NEXSMS && Number.isFinite(countryId) && countryId >= 0)
        || (
          provider !== PHONE_SMS_PROVIDER_5SIM
          && provider !== PHONE_SMS_PROVIDER_NEXSMS
          && Number.isFinite(countryId)
          && countryId > 0
        )
      ) {
        fallback.countryId = countryId;
        if (provider === PHONE_SMS_PROVIDER_5SIM) {
          fallback.countryCode = countryId;
        }
      }
      if (countryLabel) {
        fallback.countryLabel = countryLabel;
      }
      if (Object.prototype.hasOwnProperty.call(record, 'successfulUses')) {
        fallback.successfulUses = normalizeUseCount(record.successfulUses);
      }
      if (Object.prototype.hasOwnProperty.call(record, 'maxUses')) {
        fallback.maxUses = Math.max(1, Math.floor(Number(record.maxUses) || DEFAULT_PHONE_NUMBER_MAX_USES));
      }
      if (statusAction) {
        fallback.statusAction = statusAction;
      }

      return Object.keys(fallback).length ? fallback : null;
    }

    function describeHeroSmsPayload(raw) {
      if (typeof raw === 'string') {
        return raw.trim();
      }
      if (raw && typeof raw === 'object') {
        if (raw.title || raw.details) {
          const title = String(raw.title || '').trim();
          const details = String(raw.details || '').trim();
          return details ? `${title}: ${details}` : title;
        }
        if (raw.status === 'false' && raw.msg) {
          return String(raw.msg).trim();
        }
        try {
          return JSON.stringify(raw);
        } catch {
          return String(raw);
        }
      }
      return String(raw || '').trim();
    }

    function parseHeroSmsPayload(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) {
        return '';
      }
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          return JSON.parse(trimmed);
        } catch {
          return trimmed;
        }
      }
      return trimmed;
    }

    function parseFiveSimPayload(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) {
        return '';
      }
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }

    function describeFiveSimPayload(raw) {
      if (typeof raw === 'string') {
        return raw.trim();
      }
      if (raw && typeof raw === 'object') {
        const message = String(raw.message || raw.error || raw.msg || raw.statusText || '').trim();
        if (message) {
          return message;
        }
        try {
          return JSON.stringify(raw);
        } catch {
          return String(raw);
        }
      }
      return String(raw || '').trim();
    }

    function parseNexSmsPayload(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) {
        return '';
      }
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }

    function describeNexSmsPayload(raw) {
      if (typeof raw === 'string') {
        return raw.trim();
      }
      if (raw && typeof raw === 'object') {
        const message = String(raw.message || raw.error || raw.msg || raw.statusText || '').trim();
        if (message) {
          return message;
        }
        try {
          return JSON.stringify(raw);
        } catch {
          return String(raw);
        }
      }
      return String(raw || '').trim();
    }

    function isNexSmsSuccessPayload(payload) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return false;
      }
      return Number(payload.code) === 0 || payload.success === true;
    }

    function buildHeroSmsUrl(baseUrl, query = {}) {
      const url = new URL(normalizeUrl(baseUrl));
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
          return;
        }
        url.searchParams.set(key, String(value));
      });
      return url.toString();
    }

    function buildPhoneCodeTimeoutError(lastResponse = '') {
      const suffix = lastResponse ? ` Last HeroSMS status: ${lastResponse}` : '';
      return new Error(`${PHONE_CODE_TIMEOUT_ERROR_PREFIX}Timed out waiting for the phone verification code.${suffix}`);
    }

    function isPhoneCodeTimeoutError(error) {
      return String(error?.message || '').startsWith(PHONE_CODE_TIMEOUT_ERROR_PREFIX);
    }

    function isPhoneResendThrottledError(error) {
      const message = String(error?.message || error || '').trim();
      if (!message) {
        return false;
      }
      if (message.startsWith(PHONE_RESEND_THROTTLED_ERROR_PREFIX)) {
        return true;
      }
      return /tried\s+to\s+resend\s+too\s+many\s+times|please\s+try\s+again\s+later|too\s+many\s+resend|resend\s+too\s+many|发送.*过于频繁|稍后再试/i.test(message);
    }

    function buildPhoneRestartStep7Error(phoneNumber = '') {
      const suffix = phoneNumber ? ` Current number: ${phoneNumber}.` : '';
      return new Error(
        `${PHONE_RESTART_STEP7_ERROR_PREFIX}Phone verification could not receive an SMS after resend. Restart step 7 with a new number.${suffix}`
      );
    }

    function sanitizePhoneCodeTimeoutError(error) {
      const message = String(error?.message || '');
      if (!message.startsWith(PHONE_CODE_TIMEOUT_ERROR_PREFIX)) {
        return error;
      }
      return new Error(message.slice(PHONE_CODE_TIMEOUT_ERROR_PREFIX.length).trim() || 'Timed out waiting for the phone verification code.');
    }

    function sanitizePhoneRestartStep7Error(error) {
      const message = String(error?.message || '');
      if (!message.startsWith(PHONE_RESTART_STEP7_ERROR_PREFIX)) {
        return error;
      }
      return new Error(
        message.slice(PHONE_RESTART_STEP7_ERROR_PREFIX.length).trim()
        || 'Phone verification could not receive an SMS after resend. Restart step 7 with a new number.'
      );
    }

    async function fetchHeroSmsPayload(config, query, actionLabel) {
      const requestUrl = buildHeroSmsUrl(config.baseUrl, {
        api_key: config.apiKey,
        ...query,
      });
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), DEFAULT_PHONE_REQUEST_TIMEOUT_MS)
        : null;

      try {
        const response = await fetchImpl(requestUrl, {
          method: 'GET',
          signal: controller?.signal,
        });
        const text = await response.text();
        const payload = parseHeroSmsPayload(text);
        if (!response.ok) {
          const requestError = new Error(`${actionLabel} failed: ${describeHeroSmsPayload(payload) || response.status}`);
          requestError.payload = payload;
          requestError.status = response.status;
          throw requestError;
        }
        return payload;
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error(`${actionLabel} timed out.`);
        }
        throw error;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    async function fetchFiveSimPayload(config, path, actionLabel, options = {}) {
      const requestUrl = new URL(
        path.replace(/^\/+/, ''),
        `${config.baseUrl.replace(/\/+$/, '')}/`
      );
      const query = options?.query && typeof options.query === 'object' ? options.query : {};
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
          return;
        }
        requestUrl.searchParams.set(key, String(value));
      });
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), DEFAULT_PHONE_REQUEST_TIMEOUT_MS)
        : null;
      try {
        const response = await fetchImpl(requestUrl.toString(), {
          method: String(options.method || 'GET').trim().toUpperCase() || 'GET',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            Accept: 'application/json',
          },
          signal: controller?.signal,
        });
        const text = await response.text();
        const payload = parseFiveSimPayload(text);
        if (!response.ok) {
          const requestError = new Error(`${actionLabel} failed: ${describeFiveSimPayload(payload) || response.status}`);
          requestError.payload = payload;
          requestError.status = response.status;
          throw requestError;
        }
        return payload;
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error(`${actionLabel} timed out.`);
        }
        throw error;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    async function fetchNexSmsPayload(config, path, actionLabel, options = {}) {
      const method = String(options.method || 'GET').trim().toUpperCase() || 'GET';
      const requestUrl = new URL(
        path.replace(/^\/+/, ''),
        `${config.baseUrl.replace(/\/+$/, '')}/`
      );
      requestUrl.searchParams.set('apiKey', config.apiKey);
      const query = options?.query && typeof options.query === 'object' ? options.query : {};
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
          return;
        }
        requestUrl.searchParams.set(key, String(value));
      });
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), DEFAULT_PHONE_REQUEST_TIMEOUT_MS)
        : null;
      try {
        const headers = {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'application/json',
          ...(options.headers && typeof options.headers === 'object' ? options.headers : {}),
        };
        const requestInit = {
          method,
          headers,
          signal: controller?.signal,
        };
        if (method !== 'GET' && method !== 'HEAD' && options.body !== undefined) {
          requestInit.body = typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body);
          if (!requestInit.headers['Content-Type']) {
            requestInit.headers['Content-Type'] = 'application/json';
          }
        }
        const response = await fetchImpl(requestUrl.toString(), {
          ...requestInit,
        });
        const text = await response.text();
        const payload = parseNexSmsPayload(text);
        if (!response.ok) {
          const requestError = new Error(`${actionLabel} failed: ${describeNexSmsPayload(payload) || response.status}`);
          requestError.payload = payload;
          requestError.status = response.status;
          throw requestError;
        }
        return payload;
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error(`${actionLabel} timed out.`);
        }
        throw error;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    function resolvePhoneConfig(state = {}) {
      const provider = normalizePhoneSmsProvider(state?.phoneSmsProvider || DEFAULT_PHONE_SMS_PROVIDER);
      const apiKey = normalizeApiKey(
        provider === PHONE_SMS_PROVIDER_5SIM
          ? state.fiveSimApiKey
          : (provider === PHONE_SMS_PROVIDER_NEXSMS ? state.nexSmsApiKey : state.heroSmsApiKey)
      );
      if (!apiKey) {
        if (provider === PHONE_SMS_PROVIDER_5SIM) {
          throw new Error('5sim API key is missing. Save it in the side panel before running the phone flow.');
        }
        if (provider === PHONE_SMS_PROVIDER_NEXSMS) {
          throw new Error('NexSMS API key is missing. Save it in the side panel before running the phone flow.');
        }
        throw new Error('HeroSMS API key is missing. Save it in the side panel before running the phone flow.');
      }
      if (provider === PHONE_SMS_PROVIDER_5SIM) {
        return {
          provider,
          apiKey,
          baseUrl: normalizeFiveSimBaseUrl(state?.fiveSimBaseUrl, DEFAULT_FIVE_SIM_BASE_URL),
          countryOrder: normalizeFiveSimCountryOrder(state?.fiveSimCountryOrder || DEFAULT_FIVE_SIM_COUNTRY_ORDER),
          countryCandidates: resolveFiveSimCountryCandidates(state),
          operator: normalizeFiveSimOperator(state?.fiveSimOperator, DEFAULT_FIVE_SIM_OPERATOR),
          product: normalizeFiveSimProduct(state?.fiveSimProduct, DEFAULT_FIVE_SIM_PRODUCT),
        };
      }
      if (provider === PHONE_SMS_PROVIDER_NEXSMS) {
        return {
          provider,
          apiKey,
          baseUrl: normalizeNexSmsBaseUrl(state?.nexSmsBaseUrl, DEFAULT_NEX_SMS_BASE_URL),
          countryOrder: normalizeNexSmsCountryOrder(state?.nexSmsCountryOrder || DEFAULT_NEX_SMS_COUNTRY_ORDER),
          countryCandidates: resolveNexSmsCountryCandidates(state),
          serviceCode: normalizeNexSmsServiceCode(state?.nexSmsServiceCode, DEFAULT_NEX_SMS_SERVICE_CODE),
        };
      }
      return {
        provider,
        apiKey,
        baseUrl: normalizeUrl(state.heroSmsBaseUrl, DEFAULT_HERO_SMS_BASE_URL),
      };
    }

    function parseActivationPayload(payload, fallback = null) {
      const normalizedFallback = normalizeActivation(fallback) || normalizeActivationFallback(fallback);
      const directActivation = normalizeActivation(payload);
      if (directActivation) {
        const statusAction = normalizedFallback?.statusAction || directActivation.statusAction;
          return {
            ...directActivation,
            provider: normalizedFallback?.provider || directActivation.provider,
            serviceCode: normalizedFallback?.serviceCode || directActivation.serviceCode,
            countryId: normalizedFallback?.countryId || directActivation.countryId,
            ...(
              normalizedFallback?.countryLabel || directActivation.countryLabel
                ? { countryLabel: normalizedFallback?.countryLabel || directActivation.countryLabel }
                : {}
            ),
            successfulUses: normalizedFallback?.successfulUses ?? directActivation.successfulUses,
            maxUses: normalizedFallback?.maxUses ?? directActivation.maxUses,
            ...(statusAction ? { statusAction } : {}),
          };
        }

      const text = describeHeroSmsPayload(payload);
      const accessNumberMatch = text.match(/^ACCESS_NUMBER:([^:]+):(.+)$/i);
      if (accessNumberMatch) {
          return {
            activationId: String(accessNumberMatch[1] || '').trim(),
            phoneNumber: String(accessNumberMatch[2] || '').trim(),
            provider: normalizedFallback?.provider || 'hero-sms',
            serviceCode: normalizedFallback?.serviceCode || HERO_SMS_SERVICE_CODE,
            countryId: normalizedFallback?.countryId || HERO_SMS_COUNTRY_ID,
            ...(normalizedFallback?.countryLabel ? { countryLabel: normalizedFallback.countryLabel } : {}),
            successfulUses: normalizedFallback?.successfulUses ?? 0,
            maxUses: normalizedFallback?.maxUses ?? DEFAULT_PHONE_NUMBER_MAX_USES,
            ...(normalizedFallback?.statusAction ? { statusAction: normalizedFallback.statusAction } : {}),
          };
        }

      if (/^ACCESS_READY$/i.test(text) && normalizedFallback) {
        return normalizedFallback;
      }

      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const activationId = String(payload.id || payload.activationId || '').trim();
        const phoneNumber = String(payload.phone || payload.phoneNumber || payload.number || '').trim().replace(/^\+/, '');
        if (activationId && phoneNumber) {
          return {
            activationId,
            phoneNumber,
            provider: normalizedFallback?.provider || PHONE_SMS_PROVIDER_5SIM,
            serviceCode: normalizedFallback?.serviceCode || HERO_SMS_SERVICE_CODE,
            countryId: normalizedFallback?.countryId || HERO_SMS_COUNTRY_ID,
            ...(normalizedFallback?.countryLabel ? { countryLabel: normalizedFallback.countryLabel } : {}),
            successfulUses: normalizedFallback?.successfulUses ?? 0,
            maxUses: normalizedFallback?.maxUses ?? DEFAULT_PHONE_NUMBER_MAX_USES,
            ...(normalizedFallback?.statusAction ? { statusAction: normalizedFallback.statusAction } : {}),
          };
        }
      }

      return null;
    }

    function resolveActivationStatusAction(activation) {
      return activation?.statusAction === 'getStatusV2' ? 'getStatusV2' : 'getStatus';
    }

    function normalizeHeroSmsPrice(value) {
      const price = Number(value);
      if (!Number.isFinite(price) || price < 0) {
        return null;
      }
      return price;
    }

    function collectHeroSmsPriceCandidates(payload, candidates = []) {
      if (Array.isArray(payload)) {
        payload.forEach((entry) => collectHeroSmsPriceCandidates(entry, candidates));
        return candidates;
      }
      if (!payload || typeof payload !== 'object') {
        return candidates;
      }

      for (const [key, value] of Object.entries(payload)) {
        const keyedPrice = normalizeHeroSmsPrice(key);
        if (keyedPrice !== null && keyedPrice > 0 && keyedPrice <= 1) {
          const directCount = Number(value);
          const countValue = value && typeof value === 'object'
            ? (value.count ?? value.physicalCount ?? value.available ?? value.total)
            : undefined;
          const nestedCount = Number(countValue);
          const hasDirectCount = Number.isFinite(directCount);
          const hasNestedCount = countValue !== undefined && Number.isFinite(nestedCount);
          if ((!hasDirectCount && !hasNestedCount) || directCount > 0 || nestedCount > 0) {
            candidates.push(keyedPrice);
          }
        }
      }

      const cost = normalizeHeroSmsPrice(
        payload.cost
        ?? payload.price
        ?? payload.amount
        ?? payload.maxPrice
        ?? payload.max_price
      );
      if (cost !== null) {
        const count = Number(payload.count);
        const physicalCount = Number(payload.physicalCount);
        const available = Number(payload.available);
        const total = Number(payload.total);
        const hasCount = Number.isFinite(count);
        const hasPhysicalCount = Number.isFinite(physicalCount);
        const hasAvailable = Number.isFinite(available);
        const hasTotal = Number.isFinite(total);
        if (
          (!hasCount && !hasPhysicalCount && !hasAvailable && !hasTotal)
          || count > 0
          || physicalCount > 0
          || available > 0
          || total > 0
        ) {
          candidates.push(cost);
        }
      }

      Object.values(payload).forEach((value) => collectHeroSmsPriceCandidates(value, candidates));
      return candidates;
    }

    function findLowestHeroSmsPrice(payload) {
      const candidates = collectHeroSmsPriceCandidates(payload, []);
      if (!candidates.length) {
        return null;
      }
      return Math.min(...candidates);
    }

    function buildSortedUniquePriceCandidates(values = []) {
      return Array.from(
        new Set(
          values
            .map((value) => normalizeHeroSmsPrice(value))
            .filter((value) => value !== null)
            .map((value) => Math.round(value * 10000) / 10000)
        )
      )
        .sort((left, right) => left - right)
        .slice(0, MAX_PHONE_PRICE_CANDIDATES);
    }

    function isHeroSmsNoNumbersPayload(payload) {
      return /\bNO_NUMBERS\b/i.test(describeHeroSmsPayload(payload));
    }

    function extractHeroSmsWrongMaxPrice(payload) {
      if (payload && typeof payload === 'object') {
        const title = String(payload.title || '').trim();
        const minPrice = normalizeHeroSmsPrice(payload.info?.min);
        if (/^WRONG_MAX_PRICE$/i.test(title) && minPrice !== null) {
          return minPrice;
        }
      }

      const text = describeHeroSmsPayload(payload);
      const match = text.match(/\bWRONG_MAX_PRICE:(\d+(?:\.\d+)?)\b/i);
      if (!match) {
        return null;
      }
      return normalizeHeroSmsPrice(match[1]);
    }

    function isNetworkFetchFailure(error) {
      const message = String(error?.message || '').trim();
      return /failed to fetch|networkerror|load failed/i.test(message);
    }

    function isHeroSmsTerminalError(payloadOrMessage) {
      const text = describeHeroSmsPayload(payloadOrMessage);
      return /\bNO_BALANCE\b|\bNOT_ENOUGH_BALANCE\b|\bBAD_KEY\b|\bINVALID_KEY\b|\bBANNED\b|\bACCOUNT_BANNED\b|\bWRONG_KEY\b/i.test(text);
    }

    function collectFiveSimPriceCandidates(payload, candidates = []) {
      if (Array.isArray(payload)) {
        payload.forEach((entry) => collectFiveSimPriceCandidates(entry, candidates));
        return candidates;
      }
      if (!payload || typeof payload !== 'object') {
        return candidates;
      }
      const cost = Number(payload.cost);
      const count = Number(payload.count);
      if (Number.isFinite(cost) && cost > 0) {
        if (!Number.isFinite(count) || count > 0) {
          candidates.push(Math.round(cost * 10000) / 10000);
        }
      }
      Object.entries(payload).forEach(([key, value]) => {
        const keyedPrice = Number(key);
        if (!Number.isFinite(keyedPrice) || keyedPrice <= 0) {
          return;
        }
        if (value && typeof value === 'object') {
          const keyedCount = Number(value.count);
          if (!Number.isFinite(keyedCount) || keyedCount > 0) {
            candidates.push(Math.round(keyedPrice * 10000) / 10000);
          }
          return;
        }
        const numericCount = Number(value);
        if (!Number.isFinite(numericCount) || numericCount > 0) {
          candidates.push(Math.round(keyedPrice * 10000) / 10000);
        }
      });
      Object.values(payload).forEach((entry) => collectFiveSimPriceCandidates(entry, candidates));
      return candidates;
    }

    function findLowestFiveSimPrice(payload, product = DEFAULT_FIVE_SIM_PRODUCT, countryCode = '') {
      const normalizedProduct = normalizeFiveSimProduct(product, DEFAULT_FIVE_SIM_PRODUCT);
      const normalizedCountryCode = normalizeFiveSimCountryCode(countryCode, '');
      const root = payload && typeof payload === 'object'
        ? (payload[normalizedProduct] || payload)
        : {};
      const countryPayload = normalizedCountryCode
        ? (root?.[normalizedCountryCode] || root)
        : root;
      const candidates = collectFiveSimPriceCandidates(countryPayload, []);
      if (!candidates.length) {
        return null;
      }
      return Math.min(...candidates);
    }

    function isFiveSimNoNumbersError(payloadOrMessage) {
      const text = describeFiveSimPayload(payloadOrMessage);
      return /no\s+free\s+phones|no\s+phones\s+available|no\s+numbers\s+available/i.test(text);
    }

    function isFiveSimTerminalError(payloadOrMessage, status = 0) {
      if (Number(status) === 401 || Number(status) === 403) {
        return true;
      }
      const text = describeFiveSimPayload(payloadOrMessage);
      return /not\s+enough\s+balance|no\s+balance|unauthorized|invalid\s+token|forbidden|bad\s+key|wrong\s+key|banned/i.test(text);
    }

    async function resolveFiveSimLowestPrice(config, countryCode) {
      try {
        const payload = await fetchFiveSimPayload(
          config,
          '/guest/prices',
          '5sim guest prices',
          {
            query: {
              country: countryCode,
              product: config.product,
            },
          }
        );
        return findLowestFiveSimPrice(payload, config.product, countryCode);
      } catch {
        return null;
      }
    }

    function parseFiveSimActivationPayload(payload, fallback = {}) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
      }
      const activationId = String(payload.id || payload.activationId || '').trim();
      const phoneNumber = normalizePhoneNumberForProvider(payload.phone || payload.number || '', PHONE_SMS_PROVIDER_5SIM);
      if (!activationId || !phoneNumber) {
        return null;
      }

      const fallbackCountryCode = normalizeFiveSimCountryCode(
        fallback.countryCode || fallback.countryId || '',
        DEFAULT_FIVE_SIM_COUNTRY_ORDER[0] || 'thailand'
      );
      const countryCode = normalizeFiveSimCountryCode(
        payload.country || payload.country_name || payload.countryCode || payload.countryId || fallbackCountryCode,
        fallbackCountryCode
      );
      const countryLabel = String(
        payload.country_name
        || payload.countryName
        || fallback.countryLabel
        || ''
      ).trim();

      return {
        activationId,
        phoneNumber,
        provider: PHONE_SMS_PROVIDER_5SIM,
        serviceCode: normalizeFiveSimProduct(
          payload.product || fallback.serviceCode || DEFAULT_FIVE_SIM_PRODUCT,
          DEFAULT_FIVE_SIM_PRODUCT
        ),
        countryId: countryCode,
        ...(countryLabel && countryLabel !== countryCode ? { countryLabel } : {}),
        successfulUses: normalizeUseCount(payload.successfulUses ?? fallback.successfulUses ?? 0),
        maxUses: Math.max(1, Math.floor(Number(payload.maxUses ?? fallback.maxUses) || DEFAULT_PHONE_NUMBER_MAX_USES)),
      };
    }

    function isNexSmsNoNumbersError(payloadOrMessage) {
      const text = describeNexSmsPayload(payloadOrMessage);
      return /numbers?\s+not\s+found|暂无可用|no\s+numbers|no\s+stock|库存.*0|not\s+available/i.test(text);
    }

    function isNexSmsPendingMessage(payloadOrMessage) {
      const text = describeNexSmsPayload(payloadOrMessage);
      return /no\s+sms|暂无短信|waiting|not\s+arrived|empty|未收到|短信为空|no\s+records|pending/i.test(text);
    }

    function isNexSmsTerminalError(payloadOrMessage, status = 0) {
      if (Number(status) === 401 || Number(status) === 403) {
        return true;
      }
      const text = describeNexSmsPayload(payloadOrMessage);
      return /invalid\s*api\s*key|bad[_\s-]*key|wrong[_\s-]*key|unauthorized|forbidden|no\s*balance|insufficient\s*balance|余额不足|账号.*封禁|banned/i.test(text);
    }

    function collectNexSmsPriceCandidates(countryData = {}) {
      const candidates = [];
      const pushCandidate = (value) => {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0) {
          candidates.push(Math.round(numeric * 10000) / 10000);
        }
      };

      pushCandidate(countryData.minPrice);
      pushCandidate(countryData.medianPrice);
      pushCandidate(countryData.maxPrice);

      if (countryData.priceMap && typeof countryData.priceMap === 'object') {
        Object.entries(countryData.priceMap).forEach(([priceKey, count]) => {
          const availableCount = Number(count);
          if (!Number.isFinite(availableCount) || availableCount <= 0) {
            return;
          }
          pushCandidate(priceKey);
        });
      }

      return buildSortedUniquePriceCandidates(candidates);
    }

    async function resolveNexSmsCountryPricePlan(config, countryConfig, state = {}) {
      const countryId = normalizeNexSmsCountryId(countryConfig?.id, -1);
      if (countryId < 0) {
        throw new Error(`NexSMS countryId is invalid: ${countryConfig?.id}`);
      }
      const payload = await fetchNexSmsPayload(
        config,
        '/api/getCountryByService',
        'NexSMS getCountryByService',
        {
          query: {
            serviceCode: config.serviceCode,
            countryId,
          },
        }
      );
      if (!isNexSmsSuccessPayload(payload)) {
        throw new Error(`NexSMS getCountryByService failed: ${describeNexSmsPayload(payload) || 'empty response'}`);
      }
      const countryData = (payload && typeof payload === 'object' && !Array.isArray(payload))
        ? (payload.data || {})
        : {};
      const countryLabel = normalizeCountryLabel(
        countryData.countryName || countryConfig?.label,
        `Country #${countryId}`
      );
      const prices = collectNexSmsPriceCandidates(countryData);
      const minCatalogPrice = prices.length
        ? prices[0]
        : (() => {
          const minPrice = Number(countryData.minPrice);
          return Number.isFinite(minPrice) && minPrice > 0
            ? Math.round(minPrice * 10000) / 10000
            : null;
        })();
      const userLimit = normalizeHeroSmsPriceLimit(state?.heroSmsMaxPrice);
      const filteredPrices = userLimit === null
        ? prices
        : prices.filter((price) => price <= userLimit);

      return {
        countryId,
        countryLabel,
        prices: filteredPrices,
        userLimit,
        minCatalogPrice,
        rawPayload: payload,
      };
    }

    function parseNexSmsActivationPayload(payload, fallback = {}) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
      }
      if (!isNexSmsSuccessPayload(payload)) {
        return null;
      }
      const data = payload.data || {};
      const phoneCandidates = Array.isArray(data.phoneNumbers)
        ? data.phoneNumbers
        : (Array.isArray(data.numbers) ? data.numbers : []);
      const phoneNumber = normalizePhoneNumberForProvider(
        data.phoneNumber
        || data.phone
        || phoneCandidates[0]
        || fallback.phoneNumber
        || '',
        PHONE_SMS_PROVIDER_NEXSMS
      );
      if (!phoneNumber) {
        return null;
      }
      const countryId = normalizeNexSmsCountryId(
        data.countryId ?? fallback.countryId,
        0
      );
      const countryLabel = normalizeCountryLabel(
        data.countryName || fallback.countryLabel,
        `Country #${countryId}`
      );
      const serviceCode = normalizeNexSmsServiceCode(
        data.serviceCode || fallback.serviceCode || DEFAULT_NEX_SMS_SERVICE_CODE,
        DEFAULT_NEX_SMS_SERVICE_CODE
      );
      return {
        activationId: phoneNumber,
        phoneNumber,
        provider: PHONE_SMS_PROVIDER_NEXSMS,
        serviceCode,
        countryId,
        countryLabel,
        successfulUses: normalizeUseCount(fallback.successfulUses ?? 0),
        maxUses: 1,
      };
    }

    async function resolveCheapestPhoneActivationPrice(config, countryConfig) {
      for (let attempt = 1; attempt <= DEFAULT_PHONE_PRICE_LOOKUP_ATTEMPTS; attempt += 1) {
        try {
          const payload = await fetchHeroSmsPayload(config, {
            action: 'serviceCountRent',
            service: HERO_SMS_SERVICE_CODE,
            country: countryConfig.id,
          }, 'HeroSMS serviceCountRent');
          const price = findLowestHeroSmsPrice(payload);
          if (price !== null) {
            return price;
          }
        } catch (_) {
          // Best-effort lookup only.
        }
      }
      return null;
    }

    async function persistHeroSmsPricePlanSnapshot(countryConfig, pricePlan) {
      if (typeof setState !== 'function') {
        return;
      }
      const prices = Array.isArray(pricePlan?.prices)
        ? pricePlan.prices.filter((price) => Number.isFinite(Number(price)))
        : [];
      const userLimit = pricePlan?.userLimit === null || pricePlan?.userLimit === undefined
        ? ''
        : String(pricePlan.userLimit);
      await setState({
        [HERO_SMS_LAST_PRICE_TIERS_KEY]: prices,
        [HERO_SMS_LAST_PRICE_COUNTRY_ID_KEY]: normalizeCountryId(countryConfig?.id, 0),
        [HERO_SMS_LAST_PRICE_COUNTRY_LABEL_KEY]: normalizeCountryLabel(countryConfig?.label, HERO_SMS_COUNTRY_LABEL),
        [HERO_SMS_LAST_PRICE_USER_LIMIT_KEY]: userLimit,
        [HERO_SMS_LAST_PRICE_AT_KEY]: Date.now(),
      });
    }

    async function resolvePhoneActivationPricePlan(config, countryConfig, state = {}) {
      const userLimit = normalizeHeroSmsPriceLimit(state.heroSmsMaxPrice);
      const userMinPrice = normalizeHeroSmsPriceLimit(state.heroSmsMinPrice);
      let priceCandidates = [];

      for (let attempt = 1; attempt <= DEFAULT_PHONE_PRICE_LOOKUP_ATTEMPTS; attempt += 1) {
        try {
          const payload = await fetchHeroSmsPayload(config, {
            action: 'serviceCountRent',
            service: HERO_SMS_SERVICE_CODE,
            country: countryConfig.id,
          }, 'HeroSMS serviceCountRent');
          priceCandidates = buildSortedUniquePriceCandidates(
            collectHeroSmsPriceCandidates(payload, [])
          );
          if (priceCandidates.length > 0) {
            break;
          }
        } catch (_) {
          // best effort
        }
      }

      const minCatalogPrice = priceCandidates.length > 0 ? priceCandidates[0] : null;
      const minBoundedCandidates = userMinPrice !== null
        ? priceCandidates.filter((price) => price >= userMinPrice)
        : priceCandidates;
      if (userMinPrice !== null && priceCandidates.length > 0 && minBoundedCandidates.length === 0) {
        const minLimitedPlan = { prices: [], userLimit, userMinPrice, minCatalogPrice };
        await persistHeroSmsPricePlanSnapshot(countryConfig, minLimitedPlan);
        return minLimitedPlan;
      }
      if (userLimit !== null) {
        const bounded = minBoundedCandidates.filter((price) => price <= userLimit);
        if (bounded.length > 0) {
          const boundedPlan = { prices: bounded, userLimit, userMinPrice, minCatalogPrice };
          await persistHeroSmsPricePlanSnapshot(countryConfig, boundedPlan);
          return boundedPlan;
        }
        const userLimitedPlan = userMinPrice !== null && userLimit < userMinPrice
          ? { prices: [], userLimit, userMinPrice, minCatalogPrice }
          : { prices: [userLimit], userLimit, userMinPrice, minCatalogPrice };
        await persistHeroSmsPricePlanSnapshot(countryConfig, userLimitedPlan);
        return userLimitedPlan;
      }

      if (minBoundedCandidates.length > 0) {
        const plan = { prices: minBoundedCandidates, userLimit: null, userMinPrice, minCatalogPrice };
        await persistHeroSmsPricePlanSnapshot(countryConfig, plan);
        return plan;
      }
      const fallbackPlan = { prices: [null], userLimit: null, userMinPrice, minCatalogPrice: null };
      await persistHeroSmsPricePlanSnapshot(countryConfig, fallbackPlan);
      return fallbackPlan;
    }

    async function fetchPhoneActivationPayload(config, countryConfig, action, options = {}) {
      const query = {
        action,
        service: HERO_SMS_SERVICE_CODE,
        country: countryConfig.id,
      };
      if (options.maxPrice !== null && options.maxPrice !== undefined) {
        query.maxPrice = options.maxPrice;
        query.fixedPrice = 'true';
      }
      return fetchHeroSmsPayload(config, query, `HeroSMS ${action}`);
    }

    async function requestPhoneActivationWithPrice(config, countryConfig, action, maxPrice, options = {}) {
      let nextMaxPrice = maxPrice;
      let retriedWithUpdatedPrice = false;
      let retriedWithoutPrice = false;
      const userLimit = normalizeHeroSmsPriceLimit(options.userLimit);

      while (true) {
        try {
          return await fetchPhoneActivationPayload(config, countryConfig, action, {
            maxPrice: nextMaxPrice,
          });
        } catch (error) {
          const updatedMaxPrice = extractHeroSmsWrongMaxPrice(error?.payload || error?.message);
          if (
            nextMaxPrice !== null
            && nextMaxPrice !== undefined
            && !retriedWithUpdatedPrice
            && updatedMaxPrice !== null
          ) {
            if (userLimit !== null && updatedMaxPrice > userLimit) {
              throw new Error(
                `HeroSMS ${action} failed: WRONG_MAX_PRICE requires ${updatedMaxPrice}, which exceeds configured maxPrice=${userLimit}.`
              );
            }
            nextMaxPrice = updatedMaxPrice;
            retriedWithUpdatedPrice = true;
            continue;
          }

          if (
            nextMaxPrice !== null
            && nextMaxPrice !== undefined
            && !retriedWithoutPrice
            && isNetworkFetchFailure(error)
          ) {
            nextMaxPrice = null;
            retriedWithoutPrice = true;
            continue;
          }

          throw error;
        }
      }
    }

    async function requestFiveSimActivation(state = {}, options = {}) {
      const config = resolvePhoneConfig(state);
      const allCountryCandidates = Array.isArray(config.countryCandidates) && config.countryCandidates.length
        ? config.countryCandidates
        : resolveFiveSimCountryCandidates(state);
      if (!allCountryCandidates.length) {
        throw new Error('Step 9: 5sim countries are empty. Please select at least one country in 接码设置。');
      }
      const blockedCountryIds = new Set(
        (Array.isArray(options?.blockedCountryIds) ? options.blockedCountryIds : [])
          .map((value) => normalizeFiveSimCountryCode(value, ''))
          .filter(Boolean)
      );
      let countryCandidates = allCountryCandidates.filter(
        (entry) => !blockedCountryIds.has(normalizeFiveSimCountryCode(entry.code || entry.id || '', ''))
      );
      if (!countryCandidates.length) {
        countryCandidates = allCountryCandidates;
        if (blockedCountryIds.size) {
          await addLog(
            'Step 9: all selected countries reached the temporary SMS-failure skip threshold, lifting skip for this acquire round.',
            'warn'
          );
        }
      }

      const maxPriceLimit = normalizeHeroSmsPriceLimit(state.heroSmsMaxPrice);
      const configuredAcquireRounds = normalizePhoneActivationRetryRounds(state?.heroSmsActivationRetryRounds);
      const maxAcquireRounds = Math.max(2, configuredAcquireRounds);
      const retryDelayMs = normalizePhoneActivationRetryDelayMs(state?.heroSmsActivationRetryDelayMs);
      let finalNoNumbersByCountry = [];
      let finalLastError = null;

      for (let round = 1; round <= maxAcquireRounds; round += 1) {
        if (maxAcquireRounds > 1) {
          await addLog(
            `Step 9: 5sim acquiring phone number (round ${round}/${maxAcquireRounds})...`,
            'info'
          );
        }
        const noNumbersByCountry = [];
        const retryableNoNumberCountries = [];
        let lastError = null;

        for (const countryConfig of countryCandidates) {
          const countryCode = normalizeFiveSimCountryCode(countryConfig.code || countryConfig.id || '', DEFAULT_FIVE_SIM_COUNTRY_ORDER[0] || 'thailand');
          const countryLabel = String(countryConfig.label || countryCode).trim() || countryCode;
          let guestPricesPayload = null;
          try {
            guestPricesPayload = await fetchFiveSimPayload(
              config,
              '/guest/prices',
              '5sim guest prices',
              {
                query: {
                  country: countryCode,
                  product: config.product,
                },
              }
            );
          } catch (_) {
            guestPricesPayload = null;
          }

          const rawPriceCandidates = buildSortedUniquePriceCandidates(
            collectFiveSimPriceCandidates(
              (
                guestPricesPayload
                && typeof guestPricesPayload === 'object'
                && !Array.isArray(guestPricesPayload)
                  ? (guestPricesPayload?.[config.product]?.[countryCode] || guestPricesPayload?.[countryCode] || guestPricesPayload)
                  : guestPricesPayload
              ),
              []
            )
          );
          const boundedPriceCandidates = maxPriceLimit === null
            ? rawPriceCandidates
            : rawPriceCandidates.filter((price) => Number(price) <= maxPriceLimit);
          const pricesToTry = boundedPriceCandidates.length
            ? boundedPriceCandidates
            : (maxPriceLimit !== null ? [maxPriceLimit] : [null]);

          let acquiredActivation = null;
          let countryNoNumbersText = '';
          for (const candidatePrice of pricesToTry) {
            try {
              const payload = await fetchFiveSimPayload(
                config,
                `user/buy/activation/${countryCode}/${config.operator}/${config.product}`,
                '5sim buy activation',
                {
                  query: {
                    ...(candidatePrice !== null && candidatePrice !== undefined ? { maxPrice: candidatePrice } : {}),
                    ...(normalizeHeroSmsReuseEnabled(state.heroSmsReuseEnabled) ? { reuse: 1 } : {}),
                  },
                }
              );
              const activation = parseFiveSimActivationPayload(payload, {
                countryCode,
                countryLabel,
                serviceCode: config.product,
              });
              if (activation) {
                acquiredActivation = activation;
                break;
              }
              const payloadText = describeFiveSimPayload(payload);
              if (isFiveSimNoNumbersError(payload)) {
                countryNoNumbersText = payloadText || countryNoNumbersText || 'no free phones';
                continue;
              }
              if (isFiveSimTerminalError(payload)) {
                throw new Error(`5sim buy activation failed: ${payloadText || 'empty response'}`);
              }
              lastError = new Error(`5sim buy activation failed: ${payloadText || 'empty response'}`);
            } catch (error) {
              if (isFiveSimTerminalError(error?.payload || error?.message, error?.status)) {
                throw new Error(`5sim buy activation failed: ${describeFiveSimPayload(error?.payload || error?.message) || 'unknown terminal error'}`);
              }
              if (isFiveSimNoNumbersError(error?.payload || error?.message)) {
                countryNoNumbersText = describeFiveSimPayload(error?.payload || error?.message) || countryNoNumbersText || 'no free phones';
                continue;
              }
              lastError = error;
            }
          }

          if (acquiredActivation) {
            return acquiredActivation;
          }

          const lowestPrice = rawPriceCandidates.length ? rawPriceCandidates[0] : await resolveFiveSimLowestPrice(config, countryCode);
          if (maxPriceLimit !== null && lowestPrice !== null && Number(lowestPrice) > Number(maxPriceLimit)) {
            noNumbersByCountry.push(
              `${countryLabel}: no numbers within maxPrice=${maxPriceLimit}; lowest listed=${lowestPrice}`
            );
          } else {
            noNumbersByCountry.push(`${countryLabel}: ${countryNoNumbersText || 'no free phones'}`);
            retryableNoNumberCountries.push(countryLabel);
          }
        }

        finalNoNumbersByCountry = noNumbersByCountry;
        finalLastError = lastError;

        if (
          noNumbersByCountry.length
          && round < maxAcquireRounds
          && retryableNoNumberCountries.length > 0
        ) {
          await addLog(
            `Step 9: 5sim has no available numbers (round ${round}/${maxAcquireRounds}); retrying in ${Math.ceil(retryDelayMs / 1000)}s. Countries: ${retryableNoNumberCountries.join(', ')}.`,
            'warn'
          );
          await sleepWithStop(retryDelayMs);
          continue;
        }

        break;
      }

      if (finalNoNumbersByCountry.length) {
        throw new Error(
          `5sim no numbers available across ${countryCandidates.length} country candidate(s): ${finalNoNumbersByCountry.join(' | ')}.`
        );
      }
      if (finalLastError) {
        throw finalLastError;
      }
      throw new Error('5sim failed to acquire a phone number.');
    }

    async function requestNexSmsActivation(state = {}, options = {}) {
      const config = resolvePhoneConfig(state);
      const allCountryCandidates = Array.isArray(config.countryCandidates) && config.countryCandidates.length
        ? config.countryCandidates
        : resolveNexSmsCountryCandidates(state);
      if (!allCountryCandidates.length) {
        throw new Error('Step 9: NexSMS countries are empty. Please select at least one country in 接码设置。');
      }
      const blockedCountryIds = new Set(
        (Array.isArray(options?.blockedCountryIds) ? options.blockedCountryIds : [])
          .map((value) => normalizeNexSmsCountryId(value, -1))
          .filter((id) => id >= 0)
      );
      let countryCandidates = allCountryCandidates.filter((entry) => {
        const id = normalizeNexSmsCountryId(entry.id, -1);
        return id >= 0 && !blockedCountryIds.has(id);
      });
      if (!countryCandidates.length) {
        countryCandidates = allCountryCandidates;
        if (blockedCountryIds.size) {
          await addLog(
            'Step 9: all selected countries reached the temporary SMS-failure skip threshold, lifting skip for this acquire round.',
            'warn'
          );
        }
      }

      const configuredAcquireRounds = normalizePhoneActivationRetryRounds(state?.heroSmsActivationRetryRounds);
      const maxAcquireRounds = Math.max(2, configuredAcquireRounds);
      const retryDelayMs = normalizePhoneActivationRetryDelayMs(state?.heroSmsActivationRetryDelayMs);
      let finalNoNumbersByCountry = [];
      let finalLastError = null;

      for (let round = 1; round <= maxAcquireRounds; round += 1) {
        if (maxAcquireRounds > 1) {
          await addLog(
            `Step 9: NexSMS acquiring phone number (round ${round}/${maxAcquireRounds})...`,
            'info'
          );
        }

        const noNumbersByCountry = [];
        const retryableNoNumberCountries = [];
        let lastError = null;

        for (const countryConfig of countryCandidates) {
          const countryId = normalizeNexSmsCountryId(countryConfig.id, -1);
          const countryLabel = normalizeCountryLabel(countryConfig.label, `Country #${countryId}`);
          let pricePlan = null;
          try {
            pricePlan = await resolveNexSmsCountryPricePlan(config, countryConfig, state);
          } catch (error) {
            if (isNexSmsTerminalError(error?.payload || error?.message, error?.status)) {
              throw new Error(`NexSMS price lookup failed: ${describeNexSmsPayload(error?.payload || error?.message) || 'unknown terminal error'}`);
            }
            lastError = error;
            continue;
          }

          if (!Array.isArray(pricePlan.prices) || !pricePlan.prices.length) {
            if (
              pricePlan.userLimit !== null
              && pricePlan.minCatalogPrice !== null
              && pricePlan.minCatalogPrice > pricePlan.userLimit
            ) {
              noNumbersByCountry.push(
                `${countryLabel}: no numbers within maxPrice=${pricePlan.userLimit}; lowest listed=${pricePlan.minCatalogPrice}`
              );
            } else {
              const reason = describeNexSmsPayload(pricePlan.rawPayload) || 'no price candidates';
              noNumbersByCountry.push(`${countryLabel}: ${reason}`);
              retryableNoNumberCountries.push(countryLabel);
            }
            continue;
          }

          let acquiredActivation = null;
          for (const price of pricePlan.prices) {
            try {
              const payload = await fetchNexSmsPayload(
                config,
                '/api/order/purchase',
                'NexSMS purchase',
                {
                  method: 'POST',
                  body: {
                    serviceCode: config.serviceCode,
                    countryId,
                    quantity: 1,
                    price,
                  },
                }
              );
              if (!isNexSmsSuccessPayload(payload)) {
                if (isNexSmsNoNumbersError(payload)) {
                  continue;
                }
                if (isNexSmsTerminalError(payload)) {
                  throw new Error(`NexSMS purchase failed: ${describeNexSmsPayload(payload) || 'empty response'}`);
                }
                lastError = new Error(`NexSMS purchase failed: ${describeNexSmsPayload(payload) || 'empty response'}`);
                continue;
              }
              const activation = parseNexSmsActivationPayload(payload, {
                countryId,
                countryLabel,
                serviceCode: config.serviceCode,
              });
              if (!activation) {
                lastError = new Error('NexSMS purchase succeeded but did not return a phone number.');
                continue;
              }
              acquiredActivation = activation;
              break;
            } catch (error) {
              if (isNexSmsTerminalError(error?.payload || error?.message, error?.status)) {
                throw new Error(`NexSMS purchase failed: ${describeNexSmsPayload(error?.payload || error?.message) || 'unknown terminal error'}`);
              }
              if (isNexSmsNoNumbersError(error?.payload || error?.message)) {
                continue;
              }
              lastError = error;
            }
          }

          if (acquiredActivation) {
            return acquiredActivation;
          }

          noNumbersByCountry.push(`${countryLabel}: ${describeNexSmsPayload(pricePlan.rawPayload) || 'numbers not found'}`);
          retryableNoNumberCountries.push(countryLabel);
        }

        finalNoNumbersByCountry = noNumbersByCountry;
        finalLastError = lastError;

        if (
          noNumbersByCountry.length
          && round < maxAcquireRounds
          && retryableNoNumberCountries.length > 0
        ) {
          await addLog(
            `Step 9: NexSMS has no available numbers (round ${round}/${maxAcquireRounds}); retrying in ${Math.ceil(retryDelayMs / 1000)}s. Countries: ${retryableNoNumberCountries.join(', ')}.`,
            'warn'
          );
          await sleepWithStop(retryDelayMs);
          continue;
        }

        break;
      }

      if (finalNoNumbersByCountry.length) {
        throw new Error(
          `NexSMS no numbers available across ${countryCandidates.length} country candidate(s): ${finalNoNumbersByCountry.join(' | ')}.`
        );
      }
      if (finalLastError) {
        throw finalLastError;
      }
      throw new Error('NexSMS failed to acquire a phone number.');
    }

    async function requestPhoneActivation(state = {}, options = {}) {
      const config = resolvePhoneConfig(state);
      if (config.provider === PHONE_SMS_PROVIDER_5SIM) {
        return requestFiveSimActivation(state, options);
      }
      if (config.provider === PHONE_SMS_PROVIDER_NEXSMS) {
        return requestNexSmsActivation(state, options);
      }
      const allCountryCandidates = resolveCountryCandidates(state);
      const blockedCountryIds = new Set(
        (Array.isArray(options?.blockedCountryIds) ? options.blockedCountryIds : [])
          .map((value) => normalizeCountryId(value, 0))
          .filter((id) => id > 0)
      );
      let countryCandidates = allCountryCandidates.filter(
        (entry) => !blockedCountryIds.has(normalizeCountryId(entry.id, 0))
      );
      if (!countryCandidates.length) {
        countryCandidates = allCountryCandidates;
        if (blockedCountryIds.size) {
          await addLog(
            'Step 9: all selected countries reached the temporary SMS-failure skip threshold, lifting skip for this acquire round.',
            'warn'
          );
        }
      }
      const acquirePriority = normalizeHeroSmsAcquirePriority(state?.heroSmsAcquirePriority);
      const requestActions = ['getNumber'];
      const configuredAcquireRounds = normalizePhoneActivationRetryRounds(
        state?.heroSmsActivationRetryRounds
      );
      const maxAcquireRounds = Math.max(2, configuredAcquireRounds);
      const retryDelayMs = normalizePhoneActivationRetryDelayMs(
        state?.heroSmsActivationRetryDelayMs
      );

      let finalNoNumbersByCountry = [];
      let finalLastError = null;
      let finalLastFailureText = '';

      for (let round = 1; round <= maxAcquireRounds; round += 1) {
        if (maxAcquireRounds > 1) {
          await addLog(
            `Step 9: HeroSMS acquiring phone number (round ${round}/${maxAcquireRounds})...`,
            'info'
          );
        }

        const countryAttempts = countryCandidates.map((countryConfig, index) => ({
          index,
          countryConfig,
          pricePlan: null,
          orderingPrice: Number.POSITIVE_INFINITY,
        }));

        if (acquirePriority === HERO_SMS_ACQUIRE_PRIORITY_PRICE) {
          for (const attempt of countryAttempts) {
            const pricePlan = await resolvePhoneActivationPricePlan(config, attempt.countryConfig, state);
            const numericPrices = Array.isArray(pricePlan?.prices)
              ? pricePlan.prices
                  .map((value) => Number(value))
                  .filter((value) => Number.isFinite(value) && value >= 0)
              : [];
            const minCandidatePrice = numericPrices.length ? Math.min(...numericPrices) : null;
            const cappedByUserLimit = (
              pricePlan?.userLimit !== null
              && pricePlan?.userLimit !== undefined
              && pricePlan?.minCatalogPrice !== null
              && pricePlan?.minCatalogPrice !== undefined
              && Number(pricePlan.minCatalogPrice) > Number(pricePlan.userLimit)
            );
            attempt.pricePlan = pricePlan;
            attempt.orderingPrice = cappedByUserLimit
              ? Number.POSITIVE_INFINITY
              : (minCandidatePrice !== null ? minCandidatePrice : Number.POSITIVE_INFINITY);
          }
        }

        if (acquirePriority === HERO_SMS_ACQUIRE_PRIORITY_PRICE && countryAttempts.length > 1) {
          countryAttempts.sort((left, right) => {
            if (left.orderingPrice !== right.orderingPrice) {
              return left.orderingPrice - right.orderingPrice;
            }
            return left.index - right.index;
          });
        }

        const noNumbersByCountry = [];
        const retryableNoNumberCountries = [];
        let lastError = null;
        let lastFailureText = '';

        for (const attempt of countryAttempts) {
          const countryConfig = attempt.countryConfig;
          const buildFallbackActivation = (_requestAction) => ({
            countryId: countryConfig.id,
          });
          const pricePlan = attempt.pricePlan || await resolvePhoneActivationPricePlan(config, countryConfig, state);
          let noNumbersObservedInCountry = false;

          if (!Array.isArray(pricePlan.prices) || pricePlan.prices.length === 0) {
            noNumbersByCountry.push(
              pricePlan.userMinPrice !== null && pricePlan.minCatalogPrice !== null
                ? `${countryConfig.label}: no numbers within minPrice=${pricePlan.userMinPrice}; lowest listed=${pricePlan.minCatalogPrice}`
                : `${countryConfig.label}: no matching price tier`
            );
            continue;
          }

          for (const maxPrice of pricePlan.prices) {
            for (const requestAction of requestActions) {
              try {
                const payload = await requestPhoneActivationWithPrice(
                  config,
                  countryConfig,
                  requestAction,
                  maxPrice,
                  { userLimit: pricePlan.userLimit }
                );
                const activation = parseActivationPayload(payload, buildFallbackActivation(requestAction));
                if (activation) {
                  const { countryLabel: _ignoredCountryLabel, ...activationWithoutCountryLabel } = activation;
                  return {
                    ...activationWithoutCountryLabel,
                    countryId: countryConfig.id,
                  };
                }
                const payloadText = describeHeroSmsPayload(payload);
                if (isHeroSmsNoNumbersPayload(payload)) {
                  noNumbersObservedInCountry = true;
                  lastFailureText = payloadText || lastFailureText;
                  continue;
                }
                if (isHeroSmsTerminalError(payload)) {
                  throw new Error(`HeroSMS ${requestAction} failed: ${payloadText || 'empty response'}`);
                }
                lastFailureText = payloadText || lastFailureText;
                lastError = new Error(`HeroSMS ${requestAction} failed: ${payloadText || 'empty response'}`);
              } catch (error) {
                const payloadOrMessage = error?.payload || error?.message;
                if (isHeroSmsTerminalError(payloadOrMessage)) {
                  throw new Error(`HeroSMS ${requestAction} failed: ${describeHeroSmsPayload(payloadOrMessage) || 'empty response'}`);
                }
                if (isHeroSmsNoNumbersPayload(payloadOrMessage)) {
                  noNumbersObservedInCountry = true;
                  lastFailureText = describeHeroSmsPayload(payloadOrMessage) || lastFailureText;
                  continue;
                }
                lastFailureText = describeHeroSmsPayload(payloadOrMessage) || lastFailureText;
                lastError = error;
              }
            }
          }

          if (noNumbersObservedInCountry) {
            if (
              pricePlan.userLimit !== null
              && pricePlan.minCatalogPrice !== null
              && pricePlan.minCatalogPrice > pricePlan.userLimit
            ) {
              noNumbersByCountry.push(
                `${countryConfig.label}: no numbers within maxPrice=${pricePlan.userLimit}; lowest listed=${pricePlan.minCatalogPrice}`
              );
            } else if (
              pricePlan.userMinPrice !== null
              && pricePlan.minCatalogPrice !== null
              && pricePlan.prices.length === 0
            ) {
              noNumbersByCountry.push(
                `${countryConfig.label}: no numbers within minPrice=${pricePlan.userMinPrice}; lowest listed=${pricePlan.minCatalogPrice}`
              );
            } else {
              noNumbersByCountry.push(
                `${countryConfig.label}: ${lastFailureText || 'NO_NUMBERS'}`
              );
              retryableNoNumberCountries.push(countryConfig.label);
            }
            continue;
          }
        }

        finalNoNumbersByCountry = noNumbersByCountry;
        finalLastError = lastError;
        finalLastFailureText = lastFailureText;

        if (
          noNumbersByCountry.length
          && round < maxAcquireRounds
          && retryableNoNumberCountries.length > 0
        ) {
          await addLog(
            `Step 9: HeroSMS has no available numbers (round ${round}/${maxAcquireRounds}); retrying in ${Math.ceil(retryDelayMs / 1000)}s. Countries: ${retryableNoNumberCountries.join(', ')}.`,
            'warn'
          );
          await sleepWithStop(retryDelayMs);
          continue;
        }

        break;
      }

      if (finalNoNumbersByCountry.length) {
        throw new Error(
          `HeroSMS no numbers available across ${countryCandidates.length} country candidate(s): ${finalNoNumbersByCountry.join(' | ')}.`
        );
      }
      if (finalLastError) {
        throw finalLastError;
      }
      throw new Error(`HeroSMS failed to acquire a phone number. Last status: ${finalLastFailureText || 'unknown'}.`);
    }

    async function reactivatePhoneActivation(state = {}, activation) {
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        throw new Error('Reusable phone activation is missing.');
      }

      const config = resolvePhoneConfig(state);
      if (config.provider === PHONE_SMS_PROVIDER_5SIM) {
        const reuseProduct = normalizeFiveSimProduct(
          normalizedActivation.serviceCode || config.product || DEFAULT_FIVE_SIM_PRODUCT,
          DEFAULT_FIVE_SIM_PRODUCT
        );
        const reuseNumber = normalizePhoneNumberForProvider(normalizedActivation.phoneNumber, PHONE_SMS_PROVIDER_5SIM);
        if (!reuseNumber) {
          throw new Error('5sim reuse activation failed: phone number is missing.');
        }
        const payload = await fetchFiveSimPayload(
          config,
          `user/reuse/${reuseProduct}/${reuseNumber}`,
          '5sim reuse activation'
        );
        const nextActivation = parseFiveSimActivationPayload(payload, {
          countryCode: normalizedActivation.countryCode || normalizedActivation.countryId,
          countryLabel: normalizedActivation.countryLabel,
          serviceCode: normalizedActivation.serviceCode,
          maxUses: normalizedActivation.maxUses,
          successfulUses: normalizedActivation.successfulUses,
        });
        if (!nextActivation) {
          const text = describeFiveSimPayload(payload);
          throw new Error(`5sim reuse activation failed: ${text || 'empty response'}`);
        }
        return {
          ...nextActivation,
          maxUses: normalizedActivation.maxUses,
          successfulUses: normalizedActivation.successfulUses,
        };
      }
      if (config.provider === PHONE_SMS_PROVIDER_NEXSMS) {
        throw new Error('NexSMS does not support activation reuse for this flow.');
      }
      const payload = await fetchHeroSmsPayload(config, {
        action: 'reactivate',
        id: normalizedActivation.activationId,
      }, 'HeroSMS reactivate');
      const nextActivation = parseActivationPayload(payload, normalizedActivation);
      if (!nextActivation) {
        const text = describeHeroSmsPayload(payload);
        throw new Error(`HeroSMS reactivate failed: ${text || 'empty response'}`);
      }
      return nextActivation;
    }

    async function setPhoneActivationStatus(state = {}, activation, status, actionLabel) {
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        return '';
      }
      const config = resolvePhoneConfig(state);
      if (config.provider === PHONE_SMS_PROVIDER_5SIM) {
        const endpoint = status === 6
          ? `user/finish/${normalizedActivation.activationId}`
          : `user/cancel/${normalizedActivation.activationId}`;
        const payload = await fetchFiveSimPayload(config, endpoint, actionLabel || '5sim set status');
        return describeFiveSimPayload(payload);
      }
      if (config.provider === PHONE_SMS_PROVIDER_NEXSMS) {
        if (status === 6) {
          return 'NexSMS complete skipped';
        }
        const payload = await fetchNexSmsPayload(
          config,
          '/api/close/activation',
          actionLabel || 'NexSMS close activation',
          {
            method: 'POST',
            body: {
              phoneNumber: normalizedActivation.phoneNumber,
            },
          }
        );
        if (!isNexSmsSuccessPayload(payload)) {
          throw new Error(`NexSMS close activation failed: ${describeNexSmsPayload(payload) || 'empty response'}`);
        }
        return describeNexSmsPayload(payload);
      }
      const payload = await fetchHeroSmsPayload(config, {
        action: 'setStatus',
        id: normalizedActivation.activationId,
        status,
      }, actionLabel);
      return describeHeroSmsPayload(payload);
    }

    async function completePhoneActivation(state = {}, activation) {
      await setPhoneActivationStatus(state, activation, 6, 'HeroSMS setStatus(6)');
    }

    async function cancelPhoneActivation(state = {}, activation) {
      try {
        await setPhoneActivationStatus(state, activation, 8, 'HeroSMS setStatus(8)');
      } catch (_) {
        // Best-effort cleanup.
      }
    }

    async function requestAdditionalPhoneSms(state = {}, activation) {
      const config = resolvePhoneConfig(state);
      if (config.provider !== PHONE_SMS_PROVIDER_HERO) {
        return;
      }
      try {
        await setPhoneActivationStatus(state, activation, 3, 'HeroSMS setStatus(3)');
      } catch (_) {
        // Best-effort request only.
      }
    }

    async function pollPhoneActivationCode(state = {}, activation, options = {}) {
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        throw new Error('Phone activation is missing.');
      }
      const statusAction = resolveActivationStatusAction(normalizedActivation);

      const config = resolvePhoneConfig(state);
      const configuredTimeoutMs = Math.max(1000, Number(options.timeoutMs) || 0);
      const timeoutMs = configuredTimeoutMs || (
        typeof getOAuthFlowStepTimeoutMs === 'function'
          ? await getOAuthFlowStepTimeoutMs(
            DEFAULT_PHONE_POLL_TIMEOUT_MS,
            { step: 9, actionLabel: options.actionLabel || 'poll phone verification code' }
          )
          : DEFAULT_PHONE_POLL_TIMEOUT_MS
      );
      const intervalMs = Math.max(1000, Number(options.intervalMs) || DEFAULT_PHONE_POLL_INTERVAL_MS);
      const maxRoundsRaw = Math.floor(Number(options.maxRounds));
      const maxRounds = Number.isFinite(maxRoundsRaw) && maxRoundsRaw > 0 ? maxRoundsRaw : 0;
      const start = Date.now();
      let lastResponse = '';
      let pollCount = 0;
      const extractVerificationCode = (rawCode) => {
        const trimmed = String(rawCode || '').trim();
        if (!trimmed) {
          return '';
        }
        const digitMatch = trimmed.match(/\b(\d{4,8})\b/);
        return digitMatch?.[1] || '';
      };

      if (config.provider === PHONE_SMS_PROVIDER_5SIM) {
        while (Date.now() - start < timeoutMs) {
          if (maxRounds > 0 && pollCount >= maxRounds) {
            break;
          }
          throwIfStopped();
          const payload = await fetchFiveSimPayload(
            config,
            `/user/check/${normalizedActivation.activationId}`,
            '5sim check activation'
          );
          const text = JSON.stringify(payload || {});
          lastResponse = text;
          pollCount += 1;
          const smsList = Array.isArray(payload?.sms) ? payload.sms : [];
          const directCode = extractVerificationCode(payload?.code || payload?.sms_code);
          const smsCode = directCode || smsList
            .map((smsItem) => extractVerificationCode(smsItem?.code || smsItem?.text || smsItem?.message || ''))
            .find(Boolean);
          if (typeof options.onStatus === 'function') {
            await options.onStatus({
              activation: normalizedActivation,
              elapsedMs: Date.now() - start,
              pollCount,
              statusText: String(payload?.status || text || 'PENDING'),
              timeoutMs,
            });
          }
          if (smsCode) {
            return smsCode;
          }
          const statusText = String(payload?.status || '').trim().toUpperCase();
          if (/^(RECEIVED|PENDING|RETRY|PREPARE|WAITING)$/i.test(statusText) || !statusText) {
            await sleepWithStop(intervalMs);
            continue;
          }
          if (/^(CANCELED|CANCELLED|BANNED|FINISHED|EXPIRED|TIMEOUT)$/i.test(statusText)) {
            throw new Error(`5sim activation ended before receiving SMS: ${statusText}`);
          }
          throw new Error(`5sim check activation failed: ${text || statusText || 'empty response'}`);
        }
        throw buildPhoneCodeTimeoutError(lastResponse);
      }

      if (config.provider === PHONE_SMS_PROVIDER_NEXSMS) {
        while (Date.now() - start < timeoutMs) {
          if (maxRounds > 0 && pollCount >= maxRounds) {
            break;
          }
          throwIfStopped();
          const payload = await fetchNexSmsPayload(
            config,
            '/api/sms/messages',
            'NexSMS get sms messages',
            {
              query: {
                phoneNumber: normalizedActivation.phoneNumber,
                format: 'json_latest',
              },
            }
          );
          const text = JSON.stringify(payload || {});
          lastResponse = text;
          pollCount += 1;
          if (typeof options.onStatus === 'function') {
            await options.onStatus({
              activation: normalizedActivation,
              elapsedMs: Date.now() - start,
              pollCount,
              statusText: text || 'PENDING',
              timeoutMs,
            });
          }
          const directCode = extractVerificationCode(payload?.data?.code || payload?.data?.text || payload?.data?.message || '');
          if (directCode) {
            return directCode;
          }
          if (payload?.success === false || /pending/i.test(String(payload?.message || ''))) {
            await sleepWithStop(intervalMs);
            continue;
          }
          await sleepWithStop(intervalMs);
        }
        throw buildPhoneCodeTimeoutError(lastResponse);
      }

      while (Date.now() - start < timeoutMs) {
        if (maxRounds > 0 && pollCount >= maxRounds) {
          break;
        }
        throwIfStopped();
        const payload = await fetchHeroSmsPayload(config, {
          action: statusAction,
          id: normalizedActivation.activationId,
        }, `HeroSMS ${statusAction}`);
        const text = describeHeroSmsPayload(payload);
        lastResponse = text;
        pollCount += 1;

        if (typeof options.onStatus === 'function') {
          await options.onStatus({
            activation: normalizedActivation,
            elapsedMs: Date.now() - start,
            pollCount,
            statusText: text,
            timeoutMs,
          });
        }

        const v2Code = (
          payload
          && typeof payload === 'object'
          && !Array.isArray(payload)
          && (
            extractVerificationCode(payload.sms?.code)
            || extractVerificationCode(payload.call?.code)
          )
        );
        if (v2Code) {
          return v2Code;
        }

        const okMatch = text.match(/^STATUS_OK:(.+)$/i);
        if (okMatch) {
          const rawCode = String(okMatch[1] || '').trim();
          const digitMatch = rawCode.match(/\b(\d{4,8})\b/);
          return digitMatch?.[1] || rawCode;
        }

        if (/^STATUS_(WAIT_CODE|WAIT_RETRY|WAIT_RESEND)$/i.test(text)) {
          await sleepWithStop(intervalMs);
          continue;
        }

        if (statusAction === 'getStatusV2' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
          await sleepWithStop(intervalMs);
          continue;
        }

        if (/^STATUS_CANCEL$/i.test(text)) {
          throw new Error('HeroSMS activation was cancelled before the SMS arrived.');
        }

        throw new Error(`HeroSMS ${statusAction} failed: ${text || 'empty response'}`);
      }

      throw buildPhoneCodeTimeoutError(lastResponse);
    }

    async function readPhonePageState(tabId, timeoutMs = 10000) {
      await ensureStep8SignupPageReady(tabId, {
        timeoutMs,
        logMessage: 'Step 9: waiting for auth page content script to recover before phone verification.',
      });
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'STEP8_GET_STATE',
        source: 'background',
        payload: {},
      }, {
        timeoutMs,
        responseTimeoutMs: timeoutMs,
        retryDelayMs: 600,
        logMessage: 'Step 9: auth page is switching, waiting to inspect phone verification state again...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    function resolveCountryConfigFromActivation(activation, fallbackState = {}) {
      const provider = normalizePhoneSmsProvider(
        activation?.provider || fallbackState?.phoneSmsProvider || DEFAULT_PHONE_SMS_PROVIDER
      );
      const candidates = provider === PHONE_SMS_PROVIDER_5SIM
        ? resolveFiveSimCountryCandidates(fallbackState)
        : (provider === PHONE_SMS_PROVIDER_NEXSMS
          ? resolveNexSmsCountryCandidates(fallbackState)
          : resolveCountryCandidates(fallbackState));
      if (activation && typeof activation === 'object') {
        if (provider === PHONE_SMS_PROVIDER_5SIM) {
          const countryCode = normalizeFiveSimCountryCode(activation.countryId || activation.countryCode || '', '');
          if (countryCode) {
            const matched = candidates.find((entry) => String(entry.id || entry.code || '') === countryCode);
            if (matched) {
              return matched;
            }
            return {
              id: countryCode,
              code: countryCode,
              label: normalizeCountryLabel(activation.countryLabel, countryCode),
            };
          }
        } else {
          const countryId = provider === PHONE_SMS_PROVIDER_NEXSMS
            ? normalizeNexSmsCountryId(activation.countryId, -1)
            : normalizeCountryId(activation.countryId, 0);
          if (countryId >= 0) {
            const matched = candidates.find((entry) => String(entry.id) === String(countryId));
            if (matched) {
              return matched;
            }
            return {
              id: countryId,
              label: normalizeCountryLabel(activation.countryLabel, `Country #${countryId}`),
            };
          }
        }
      }
      if (provider === PHONE_SMS_PROVIDER_5SIM) {
        return candidates[0] || { id: '', code: '', label: '' };
      }
      if (provider === PHONE_SMS_PROVIDER_NEXSMS) {
        return candidates[0] || { id: 0, label: '' };
      }
      return candidates[0] || resolveCountryConfig(fallbackState);
    }

    async function submitPhoneNumber(tabId, phoneNumber, activation = null) {
      const state = await getState();
      const countryConfig = resolveCountryConfigFromActivation(activation, state);
      const timeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
        ? await getOAuthFlowStepTimeoutMs(30000, { step: 9, actionLabel: 'submit add-phone number' })
        : 30000;
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'SUBMIT_PHONE_NUMBER',
        source: 'background',
        payload: {
          phoneNumber,
          countryId: countryConfig.id,
          countryLabel: countryConfig.label,
        },
      }, {
        timeoutMs,
        responseTimeoutMs: timeoutMs,
        retryDelayMs: 600,
        logMessage: 'Step 9: waiting for add-phone page to become ready...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function submitPhoneVerificationCode(tabId, code) {
      const timeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
        ? await getOAuthFlowStepTimeoutMs(45000, { step: 9, actionLabel: 'submit phone verification code' })
        : 45000;
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'SUBMIT_PHONE_VERIFICATION_CODE',
        source: 'background',
        payload: { code },
      }, {
        timeoutMs,
        responseTimeoutMs: timeoutMs,
        retryDelayMs: 600,
        logMessage: 'Step 9: waiting for phone verification page before filling the SMS code...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function resendPhoneVerificationCode(tabId) {
      const timeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
        ? await getOAuthFlowStepTimeoutMs(30000, { step: 9, actionLabel: 'resend phone verification code' })
        : 30000;
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'RESEND_PHONE_VERIFICATION_CODE',
        source: 'background',
        payload: {},
      }, {
        timeoutMs,
        responseTimeoutMs: timeoutMs,
        retryDelayMs: 600,
        logMessage: 'Step 9: waiting for the phone verification resend button...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function submitSignupPhoneVerificationCode(tabId, code, options = {}) {
      const visibleStep = 4;
      const timeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
        ? await getOAuthFlowStepTimeoutMs(45000, { step: visibleStep, actionLabel: '提交注册手机验证码' })
        : 45000;
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'SUBMIT_PHONE_VERIFICATION_CODE',
        step: visibleStep,
        source: 'background',
        payload: {
          code,
          purpose: 'signup',
          visibleStep,
          signupProfile: options.signupProfile || null,
        },
      }, {
        timeoutMs,
        responseTimeoutMs: timeoutMs,
        retryDelayMs: 600,
        logMessage: '步骤 4：等待注册手机验证码页面就绪后填写短信验证码...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function resendSignupPhoneVerificationCode(tabId) {
      const visibleStep = 4;
      const timeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
        ? await getOAuthFlowStepTimeoutMs(65000, { step: visibleStep, actionLabel: '重新发送注册手机验证码' })
        : 65000;
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'RESEND_VERIFICATION_CODE',
        step: visibleStep,
        source: 'background',
        payload: {},
      }, {
        timeoutMs,
        responseTimeoutMs: timeoutMs,
        retryDelayMs: 600,
        logMessage: '步骤 4：等待注册手机验证码重发按钮出现...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function returnToAddPhone(tabId) {
      const timeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
        ? await getOAuthFlowStepTimeoutMs(30000, { step: 9, actionLabel: 'return to add-phone page' })
        : 30000;
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'RETURN_TO_ADD_PHONE',
        source: 'background',
        payload: {},
      }, {
        timeoutMs,
        responseTimeoutMs: timeoutMs,
        retryDelayMs: 600,
        logMessage: 'Step 9: returning to add-phone page to replace the phone number...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function persistCurrentActivation(activation) {
      await setState({
        [PHONE_ACTIVATION_STATE_KEY]: activation || null,
        [PHONE_VERIFICATION_CODE_STATE_KEY]: '',
      });
    }

    async function persistReusableActivation(activation) {
      await setState({
        [REUSABLE_PHONE_ACTIVATION_STATE_KEY]: activation || null,
      });
    }

    async function clearCurrentActivation() {
      await persistCurrentActivation(null);
    }

    async function clearReusableActivation() {
      await persistReusableActivation(null);
    }

    async function clearSignupPhoneRegistrationState(reason = '') {
      const state = await getState();
      const updates = {
        signupPhoneNumber: '',
        signupPhoneActivation: null,
        signupPhoneVerificationRequestedAt: null,
        signupPhoneVerificationPurpose: '',
        [PHONE_VERIFICATION_CODE_STATE_KEY]: '',
      };
      if (String(state?.accountIdentifierType || '').trim().toLowerCase() === 'phone') {
        updates.accountIdentifier = '';
      }
      await setState(updates);
      if (reason) {
        await addLog(reason, 'warn');
      }
    }

    async function prepareSignupPhoneActivation(state = {}, options = {}) {
      const activation = await requestPhoneActivation(state, options);
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        throw new Error('步骤 2：接码平台返回的手机号订单无效。');
      }
      await setState({
        signupPhoneNumber: normalizedActivation.phoneNumber,
        signupPhoneActivation: normalizedActivation,
        signupPhoneVerificationRequestedAt: null,
        signupPhoneVerificationPurpose: 'signup',
        accountIdentifierType: 'phone',
        accountIdentifier: normalizedActivation.phoneNumber,
      });
      return normalizedActivation;
    }

    async function prepareLoginPhoneActivation(state = {}, options = {}) {
      const visibleStep = Math.floor(Number(options?.visibleStep || options?.step) || 0) || 8;
      const preferredActivation = normalizeActivation(
        options?.activation
        || state?.signupPhoneCompletedActivation
        || state?.signupPhoneActivation
      );
      if (!preferredActivation) {
        throw new Error(`步骤 ${visibleStep}：缺少已注册手机号激活记录，无法继续手机号登录验证码流程。`);
      }

      const activeActivation = normalizeActivation(state?.signupPhoneActivation);
      if (activeActivation && activeActivation.activationId === preferredActivation.activationId) {
        await setState({
          signupPhoneNumber: activeActivation.phoneNumber,
          signupPhoneVerificationPurpose: 'login',
        });
        return activeActivation;
      }

      const reactivated = await reactivatePhoneActivation(state, preferredActivation);
      const normalizedActivation = normalizeActivation(reactivated);
      if (!normalizedActivation) {
        throw new Error(`步骤 ${visibleStep}：无法复用当前注册手机号，请重新执行步骤 ${visibleStep >= 11 ? 10 : 7}。`);
      }

      await setState({
        signupPhoneActivation: normalizedActivation,
        signupPhoneCompletedActivation: preferredActivation,
        signupPhoneNumber: normalizedActivation.phoneNumber,
        signupPhoneVerificationRequestedAt: null,
        signupPhoneVerificationPurpose: 'login',
        [PHONE_VERIFICATION_CODE_STATE_KEY]: '',
        accountIdentifierType: 'phone',
        accountIdentifier: normalizedActivation.phoneNumber,
      });
      return normalizedActivation;
    }

    async function cancelSignupPhoneActivation(state = {}, activation = null) {
      const normalizedActivation = normalizeActivation(activation || state?.signupPhoneActivation);
      if (normalizedActivation) {
        await cancelPhoneActivation(state, normalizedActivation);
      }
      await setState({
        signupPhoneActivation: null,
        signupPhoneVerificationRequestedAt: null,
        signupPhoneVerificationPurpose: '',
      });
    }

    async function waitForSignupPhoneCode(state = {}, activation, options = {}) {
      const waitSeconds = normalizePhoneCodeWaitSeconds(state?.phoneCodeWaitSeconds);
      const timeoutWindows = normalizePhoneCodeTimeoutWindows(state?.phoneCodeTimeoutWindows);
      const pollIntervalSeconds = normalizePhoneCodePollIntervalSeconds(state?.phoneCodePollIntervalSeconds);
      const pollMaxRounds = normalizePhoneCodePollMaxRounds(state?.phoneCodePollMaxRounds);
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        await clearSignupPhoneRegistrationState(
          '步骤 4：注册手机号激活记录缺失，已清理当前手机号状态；重新执行步骤 2 时将重新获取手机号。'
        );
        throw new Error('步骤 4：注册手机号激活记录缺失，请重新执行步骤 2。');
      }

      const providerLabel = normalizedActivation.provider === PHONE_SMS_PROVIDER_5SIM
        ? '5sim'
        : (normalizedActivation.provider === PHONE_SMS_PROVIDER_NEXSMS ? 'NexSMS' : 'HeroSMS');
      let lastLoggedStatus = '';
      let lastLoggedPollCount = 0;

      for (let windowIndex = 1; windowIndex <= timeoutWindows; windowIndex += 1) {
        await setState({
          signupPhoneActivation: normalizedActivation,
          signupPhoneNumber: normalizedActivation.phoneNumber,
          signupPhoneVerificationPurpose: 'signup',
          signupPhoneVerificationRequestedAt: Date.now(),
        });
        await addLog(
          `步骤 4：正在等待 ${normalizedActivation.phoneNumber} 的短信验证码（${windowIndex}/${timeoutWindows}，最长 ${waitSeconds} 秒）。`,
          'info'
        );

        try {
          const code = await pollPhoneActivationCode(state, normalizedActivation, {
            actionLabel: windowIndex === 1
              ? `poll signup phone verification code from ${providerLabel}`
              : `poll resent signup phone verification code from ${providerLabel}`,
            timeoutMs: waitSeconds * 1000,
            intervalMs: pollIntervalSeconds * 1000,
            maxRounds: pollMaxRounds,
            onStatus: async ({ elapsedMs, pollCount, statusText }) => {
              const shouldLog = (
                pollCount === 1
                || statusText !== lastLoggedStatus
                || pollCount - lastLoggedPollCount >= 3
              );
              if (!shouldLog) {
                return;
              }
              lastLoggedStatus = statusText;
              lastLoggedPollCount = pollCount;
              await addLog(
                `步骤 4：${providerLabel} 状态 ${normalizedActivation.phoneNumber}: ${statusText}（已等待 ${Math.ceil(elapsedMs / 1000)} 秒，第 ${pollCount}/${pollMaxRounds} 轮）。`,
                'info'
              );
            },
          });
          await setState({
            [PHONE_VERIFICATION_CODE_STATE_KEY]: String(code || '').trim(),
            signupPhoneVerificationRequestedAt: Date.now(),
          });
          return code;
        } catch (error) {
          if (!isPhoneCodeTimeoutError(error)) {
            throw error;
          }

          if (windowIndex < timeoutWindows) {
            await addLog(
              `步骤 4：${normalizedActivation.phoneNumber} 在 ${waitSeconds} 秒内未收到短信，准备请求重发。`,
              'warn'
            );
            await requestAdditionalPhoneSms(state, normalizedActivation);
            if (typeof options.onTimeoutWindow === 'function') {
              await options.onTimeoutWindow({
                activation: normalizedActivation,
                windowIndex,
                timeoutWindows,
              });
            }
            continue;
          }

          throw error;
        }
      }

      throw new Error('步骤 4：手机验证码未能成功获取。');
    }

    async function finalizeSignupPhoneActivationAfterSuccess(state = {}, activation = null) {
      const normalizedActivation = normalizeActivation(activation || state?.signupPhoneActivation);
      if (!normalizedActivation) {
        await setState({
          signupPhoneActivation: null,
          signupPhoneVerificationRequestedAt: null,
          signupPhoneVerificationPurpose: '',
          [PHONE_VERIFICATION_CODE_STATE_KEY]: '',
        });
        return null;
      }

      await completePhoneActivation(state, normalizedActivation);
      await setState({
        signupPhoneActivation: null,
        signupPhoneCompletedActivation: {
          ...normalizedActivation,
          successfulUses: Number(normalizedActivation.successfulUses || 0) + 1,
        },
        signupPhoneNumber: normalizedActivation.phoneNumber,
        signupPhoneVerificationRequestedAt: null,
        signupPhoneVerificationPurpose: '',
        [PHONE_VERIFICATION_CODE_STATE_KEY]: '',
        accountIdentifierType: 'phone',
        accountIdentifier: normalizedActivation.phoneNumber,
      });
      return normalizedActivation;
    }

    async function finalizeLoginPhoneActivationAfterSuccess(state = {}, activation = null, options = {}) {
      const normalizedActivation = normalizeActivation(activation || state?.signupPhoneActivation);
      const visibleStep = Math.floor(Number(options?.visibleStep || options?.step) || 0) || 8;
      if (!normalizedActivation) {
        await setState({
          signupPhoneActivation: null,
          signupPhoneVerificationRequestedAt: null,
          signupPhoneVerificationPurpose: '',
          [PHONE_VERIFICATION_CODE_STATE_KEY]: '',
        });
        return null;
      }

      await completePhoneActivation(state, normalizedActivation);
      await setState({
        signupPhoneActivation: null,
        signupPhoneCompletedActivation: {
          ...normalizedActivation,
          successfulUses: Number(normalizedActivation.successfulUses || 0) + 1,
        },
        signupPhoneNumber: normalizedActivation.phoneNumber,
        signupPhoneVerificationRequestedAt: null,
        signupPhoneVerificationPurpose: '',
        [PHONE_VERIFICATION_CODE_STATE_KEY]: '',
        accountIdentifierType: 'phone',
        accountIdentifier: normalizedActivation.phoneNumber,
      });
      return normalizedActivation;
    }

    async function completeSignupPhoneVerificationFlow(tabId, options = {}) {
      let state = options?.state || await getState();
      const activation = normalizeActivation(options?.activation || state?.signupPhoneActivation);
      if (!activation) {
        await clearSignupPhoneRegistrationState(
          '步骤 4：未找到当前注册手机号激活记录，已清理当前手机号状态；重新执行步骤 2 时将重新获取手机号。'
        );
        throw new Error('步骤 4：未找到当前注册手机号激活记录，请重新执行步骤 2。');
      }

      let shouldCancelActivation = true;
      try {
        for (let attempt = 1; attempt <= DEFAULT_PHONE_SUBMIT_ATTEMPTS; attempt += 1) {
          throwIfStopped();
          state = await getState();
          const code = await waitForSignupPhoneCode(state, activation, {
            onTimeoutWindow: async () => {
              try {
                await resendSignupPhoneVerificationCode(tabId);
                await addLog('步骤 4：已点击注册手机验证码页面的“重新发送”。', 'info');
              } catch (resendError) {
                if (String(resendError?.message || '').toLowerCase().includes('stopped')) {
                  throw resendError;
                }
                await addLog(`步骤 4：注册手机验证码页面重发失败，将继续轮询短信。${resendError.message}`, 'warn');
              }
            },
          });

          await setState({
            signupPhoneVerificationRequestedAt: Date.now(),
            signupPhoneVerificationPurpose: 'signup',
            [PHONE_VERIFICATION_CODE_STATE_KEY]: String(code || '').trim(),
          });
          await addLog(`步骤 4：已获取手机验证码 ${code}。`, 'info');

          const submitResult = await submitSignupPhoneVerificationCode(tabId, code, {
            signupProfile: options.signupProfile || null,
          });
          if (submitResult?.invalidCode) {
            const invalidErrorText = String(submitResult.errorText || submitResult.url || '未知错误').trim();
            if (attempt >= DEFAULT_PHONE_SUBMIT_ATTEMPTS) {
              throw new Error(`步骤 4：手机验证码连续 ${DEFAULT_PHONE_SUBMIT_ATTEMPTS} 次被拒绝：${invalidErrorText}`);
            }

            await requestAdditionalPhoneSms(state, activation);
            try {
              await resendSignupPhoneVerificationCode(tabId);
            } catch (resendError) {
              if (String(resendError?.message || '').toLowerCase().includes('stopped')) {
                throw resendError;
              }
              await addLog(`步骤 4：验证码被拒后点击重发失败。${resendError.message}`, 'warn');
            }
            await addLog(
              `步骤 4：手机验证码被拒绝，已请求新短信（${attempt + 1}/${DEFAULT_PHONE_SUBMIT_ATTEMPTS}）。`,
              'warn'
            );
            continue;
          }

          await finalizeSignupPhoneActivationAfterSuccess(state, activation);
          shouldCancelActivation = false;
          await addLog('步骤 4：手机验证码已通过，继续进入资料填写。', 'ok');
          return {
            ...(submitResult || {}),
            code,
          };
        }

        throw new Error('步骤 4：手机验证码未能成功提交。');
      } catch (error) {
        if (shouldCancelActivation) {
          await cancelSignupPhoneActivation(state, activation).catch(() => {});
        }
        await setState({
          signupPhoneVerificationRequestedAt: null,
          signupPhoneVerificationPurpose: '',
          [PHONE_VERIFICATION_CODE_STATE_KEY]: '',
        });
        throw sanitizePhoneCodeTimeoutError(error);
      }
    }

    async function submitLoginPhoneVerificationCode(tabId, code, options = {}) {
      const visibleStep = Math.floor(Number(options?.visibleStep || options?.step) || 0) || 8;
      const timeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
        ? await getOAuthFlowStepTimeoutMs(45000, { step: visibleStep, actionLabel: '提交登录手机验证码' })
        : 45000;
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'SUBMIT_PHONE_VERIFICATION_CODE',
        step: visibleStep,
        source: 'background',
        payload: {
          code,
          purpose: 'login',
          visibleStep,
        },
      }, {
        timeoutMs,
        responseTimeoutMs: timeoutMs,
        retryDelayMs: 600,
        logMessage: `步骤 ${visibleStep}：等待登录手机验证码页面就绪后填写短信验证码...`,
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function resendLoginPhoneVerificationCode(tabId, options = {}) {
      const visibleStep = Math.floor(Number(options?.visibleStep || options?.step) || 0) || 8;
      const timeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
        ? await getOAuthFlowStepTimeoutMs(65000, { step: visibleStep, actionLabel: '重新发送登录手机验证码' })
        : 65000;
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'RESEND_VERIFICATION_CODE',
        step: visibleStep,
        source: 'background',
        payload: {},
      }, {
        timeoutMs,
        responseTimeoutMs: timeoutMs,
        retryDelayMs: 600,
        logMessage: `步骤 ${visibleStep}：等待登录手机验证码重发按钮出现...`,
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function waitForLoginPhoneCode(state = {}, activation, options = {}) {
      const visibleStep = Math.floor(Number(options?.visibleStep || options?.step) || 0) || 8;
      const waitSeconds = normalizePhoneCodeWaitSeconds(state?.phoneCodeWaitSeconds);
      const timeoutWindows = normalizePhoneCodeTimeoutWindows(state?.phoneCodeTimeoutWindows);
      const pollIntervalSeconds = normalizePhoneCodePollIntervalSeconds(state?.phoneCodePollIntervalSeconds);
      const pollMaxRounds = normalizePhoneCodePollMaxRounds(state?.phoneCodePollMaxRounds);
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        throw new Error(`步骤 ${visibleStep}：登录手机号激活记录缺失，请重新执行步骤 ${visibleStep >= 11 ? 10 : 7}。`);
      }

      for (let windowIndex = 1; windowIndex <= timeoutWindows; windowIndex += 1) {
        await addLog(`步骤 ${visibleStep}：正在等待 ${normalizedActivation.phoneNumber} 的短信验证码（${windowIndex}/${timeoutWindows}，最长 ${waitSeconds} 秒）。`, 'info');
        try {
          const code = await pollPhoneActivationCode(state, normalizedActivation, {
            actionLabel: windowIndex === 1
              ? 'poll login phone verification code'
              : 'poll resent login phone verification code',
            timeoutMs: waitSeconds * 1000,
            intervalMs: pollIntervalSeconds * 1000,
            maxRounds: pollMaxRounds,
          });
          await setState({
            [PHONE_VERIFICATION_CODE_STATE_KEY]: String(code || '').trim(),
            signupPhoneVerificationRequestedAt: Date.now(),
          });
          return code;
        } catch (error) {
          if (!isPhoneCodeTimeoutError(error)) {
            throw error;
          }

          if (windowIndex < timeoutWindows) {
            await addLog(`步骤 ${visibleStep}：${normalizedActivation.phoneNumber} 在 ${waitSeconds} 秒内未收到短信，准备请求重发。`, 'warn');
            await requestAdditionalPhoneSms(state, normalizedActivation);
            if (typeof options.onTimeoutWindow === 'function') {
              await options.onTimeoutWindow({
                activation: normalizedActivation,
                windowIndex,
                timeoutWindows,
              });
            }
            continue;
          }

          throw error;
        }
      }

      throw new Error(`步骤 ${visibleStep}：手机验证码未能成功获取。`);
    }

    async function completeLoginPhoneVerificationFlow(tabId, options = {}) {
      const visibleStep = Math.floor(Number(options?.visibleStep || options?.step) || 0) || 8;
      let state = options?.state || await getState();
      const baseActivation = normalizeActivation(
        options?.activation
        || state?.signupPhoneCompletedActivation
        || state?.signupPhoneActivation
      );
      if (!baseActivation) {
        throw new Error(`步骤 ${visibleStep}：未找到当前登录手机号激活记录，请重新执行步骤 ${visibleStep >= 11 ? 10 : 7}。`);
      }

      let activation = await prepareLoginPhoneActivation(state, {
        activation: baseActivation,
        visibleStep,
      });
      let shouldCancelActivation = true;

      try {
        for (let attempt = 1; attempt <= DEFAULT_PHONE_SUBMIT_ATTEMPTS; attempt += 1) {
          throwIfStopped();
          state = await getState();
          const code = await waitForLoginPhoneCode(state, activation, {
            visibleStep,
            onTimeoutWindow: async () => {
              try {
                await resendLoginPhoneVerificationCode(tabId, { visibleStep });
                await addLog(`步骤 ${visibleStep}：已点击登录手机验证码页面的“重新发送”。`, 'info');
              } catch (resendError) {
                if (String(resendError?.message || '').toLowerCase().includes('stopped')) {
                  throw resendError;
                }
                await addLog(`步骤 ${visibleStep}：登录手机验证码页面重发失败，将继续轮询短信。${resendError.message}`, 'warn');
              }
            },
          });

          await setState({
            [PHONE_VERIFICATION_CODE_STATE_KEY]: String(code || '').trim(),
            signupPhoneVerificationRequestedAt: Date.now(),
            signupPhoneVerificationPurpose: 'login',
          });
          await addLog(`步骤 ${visibleStep}：已获取登录手机验证码 ${code}。`, 'info');

          const submitResult = await submitLoginPhoneVerificationCode(tabId, code, { visibleStep });
          if (submitResult.invalidCode) {
            const invalidErrorText = String(submitResult.errorText || submitResult.url || '未知错误').trim();
            if (attempt >= DEFAULT_PHONE_SUBMIT_ATTEMPTS) {
              throw new Error(`步骤 ${visibleStep}：登录手机验证码连续 ${DEFAULT_PHONE_SUBMIT_ATTEMPTS} 次被拒绝：${invalidErrorText}`);
            }

            await requestAdditionalPhoneSms(state, activation);
            try {
              await resendLoginPhoneVerificationCode(tabId, { visibleStep });
            } catch (resendError) {
              if (String(resendError?.message || '').toLowerCase().includes('stopped')) {
                throw resendError;
              }
              await addLog(`步骤 ${visibleStep}：登录手机验证码被拒后点击重发失败。${resendError.message}`, 'warn');
            }
            await addLog(`步骤 ${visibleStep}：登录手机验证码被拒绝，已请求新短信（${attempt + 1}/${DEFAULT_PHONE_SUBMIT_ATTEMPTS}）。`, 'warn');
            continue;
          }

          await finalizeLoginPhoneActivationAfterSuccess(state, activation, { visibleStep });
          shouldCancelActivation = false;
          await addLog(`步骤 ${visibleStep}：登录手机验证码已通过，继续进入后续授权流程。`, 'ok');
          return {
            ...(submitResult || {}),
            code,
          };
        }

        throw new Error(`步骤 ${visibleStep}：登录手机验证码未能成功提交。`);
      } catch (error) {
        if (shouldCancelActivation && activation) {
          await cancelPhoneActivation(state, activation).catch(() => {});
        }
        await setState({
          signupPhoneActivation: null,
          [PHONE_VERIFICATION_CODE_STATE_KEY]: '',
          signupPhoneVerificationRequestedAt: null,
          signupPhoneVerificationPurpose: '',
        });
        throw sanitizePhoneCodeTimeoutError(error);
      }
    }

    async function acquirePhoneActivation(state = {}, options = {}) {
      const countryCandidates = resolveCountryCandidates(state);
      const blockedCountryIds = new Set(
        (Array.isArray(options?.blockedCountryIds) ? options.blockedCountryIds : [])
          .map((value) => normalizeCountryId(value, 0))
          .filter((id) => id > 0)
      );
      const allowedCountryIds = new Set(
        countryCandidates
          .map((entry) => normalizeCountryId(entry.id, 0))
          .filter((id) => id > 0 && !blockedCountryIds.has(id))
      );
      const preferredCountryLabel = countryCandidates[0]?.label || HERO_SMS_COUNTRY_LABEL;
      const resolveCountryLabelById = (countryId) => (
        countryCandidates.find((entry) => entry.id === normalizeCountryId(countryId, 0))?.label
        || preferredCountryLabel
      );
      const reuseEnabled = normalizeHeroSmsReuseEnabled(state.heroSmsReuseEnabled);
      const reusableActivation = normalizeActivation(state[REUSABLE_PHONE_ACTIVATION_STATE_KEY]);
      if (
        reuseEnabled
        &&
        reusableActivation
        && !blockedCountryIds.has(normalizeCountryId(reusableActivation.countryId, 0))
        && allowedCountryIds.has(reusableActivation.countryId)
        && reusableActivation.successfulUses < reusableActivation.maxUses
      ) {
        try {
          const reactivated = await reactivatePhoneActivation(state, reusableActivation);
          await addLog(
            `Step 9: reusing ${resolveCountryLabelById(reactivated.countryId)} number ${reactivated.phoneNumber} (${reactivated.successfulUses + 1}/${reactivated.maxUses}).`,
            'info'
          );
          return reactivated;
        } catch (error) {
          await addLog(`Step 9: failed to reuse phone number ${reusableActivation.phoneNumber}, falling back to a new number. ${error.message}`, 'warn');
          await clearReusableActivation();
        }
      }

      const activation = await requestPhoneActivation(state, { blockedCountryIds: Array.from(blockedCountryIds) });
      await addLog(
        `Step 9: acquired ${HERO_SMS_SERVICE_LABEL} / ${resolveCountryLabelById(activation.countryId)} number ${activation.phoneNumber}.`,
        'info'
      );
      return activation;
    }

    async function markActivationReusableAfterSuccess(state, activation) {
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizeHeroSmsReuseEnabled(state?.heroSmsReuseEnabled)) {
        await clearReusableActivation();
        return;
      }
      if (!normalizedActivation) {
        await clearReusableActivation();
        return;
      }

      const successfulUses = normalizedActivation.successfulUses + 1;
      if (successfulUses >= normalizedActivation.maxUses) {
        await completePhoneActivation(state, normalizedActivation);
        await clearReusableActivation();
        return;
      }

      await persistReusableActivation({
        ...normalizedActivation,
        successfulUses,
      });
    }

    async function waitForPhoneCodeOrRotateNumber(tabId, state, activation) {
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        throw new Error('Phone activation is missing.');
      }
      const providerLabel = normalizedActivation.provider === PHONE_SMS_PROVIDER_5SIM
        ? '5sim'
        : (normalizedActivation.provider === PHONE_SMS_PROVIDER_NEXSMS ? 'NexSMS' : 'HeroSMS');
      const usePageResend = normalizedActivation.provider !== PHONE_SMS_PROVIDER_5SIM;

      const waitSeconds = normalizePhoneCodeWaitSeconds(state?.phoneCodeWaitSeconds);
      const timeoutWindows = normalizePhoneCodeTimeoutWindows(state?.phoneCodeTimeoutWindows);
      const pollIntervalSeconds = normalizePhoneCodePollIntervalSeconds(state?.phoneCodePollIntervalSeconds);
      const pollMaxRounds = normalizePhoneCodePollMaxRounds(state?.phoneCodePollMaxRounds);
      let lastLoggedStatus = '';
      let lastLoggedPollCount = 0;
      let resendTriggeredForCurrentNumber = false;

      for (let windowIndex = 1; windowIndex <= timeoutWindows; windowIndex += 1) {
        await addLog(
          `Step 9: waiting up to ${waitSeconds} seconds for SMS on ${normalizedActivation.phoneNumber} (${windowIndex}/${timeoutWindows}).`,
          'info'
        );
        try {
          const code = await pollPhoneActivationCode(state, normalizedActivation, {
            actionLabel: windowIndex === 1
              ? `poll phone verification code from ${providerLabel}`
              : `poll resent phone verification code from ${providerLabel}`,
            timeoutMs: waitSeconds * 1000,
            intervalMs: pollIntervalSeconds * 1000,
            maxRounds: pollMaxRounds,
            onStatus: async ({ elapsedMs, pollCount, statusText }) => {
              const shouldLog = (
                pollCount === 1
                || statusText !== lastLoggedStatus
                || pollCount - lastLoggedPollCount >= 3
              );
              if (!shouldLog) {
                return;
              }
              lastLoggedStatus = statusText;
              lastLoggedPollCount = pollCount;
              await addLog(
                `Step 9: ${providerLabel} status for ${normalizedActivation.phoneNumber}: ${statusText} (${Math.ceil(elapsedMs / 1000)}s elapsed, round ${pollCount}/${pollMaxRounds}).`,
                'info'
              );
            },
          });
          return {
            code,
            replaceNumber: false,
          };
        } catch (error) {
          if (!isPhoneCodeTimeoutError(error)) {
            throw error;
          }

          if (windowIndex < timeoutWindows) {
            await addLog(
              `Step 9: no SMS arrived for ${normalizedActivation.phoneNumber} within ${waitSeconds} seconds, requesting another SMS.`,
              'warn'
            );
            if (!usePageResend) {
              await addLog(
                `Step 9: ${providerLabel} keeps the same verification page session and skips page resend; continue polling this number.`,
                'warn'
              );
              continue;
            }
            await requestAdditionalPhoneSms(state, normalizedActivation);
            if (resendTriggeredForCurrentNumber) {
              await addLog(
                `Step 9: resend already used once for ${normalizedActivation.phoneNumber}; continue polling without another page resend to avoid rate limit.`,
                'warn'
              );
              continue;
            }
            try {
              await resendPhoneVerificationCode(tabId);
              resendTriggeredForCurrentNumber = true;
              await addLog('Step 9: clicked "Resend text message" on the phone verification page.', 'info');
            } catch (resendError) {
              if (isPhoneResendThrottledError(resendError)) {
                await addLog(
                  `Step 9: resend is throttled for ${normalizedActivation.phoneNumber}, replacing number immediately. ${resendError.message}`,
                  'warn'
                );
                return {
                  code: '',
                  replaceNumber: true,
                  reason: 'resend_throttled',
                };
              }
              await addLog(`Step 9: failed to click resend on the phone verification page. ${resendError.message}`, 'warn');
            }
            continue;
          }

          await addLog(
            `Step 9: no SMS for ${normalizedActivation.phoneNumber} after ${timeoutWindows} window(s), replacing the number inside step 9.`,
            'warn'
          );
          return {
            code: '',
            replaceNumber: true,
            reason: `sms_timeout_after_${timeoutWindows}_windows`,
          };
        }
      }

      throw new Error('Phone verification did not complete successfully.');
    }

    async function completePhoneVerificationFlow(tabId, initialPageState = null) {
      let state = await getState();
      let activation = normalizeActivation(state[PHONE_ACTIVATION_STATE_KEY]);
      let pageState = initialPageState || await readPhonePageState(tabId);
      let shouldCancelActivation = false;
      let remainingResendRequests = Math.max(0, Number(state.verificationResendCount) || 0);
      const maxNumberReplacementAttempts = normalizePhoneReplacementLimit(
        state.phoneVerificationReplacementLimit
      );
      let usedNumberReplacementAttempts = 0;
      let preferReuseExistingActivationOnAddPhone = false;
      let addPhoneReentryWithSameActivation = 0;
      const countrySmsFailureCounts = new Map();
      const normalizeCountryFailureKey = (countryId, providerName = '') => {
        const provider = normalizePhoneSmsProvider(providerName || DEFAULT_PHONE_SMS_PROVIDER);
        if (provider === PHONE_SMS_PROVIDER_5SIM) {
          const code = normalizeFiveSimCountryCode(countryId, '');
          return code ? `${provider}:${code}` : '';
        }
        if (provider === PHONE_SMS_PROVIDER_NEXSMS) {
          const id = normalizeNexSmsCountryId(countryId, -1);
          return id >= 0 ? `${provider}:${id}` : '';
        }
        const id = normalizeCountryId(countryId, 0);
        return id > 0 ? `${provider}:${id}` : '';
      };
      const splitCountryFailureKey = (compoundKey = '') => {
        const [provider, countryKey] = String(compoundKey || '').split(':');
        return {
          provider: normalizePhoneSmsProvider(provider),
          countryKey: String(countryKey || '').trim(),
        };
      };
      const resolveCountryLabelByFailureKey = (compoundKey = '', providerName = '') => {
        const parsed = splitCountryFailureKey(compoundKey);
        const provider = normalizePhoneSmsProvider(providerName || parsed.provider || state?.phoneSmsProvider || DEFAULT_PHONE_SMS_PROVIDER);
        const countryKey = String(parsed.countryKey || '').trim();
        if (provider === PHONE_SMS_PROVIDER_5SIM) {
          const matched = resolveFiveSimCountryCandidates(state)
            .find((entry) => normalizeFiveSimCountryCode(entry.id || entry.code || '', '') === countryKey);
          return matched?.label || countryKey || 'Unknown country';
        }
        if (provider === PHONE_SMS_PROVIDER_NEXSMS) {
          const normalizedCountryId = normalizeNexSmsCountryId(countryKey, -1);
          const matched = resolveNexSmsCountryCandidates(state)
            .find((entry) => normalizeNexSmsCountryId(entry.id, -1) === normalizedCountryId);
          return matched?.label || `Country #${normalizedCountryId}`;
        }
        const normalizedCountryId = normalizeCountryId(countryKey, 0);
        const matched = resolveCountryCandidates(state)
          .find((entry) => normalizeCountryId(entry.id, 0) === normalizedCountryId);
        return matched?.label || `Country #${normalizedCountryId}`;
      };

      const getCountryFailureCount = (countryId) => {
        const provider = normalizePhoneSmsProvider(
          activation?.provider || state?.phoneSmsProvider || DEFAULT_PHONE_SMS_PROVIDER
        );
        const countryKey = normalizeCountryFailureKey(countryId, provider);
        if (!countryKey) {
          return 0;
        }
        return Math.max(0, Math.floor(Number(countrySmsFailureCounts.get(countryKey)) || 0));
      };

      const markCountrySmsFailure = async (countryId, reason = 'sms_timeout') => {
        const provider = normalizePhoneSmsProvider(
          activation?.provider || state?.phoneSmsProvider || DEFAULT_PHONE_SMS_PROVIDER
        );
        const countryKey = normalizeCountryFailureKey(countryId, provider);
        if (!countryKey) {
          return;
        }
        const nextCount = Math.max(0, Math.floor(Number(countrySmsFailureCounts.get(countryKey)) || 0)) + 1;
        countrySmsFailureCounts.set(countryKey, nextCount);
        if (nextCount >= PHONE_SMS_FAILURE_SKIP_THRESHOLD) {
          const countryLabel = resolveCountryLabelByFailureKey(countryKey);
          await addLog(
            `Step 9: ${countryLabel} reached ${nextCount} SMS failures (${reason}); next acquisition will fallback to other selected country candidates first.`,
            'warn'
          );
        }
      };

      const clearCountrySmsFailure = (countryId) => {
        const provider = normalizePhoneSmsProvider(
          activation?.provider || state?.phoneSmsProvider || DEFAULT_PHONE_SMS_PROVIDER
        );
        const countryKey = normalizeCountryFailureKey(countryId, provider);
        if (!countryKey) {
          return;
        }
        countrySmsFailureCounts.delete(countryKey);
      };

      const getBlockedCountryIds = () => {
        const activeProvider = normalizePhoneSmsProvider(
          activation?.provider || state?.phoneSmsProvider || DEFAULT_PHONE_SMS_PROVIDER
        );
        return Array.from(countrySmsFailureCounts.entries())
          .filter(([, count]) => Number(count) >= PHONE_SMS_FAILURE_SKIP_THRESHOLD)
          .map(([compoundKey]) => splitCountryFailureKey(compoundKey))
          .filter((entry) => entry.provider === activeProvider)
          .map((entry) => String(entry.countryKey || '').trim())
          .filter(Boolean);
      };

      try {
        while (true) {
          state = await getState();
          if (!activation) {
            activation = normalizeActivation(state[PHONE_ACTIVATION_STATE_KEY]);
          }

          if (pageState?.addPhonePage) {
            if (!activation) {
              activation = await acquirePhoneActivation(state, {
                blockedCountryIds: getBlockedCountryIds(),
              });
              shouldCancelActivation = true;
              await persistCurrentActivation(activation);
              addPhoneReentryWithSameActivation = 0;
            } else if (preferReuseExistingActivationOnAddPhone) {
              addPhoneReentryWithSameActivation += 1;
              if (addPhoneReentryWithSameActivation > 1) {
                usedNumberReplacementAttempts += 1;
                if (usedNumberReplacementAttempts > maxNumberReplacementAttempts) {
                  throw new Error(
                    `Step 9: phone verification did not succeed after ${maxNumberReplacementAttempts} number replacements. Last reason: returned_to_add_phone_loop.`
                  );
                }
                await addLog(
                  `Step 9: current number ${activation.phoneNumber} returned to add-phone repeatedly, replacing number (${usedNumberReplacementAttempts}/${maxNumberReplacementAttempts}).`,
                  'warn'
                );
                if (shouldCancelActivation && activation) {
                  await cancelPhoneActivation(state, activation);
                }
                await clearCurrentActivation();
                activation = null;
                shouldCancelActivation = false;
                preferReuseExistingActivationOnAddPhone = false;
                addPhoneReentryWithSameActivation = 0;
                pageState = {
                  ...pageState,
                  addPhonePage: true,
                  phoneVerificationPage: false,
                };
                continue;
              }
              await addLog(
                `Step 9: add-phone returned, re-submitting current number ${activation.phoneNumber} before requesting a new number.`,
                'warn'
              );
            }

            let submitResult = await submitPhoneNumber(tabId, activation.phoneNumber, activation);
            if (submitResult.addPhoneRejected) {
              const addPhoneRejectText = String(submitResult.errorText || submitResult.url || 'unknown error');
              if (isPhoneNumberUsedError(addPhoneRejectText)) {
                usedNumberReplacementAttempts += 1;
                if (usedNumberReplacementAttempts > maxNumberReplacementAttempts) {
                  throw new Error(
                    `Step 9: phone verification did not succeed after ${maxNumberReplacementAttempts} number replacements. Last reason: phone_number_used.`
                  );
                }

                await addLog(
                  `Step 9: add-phone rejected ${activation.phoneNumber} as already used (${addPhoneRejectText}), replacing number (${usedNumberReplacementAttempts}/${maxNumberReplacementAttempts}).`,
                  'warn'
                );
                if (shouldCancelActivation && activation) {
                  await cancelPhoneActivation(state, activation);
                }
                await clearCurrentActivation();
                activation = null;
                shouldCancelActivation = false;
                preferReuseExistingActivationOnAddPhone = false;
                addPhoneReentryWithSameActivation = 0;
                pageState = {
                  ...pageState,
                  ...submitResult,
                  addPhonePage: true,
                  phoneVerificationPage: false,
                };
                continue;
              }

              await addLog(
                `Step 9: add-phone rejected current number but did not mark it as used (${addPhoneRejectText}), retrying once with the same number.`,
                'warn'
              );
              submitResult = await submitPhoneNumber(tabId, activation.phoneNumber, activation);
              if (submitResult.addPhoneRejected) {
                throw new Error(
                  `Step 9: add-phone keeps rejecting current number without explicit "used" status: ${submitResult.errorText || submitResult.url || 'unknown error'}.`
                );
              }
            }

            await addLog('Step 9: submitted the phone number on add-phone page.', 'info');
            pageState = {
              ...pageState,
              ...submitResult,
              addPhonePage: false,
              phoneVerificationPage: true,
            };
            preferReuseExistingActivationOnAddPhone = false;
            addPhoneReentryWithSameActivation = 0;
          }

          if (!pageState?.phoneVerificationPage) {
            pageState = await readPhonePageState(tabId);
          }

          if (!pageState?.phoneVerificationPage) {
            return pageState;
          }

          if (!activation) {
            throw new Error('The auth page is waiting for a phone verification code, but no HeroSMS activation is stored for this run.');
          }

          let shouldReplaceNumber = false;
          let replaceReason = '';

          for (let attempt = 1; attempt <= DEFAULT_PHONE_SUBMIT_ATTEMPTS; attempt += 1) {
            throwIfStopped();

            const codeResult = await waitForPhoneCodeOrRotateNumber(tabId, state, activation);
            if (codeResult.replaceNumber) {
              shouldReplaceNumber = true;
              replaceReason = codeResult.reason || 'sms_not_received';
              break;
            }

            await setState({
              [PHONE_VERIFICATION_CODE_STATE_KEY]: String(codeResult.code || '').trim(),
            });
            await addLog(`Step 9: received phone verification code ${codeResult.code}.`, 'info');
            const submitResult = await submitPhoneVerificationCode(tabId, codeResult.code);

            if (submitResult.returnedToAddPhone) {
              await addLog(
                'Step 9: phone verification returned to add-phone after code submission, will try current number first.',
                'warn'
              );
              preferReuseExistingActivationOnAddPhone = true;
              pageState = {
                ...pageState,
                ...submitResult,
                addPhonePage: true,
                phoneVerificationPage: false,
              };
              break;
            }

            if (submitResult.invalidCode) {
              const invalidErrorText = String(submitResult.errorText || submitResult.url || 'unknown error');
              if (isPhoneNumberUsedError(invalidErrorText)) {
                shouldReplaceNumber = true;
                replaceReason = 'phone_number_used';
                await addLog(
                  `Step 9: phone number was rejected as already used (${invalidErrorText}), replacing with a new number immediately.`,
                  'warn'
                );
                break;
              }

              if (attempt >= DEFAULT_PHONE_SUBMIT_ATTEMPTS) {
                shouldReplaceNumber = true;
                replaceReason = 'code_rejected';
                await addLog(
                  `Step 9: phone verification code was rejected ${DEFAULT_PHONE_SUBMIT_ATTEMPTS} times (${invalidErrorText}), replacing the number.`,
                  'warn'
                );
                break;
              }

              if (remainingResendRequests > 0) {
                remainingResendRequests -= 1;
                await requestAdditionalPhoneSms(state, activation);
                try {
                  await resendPhoneVerificationCode(tabId);
                  await addLog('Step 9: clicked "Resend text message" after the phone code was rejected.', 'info');
                } catch (resendError) {
                  await addLog(`Step 9: failed to click resend after code rejection. ${resendError.message}`, 'warn');
                }
                await addLog(
                  `Step 9: phone verification code was rejected, requested another SMS (${remainingResendRequests} resend attempts left).`,
                  'warn'
                );
              } else {
                await addLog(
                  'Step 9: phone verification code was rejected and the configured resend budget is exhausted, retrying with the current activation window.',
                  'warn'
                );
              }
              continue;
            }

            await markActivationReusableAfterSuccess(state, activation);
            clearCountrySmsFailure(activation.countryId);
            shouldCancelActivation = false;
            await clearCurrentActivation();
            addPhoneReentryWithSameActivation = 0;
            await addLog('Step 9: phone verification finished, waiting for OAuth consent.', 'ok');
            return submitResult;
          }

          if (!shouldReplaceNumber) {
            if (pageState?.addPhonePage) {
              continue;
            }
            throw new Error('Phone verification did not complete successfully.');
          }

          if (
            activation
            && (replaceReason === 'resend_throttled' || /^sms_timeout_after_/i.test(String(replaceReason || '')))
          ) {
            await markCountrySmsFailure(activation.countryId, replaceReason || 'sms_timeout');
          }

          usedNumberReplacementAttempts += 1;
          if (usedNumberReplacementAttempts > maxNumberReplacementAttempts) {
            throw new Error(
              `Step 9: phone verification did not succeed after ${maxNumberReplacementAttempts} number replacements. Last reason: ${replaceReason || 'unknown'}.`
            );
          }

          if (shouldCancelActivation && activation) {
            await cancelPhoneActivation(state, activation);
          }
          await clearCurrentActivation();
          activation = null;
          shouldCancelActivation = false;
          addPhoneReentryWithSameActivation = 0;

          let returnResult = { addPhonePage: true, phoneVerificationPage: false };
          try {
            returnResult = await returnToAddPhone(tabId);
          } catch (returnError) {
            await addLog(`Step 9: failed to return to add-phone page before replacing number. ${returnError.message}`, 'warn');
          }

          await addLog(
            `Step 9: replacing number and retrying inside step 9 (${usedNumberReplacementAttempts}/${maxNumberReplacementAttempts}).`,
            'warn'
          );
          pageState = {
            ...pageState,
            ...returnResult,
            addPhonePage: true,
            phoneVerificationPage: false,
          };
        }
      } catch (error) {
        if (shouldCancelActivation && activation) {
          await cancelPhoneActivation(state, activation);
        }
        await clearCurrentActivation();
        throw sanitizePhoneRestartStep7Error(sanitizePhoneCodeTimeoutError(error));
      }
    }

    return {
      cancelSignupPhoneActivation,
      completeLoginPhoneVerificationFlow,
      completeSignupPhoneVerificationFlow,
      completePhoneVerificationFlow,
      finalizeSignupPhoneActivationAfterSuccess,
      finalizeLoginPhoneActivationAfterSuccess,
      normalizeActivation,
      pollPhoneActivationCode,
      prepareLoginPhoneActivation,
      prepareSignupPhoneActivation,
      reactivatePhoneActivation,
      requestPhoneActivation,
      waitForSignupPhoneCode,
      waitForLoginPhoneCode,
    };
  }

  return {
    createPhoneVerificationHelpers,
  };
});
