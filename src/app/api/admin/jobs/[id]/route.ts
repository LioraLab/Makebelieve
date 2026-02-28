import { type NextRequest } from 'next/server';

import { isAdminRequest, adminAuthFailureMessage } from '../../../../../lib/api/admin';
import { failJson, okJson } from '../../../../../lib/api/response';
import { getServiceSupabaseClient } from '../../../../../lib/supabase/admin';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest(_req)) {
    return failJson('UNAUTHORIZED', adminAuthFailureMessage(), 401);
  }

  const id = params.id;
  if (!UUID_RE.test(id)) {
    return failJson('VALIDATION_ERROR', 'Invalid job id', 400);
  }

  try {
    const supabase = getServiceSupabaseClient();
    const { data: jobResult, error } = await supabase
      .from('jobs')
      .select('id,story_id,type,status,attempt_seq,max_attempts,payload,result,error_code,error_message,next_retry_at,started_at,completed_at,created_at,updated_at,compensation_required')
      .eq('id', id)
      .single();
    const job = jobResult as {
      id: string;
      status: string;
      attempt_seq: number | null;
      max_attempts: number | null;
      payload: Record<string, unknown> | null;
      result: Record<string, unknown> | null;
      error_code: string | null;
      error_message: string | null;
      next_retry_at: string | null;
      started_at: string | null;
      completed_at: string | null;
      created_at: string;
      updated_at: string;
      compensation_required: boolean | null;
      story_id: string;
      type: string;
    } | null;

    if (error) {
      if (error.code === 'PGRST116') {
        return failJson('NOT_FOUND', 'Job not found', 404);
      }

      return failJson('INTERNAL_ERROR', error.message, 500);
    }

    if (!job) {
      return failJson('NOT_FOUND', 'Job not found', 404);
    }

    return okJson({
      job,
      retry: {
        allowed: job.status !== 'ready',
        attemptsRemaining: Math.max(0, (job.max_attempts ?? 3) - (job.attempt_seq ?? 1)),
      },
    });
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}
