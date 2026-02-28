import { timingSafeEqual, createHmac } from 'node:crypto';
import { type NextRequest } from 'next/server';

import { failJson, okJson } from '../../../../lib/api/response';
import { getServiceSupabaseClient } from '../../../../lib/supabase/admin';
import { sendOperationalAlert } from '../../../../lib/api/alerts';

type ActorRecord = Record<string, unknown>;

type WebhookBody = {
  event_id?: string;
  eventType?: string;
  event_type?: string;
  alert_name?: string;
  data?: {
    id?: string;
    status?: string;
    checkout?: { id?: string };
    transaction_id?: string;
    order_id?: string;
    custom_data?: string | Record<string, unknown>;
    passthrough?: string;
    story_id?: string;
  };
  custom_data?: string;
  passthrough?: string;
  id?: string;
  alert_id?: string;
};

type StoryStatus =
  | 'payment_pending'
  | 'paid'
  | 'refunded'
  | 'chargeback'
  | 'disputed';

type FulfillmentStatus =
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

const ALLOWED_TIMESTAMP_SKEW_SECONDS = 5 * 60;

function parseSignature(raw: string | null): { ts: number; signature: string } | null {
  if (!raw) {
    return null;
  }

  const match = /\bts=([^;\s]+)\b/.exec(raw);
  const hash = /\bh1=([a-f0-9]{64})\b/i.exec(raw);

  if (!match?.[1] || !hash?.[1]) {
    return null;
  }

  const tsRaw = Number(match[1]);
  if (!Number.isFinite(tsRaw)) {
    return null;
  }

  const timestamp = tsRaw < 1e12 ? tsRaw * 1000 : tsRaw;
  const ageMs = Math.abs(Date.now() - timestamp);
  if (ageMs / 1000 > ALLOWED_TIMESTAMP_SKEW_SECONDS) {
    return null;
  }

  return { ts: tsRaw, signature: hash[1] };
}

function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    return false;
  }

  const parsed = parseSignature(signatureHeader);
  if (!parsed) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(`${parsed.ts}:${rawBody}`)
    .digest();

  const provided = Buffer.from(parsed.signature, 'hex');
  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}

function coerceObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return value as Record<string, unknown>;
}

function parseTextJson(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseEventType(body: WebhookBody): string {
  return (body.eventType || body.event_type || body.alert_name || '').trim().toLowerCase();
}

function parseEventId(body: WebhookBody): string {
  if (typeof body.event_id === 'string' && body.event_id.trim()) {
    return body.event_id.trim();
  }

  if (typeof body.id === 'string' && body.id.trim()) {
    return body.id.trim();
  }

  if (typeof body.alert_id === 'string' && body.alert_id.trim()) {
    return body.alert_id.trim();
  }

  const txId = body.data?.id;
  if (typeof txId === 'string' && txId.trim()) {
    return txId.trim();
  }

  return '';
}

function resolveStoryId(body: WebhookBody, custom: Record<string, unknown>): string | null {
  const candidates = [
    custom.story_id,
    custom.storyId,
    body.data?.story_id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

function resolveCheckoutSessionId(body: WebhookBody, custom: Record<string, unknown>): string | null {
  if (typeof body.data?.checkout === 'object' && body.data?.checkout !== null) {
    const id = coerceObject(body.data.checkout).id;
    if (typeof id === 'string' && id.length > 0) {
      return id;
    }
  }

  return (
    (typeof body.data?.transaction_id === 'string' && body.data.transaction_id) ||
    (typeof body.data?.order_id === 'string' && body.data.order_id) ||
    (typeof custom.checkout_session_id === 'string' ? custom.checkout_session_id : null) ||
    (typeof custom.order_id === 'string' ? custom.order_id : null) ||
    null
  );
}

function resolveOrderCandidate(custom: Record<string, unknown>): string | null {
  const candidates = [
    custom.order_id,
    custom.orderId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

function classifyEvent(eventType: string, eventStatus: string): 'paid' | 'refunded' | 'disputed' | 'chargeback' | 'ignored' {
  const normalizedStatus = eventStatus.toLowerCase();

  if (eventType === 'paddle.transaction.paid' ||
    eventType === 'transaction.paid' ||
    eventType === 'payment_succeeded' ||
    normalizedStatus === 'completed' ||
    normalizedStatus === 'paid') {
    return 'paid';
  }

  if (eventType.includes('chargeback') || normalizedStatus === 'chargeback') {
    return 'chargeback';
  }

  if (eventType.includes('refund') || normalizedStatus === 'refunded') {
    return 'refunded';
  }

  if (eventType.includes('dispute') || normalizedStatus === 'disputed') {
    return 'disputed';
  }

  return 'ignored';
}

function mapStoryState(kind: 'paid' | 'refunded' | 'disputed' | 'chargeback'): {
  storyStatus: StoryStatus;
  fulfillmentStatus: FulfillmentStatus;
  isActivePaid: boolean;
  orderStatus: 'paid' | 'refunded' | 'disputed' | 'chargeback' | 'failed';
} {
  if (kind === 'paid') {
    return {
      storyStatus: 'paid',
      fulfillmentStatus: 'full_queued',
      isActivePaid: true,
      orderStatus: 'paid',
    };
  }

  if (kind === 'refunded') {
    return {
      storyStatus: 'refunded',
      fulfillmentStatus: 'delivery_locked',
      isActivePaid: false,
      orderStatus: 'refunded',
    };
  }

  if (kind === 'chargeback') {
    return {
      storyStatus: 'chargeback',
      fulfillmentStatus: 'delivery_locked',
      isActivePaid: false,
      orderStatus: 'chargeback',
    };
  }

  if (kind === 'disputed') {
    return {
      storyStatus: 'disputed',
      fulfillmentStatus: 'delivery_locked',
      isActivePaid: false,
      orderStatus: 'disputed',
    };
  }

  throw new Error(`Unsupported event kind: ${kind}`);
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureHeader =
    req.headers.get('paddle-signature') ||
    req.headers.get('Paddle-Signature') ||
    req.headers.get('x-paddle-signature');

  if (!verifyWebhookSignature(rawBody, signatureHeader)) {
    return failJson('UNAUTHORIZED', 'Invalid webhook signature', 401);
  }

  let payload: WebhookBody;
  try {
    payload = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return failJson('VALIDATION_ERROR', 'Invalid JSON payload', 400);
  }

  const eventType = parseEventType(payload);
  if (!eventType) {
    return failJson('VALIDATION_ERROR', 'Missing event_type', 400);
  }

  const eventId = parseEventId(payload);
  if (!eventId) {
    return failJson('VALIDATION_ERROR', 'Missing event_id', 400);
  }

  const eventStatus = typeof payload.data?.status === 'string' ? payload.data.status : '';
  const customFromData = payload.data ? coerceObject(payload.data.custom_data) : {};
  const passthroughFromData = payload.data ? parseTextJson(payload.data.passthrough) : {};
  const customFromTop = parseTextJson(payload.custom_data);
  const passthroughTop = parseTextJson(payload.passthrough);

  const customPayload: ActorRecord = {
    ...customFromData,
    ...customFromTop,
    ...passthroughFromData,
    ...passthroughTop,
  };

  const storyId = resolveStoryId(payload, customPayload);
  const checkoutSessionId = resolveCheckoutSessionId(payload, customPayload);
  const eventKind = classifyEvent(eventType, eventStatus);

  if (eventKind === 'ignored') {
    return okJson({ ok: true, status: 'ignored', action: 'ignored' });
  }

  const nowIso = new Date().toISOString();

  const supabase = getServiceSupabaseClient();

  const { data: duplicated } = await supabase
    .from('orders')
    .select('id,story_id')
    .eq('paddle_event_id', eventId)
    .maybeSingle();

  if (duplicated) {
    return okJson({ ok: true, status: 'duplicate', action: 'idempotent' });
  }

  let orderId: string | null = resolveOrderCandidate(customPayload);
  let storyLookup: string | null = storyId;

  if (storyLookup && !isValidUuid(storyLookup)) {
    storyLookup = null;
  }

  if (!orderId && checkoutSessionId) {
    const { data: orderBySession } = await supabase
      .from('orders')
      .select('id, story_id')
      .eq('checkout_session_id', checkoutSessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderBySession) {
      orderId = orderBySession.id;
      storyLookup = orderBySession.story_id;
    }
  }

  if (!orderId && storyLookup) {
    const { data: orderByStory } = await supabase
      .from('orders')
      .select('id')
      .eq('story_id', storyLookup)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderByStory) {
      orderId = orderByStory.id;
    }
  }

  if (!orderId) {
    return failJson('NOT_FOUND', 'No matching order for webhook event', 404);
  }

  const { data: orderRow } = await supabase
    .from('orders')
    .select('id, story_id, status')
    .eq('id', orderId)
    .single();

  if (!orderRow) {
    return failJson('NOT_FOUND', 'Order not found', 404);
  }

  const resolvedStoryId = storyLookup ?? orderRow.story_id;

  const mapped = mapStoryState(eventKind);

  const orderPayload: Record<string, unknown> = {
    status: mapped.orderStatus,
    is_active_paid: mapped.isActivePaid,
    paddle_event_id: eventId,
    webhook_processed_at: nowIso,
    webhook_raw: payload,
    updated_at: nowIso,
  };
  if (checkoutSessionId) {
    orderPayload.checkout_session_id = checkoutSessionId;
  }

  const { error: orderUpdateError } = await supabase
    .from('orders')
    .update(orderPayload)
    .eq('id', orderRow.id);

  if (orderUpdateError) {
    return failJson('INTERNAL_ERROR', orderUpdateError.message, 500);
  }

  if (eventKind === 'paid' && resolvedStoryId) {
    const { error: storyUpdateError } = await supabase
      .from('stories')
      .update({
        payment_status: mapped.storyStatus,
        fulfillment_status: mapped.fulfillmentStatus,
        updated_at: nowIso,
      })
      .eq('id', resolvedStoryId);

    if (storyUpdateError) {
      return failJson('INTERNAL_ERROR', storyUpdateError.message, 500);
    }

    const { data: existingJob } = await supabase
      .from('jobs')
      .select('id')
      .eq('story_id', resolvedStoryId)
      .eq('type', 'full')
      .in('status', ['queued', 'running'])
      .maybeSingle();

    if (!existingJob) {
      const { error: jobError } = await supabase.from('jobs').insert({
        story_id: resolvedStoryId,
        type: 'full',
        status: 'queued',
        attempt_seq: 1,
        max_attempts: 3,
        payload: {
          source: 'paddle_webhook',
          event_id: eventId,
          event_type: eventType,
          order_id: orderRow.id,
        },
      });
      if (jobError && jobError.code !== '23505') {
        return failJson('INTERNAL_ERROR', jobError.message, 500);
      }
    }
  } else if (resolvedStoryId) {
    const { error: storyUpdateError } = await supabase
      .from('stories')
      .update({
        payment_status: mapped.storyStatus,
        fulfillment_status: mapped.fulfillmentStatus,
        updated_at: nowIso,
      })
      .eq('id', resolvedStoryId);

    if (storyUpdateError) {
      return failJson('INTERNAL_ERROR', storyUpdateError.message, 500);
    }
  }

  await sendOperationalAlert({
    kind: `paddle.${eventType}`,
    severity: eventKind === 'paid' ? 'info' : 'warning',
    title: `Processed paddle webhook ${eventType}`,
    message: `Processed Paddle webhook ${eventType} for story ${resolvedStoryId ?? 'unknown'}`,
    details: {
      eventKind,
      actor: req.method,
      storyId: resolvedStoryId,
      orderId: orderRow.id,
    },
  });

  await supabase.from('audit_events').insert({
    story_id: resolvedStoryId,
    order_id: orderRow.id,
    actor_id: null,
    event_code: `paddle.${eventType}`,
    event_data: payload,
  });

  return okJson({ ok: true, status: eventKind, action: 'processed' });
}
