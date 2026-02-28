import { type NextRequest } from 'next/server';

type ActorLike = {
  type: 'user' | 'guest';
  userId?: string | null;
  guestSessionId?: string | null;
};

type AbuseGuardKey = `${string}:${string}`;

type AbuseBucket = {
  windowStart: number;
  count: number;
};

type BudgetBucket = {
  periodStart: number;
  units: number;
};

export type AbuseResult =
  | { allowed: true }
  | {
      allowed: false;
      status: number;
      code: 'FORBIDDEN' | 'CONFLICT';
      message: string;
      reason:
        | 'rate_limit_exceeded'
        | 'captcha_required'
        | 'daily_budget_exceeded';
      retryAfterSeconds?: number;
    };

const REQUEST_WINDOW_MS = 60 * 1000;
const requestBuckets = new Map<AbuseGuardKey, AbuseBucket>();
const budgetBuckets = new Map<AbuseGuardKey, BudgetBucket>();

type OperationKey =
  | 'story_create'
  | 'checkout'
  | 'upload_sign';

type ControlOptions = {
  operation: OperationKey;
};

function envInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function toIdentity(actor: ActorLike): AbuseGuardKey {
  if (actor.type === 'user' && actor.userId) {
    return `user:${actor.userId}`;
  }

  if (actor.guestSessionId) {
    return `guest:${actor.guestSessionId}`;
  }

  return 'anon:unknown';
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const direct = req.headers.get('x-real-ip')?.trim();
  return forwarded || direct || req.headers.get('x-client-ip')?.trim() || 'ip:unknown';
}

function consumeWindowCounter(key: AbuseGuardKey, now = Date.now()): {
  count: number;
  retryAfterSeconds: number;
} {
  const existing = requestBuckets.get(key);
  const isNewWindow = !existing || now - existing.windowStart >= REQUEST_WINDOW_MS;

  const state = isNewWindow
    ? { windowStart: now, count: 1 }
    : { ...existing, count: existing.count + 1 };

  requestBuckets.set(key, state);

  const retryAfterMs = existing && !isNewWindow
    ? REQUEST_WINDOW_MS - (now - existing.windowStart)
    : 0;

  return {
    count: state.count,
    retryAfterSeconds: Math.max(1, Math.ceil(Math.max(retryAfterMs, 0) / 1000)),
  };
}

function consumeBudget(key: AbuseGuardKey, cost: number, now = Date.now(), maxUnits: number): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const periodStart = Math.floor(now / dayMs) * dayMs;
  const existing = budgetBuckets.get(key);

  const state =
    !existing || existing.periodStart !== periodStart
      ? { periodStart, units: cost }
      : { periodStart, units: existing.units + cost };

  budgetBuckets.set(key, state);
  return state.units;
}

function buildRequestKey(req: NextRequest, actor: ActorLike, operation: OperationKey): AbuseGuardKey {
  const actorId = toIdentity(actor);
  const clientIp = getClientIp(req);
  return `${operation}:${actorId}:${clientIp}` as AbuseGuardKey;
}

function operationLimits(operation: OperationKey) {
  const rateLimit = envInt(`GUARD_RATE_LIMIT_PER_MINUTE_${operation.toUpperCase()}`, 0);
  const rateLimitEnabled = rateLimit > 0;
  const captchaEnabled = (process.env.GUARD_CAPTCHA_ENABLED || 'false').toLowerCase() === 'true';
  const captchaThreshold = envInt(
    `GUARD_CAPTCHA_THRESHOLD_${operation.toUpperCase()}`,
    envInt('GUARD_CAPTCHA_THRESHOLD', 15),
  );
  const dailyBudget = envInt(`GUARD_DAILY_BUDGET_UNITS_${operation.toUpperCase()}`, 0);
  const operationCost = envInt(`GUARD_OPERATION_COST_${operation.toUpperCase()}`, 1);

  return {
    rateLimit,
    rateLimitEnabled,
    captchaEnabled,
    captchaThreshold,
    dailyBudget,
    operationCost,
  };
}

export function checkAbuseControls(req: NextRequest, actor: ActorLike, options: ControlOptions): AbuseResult {
  const { operation } = options;
  const { rateLimit, rateLimitEnabled, captchaEnabled, captchaThreshold, dailyBudget, operationCost } =
    operationLimits(operation);

  const budgetEnabled = dailyBudget > 0;
  const key = buildRequestKey(req, actor, operation);

  if (rateLimitEnabled) {
    const { count, retryAfterSeconds } = consumeWindowCounter(key, Date.now());

    if (count > rateLimit) {
      return {
        allowed: false,
        status: 429,
        code: 'FORBIDDEN',
        reason: 'rate_limit_exceeded',
        message: `Rate limit exceeded for ${operation}; please retry after ${retryAfterSeconds}s`,
        retryAfterSeconds,
      };
    }

    if (captchaEnabled && count >= captchaThreshold) {
      const captcha = req.headers.get('x-captcha-token')?.trim();
      if (!captcha) {
        return {
          allowed: false,
          status: 403,
          code: 'FORBIDDEN',
          reason: 'captcha_required',
          message:
            'CAPTCHA required due to sustained activity. Please provide x-captcha-token header.',
          retryAfterSeconds,
        };
      }
    }
  }

  if (budgetEnabled) {
    const identity = toIdentity(actor);
    const budgetKey = `budget:${operation}:${identity}` as AbuseGuardKey;
    const usedUnits = consumeBudget(budgetKey, operationCost, Date.now(), dailyBudget);

    if (usedUnits > dailyBudget) {
      return {
        allowed: false,
        status: 403,
        code: 'CONFLICT',
        reason: 'daily_budget_exceeded',
        message: `Daily budget breaker triggered for ${operation}`,
      };
    }
  }

  return { allowed: true };
}
