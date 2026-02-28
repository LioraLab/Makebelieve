import { type NextRequest } from 'next/server';

type AlertSeverity = 'high' | 'medium' | 'low';

type OperationalAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  metric: string;
  threshold: number;
  current: number;
  createdAt: string;
};

type AlertPayload = {
  source: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
};

export const TELEMETRY_THRESHOLDS = {
  jobDlqRate: 0.05,
  fullFailedRate: 0.08,
  abuseIpQuotaRate: 0.2,
  unknownEventRate: 0.1,
};

export function evaluateOperationalAlerts(input: {
  jobs: {
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  };
  abuse: {
    ipOverQuotaCount: number;
    guestOverQuotaCount: number;
    budgetRemainingCents: number;
    budgetEnabled: boolean;
  };
  events: {
    total: number;
    unknownCodeRate: number;
  };
}): OperationalAlert[] {
  const now = new Date().toISOString();
  const totalJobs = Math.max(input.jobs.total, 1);
  const dlqRate = input.jobs.byStatus.dlq ? input.jobs.byStatus.dlq / totalJobs : 0;

  const fullJobs = input.jobs.byType.full ?? 0;
  const fullFailed = input.jobs.byStatus.failed ?? 0;
  const fullFailedRate = fullJobs > 0 ? fullFailed / fullJobs : 0;

  const result: OperationalAlert[] = [];

  if (dlqRate > TELEMETRY_THRESHOLDS.jobDlqRate) {
    result.push({
      id: 'ops.dlq.rate',
      severity: 'high',
      title: 'DLQ 비율 임계치 초과',
      description: 'DLQ(job dead-letter) 비율이 임계치보다 큽니다.',
      metric: 'dlq_rate',
      threshold: TELEMETRY_THRESHOLDS.jobDlqRate,
      current: Number(dlqRate.toFixed(4)),
      createdAt: now,
    });
  }

  if (fullFailedRate > TELEMETRY_THRESHOLDS.fullFailedRate && fullJobs >= 5) {
    result.push({
      id: 'ops.full.failed.rate',
      severity: 'medium',
      title: '전체 생성 실패율 증가',
      description: 'full job 실패율이 임계치보다 큽니다.',
      metric: 'full_failed_rate',
      threshold: TELEMETRY_THRESHOLDS.fullFailedRate,
      current: Number(fullFailedRate.toFixed(4)),
      createdAt: now,
    });
  }

  if (input.abuse.ipOverQuotaCount > TELEMETRY_THRESHOLDS.abuseIpQuotaRate) {
    result.push({
      id: 'ops.abuse.ip',
      severity: 'medium',
      title: 'IP 남용 지표 감지',
      description: 'IP 쿼터 초과가 감지된 항목이 존재합니다.',
      metric: 'quota_exhaust_rate',
      threshold: TELEMETRY_THRESHOLDS.abuseIpQuotaRate,
      current: input.abuse.ipOverQuotaCount,
      createdAt: now,
    });
  }

  if (input.abuse.budgetEnabled && input.abuse.budgetRemainingCents <= 0) {
    result.push({
      id: 'ops.budget.blocked',
      severity: 'high',
      title: '예산 브레이커 발동',
      description: '일일 비용 예산이 소진되어 신규 비용성 요청이 차단됩니다.',
      metric: 'budget_remaining',
      threshold: 0,
      current: input.abuse.budgetRemainingCents,
      createdAt: now,
    });
  }

  if (input.events.unknownCodeRate > TELEMETRY_THRESHOLDS.unknownEventRate) {
    result.push({
      id: 'ops.events.unknown',
      severity: 'low',
      title: '알 수 없는 이벤트 패턴',
      description: '감사 이벤트 중 미분류 코드 비율이 높습니다.',
      metric: 'unknown_event_rate',
      threshold: TELEMETRY_THRESHOLDS.unknownEventRate,
      current: Number(input.events.unknownCodeRate.toFixed(4)),
      createdAt: now,
    });
  }

  return result;
}

export function buildAlertPayload(alert: OperationalAlert): AlertPayload {
  return {
    source: 'makebelieve.ops',
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    metadata: {
      metric: alert.metric,
      threshold: alert.threshold,
      current: alert.current,
      alertId: alert.id,
    },
  };
}

export async function sendAlertWebhook(req: NextRequest, payload: AlertPayload) {
  const webhookUrl = process.env.OPS_ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    return { sent: false, reason: 'webhook_not_configured' as const };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.OPS_ALERT_WEBHOOK_SECRET
          ? { 'x-alert-secret': process.env.OPS_ALERT_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    return {
      sent: true,
      status: response.status,
      ok: response.ok,
      requestId: req.headers.get('x-request-id') ?? undefined,
    };
  } catch (error) {
    return {
      sent: true,
      ok: false,
      reason: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}
