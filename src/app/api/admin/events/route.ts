import { type NextRequest } from 'next/server';

import { isAdminRequest, adminAuthFailureMessage } from '../../../../lib/api/admin';
import { failJson, okJson } from '../../../../lib/api/response';
import { getServiceSupabaseClient } from '../../../../lib/supabase/admin';

function toInt(value: string | null, fallback: number, min = 1, max = 168): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function groupByCode(rows: Array<{ event_code: string }>): Array<{ event_code: string; count: number }> {
  const grouped = new Map<string, number>();

  for (const row of rows) {
    grouped.set(row.event_code, (grouped.get(row.event_code) ?? 0) + 1);
  }

  return Array.from(grouped.entries())
    .map(([event_code, count]) => ({ event_code, count }))
    .sort((a, b) => b.count - a.count);
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return failJson('UNAUTHORIZED', adminAuthFailureMessage(), 401);
  }

  const { searchParams } = new URL(req.url);
  const hours = toInt(searchParams.get('hours'), 24);
  const now = new Date();
  const since = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

  try {
    const supabase = getServiceSupabaseClient();

    const [jobsResult, eventsResult, jobsFailedResult, jobsDlqResult] = await Promise.all([
      supabase
        .from('jobs')
        .select('type,status,created_at,updated_at,error_code')
        .gte('created_at', since),
      supabase
        .from('audit_events')
        .select('event_code,story_id,order_id,created_at')
        .gte('created_at', since),
      supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', since),
      supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'dlq')
        .gte('created_at', since),
    ]);

    if (jobsResult.error) {
      return failJson('INTERNAL_ERROR', jobsResult.error.message, 500);
    }

    if (eventsResult.error) {
      return failJson('INTERNAL_ERROR', eventsResult.error.message, 500);
    }

    const jobs = jobsResult.data ?? [];
    const events = eventsResult.data ?? [];

    const eventCodeCounts = groupByCode(events as Array<{ event_code: string }>);
    const failedCount = jobsFailedResult.count ?? 0;
    const dlqCount = jobsDlqResult.count ?? 0;

    const jobStatusCounts = {
      queued: jobs.filter((job) => job.status === 'queued').length,
      running: jobs.filter((job) => job.status === 'running').length,
      ready: jobs.filter((job) => job.status === 'ready').length,
      failed: jobs.filter((job) => job.status === 'failed').length,
      dlq: jobs.filter((job) => job.status === 'dlq').length,
    };

    const previewJobs = jobs.filter((job) => job.type === 'preview');
    const fullJobs = jobs.filter((job) => job.type === 'full');

    const previewFailRate =
      previewJobs.length > 0
        ? previewJobs.filter((job) => job.status === 'failed').length / previewJobs.length
        : 0;

    const fullFailRate =
      fullJobs.length > 0
        ? fullJobs.filter((job) => job.status === 'failed').length / fullJobs.length
        : 0;

    const errorCodeCounts = new Map<string, number>();
    for (const job of jobs as Array<{ error_code: string | null }>) {
      if (job.error_code) {
        errorCodeCounts.set(job.error_code, (errorCodeCounts.get(job.error_code) ?? 0) + 1);
      }
    }

    return okJson({
      window: {
        since,
        hours,
      },
      totals: {
        jobs: jobs.length,
        events: events.length,
        failedJobs: failedCount,
        dlqJobs: dlqCount,
      },
      jobs: {
        byStatus: jobStatusCounts,
        failRates: {
          preview: Number(previewFailRate.toFixed(4)),
          full: Number(fullFailRate.toFixed(4)),
        },
        topErrorCodes: Array.from(errorCodeCounts.entries()).map(([code, count]) => ({ code, count })),
      },
      events: {
        topCodes: eventCodeCounts,
      },
      alerts: {
        budgetBreakerPotential: fullJobs.length >= Number(process.env.BUDGET_FULL_QUEUE_LIMIT ?? '120'),
      },
    });
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}
