import { type NextRequest } from 'next/server';

import { isAdminRequest, adminAuthFailureMessage } from '../../../../lib/api/admin';
import { failJson, okJson } from '../../../../lib/api/response';
import { getServiceSupabaseClient } from '../../../../lib/supabase/admin';

type JobRow = {
  id: string;
  story_id: string;
  type: string;
  status: string;
  attempt_seq: number;
  max_attempts: number;
  payload: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  next_retry_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  created_at: string;
  compensation_required: boolean;
};

type JobStats = {
  total: number;
  queued: number;
  running: number;
  ready: number;
  failed: number;
  dlq: number;
};

function clampLimit(input: string | null): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  if (parsed > 200) {
    return 200;
  }

  return Math.floor(parsed);
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return failJson('UNAUTHORIZED', adminAuthFailureMessage(), 401);
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const storyId = searchParams.get('storyId');

  const limit = clampLimit(searchParams.get('limit'));
  const page = Math.max(0, Number(searchParams.get('page') ?? '0'));
  const from = limit * page;

  try {
    const supabase = getServiceSupabaseClient();
    let query = supabase
      .from('jobs')
      .select('id, story_id, type, status, attempt_seq, max_attempts, payload, error_code, error_message, next_retry_at, started_at, completed_at, updated_at, created_at, compensation_required')
      .order('updated_at', { ascending: false })
      .range(from, from + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (type) {
      query = query.eq('type', type);
    }

    if (storyId) {
      query = query.eq('story_id', storyId);
    }

    const { data: jobs, error } = await query;

    if (error) {
      return failJson('INTERNAL_ERROR', error.message, 500);
    }

    const stats: JobStats = {
      total: jobs?.length ?? 0,
      queued: 0,
      running: 0,
      ready: 0,
      failed: 0,
      dlq: 0,
    };

    for (const job of jobs ?? []) {
      const typedJob = job as JobRow;
      if (typedJob.status === 'queued') {
        stats.queued += 1;
      } else if (typedJob.status === 'running') {
        stats.running += 1;
      } else if (typedJob.status === 'ready') {
        stats.ready += 1;
      } else if (typedJob.status === 'failed') {
        stats.failed += 1;
      } else if (typedJob.status === 'dlq') {
        stats.dlq += 1;
      }
    }

    return okJson({
      jobs: jobs ?? [],
      pagination: {
        page,
        limit,
        count: jobs?.length ?? 0,
      },
      stats,
    });
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}
