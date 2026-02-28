type AlertSeverity = 'critical' | 'warning' | 'info';

type AlertPayload = {
  kind: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  tags?: string[];
  details?: Record<string, unknown>;
};

const ALERT_WEBHOOK_URL = process.env.ADMIN_ALERT_WEBHOOK_URL;
const ALERT_WEBHOOK_SECRET = process.env.ADMIN_ALERT_WEBHOOK_SECRET;
const ALERT_WEBHOOK_TIMEOUT_MS = Number(process.env.ADMIN_ALERT_WEBHOOK_TIMEOUT_MS ?? '1500');

function sanitizeDetail(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return value;
}

export type AlertSendResult =
  | {
      sent: true;
      mode: 'webhook';
      webhookStatus: number;
    }
  | {
      sent: false;
      mode: 'disabled';
      reason: string;
    }
  | {
      sent: false;
      mode: 'error';
      reason: string;
    };

export async function sendOperationalAlert(payload: AlertPayload): Promise<AlertSendResult> {
  if (!ALERT_WEBHOOK_URL) {
    return { sent: false, mode: 'disabled', reason: 'ADMIN_ALERT_WEBHOOK_URL is not configured' };
  }

  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (ALERT_WEBHOOK_SECRET) {
      headers.authorization = `Bearer ${ALERT_WEBHOOK_SECRET}`;
    }

    const timeout = Number.isFinite(ALERT_WEBHOOK_TIMEOUT_MS) && ALERT_WEBHOOK_TIMEOUT_MS > 0
      ? ALERT_WEBHOOK_TIMEOUT_MS
      : 1500;

    const response = await fetch(ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        createdAt: new Date().toISOString(),
        source: 'makebelieve-admin',
        details: payload.details
          ? Object.fromEntries(
              Object.entries(payload.details).map(([key, value]) => [
                key,
                sanitizeDetail(value),
              ]),
            )
          : undefined,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    return {
      sent: true,
      mode: 'webhook',
      webhookStatus: response.status,
    };
  } catch (error) {
    return {
      sent: false,
      mode: 'error',
      reason: error instanceof Error ? error.message : 'Unknown alert delivery failure',
    };
  }
}
