import { type NextRequest } from 'next/server';

import { failJson, okJson } from '../../../../../lib/api/response';
import { getServiceSupabaseClient } from '../../../../../lib/supabase/admin';
import { adminAuthFailureMessage, isAdminRequest } from '../../../../../lib/api/admin';

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function safeDateIso(value: Date): string {
  return value.toISOString();
}

type JobRow = {
  id: string;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
  error_code: string | null;
};

type EventRow = {
  event_code: string;
  story_id: string | null;
  order_id: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  amount_cents: number | null;
  status: string | null;
  payment_status: string | null;
  created_at: string;
};

function isSuccessfulOrder(row: OrderRow): boolean {
  return row.payment_status === 'paid' || row.status === 'completed' || row.status === 'paid';
}

function clampWindow(start: string | null, end: string | null): { from: string; to: string } {
  const now = new Date();
  const toDate = parseDate(end, now);
  const weekAgo = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromDate = parseDate(start, weekAgo);

  return {
    from: safeDateIso(fromDate),
    to: safeDateIso(toDate),
  };
}

function groupByField<T extends Record<string, unknown>>(rows: T[], field: keyof T): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = String(row[field]);
    if (key) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

function buildSummary(values: Pick<JobRow, 'type' | 'status' | 'error_code' | 'created_at' | 'updated_at'>[]) {
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  let latencySumMs = 0;

  for (const row of values) {
    byType[row.type] = (byType[row.type] ?? 0) + 1;
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

    const createdAtMs = Date.parse(row.created_at);
    const updatedAtMs = Date.parse(row.updated_at);

    if (Number.isFinite(createdAtMs) && Number.isFinite(updatedAtMs) && updatedAtMs >= createdAtMs) {
      latencySumMs += updatedAtMs - createdAtMs;
    }
  }

  const totalJobs = values.length;

  const previewJobs = values.filter((row) => row.type === 'preview');
  const fullJobs = values.filter((row) => row.type === 'full');

  const previewFailRate =
    previewJobs.length > 0
      ? Number((previewJobs.filter((row) => row.status === 'failed').length / previewJobs.length).toFixed(4))
      : 0;

  const fullFailRate =
    fullJobs.length > 0
      ? Number((fullJobs.filter((row) => row.status === 'failed').length / fullJobs.length).toFixed(4))
      : 0;

  const errorCodeCounts = groupByField(
    values.filter((row) => row.error_code !== null) as Array<JobRow & { error_code: string }>,
    'error_code',
  );

  return {
    totalJobs,
    averageJobLatencyMs: totalJobs > 0 ? Math.round(latencySumMs / totalJobs) : 0,
    byType,
    byStatus,
    previewJobs: previewJobs.length,
    fullJobs: fullJobs.length,
    previewFailRate,
    fullFailRate,
    topErrorCodes: Object.entries(errorCodeCounts)
      .map(([error_code, count]) => ({ error_code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };
}

function rankTop(rows: Record<string, number>): Array<{ code: string; count: number }> {
  return Object.entries(rows)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function buildKpiPayload(jobs: JobRow[], events: EventRow[], orders: OrderRow[], from: string, to: string) {
  const jobSummary = buildSummary(jobs);
  const eventCounts = groupByField(events, 'event_code');
  const paidOrders = orders.filter(isSuccessfulOrder);

  const previewReadyCount = jobs.filter((row) => row.type === 'preview' && row.status === 'ready').length;
  const fullQueuedCount = jobs.filter((row) => row.type === 'full' && row.status !== 'failed' && row.status !== 'dlq').length;
  const previewReadyToFullQueuedRate =
    previewReadyCount > 0 ? Number((fullQueuedCount / previewReadyCount).toFixed(4)) : 0;
  const paidRevenueCents = paidOrders.reduce((acc, row) => acc + (row.amount_cents ?? 0), 0);

  return {
    window: {
      from,
      to,
    },
    jobs: {
      totals: {
        count: jobSummary.totalJobs,
        byType: jobSummary.byType,
        byStatus: jobSummary.byStatus,
      },
      latency: {
        averageMs: jobSummary.averageJobLatencyMs,
      },
      quality: {
        previewFailRate: jobSummary.previewFailRate,
        fullFailRate: jobSummary.fullFailRate,
      },
      topErrorCodes: jobSummary.topErrorCodes,
      previewReady: previewReadyCount,
      fullQueued: fullQueuedCount,
      previewToFullQueuedRate: previewReadyToFullQueuedRate,
    },
    events: {
      total: events.length,
      topCodes: rankTop(eventCounts),
      byCode: eventCounts,
    },
    orders: {
      total: orders.length,
      paid: paidOrders.length,
      paidRevenueCents,
      avgPaidAmountCents:
        paidOrders.length > 0
          ? Number((paidRevenueCents / paidOrders.length).toFixed(2))
          : 0,
      paidRevenueUSD: Number((paidRevenueCents / 100).toFixed(2)),
      previewToPaidRate:
        previewReadyCount > 0 ? Number((paidOrders.length / previewReadyCount).toFixed(4)) : 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return failJson('UNAUTHORIZED', adminAuthFailureMessage(), 401);
  }

  const searchParams = req.nextUrl.searchParams;
  const { from, to } = clampWindow(searchParams.get('from'), searchParams.get('to'));

  try {
    const supabase = getServiceSupabaseClient();

    const [jobsResult, eventsResult, ordersResult] = await Promise.all([
      supabase
        .from('jobs')
        .select('id,type,status,created_at,updated_at,error_code')
        .gte('created_at', from)
        .lte('created_at', to),
      supabase
        .from('audit_events')
        .select('event_code,story_id,order_id,created_at')
        .gte('created_at', from)
        .lte('created_at', to),
      supabase
        .from('orders')
        .select('id,amount_cents,status,payment_status,created_at')
        .gte('created_at', from)
        .lte('created_at', to),
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

    const jobs = (jobsResult.data ?? []) as JobRow[];
    const events = (eventsResult.data ?? []) as EventRow[];
    const orders = (ordersResult.data ?? []) as OrderRow[];

    return okJson(buildKpiPayload(jobs, events, orders, from, to));
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}
