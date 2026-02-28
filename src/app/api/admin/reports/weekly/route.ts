import { type NextRequest } from 'next/server';

import { getServiceSupabaseClient } from '../../../../../lib/supabase/admin';
import { adminAuthFailureMessage, isAdminRequest } from '../../../../../lib/api/admin';
import { failJson, okJson } from '../../../../../lib/api/response';

type Alert = {
  code: string;
  title: string;
  message: string;
  level: 'critical' | 'warning' | 'info';
};

type JobStatus = 'queued' | 'running' | 'ready' | 'failed' | 'dlq';

type ReportWindow = {
  since: string;
  until: string;
  days: number;
};

const JOB_STATUS: JobStatus[] = ['queued', 'running', 'ready', 'failed', 'dlq'];
type SupabaseClientLike = ReturnType<typeof getServiceSupabaseClient>;

type AuditEventSampleRow = {
  event_code: string;
  story_id: string | null;
  order_id: string | null;
  created_at: string;
};

function toInt(input: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(input ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(parsed, max));
}

function normalizeRate(value: number, total: number) {
  return total > 0 ? Number((value / total).toFixed(4)) : 0;
}

async function countJobs(supabase: SupabaseClientLike, opts: { since: string; status?: string; type?: string }) {
  let query = supabase.from('jobs').select('id', { count: 'exact', head: true }).gte('created_at', opts.since);

  if (opts.status) {
    query = query.eq('status', opts.status);
  }

  if (opts.type) {
    query = query.eq('type', opts.type);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`jobs count failed (${opts.status ?? 'all'}/${opts.type ?? 'all'}): ${error.message}`);
  }

  return count ?? 0;
}

async function countOrders(supabase: SupabaseClientLike, opts: { since: string; status?: string }) {
  let query = supabase
    .from('orders')
    .select('id,amount_cents', { count: 'exact', head: true })
    .gte('created_at', opts.since);

  if (opts.status) {
    query = query.eq('status', opts.status);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`orders count failed (${opts.status ?? 'all'}): ${error.message}`);
  }

  return count ?? 0;
}

function buildAlerts({ jobDlqRate, fullFailRate, previewFailRate, paidToFullRate }: {
  jobDlqRate: number;
  fullFailRate: number;
  previewFailRate: number;
  paidToFullRate: number;
}) {
  const alerts: Alert[] = [];

  if (jobDlqRate > 0.05) {
    alerts.push({
      code: 'ops.job_dlq_rate',
      title: 'DLQ율 임계치 초과',
      message: `Job DLQ rate ${jobDlqRate} > 0.05`,
      level: 'critical',
    });
  }

  if (fullFailRate > 0.08) {
    alerts.push({
      code: 'ops.full_failed_rate',
      title: 'full job 실패율 임계치 초과',
      message: `full job failure rate ${fullFailRate} > 0.08`,
      level: 'warning',
    });
  }

  if (previewFailRate > 0.12) {
    alerts.push({
      code: 'ops.preview_failed_rate',
      title: 'preview job 실패율 높음',
      message: `preview job failure rate ${previewFailRate} > 0.12`,
      level: 'warning',
    });
  }

  if (paidToFullRate < 0.9) {
    alerts.push({
      code: 'ops.full_delivery_rate',
      title: '유료→완성 전달률 저조',
      message: `paid story to full-ready rate ${paidToFullRate} < 0.9`,
      level: 'warning',
    });
  }

  return alerts;
}

async function eventSamples(supabase: SupabaseClientLike, since: string, limit: number) {
  const { data, count, error } = await supabase
    .from('audit_events')
    .select('event_code,story_id,order_id,created_at', { count: 'exact' })
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`events sample query failed: ${error.message}`);
  }

  const grouped: Record<string, number> = {};
  for (const row of (data ?? []) as AuditEventSampleRow[]) {
    const code = row.event_code;
    grouped[code] = (grouped[code] ?? 0) + 1;
  }

  return {
    topEvents: Object.entries(grouped)
      .map(([event_code, count]) => ({ event_code, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10),
    totalCount: count ?? 0,
    sampledCount: data?.length ?? 0,
  };
}

async function countStories(supabase: SupabaseClientLike, opts: { since: string; fulfillmentStatus?: string; paymentStatus?: string }) {
  let query = supabase
    .from('stories')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', opts.since);

  if (opts.fulfillmentStatus) {
    query = query.eq('fulfillment_status', opts.fulfillmentStatus);
  }

  if (opts.paymentStatus) {
    query = query.eq('payment_status', opts.paymentStatus);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`stories count failed: ${error.message}`);
  }

  return count ?? 0;
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return failJson('UNAUTHORIZED', adminAuthFailureMessage(), 401);
  }

  const { searchParams } = new URL(req.url);
  const days = toInt(searchParams.get('days'), 7, 1, 30);
  const eventLimit = toInt(searchParams.get('eventLimit'), 200, 50, 1000);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const until = new Date().toISOString();

  const window: ReportWindow = {
    since,
    until,
    days,
  };

  try {
    const supabase = getServiceSupabaseClient();

    const [jobsTotal, storiesCreated, storiesPaid, storiesFullReady, storiesPreviewReady, jobsByStatusCount, paidOrderCount, pendingOrderCount, paidWithStartedCount] =
      await Promise.all([
        countJobs(supabase, { since }),
        countStories(supabase, { since }),
        countStories(supabase, { since, paymentStatus: 'paid' }),
        countStories(supabase, { since, fulfillmentStatus: 'full_ready' }),
        countStories(supabase, {
          since,
          fulfillmentStatus: 'preview_ready',
        }),
        Promise.all(JOB_STATUS.map((status) => countJobs(supabase, { since, status }))),
        countOrders(supabase, { since, status: 'paid' }),
        countOrders(supabase, { since, status: 'created' }),
        countOrders(supabase, { since }),
      ]);

    const jobsByStatus = JOB_STATUS.reduce<Record<string, number>>((acc, status, index) => {
      acc[status] = jobsByStatusCount[index] ?? 0;
      return acc;
    }, {});

    const jobsPreview = await Promise.all(
      ['queued', 'running', 'ready', 'failed', 'dlq'].map((status) =>
        countJobs(supabase, { since, type: 'preview', status }),
      ),
    );

    const jobsFull = await Promise.all(
      ['queued', 'running', 'ready', 'failed', 'dlq'].map((status) =>
        countJobs(supabase, { since, type: 'full', status }),
      ),
    );

    const previewJobsTotal = jobsPreview.reduce((acc, value) => acc + value, 0);
    const fullJobsTotal = jobsFull.reduce((acc, value) => acc + value, 0);
    const previewFailRate = normalizeRate(jobsPreview[3], previewJobsTotal);
    const fullFailRate = normalizeRate(jobsFull[3], fullJobsTotal);
    const jobDlqRate = normalizeRate(jobsByStatus.dlq ?? 0, jobsTotal);

    const paidToFullRate = normalizeRate(storiesFullReady, storiesPaid);
    const previewReadyRate = normalizeRate(storiesPreviewReady, storiesCreated);

    const paidOrderAmount = await supabase
      .from('orders')
      .select('amount_cents')
      .gte('created_at', since)
      .eq('status', 'paid');

    if (paidOrderAmount.error) {
      return failJson('INTERNAL_ERROR', paidOrderAmount.error.message, 500);
    }

    const totalPaidCents = (paidOrderAmount.data ?? []).reduce((acc, row: { amount_cents: number | null }) => {
      return acc + (row.amount_cents ?? 0);
    }, 0);

    const events = await eventSamples(supabase, since, eventLimit);
    const alerts = buildAlerts({
      jobDlqRate,
      fullFailRate,
      previewFailRate,
      paidToFullRate,
    });

    return okJson({
      generatedAt: new Date().toISOString(),
      window,
      kpis: {
        jobs: {
          total: jobsTotal,
          byStatus: {
            queued: jobsByStatus.queued,
            running: jobsByStatus.running,
            ready: jobsByStatus.ready,
            failed: jobsByStatus.failed,
            dlq: jobsByStatus.dlq,
          },
          byType: {
            preview: {
              total: previewJobsTotal,
              queued: jobsPreview[0],
              running: jobsPreview[1],
              ready: jobsPreview[2],
              failed: jobsPreview[3],
              dlq: jobsPreview[4],
              failRate: previewFailRate,
            },
            full: {
              total: fullJobsTotal,
              queued: jobsFull[0],
              running: jobsFull[1],
              ready: jobsFull[2],
              failed: jobsFull[3],
              dlq: jobsFull[4],
              failRate: fullFailRate,
            },
          },
          jobDlqRate,
        },
        payments: {
          orders: {
            total: paidWithStartedCount,
            paid: paidOrderCount,
            pending: pendingOrderCount,
          },
          weeklyNewRevenueCents: totalPaidCents,
        },
        funnel: {
          previewRequestToReadyRate: previewReadyRate,
          fullDeliveryRate: paidToFullRate,
          checkoutToPaidRate: normalizeRate(paidOrderCount, paidOrderCount + pendingOrderCount),
        },
      },
      events: {
        top: events.topEvents,
        totalCount: events.totalCount,
        sampledCount: events.sampledCount,
      },
      alerts,
      experimentReadiness: {
        openSlots: Math.max(0, 3 - alerts.length),
        suggestedBacklog: ['EXP-PRICE-01', 'EXP-COPY-01', 'EXP-THEME-01'],
      },
    });
  } catch (error) {
    return failJson('INTERNAL_ERROR', error instanceof Error ? error.message : 'Unexpected error', 500);
  }
}
