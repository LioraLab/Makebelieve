import { type NextRequest } from 'next/server';

import { isAdminRequest, adminAuthFailureMessage } from '../../../../lib/api/admin';
import { failJson, okJson } from '../../../../lib/api/response';
import { getServiceSupabaseClient } from '../../../../lib/supabase/admin';

type JobStatus = 'queued' | 'running' | 'ready' | 'failed' | 'dlq';
type JobType = 'preview' | 'full' | 'pdf';
type JobRow = {
  id: string;
  story_id: string;
  type: JobType | string;
  status: JobStatus | string;
  error_code: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type EventRow = {
  event_code: string;
  created_at: string;
};

type OrderRow = {
  status: string;
  amount_cents: number | null;
  payment_status: string | null;
  created_at: string;
};

type StoryRow = {
  payment_status: string | null;
  fulfillment_status: string | null;
  created_at: string;
};

type BacklogStatus = 'proposed' | 'ready' | 'running' | 'complete' | 'archived';

type ExperimentArtifact = {
  id: string;
  title: string;
  type: 'pricing' | 'copy' | 'theme';
  owner: string;
  status: BacklogStatus;
  hypothesis: string;
  successMetric: string;
  acceptanceCriteria: string;
  expectedOwnerImpact: string;
  plannedStart: string;
  plannedEnd: string | null;
};

const BETA_LAUNCH_BACKLOG: ExperimentArtifact[] = [
  {
    id: 'EXP-001',
    title: 'Pricing tier optimization for premium conversion',
    type: 'pricing',
    owner: 'growth@makebelieve',
    status: 'proposed',
    hypothesis:
      'A 15% temporary discount for Premium during week 1 will increase first-time paid conversion while keeping margin impact manageable.',
    successMetric: 'Checkout completion rate (+4% relative to baseline) and trial-to-paid conversion (+2pp).',
    acceptanceCriteria: 'If paid conversions increase by ≥2pp for two consecutive daily cohorts, keep and expand to week 2.',
    expectedOwnerImpact: 'Recommends dynamic pricing review during beta week 1.',
    plannedStart: '2026-03-01',
    plannedEnd: null,
  },
  {
    id: 'EXP-002',
    title: 'Copy experiment for hero CTA and trust messaging',
    type: 'copy',
    owner: 'growth@makebelieve',
    status: 'ready',
    hypothesis:
      'Trust-first messaging (privacy + fast preview completion) directly increases preview start-to-checkout conversion.',
    successMetric: 'Preview→Checkout ratio improves by ≥3pp and preview dropout rate falls by 2pp.',
    acceptanceCriteria: 'Pass threshold on both conversion and completion metrics across two complete weekdays.',
    expectedOwnerImpact: 'Improves top-of-funnel quality and reduces paid CAC for low-intent visitors.',
    plannedStart: '2026-03-04',
    plannedEnd: null,
  },
  {
    id: 'EXP-003',
    title: 'Theme defaults and seasonal variants',
    type: 'theme',
    owner: 'editorial@makebelieve',
    status: 'ready',
    hypothesis:
      'Curated seasonal themes increase emotional resonance and reduce time-to-preview abandonment.',
    successMetric: 'Time to first preview completion decreases by 10% and preview→checkout improves by 2pp.',
    acceptanceCriteria: 'Maintain preview completion ≥92% with no increase in full generation retry rate.',
    expectedOwnerImpact: 'Supports conversion quality on weekends and holiday launches.',
    plannedStart: '2026-03-06',
    plannedEnd: null,
  },
];

function parseHours(value: string | null): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 168;
  }

  return Math.min(Math.max(parsed, 24), 24 * 30);
}

function safePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return Number((numerator / denominator).toFixed(4));
}

function sumAmountCents(rows: Array<{ amount_cents: number | null }>): number {
  return rows.reduce((acc, row) => acc + (row.amount_cents ?? 0), 0);
}

function toDateKey(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return 'invalid';
  }

  return date.toISOString().slice(0, 10);
}

function countBy<T>(rows: T[], selector: (row: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const key = selector(row);
    result[key] = (result[key] ?? 0) + 1;
  }

  return result;
}

function quantile(values: number[], quantileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const maxIndex = sorted.length - 1;
  const rawIndex = Math.ceil(quantileValue * sorted.length) - 1;
  const index = Math.max(0, Math.min(maxIndex, rawIndex));
  return sorted[index] ?? 0;
}

function latencyMsRows(rows: Array<{ started_at: string | null; completed_at: string | null }>): number[] {
  const latencies: number[] = [];

  for (const row of rows) {
    if (!row.started_at || !row.completed_at) {
      continue;
    }

    const start = Date.parse(row.started_at);
    const end = Date.parse(row.completed_at);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      latencies.push(end - start);
    }
  }

  return latencies;
}

function buildEmptyDaySeries(from: string, to: string): string[] {
  const dayCursor = new Date(from);
  const end = new Date(to);
  const days: string[] = [];

  dayCursor.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);

  while (dayCursor <= end) {
    days.push(dayCursor.toISOString().slice(0, 10));
    dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
  }

  return days;
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return failJson('UNAUTHORIZED', adminAuthFailureMessage(), 401);
  }

  const { searchParams } = new URL(req.url);
  const reportType = (searchParams.get('report') || 'baseline').toLowerCase();
  const hours = parseHours(searchParams.get('hours'));
  const now = new Date();
  const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const fromISOString = from.toISOString();
  const toISOString = now.toISOString();

  if (!['baseline', 'weekly', 'backlog'].includes(reportType)) {
    return failJson('VALIDATION_ERROR', `Unsupported report type: ${reportType}`, 400);
  }

  try {
    const supabase = getServiceSupabaseClient();

    const [jobsResult, eventsResult, ordersResult, storiesResult] = await Promise.all([
      supabase
        .from('jobs')
        .select('id,story_id,type,status,error_code,created_at,started_at,completed_at')
        .gte('created_at', fromISOString),
      supabase
        .from('audit_events')
        .select('event_code,created_at')
        .gte('created_at', fromISOString),
      supabase
        .from('orders')
        .select('status,amount_cents,payment_status,created_at')
        .gte('created_at', fromISOString),
      supabase
        .from('stories')
        .select('payment_status,fulfillment_status,created_at')
        .gte('created_at', fromISOString),
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
    if (storiesResult.error) {
      return failJson('INTERNAL_ERROR', storiesResult.error.message, 500);
    }

    const jobs = (jobsResult.data ?? []) as JobRow[];
    const events = (eventsResult.data ?? []) as EventRow[];
    const orders = (ordersResult.data ?? []) as OrderRow[];
    const stories = (storiesResult.data ?? []) as StoryRow[];

    const jobsByType = countBy(jobs, (job) => job.type);
    const jobsByStatus = countBy(jobs, (job) => job.status);
    const eventsByCode = countBy(events, (eventRow) => eventRow.event_code);
    const ordersByStatus = countBy(orders, (order) => order.status);
    const storiesByPaymentStatus = countBy(stories, (story) => story.payment_status ?? 'unknown');
    const storiesByFulfillmentStatus = countBy(stories, (story) => story.fulfillment_status ?? 'unknown');

    const previewJobs = jobs.filter((job) => job.type === 'preview');
    const fullJobs = jobs.filter((job) => job.type === 'full');
    const failedPreviewJobs = previewJobs.filter((job) => job.status === 'failed');
    const failedFullJobs = fullJobs.filter((job) => job.status === 'failed');
    const dlqJobs = jobs.filter((job) => job.status === 'dlq');

    const paidOrders = orders.filter((order) => order.status === 'paid');
    const refundedOrders = orders.filter((order) => order.status === 'refunded');
    const disputedOrders = orders.filter((order) => order.status === 'disputed');

    const paidWebhookEvents = eventsByCode['paddle.transaction.paid'] ?? 0;
    const unknownEvents = events.filter((event) =>
      !event.event_code.startsWith('paddle.transaction.') && !event.event_code.startsWith('story.') &&
      !event.event_code.startsWith('job.') && !event.event_code.startsWith('admin.'),
    );

    const baseline = {
      stories: {
        created: stories.length,
        paymentStatus: storiesByPaymentStatus,
        fulfillmentStatus: storiesByFulfillmentStatus,
      },
      jobs: {
        total: jobs.length,
        byType: jobsByType,
        byStatus: jobsByStatus,
        failures: {
          previewFailed: failedPreviewJobs.length,
          fullFailed: failedFullJobs.length,
          dlq: dlqJobs.length,
        },
      },
      orders: {
        total: orders.length,
        byStatus: ordersByStatus,
        paidAmountCents: sumAmountCents(paidOrders),
        paidCount: paidOrders.length,
        refundedCount: refundedOrders.length,
        disputedCount: disputedOrders.length,
        avgPaidAmountCents:
          paidOrders.length > 0 ? Math.round(sumAmountCents(paidOrders) / paidOrders.length) : 0,
      },
      events: {
        total: events.length,
        byCode: eventsByCode,
        paidWebhookEvents,
        unknownEventCount: unknownEvents.length,
      },
      rates: {
        previewSuccessRate: safePercent(
          previewJobs.filter((job) => job.status === 'ready').length,
          previewJobs.length,
        ),
        fullSuccessRate: safePercent(
          fullJobs.filter((job) => job.status === 'ready').length,
          fullJobs.length,
        ),
        fullFailureRate: safePercent(failedFullJobs.length, fullJobs.length),
        previewFailureRate: safePercent(failedPreviewJobs.length, previewJobs.length),
        jobsDlqRate: safePercent(dlqJobs.length, jobs.length),
        orderPaidRate: safePercent(paidOrders.length, orders.length),
        unknownEventRate: safePercent(unknownEvents.length, Math.max(1, events.length)),
      },
      latency: {
        previewP95Ms: quantile(latencyMsRows(previewJobs), 0.95),
        fullP95Ms: quantile(latencyMsRows(fullJobs), 0.95),
      },
    };

    if (reportType === 'backlog') {
      return okJson({
        generatedAt: toISOString,
        reportType: 'backlog',
        window: {
          from: fromISOString,
          to: toISOString,
          hours,
        },
        backlog: BETA_LAUNCH_BACKLOG,
      });
    }

    if (reportType === 'weekly') {
      const daySeries = buildEmptyDaySeries(fromISOString, toISOString);
      const dailyRollup: Array<{
        date: string;
        storiesCreated: number;
        previewReady: number;
        fullReady: number;
        paidOrders: number;
        paidCents: number;
        paidEvents: number;
      }> = daySeries.map((date) => ({
        date,
        storiesCreated: 0,
        previewReady: 0,
        fullReady: 0,
        paidOrders: 0,
        paidCents: 0,
        paidEvents: 0,
      }));

      const dayIndex = new Map<string, number>();
      daySeries.forEach((date, index) => {
        dayIndex.set(date, index);
      });

      for (const story of stories) {
        const key = toDateKey(story.created_at);
        const idx = dayIndex.get(key);
        if (idx === undefined) {
          continue;
        }
        dailyRollup[idx].storiesCreated += 1;
      }

      for (const job of jobs) {
        const key = toDateKey(job.created_at);
        const idx = dayIndex.get(key);
        if (idx === undefined) {
          continue;
        }

        if (job.type === 'preview' && job.status === 'ready') {
          dailyRollup[idx].previewReady += 1;
        }

        if (job.type === 'full' && job.status === 'ready') {
          dailyRollup[idx].fullReady += 1;
        }
      }

      for (const event of events) {
        const key = toDateKey(event.created_at);
        const idx = dayIndex.get(key);
        if (idx === undefined) {
          continue;
        }

        if (event.event_code === 'paddle.transaction.paid') {
          dailyRollup[idx].paidEvents += 1;
        }
      }

      for (const order of orders) {
        if (order.status !== 'paid') {
          continue;
        }

        const key = toDateKey(order.created_at);
        const idx = dayIndex.get(key);
        if (idx === undefined) {
          continue;
        }

        dailyRollup[idx].paidOrders += 1;
        dailyRollup[idx].paidCents += order.amount_cents ?? 0;
      }

      return okJson({
        generatedAt: toISOString,
        reportType: 'weekly',
        window: {
          from: fromISOString,
          to: toISOString,
          hours,
        },
        summary: baseline,
        backlog: BETA_LAUNCH_BACKLOG,
        weekly: dailyRollup,
        notes: [
          'Series uses ingestion timestamps at UTC day granularity.',
          'Events and orders are sourced from the same reporting window defined by `hours`.',
          'Use baseline report (`report=baseline`) for a single KPI snapshot and backlog state.',
        ],
      });
    }

    return okJson({
      generatedAt: toISOString,
      reportType: 'baseline',
      window: {
        from: fromISOString,
        to: toISOString,
        hours,
      },
      summary: baseline,
      backlog: BETA_LAUNCH_BACKLOG,
    });
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}
