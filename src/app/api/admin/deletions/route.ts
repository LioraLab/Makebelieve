import { type NextRequest } from 'next/server';

import { isAdminRequest, adminAuthFailureMessage } from '../../../../lib/api/admin';
import { failJson, okJson } from '../../../../lib/api/response';
import { getServiceSupabaseClient } from '../../../../lib/supabase/admin';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toInt(value: string | null, fallback: number, min = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return Math.floor(parsed);
}

function parseJsonBody(raw: unknown): unknown {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (typeof raw !== 'object') {
    return null;
  }

  return raw;
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return failJson('UNAUTHORIZED', adminAuthFailureMessage(), 401);
  }

  const { searchParams } = new URL(req.url);
  const retentionDays = toInt(searchParams.get('days'), 90);
  const before = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const supabase = getServiceSupabaseClient();
    const { data: stories, error } = await supabase
      .from('stories')
      .select('id, child_name, payment_status, fulfillment_status, created_at, updated_at')
      .lt('updated_at', before)
      .order('updated_at', { ascending: true });

    if (error) {
      return failJson('INTERNAL_ERROR', error.message, 500);
    }

    return okJson({
      retentionDays,
      cutoff: before,
      candidates: stories ?? [],
      candidateCount: stories?.length ?? 0,
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
    payload = parseJsonBody(await req.json());
  } catch {
    return failJson('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }

  const body = payload as {
    storyIds?: unknown;
    dryRun?: boolean;
  };

  if (!Array.isArray(body.storyIds) || body.storyIds.length === 0) {
    return failJson('VALIDATION_ERROR', 'storyIds must be a non-empty array', 400);
  }

  const storyIds = body.storyIds
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => UUID_RE.test(item));

  if (storyIds.length === 0) {
    return failJson('VALIDATION_ERROR', 'storyIds must contain valid UUIDs', 400);
  }

  const dryRun = body.dryRun === true;

  try {
    const supabase = getServiceSupabaseClient();

    const { data: stories } = await supabase
      .from('stories')
      .select('id')
      .in('id', storyIds);

    const resolvedIds = (stories ?? []).map((story) => story.id);

    if (resolvedIds.length === 0) {
      return failJson('NOT_FOUND', 'No matching stories found', 404);
    }

    if (dryRun) {
      return okJson({
        dryRun: true,
        wouldDelete: resolvedIds,
        count: resolvedIds.length,
      });
    }

    const { data: deletedStories, error } = await supabase
      .from('stories')
      .delete()
      .in('id', resolvedIds)
      .select('id, user_id, guest_session_id, payment_status, fulfillment_status');

    if (error) {
      return failJson('INTERNAL_ERROR', error.message, 500);
    }

    const auditRows = (deletedStories ?? []).map((story) => ({
      story_id: story.id,
      event_code: 'admin.story_deleted',
      event_data: {
        deletedBy: 'admin-api',
        reason: 'deletion_scan',
        payment_status: story.payment_status,
        fulfillment_status: story.fulfillment_status,
      },
    }));

    if (auditRows.length > 0) {
      const { error: auditError } = await supabase
        .from('audit_events')
        .insert(auditRows);

      if (auditError) {
        return failJson('INTERNAL_ERROR', auditError.message, 500);
      }
    }

    return okJson({
      deleted: deletedStories?.length ?? 0,
      deletedIds: (deletedStories ?? []).map((story) => story.id),
      dryRun: false,
    });
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}
