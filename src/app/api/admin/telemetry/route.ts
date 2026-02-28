import { type NextRequest } from 'next/server';

import { getServiceSupabaseClient } from '../../../../lib/supabase/admin';
import { adminAuthFailureMessage, isAdminRequest } from '../../../../lib/api/admin';
import { failJson, okJson } from '../../../../lib/api/response';
import { evaluateOperationalAlerts, TELEMETRY_THRESHOLDS, buildAlertPayload } from '../../../../lib/ops/alerts';
import { getAbuseStateSnapshot } from '../../../../lib/ops/abuse';

function toInt(value: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

type JobRecord = {
  id: string;
  status: string;
  type: string;
  created_at: string;
  updated_at: string;
  story_id: string | null;
};

type EventRecord = {
  id: string;
  event_code: string;
  story_id: string | null;
  order_id: string | null;
};

function summarizeValues(rows: { status: string; type: string; created_at: string; updated_at: string }[]) {
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let totalLatencySampleMs = 0;

  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    byType[row.type] = (byType[row.type] ?? 0) + 1;

    const createdAtMs = Date.parse(row.created_at);
    const updatedAtMs = Date.parse(row.updated_at);
    if (Number.isFinite(createdAtMs) && Number.isFinite(updatedAtMs) && updatedAtMs >= createdAtMs) {
      totalLatencySampleMs += updatedAtMs - createdAtMs;
    }
  }

  return {
    total: rows.length,
    byStatus,
    byType,
    avgLatencyMs: rows.length > 0 ? Math.round(totalLatencySampleMs / rows.length) : 0,
  };
}

function summarizeEvents(rows: EventRecord[]) {
  const byCode: Record<string, number> = {};
  for (const row of rows) {
    byCode[row.event_code] = (byCode[row.event_code] ?? 0) + 1;
  }

  const knownCodes = new Set(['paddle.transaction.paid', 'paddle.transaction.refunded', 'paddle.chargeback']);
  const unknownCodes = rows.filter((row) => !knownCodes.has(row.event_code));
  return {
    total: rows.length,
    byCode,
    unknownCodeRate: rows.length > 0 ? unknownCodes.length / rows.length : 0,
  };
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return failJson('UNAUTHORIZED', adminAuthFailureMessage(), 401);
  }

  const limit = Math.min(Math.max(toInt(req.nextUrl.searchParams.get('limit') || '500'), 1), 1000);

  try {
    const client = getServiceSupabaseClient();

    const [jobsResult, eventsResult, ordersResult] = await Promise.all([
      client
        .from('jobs')
        .select('id,status,type,story_id,created_at,updated_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(limit),
      client
        .from('audit_events')
        .select('id,event_code,story_id,order_id,created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(limit),
      client
        .from('orders')
        .select('status,amount_cents,payment_status', { count: 'exact' }),
    ]);

    if (jobsResult.error) {
      return failJson('INTERNAL_ERROR', jobsResult.error.message, 500);
    }
    if (eventsResult.error) {
      return failJson('INTERNAL_ERROR', eventsResult.error.message, 500);
    }
    if (ordersResult.error) {
      return failJson('INTERNAL_ERROR', ordersResult.error.message, 500);
    }

    const jobs = (jobsResult.data ?? []) as JobRecord[];
    const events = (eventsResult.data ?? []) as EventRecord[];
    const jobSummary = summarizeValues(jobs);
    const eventSummary = summarizeEvents(events);

    const totalOrderAmountCents = (ordersResult.data ?? []).reduce(
      (acc, row: { amount_cents?: number | null }) => acc + (row.amount_cents ?? 0),
      0,
    );

    const abuseState = getAbuseStateSnapshot();
    const alerts = evaluateOperationalAlerts({
      jobs: jobSummary,
      abuse: {
        ipOverQuotaCount: abuseState.quotas.activeIps.filter((ip) => ip.count > abuseState.quotas.ipDaily).length,
        guestOverQuotaCount: abuseState.quotas.activeGuests.filter(
          (guest) => guest.count > abuseState.quotas.guestDaily,
        ).length,
        budgetRemainingCents: abuseState.budget.remainingCents,
        budgetEnabled: abuseState.budget.enabled,
      },
      events: {
        total: eventSummary.total,
        unknownCodeRate: eventSummary.unknownCodeRate,
      },
    });

    return okJson({
      generatedAt: new Date().toISOString(),
      jobs: {
        total: jobSummary.total,
        byStatus: jobSummary.byStatus,
        byType: jobSummary.byType,
        avgLatencyMs: jobSummary.avgLatencyMs,
        totalCount: jobsResult.count ?? jobSummary.total,
      },
      events: {
        total: eventSummary.total,
        byCode: eventSummary.byCode,
        unknownCodeRate: Number(eventSummary.unknownCodeRate.toFixed(4)),
        totalCount: eventsResult.count ?? eventSummary.total,
      },
      orders: {
        totalCents: totalOrderAmountCents,
        totalCount: ordersResult.count,
      },
      abuse: abuseState,
      thresholds: TELEMETRY_THRESHOLDS,
      alerts,
      alertPayloads: alerts.map((alert) => buildAlertPayload(alert)),
    });
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}
