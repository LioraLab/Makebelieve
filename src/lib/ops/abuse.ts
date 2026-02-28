import { type NextRequest } from 'next/server';

type AbuseResource = 'story_create' | 'preview' | 'full_generation';
type AbuseCheckCode = 'ok' | 'rate_limited' | 'captcha_required' | 'budget_blocked';

type AbuseCounter = {
  count: number;
  windowStart: number;
};

type AbusiveAction = {
  allow: boolean;
  code: AbuseCheckCode;
  reason?: string;
  retryAfterSeconds?: number;
  guestRequests: number;
  ipRequests: number;
  budgetUsedCents: number;
};

type AbuseControlState = {
  dayKey: string;
  guestCounters: Map<string, AbuseCounter>;
  ipCounters: Map<string, AbuseCounter>;
  captchaCounters: Map<string, AbuseCounter>;
  budgetUsedCents: number;
};

type ParsedLimitEnv = {
  guestDailyQuota: number;
  ipDailyQuota: number;
  captchaTrigger: number;
  costPreviewCents: number;
  costFullGenerationCents: number;
  costStoryCreateCents: number;
  budgetBreakerEnabled: boolean;
  budgetBreakerDailyCents: number;
};

const state: AbuseControlState = {
  dayKey: currentDayKey(),
  guestCounters: new Map(),
  ipCounters: new Map(),
  captchaCounters: new Map(),
  budgetUsedCents: 0,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function currentDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed;
}

function parseBool(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function getConfig(): ParsedLimitEnv {
  return {
    guestDailyQuota: parsePositiveInt(process.env.ABUSE_GUEST_QUOTA_PER_DAY, 3),
    ipDailyQuota: parsePositiveInt(process.env.ABUSE_IP_QUOTA_PER_DAY, 20),
    captchaTrigger: parsePositiveInt(process.env.ABUSE_CAPTCHA_TRIGGER, 15),
    costPreviewCents: parsePositiveInt(process.env.ABUSE_COST_PREVIEW_CENTS, 20),
    costFullGenerationCents: parsePositiveInt(process.env.ABUSE_COST_FULL_CENTS, 250),
    costStoryCreateCents: parsePositiveInt(process.env.ABUSE_COST_STORY_CREATE_CENTS, 5),
    budgetBreakerEnabled: parseBool(process.env.BUDGET_BREAKER_ENABLED),
    budgetBreakerDailyCents: parsePositiveInt(process.env.BUDGET_BREAKER_DAILY_CENTS, 0),
  };
}

function getIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }

  const xrip = req.headers.get('x-real-ip');
  if (xrip?.trim()) {
    return xrip.trim();
  }

  return 'unknown-ip';
}

function parseActorWindow(now: number): AbuseCounter {
  return { count: 0, windowStart: now };
}

function resetDailyWindowIfNeeded(now: number): void {
  const current = currentDayKey(new Date(now));
  if (current !== state.dayKey) {
    state.dayKey = current;
    state.guestCounters = new Map();
    state.ipCounters = new Map();
    state.captchaCounters = new Map();
    state.budgetUsedCents = 0;
  }
}

function incrementCounter(map: Map<string, AbuseCounter>, key: string, now: number): AbuseCounter {
  const existing = map.get(key);
  if (!existing || now - existing.windowStart > DAY_MS) {
    const next = parseActorWindow(now);
    map.set(key, next);
    return next;
  }

  existing.count += 1;
  return existing;
}

function getCounter(map: Map<string, AbuseCounter>, key: string): AbuseCounter | undefined {
  return map.get(key);
}

export function evaluateAbuseControl(input: {
  req: NextRequest;
  resource: AbuseResource;
  actorType: 'user' | 'guest';
  actorKey?: string | null;
  includeEstimatedCost?: boolean;
}): AbusiveAction {
  const now = Date.now();
  resetDailyWindowIfNeeded(now);

  const cfg = getConfig();
  const ip = getIp(input.req);
  const ipCounter = incrementCounter(state.ipCounters, `ip:${ip}`, now);
  const guestCounter =
    input.actorType === 'guest' && input.actorKey
      ? incrementCounter(state.guestCounters, `guest:${input.actorKey}`, now)
      : undefined;

  const reasonTemplate = {
    guestRequests: guestCounter?.count ?? 0,
    ipRequests: ipCounter.count,
    budgetUsedCents: state.budgetUsedCents,
  } as const;

  if (cfg.budgetBreakerEnabled && cfg.budgetBreakerDailyCents > 0) {
    const estimatedCost = estimateCost(input.resource, cfg);
    if (state.budgetUsedCents + estimatedCost > cfg.budgetBreakerDailyCents) {
      return {
        allow: false,
        code: 'budget_blocked',
        reason: 'budget breaker active: daily budget would be exceeded',
        retryAfterSeconds: 60 * 60,
        ...reasonTemplate,
      };
    }
  }

  if (input.actorType === 'guest' && guestCounter && guestCounter.count > cfg.guestDailyQuota) {
    return {
      allow: false,
      code: 'rate_limited',
      reason: 'guest quota exceeded',
      retryAfterSeconds: 24 * 60 * 60,
      ...reasonTemplate,
    };
  }

  if (ipCounter.count > cfg.ipDailyQuota) {
    const captchaCounter = incrementCounter(state.captchaCounters, `captcha:${ip}`, now);
    if (captchaCounter.count > cfg.captchaTrigger) {
      return {
        allow: false,
        code: 'captcha_required',
        reason: 'captcha required due to excessive requests',
        retryAfterSeconds: 10 * 60,
        ...reasonTemplate,
      };
    }

    return {
      allow: false,
      code: 'rate_limited',
      reason: 'IP quota exceeded',
      retryAfterSeconds: 60,
      ...reasonTemplate,
    };
  }

  if (input.includeEstimatedCost) {
    const estimatedCost = estimateCost(input.resource, cfg);
    state.budgetUsedCents += estimatedCost;
  }

  return {
    allow: true,
    code: 'ok',
    ...reasonTemplate,
  };
}

function estimateCost(resource: AbuseResource, cfg: ParsedLimitEnv): number {
  if (resource === 'preview') {
    return cfg.costPreviewCents;
  }

  if (resource === 'full_generation') {
    return cfg.costFullGenerationCents;
  }

  return cfg.costStoryCreateCents;
}

export function getAbuseStateSnapshot() {
  const cfg = getConfig();

  return {
    window: state.dayKey,
    budget: {
      enabled: cfg.budgetBreakerEnabled && cfg.budgetBreakerDailyCents > 0,
      limitCents: cfg.budgetBreakerDailyCents,
      usedCents: state.budgetUsedCents,
      remainingCents: Math.max(0, cfg.budgetBreakerDailyCents - state.budgetUsedCents),
    },
    quotas: {
      guestDaily: cfg.guestDailyQuota,
      ipDaily: cfg.ipDailyQuota,
      captchaTrigger: cfg.captchaTrigger,
      activeGuests: Array.from(state.guestCounters.entries())
        .filter(([, value]) => value.count > 0)
        .map(([key, value]) => ({ key, count: value.count })),
      activeIps: Array.from(state.ipCounters.entries())
        .filter(([, value]) => value.count > 0)
        .map(([key, value]) => ({ key, count: value.count })),
    },
  };
}
