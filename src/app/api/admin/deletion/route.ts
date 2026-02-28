import { type NextRequest } from 'next/server';

import { getServiceSupabaseClient } from '../../../../lib/supabase/admin';
import { adminAuthFailureMessage, isAdminRequest } from '../../../../lib/api/admin';
import { failJson, okJson } from '../../../../lib/api/response';

type StoryCandidate = {
  id: string;
  payment_status: string | null;
  fulfillment_status: string;
  user_id: string | null;
  guest_session_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function toInt(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cutoffFromDays(days: number): string {
  const threshold = new Date();
  threshold.setUTCDate(threshold.getUTCDate() - days);
  return threshold.toISOString();
}

function ensureAdmin(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return failJson('UNAUTHORIZED', adminAuthFailureMessage(), 401);
  }

  return null;
}

export async function GET(req: NextRequest) {
  const adminFailure = ensureAdmin(req);
  if (adminFailure) {
    return adminFailure;
  }

  const days = toInt(req.nextUrl.searchParams.get('days'), 90);
  const limit = Math.min(toInt(req.nextUrl.searchParams.get('limit'), 200), 500);

  try {
    const cutoff = cutoffFromDays(days);
    const client = getServiceSupabaseClient();

    const { data, error } = await client
      .from('stories')
      .select('id,payment_status,fulfillment_status,user_id,guest_session_id,created_at,updated_at')
      .lt('updated_at', cutoff)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      return failJson('INTERNAL_ERROR', error.message, 500);
    }

    return okJson({
      cutoffDate: cutoff,
      retentionDays: days,
      candidateCount: data?.length ?? 0,
      candidates: data ?? [],
    });
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}

export async function POST(req: NextRequest) {
  const adminFailure = ensureAdmin(req);
  if (adminFailure) {
    return adminFailure;
  }

  let payload: {
    dryRun?: boolean;
    days?: number;
    limit?: number;
    storyIds?: string[];
    reason?: string;
  };

  try {
    payload = (await req.json()) as {
      dryRun?: boolean;
      days?: number;
      limit?: number;
      storyIds?: string[];
      reason?: string;
    };
  } catch {
    return failJson('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }

  const dryRun = payload.dryRun !== false;
  const days = toInt(typeof payload.days === 'number' ? String(payload.days) : null, 90);
  const limit = Math.min(toInt(typeof payload.limit === 'number' ? String(payload.limit) : null, 200), 500);
  const reason = (payload.reason ?? 'manual cleanup').trim() || 'manual cleanup';

  const storyIds =
    payload.storyIds?.map((id) => id.trim()).filter((id) => id.length > 0) ?? [];

  if (storyIds.length > 0) {
    const invalid = storyIds.filter((id) => !isValidUUID(id));
    if (invalid.length > 0) {
      return failJson('VALIDATION_ERROR', `Invalid story id(s): ${invalid.join(',')}`, 400);
    }
  }

  try {
    const cutoff = cutoffFromDays(days);
    const client = getServiceSupabaseClient();

    if (storyIds.length === 0) {
      const { data: candidates, error: candidateError } = await client
        .from('stories')
        .select('id,payment_status,fulfillment_status,user_id,guest_session_id,created_at,updated_at')
        .lt('updated_at', cutoff)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (candidateError) {
        return failJson('INTERNAL_ERROR', candidateError.message, 500);
      }

      const ids = (candidates as Array<{ id: string }> | null)?.map((story) => story.id) ?? [];
      return executeDeletion({ client, ids, dryRun, reason, days, cutoff });
    }

    return executeDeletion({
      client,
      ids: storyIds,
      dryRun,
      reason,
      days,
      cutoff,
      allowNonExpired: true,
    });
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}

async function executeDeletion(input: {
  client: ReturnType<typeof getServiceSupabaseClient>;
  ids: string[];
  dryRun: boolean;
  reason: string;
  days: number;
  cutoff: string;
  allowNonExpired?: boolean;
}) {
  const { client, ids, dryRun, reason, days, cutoff, allowNonExpired = false } = input;

  if (ids.length === 0) {
    return okJson({
      dryRun,
      candidates: [],
      deletedCount: 0,
      message: 'No stories matched the deletion policy.',
    });
  }

  let filteredIds = ids;
  if (!allowNonExpired) {
    const { data: oldStories, error: storyError } = await client
      .from('stories')
      .select('id')
      .in('id', ids)
      .lt('updated_at', cutoff);

    if (storyError) {
      return failJson('INTERNAL_ERROR', storyError.message, 500);
    }

    const validRows = (oldStories ?? []) as Array<{ id: string }>;
    const validIds = new Set<string>(validRows.map((row) => row.id));
    filteredIds = ids.filter((id) => validIds.has(id));
  }

  if (dryRun) {
    return okJson({
      dryRun: true,
      retentionDays: days,
      candidateCount: filteredIds.length,
      candidates: filteredIds,
      message: 'Dry run: no deletion was executed.',
    });
  }

  const { data: candidatesForAudit, error: auditError } = await client
    .from('stories')
    .select('id,payment_status,fulfillment_status', { count: 'exact' })
    .in('id', filteredIds);

  if (auditError) {
    return failJson('INTERNAL_ERROR', auditError.message, 500);
  }

  const { data: deletedStories, error } = await client.from('stories').delete().in('id', filteredIds).select('id');
  if (error) {
    return failJson('INTERNAL_ERROR', error.message, 500);
  }

  await client.from('audit_events').insert(
    (deletedStories ?? []).map((story: { id: string }) => ({
      story_id: story.id,
      order_id: null,
      actor_id: null,
      event_code: 'ops.deletion_scaffold',
      event_data: {
        reason,
        dryRun,
        retentionDays: days,
        cutoff,
        deletionMode: 'manual',
      },
    })),
  );

  return okJson({
    dryRun: false,
    reason,
    deletedCount: deletedStories?.length ?? 0,
    candidates: candidatesForAudit ?? [],
    deletionDetails: deletedStories,
  });
}
