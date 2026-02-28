import { type NextRequest } from 'next/server';

import { isAdminRequest, adminAuthFailureMessage } from '../../../../lib/api/admin';
import { failJson, okJson } from '../../../../lib/api/response';
import { getServiceSupabaseClient } from '../../../../lib/supabase/admin';
import { sendOperationalAlert, type AlertSendResult } from '../../../../lib/api/alerts';

function parseAlertRequest(raw: unknown): {
  kind: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  tags?: string[];
  details?: Record<string, unknown>;
} | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const input = raw as {
    kind?: unknown;
    title?: unknown;
    message?: unknown;
    severity?: unknown;
    tags?: unknown;
    details?: unknown;
  };

  if (
    typeof input.kind !== 'string' ||
    typeof input.title !== 'string' ||
    typeof input.message !== 'string'
  ) {
    return null;
  }

  const severity =
    input.severity === 'critical' || input.severity === 'warning' || input.severity === 'info'
      ? input.severity
      : 'warning';

  return {
    kind: input.kind,
    title: input.title,
    message: input.message,
    severity,
    tags: Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
    details: input.details && typeof input.details === 'object'
      ? (input.details as Record<string, unknown>)
      : undefined,
  };
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return failJson('UNAUTHORIZED', adminAuthFailureMessage(), 401);
  }

  try {
    const supabase = getServiceSupabaseClient();

    const { count: failedJobsCount, error: failedJobsError } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed');

    const { count: dlqJobsCount, error: dlqJobsError } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'dlq');

    const { count: fullQueuedJobsCount, error: fullQueuedJobsError } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'full')
      .in('status', ['queued', 'running']);

    if (failedJobsError) {
      return failJson('INTERNAL_ERROR', failedJobsError.message, 500);
    }
    if (dlqJobsError) {
      return failJson('INTERNAL_ERROR', dlqJobsError.message, 500);
    }
    if (fullQueuedJobsError) {
      return failJson('INTERNAL_ERROR', fullQueuedJobsError.message, 500);
    }

    return okJson({
      enabled: {
        adminAlertsEnabled: Boolean(process.env.ADMIN_ALERT_WEBHOOK_URL),
      },
      thresholds: {
        budgetQueueLimit: Number(process.env.BUDGET_FULL_QUEUE_LIMIT ?? 120),
      },
      telemetry: {
        failedJobs: failedJobsCount ?? 0,
        dlqJobs: dlqJobsCount ?? 0,
        atRiskFullLoad: fullQueuedJobsCount ?? 0,
      },
      evaluatedAt: new Date().toISOString(),
    });
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return failJson('UNAUTHORIZED', adminAuthFailureMessage(), 401);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return failJson('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }

  const parsed = parseAlertRequest(payload);
  if (!parsed) {
    return failJson('VALIDATION_ERROR', 'Invalid alert payload', 400);
  }

  try {
    const supabase = getServiceSupabaseClient();
    const details = parsed.details ?? {};

    const deliverResult: AlertSendResult = await sendOperationalAlert(parsed);

    await supabase.from('audit_events').insert({
      event_code: `admin.alert_${parsed.severity}`,
      event_data: {
        kind: parsed.kind,
        title: parsed.title,
        message: parsed.message,
        tags: parsed.tags,
        details,
        delivery: deliverResult,
      },
    });

    return okJson({
      sent: deliverResult.sent,
      mode: deliverResult.mode,
      details: deliverResult,
      evaluatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return failJson(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Failed to deliver alert',
      500,
    );
  }
}
