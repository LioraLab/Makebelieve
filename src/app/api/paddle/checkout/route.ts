import { randomUUID, createHash } from 'node:crypto';
import { type NextRequest } from 'next/server';

import { failJson, okJson } from '../../../../lib/api/response';
import { getGuestSessionId } from '../../../../lib/api/request';
import { getServiceSupabaseClient } from '../../../../lib/supabase/admin';

type Actor =
  | {
      type: 'user';
      userId: string;
      guestSessionId: null;
    }
  | {
      type: 'guest';
      userId: null;
      guestSessionId: string;
    };

type CheckoutPlan = 'digital' | 'premium' | 'bundle';

type StoryRow = {
  id: string;
  user_id: string | null;
  guest_session_id: string | null;
  payment_status: 'payment_pending' | 'paid' | 'refunded' | 'chargeback' | 'disputed' | null;
  fulfillment_status:
    | 'none'
    | 'preview_queued'
    | 'preview_generating'
    | 'preview_ready'
    | 'preview_failed'
    | 'full_queued'
    | 'full_generating'
    | 'full_ready'
    | 'full_failed'
    | 'delivery_locked';
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_PLANS: CheckoutPlan[] = ['digital', 'premium', 'bundle'];
const DEFAULT_PLAN: CheckoutPlan = 'digital';
const DEFAULT_AMOUNT_CENTS = {
  digital: 1999,
  premium: 2499,
  bundle: 3499,
};

function resolveActor(req: NextRequest): Actor | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer user:')) {
    const userId = auth.slice('Bearer user:'.length).trim();
    if (userId) {
      return { type: 'user', userId, guestSessionId: null };
    }
  }

  const guestSessionId = getGuestSessionId(req);
  if (!guestSessionId) {
    return null;
  }

  return { type: 'guest', userId: null, guestSessionId };
}

function parseCheckoutPayload(raw: unknown): { storyId: string; plan: CheckoutPlan } | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const body = raw as { storyId?: unknown; plan?: unknown };
  const storyId = typeof body.storyId === 'string' ? body.storyId.trim() : '';
  const planValue = typeof body.plan === 'string' ? body.plan.trim().toLowerCase() : DEFAULT_PLAN;

  if (!storyId || !UUID_RE.test(storyId)) {
    return null;
  }

  if (!VALID_PLANS.includes(planValue as CheckoutPlan)) {
    return null;
  }

  return { storyId, plan: planValue as CheckoutPlan };
}

function planPrice(plan: CheckoutPlan) {
  const envAmount = process.env[`PADDLE_PRICE_CENTS_${plan.toUpperCase()}`];
  if (envAmount) {
    const parsed = Number.parseInt(envAmount, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return DEFAULT_AMOUNT_CENTS[plan];
}

function formatFallbackCheckoutUrl({
  storyId,
  plan,
  orderId,
  sessionId,
}: {
  storyId: string;
  plan: CheckoutPlan;
  orderId: string;
  sessionId: string;
}) {
  const base = process.env.PADDLE_CHECKOUT_FALLBACK_URL ?? 'https://sandbox-checkout.paddle.com';
  const url = new URL(base);
  url.pathname = '/checkout/start';
  url.searchParams.set('storyId', storyId);
  url.searchParams.set('plan', plan);
  url.searchParams.set('orderId', orderId);
  url.searchParams.set('session', sessionId);

  return url.toString();
}

async function createCheckoutSession({
  storyId,
  plan,
  orderId,
  sessionId,
  amountCents,
}: {
  storyId: string;
  plan: CheckoutPlan;
  orderId: string;
  sessionId: string;
  amountCents: number;
}) {
  const apiBaseUrl = process.env.PADDLE_API_BASE_URL;
  const apiKey = process.env.PADDLE_API_KEY;
  const priceId = process.env[`PADDLE_PRICE_${plan.toUpperCase()}`];

  if (!apiBaseUrl || !apiKey || !priceId) {
    return {
      checkoutUrl: formatFallbackCheckoutUrl({
        storyId,
        plan,
        orderId,
        sessionId,
      }),
      checkoutSessionId: sessionId,
      currency: process.env.PADDLE_DEFAULT_CURRENCY ?? 'USD',
    };
  }

  const response = await fetch(`${apiBaseUrl}/transactions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'x-idempotency-key': sessionId,
    },
    body: JSON.stringify({
      items: [{
        price_id: priceId,
        quantity: 1,
      }],
      amount: amountCents,
      currency: process.env.PADDLE_DEFAULT_CURRENCY ?? 'USD',
      custom_data: {
        story_id: storyId,
        order_id: orderId,
        plan,
        session_id: sessionId,
      },
    }),
  });

  if (!response.ok) {
    return {
      checkoutUrl: formatFallbackCheckoutUrl({
        storyId,
        plan,
        orderId,
        sessionId,
      }),
      checkoutSessionId: sessionId,
      currency: process.env.PADDLE_DEFAULT_CURRENCY ?? 'USD',
    };
  }

  const payload = (await response.json()) as {
    data?: {
      id?: string;
      checkout?: {
        url?: string;
        checkout_url?: string;
      };
      url?: string;
      checkout_url?: string;
      currency?: string;
    };
  };

  const providerCheckoutUrl =
    payload?.data?.checkout?.url ??
    payload?.data?.checkout?.checkout_url ??
    payload?.data?.url ??
    payload?.data?.checkout_url;

  if (!providerCheckoutUrl) {
    return {
      checkoutUrl: formatFallbackCheckoutUrl({
        storyId,
        plan,
        orderId,
        sessionId,
      }),
      checkoutSessionId: payload?.data?.id ?? sessionId,
      currency: payload?.data?.currency ?? process.env.PADDLE_DEFAULT_CURRENCY ?? 'USD',
    };
  }

  return {
    checkoutUrl: providerCheckoutUrl,
    checkoutSessionId: payload?.data?.id ?? sessionId,
    currency: payload?.data?.currency ?? process.env.PADDLE_DEFAULT_CURRENCY ?? 'USD',
  };
}

export async function POST(req: NextRequest) {
  const actor = resolveActor(req);
  if (!actor) {
    return failJson('UNAUTHORIZED', 'guest session id or auth header required', 401);
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return failJson('VALIDATION_ERROR', 'Invalid JSON body', 400);
    }

    const parsed = parseCheckoutPayload(body);
    if (!parsed) {
      return failJson(
        'VALIDATION_ERROR',
        'storyId must be a UUID and plan must be one of digital/premium/bundle',
        400,
      );
    }

    const amountCents = planPrice(parsed.plan);

    const supabase = getServiceSupabaseClient();

    let storyQuery = supabase
      .from('stories')
      .select('id, payment_status, fulfillment_status, user_id, guest_session_id')
      .eq('id', parsed.storyId);

    if (actor.type === 'user') {
      storyQuery = storyQuery.eq('user_id', actor.userId);
    } else {
      storyQuery = storyQuery.eq('guest_session_id', actor.guestSessionId);
    }

    const { data: story, error: storyError } = await storyQuery.single<StoryRow>();

    if (storyError) {
      if (storyError.code === 'PGRST116') {
        return failJson('NOT_FOUND', 'Story not found', 404);
      }
      return failJson('INTERNAL_ERROR', storyError.message, 500);
    }

    if (!story) {
      return failJson('NOT_FOUND', 'Story not found', 404);
    }

    if (story.fulfillment_status !== 'preview_ready') {
      return failJson('CONFLICT', 'Story preview must be ready before checkout', 409);
    }

    if (story.payment_status === 'paid') {
      return failJson('CONFLICT', 'Story is already paid', 409);
    }

    const sessionBase = `${parsed.storyId}:${actor.type === 'user' ? actor.userId : actor.guestSessionId}`;
    const sessionId = createHash('sha1').update(sessionBase).update(randomUUID()).digest('hex').slice(0, 32);

    const orderId = randomUUID();
    const createdAt = new Date().toISOString();
    const { error: insertOrderError } = await supabase.from('orders').insert({
      id: orderId,
      story_id: parsed.storyId,
      status: 'created',
      checkout_session_id: sessionId,
      plan_code: parsed.plan,
      amount_cents: amountCents,
      currency: process.env.PADDLE_DEFAULT_CURRENCY ?? 'USD',
      provider: 'paddle',
      is_active_paid: false,
      created_at: createdAt,
      updated_at: createdAt,
    });

    if (insertOrderError) {
      return failJson('INTERNAL_ERROR', insertOrderError.message, 500);
    }

    const checkout = await createCheckoutSession({
      storyId: parsed.storyId,
      plan: parsed.plan,
      orderId,
      sessionId,
      amountCents,
    });

    const finalSessionId = checkout.checkoutSessionId || sessionId;
    const updateCheckout = await supabase
      .from('orders')
      .update({
        checkout_session_id: finalSessionId,
        currency: checkout.currency,
      })
      .eq('id', orderId);

    if (updateCheckout.error) {
      return failJson('INTERNAL_ERROR', updateCheckout.error.message, 500);
    }

    return okJson({ checkoutUrl: checkout.checkoutUrl, orderId, checkout_session_id: finalSessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return failJson('INTERNAL_ERROR', message, 500);
  }
}
