import type { NextRequest } from 'next/server';

export type AbuseOperation = 'preview' | 'full' | 'generic';

type AbuseResultBase = {
  allowed: boolean;
  statusCode: number;
  message: string;
  code: 'QUOTA_EXCEEDED' | 'CAPTCHA_REQUIRED' | 'BUDGET_BREAKER' | 'OK';
  headers?: Record<string, string>;
};

export type AbuseResult = AbuseResultBase;

type QuotaBucket = {
  count: number;
  resetAt: number;
};

type CaptchaBucket = {
  failures: number;
  resetAt: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const quotaBucket = new Map<string, QuotaBucket>();
const captchaBucket = new Map<string, CaptchaBucket>();

const previewGuestQuota = Number(process.env.GUEST_PREVIEW_QUOTA_PER_DAY ?? '3');
const previewIpQuota = Number(process.env.IP_PREVIEW_QUOTA_PER_DAY ?? '20');
const captchaFailureThreshold = Number(process.env.CAPTCHA_FAILURE_THRESHOLD ?? '3');
const captchaWindowMs = Number(process.env.CAPTCHA_WINDOW_MS ?? '300000');
const captchaSolvedBypassHeader = 'x-captcha-token';

const budgetQueueLimit = Number(process.env.BUDGET_FULL_QUEUE_LIMIT ?? '120');

function nowDayStart(now: number): number {
  const current = new Date(now);
  current.setUTCHours(0, 0, 0, 0);
  return current.getTime();
}

function readNumberEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getQuotaKey(prefix: string, key: string, now: number): string {
  return `${prefix}:${key}:${Math.floor(nowDayStart(now) / DAY_MS)}`;
}

function getQuotaConfig(): { guestLimit: number; ipLimit: number } {
  return {
    guestLimit: readNumberEnv(process.env.GUEST_PREVIEW_QUOTA_PER_DAY, previewGuestQuota),
    ipLimit: readNumberEnv(process.env.IP_PREVIEW_QUOTA_PER_DAY, previewIpQuota),
  };
}

function getCaptchaConfig(): { threshold: number; windowMs: number } {
  return {
    threshold: readNumberEnv(process.env.CAPTCHA_FAILURE_THRESHOLD, captchaFailureThreshold),
    windowMs: readNumberEnv(process.env.CAPTCHA_WINDOW_MS, captchaWindowMs),
  };
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }

  return req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || 'unknown';
}

function consumeQuota(key: string, limit: number, now: number): { allowed: boolean; count: number; resetAt: number } {
  const bucketKey = getQuotaKey('quota', key, now);
  const next = quotaBucket.get(bucketKey) ?? { count: 0, resetAt: nowDayStart(now) + DAY_MS };
  const updated = {
    count: next.count + 1,
    resetAt: next.resetAt,
  };

  quotaBucket.set(bucketKey, updated);

  return {
    allowed: updated.count <= limit,
    count: updated.count,
    resetAt: updated.resetAt,
  };
}

function getCaptchaState(key: string): CaptchaBucket {
  const now = Date.now();
  const current = captchaBucket.get(key);
  if (current && current.resetAt > now) {
    return current;
  }

  const fallback: CaptchaBucket = {
    failures: 0,
    resetAt: now + getCaptchaConfig().windowMs,
  };

  captchaBucket.set(key, fallback);
  return fallback;
}

function persistCaptcha(key: string, value: CaptchaBucket): void {
  captchaBucket.set(key, value);
}

function normalizeCaptchaToken(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resetCaptchaState(key: string): void {
  captchaBucket.delete(key);
}

export function assessAbuseControls(params: {
  req: NextRequest;
  actorType: 'user' | 'guest';
  actorId?: string | null;
  operation: AbuseOperation;
}): AbuseResult {
  const now = Date.now();

  if (params.operation !== 'preview' || params.actorType !== 'guest') {
    return {
      allowed: true,
      statusCode: 200,
      code: 'OK',
      message: 'allowed',
    };
  }

  const guestId = params.actorId;
  const ip = getClientIp(params.req);
  const { guestLimit, ipLimit } = getQuotaConfig();

  if (guestId && guestLimit > 0) {
    const sessionResult = consumeQuota(`guest:${guestId}`, guestLimit, now);
    if (!sessionResult.allowed) {
      return {
        allowed: false,
        statusCode: 429,
        code: 'QUOTA_EXCEEDED',
        message: 'Guest preview quota exceeded for this session. Please sign in to continue.',
        headers: {
          'x-abuse-reason': 'guest-quota-exceeded',
          'x-abuse-reset-at': new Date(sessionResult.resetAt).toISOString(),
        },
      };
    }
  }

  if (ipLimit > 0) {
    const ipResult = consumeQuota(`ip:${ip}`, ipLimit, now);
    if (!ipResult.allowed) {
      return {
        allowed: false,
        statusCode: 429,
        code: 'QUOTA_EXCEEDED',
        message: 'Request volume exceeded for this IP. Please try again later.',
        headers: {
          'x-abuse-reason': 'ip-quota-exceeded',
          'x-abuse-reset-at': new Date(ipResult.resetAt).toISOString(),
        },
      };
    }
  }

  const { threshold, windowMs } = getCaptchaConfig();
  const key = `captcha:${ip}`;
  const state = getCaptchaState(key);
  if (state.failures >= threshold) {
    const token = normalizeCaptchaToken(params.req.headers.get(captchaSolvedBypassHeader));

    if (!token) {
      return {
        allowed: false,
        statusCode: 403,
        code: 'CAPTCHA_REQUIRED',
        message: 'CAPTCHA challenge required before this operation can continue.',
        headers: {
          'x-abuse-reason': 'captcha-required',
          'x-abuse-reset-at': new Date(state.resetAt).toISOString(),
          'x-captcha-window-ms': String(windowMs),
        },
      };
    }

    if (token.length < 8) {
      return {
        allowed: false,
        statusCode: 403,
        code: 'CAPTCHA_REQUIRED',
        message: 'CAPTCHA token invalid. Please solve the challenge again.',
        headers: {
          'x-abuse-reason': 'captcha-invalid',
          'x-abuse-reset-at': new Date(state.resetAt).toISOString(),
        },
      };
    }

    resetCaptchaState(key);
  }

  return {
    allowed: true,
    statusCode: 200,
    code: 'OK',
    message: 'allowed',
  };
}

export function recordAbuseFailure(params: {
  req: NextRequest;
  operation: AbuseOperation;
  actorType: 'user' | 'guest';
}): void {
  if (params.operation !== 'preview' || params.actorType !== 'guest') {
    return;
  }

  const key = `captcha:${getClientIp(params.req)}`;
  const { windowMs, threshold } = getCaptchaConfig();
  const state = getCaptchaState(key);
  const nextFailures = Math.max(0, state.failures) + 1;

  persistCaptcha(key, {
    failures: nextFailures,
    resetAt: state.resetAt > Date.now() ? state.resetAt : Date.now() + windowMs,
  });

  if (nextFailures >= threshold) {
    console.warn('CAPTCHA placeholder challenge state entered', {
      ip: getClientIp(params.req),
      failures: nextFailures,
      threshold,
    });
  }
}

export function assessBudgetBreaker(params: {
  queuedFullJobs: number;
  runningFullJobs: number;
}): AbuseResult {
  const queueLimit = readNumberEnv(process.env.BUDGET_FULL_QUEUE_LIMIT, budgetQueueLimit);
  const totalLoad = params.queuedFullJobs + params.runningFullJobs;

  if (!Number.isFinite(queueLimit) || queueLimit <= 0) {
    return {
      allowed: true,
      statusCode: 200,
      code: 'OK',
      message: 'budget controls are disabled',
    };
  }

  if (totalLoad > queueLimit) {
    return {
      allowed: false,
      statusCode: 429,
      code: 'BUDGET_BREAKER',
      message: 'Cost budget breaker is active. Full generation is temporarily blocked.',
      headers: {
        'x-abuse-reason': 'budget-breaker',
        'x-budget-limit': String(queueLimit),
        'x-budget-load': String(totalLoad),
      },
    };
  }

  return {
    allowed: true,
    statusCode: 200,
    code: 'OK',
    message: 'allowed',
  };
}
