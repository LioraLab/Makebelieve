import { type NextRequest } from 'next/server';

import { isAdminRequest, adminAuthFailureMessage } from '../../../../../../lib/api/admin';
import { failJson, okJson } from '../../../../../../lib/api/response';
import { getServiceSupabaseClient } from '../../../../../../lib/supabase/admin';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) {
    return failJson('UNAUTHORIZED', adminAuthFailureMessage(), 401);
  }

  const jobId = params.id;
  if (!UUID_RE.test(jobId)) {
    return failJson('VALIDATION_ERROR', 'Invalid job id', 400);
  }

  try {
    const supabase = getServiceSupabaseClient();
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, story_id, type, status, attempt_seq, max_attempts')
      .eq('id', jobId)
      .single();

    if (jobError) {
      if (jobError.code === 'PGRST116') {
        return failJson('NOT_FOUND', 'Job not found', 404);
      }

      return failJson('INTERNAL_ERROR', jobError.message, 500);
    }

    if (!job) {
      return failJson('NOT_FOUND', 'Job not found', 404);
    }

    if (job.status === 'queued') {
      return okJson({ ok: true, action: 'already_queued', jobId });
    }

    const maxAttempts = job.max_attempts ?? 3;
    if ((job.attempt_seq ?? 1) > maxAttempts) {
      return failJson('CONFLICT', 'Max attempts exceeded, cannot retry', 409);
    }

    const nowIso = new Date().toISOString();
    const nextAttempt = (job.attempt_seq ?? 1) + 1;

    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        status: 'queued',
        attempt_seq: nextAttempt,
        error_code: null,
        error_message: null,
        started_at: null,
        completed_at: null,
        next_retry_at: null,
        updated_at: nowIso,
      })
      .eq('id', jobId);

    if (updateError) {
      return failJson('INTERNAL_ERROR', updateError.message, 500);
    }

    if (job.type === 'full') {
      await supabase
        .from('stories')
        .update({ fulfillment_status: 'full_queued', updated_at: nowIso })
        .eq('id', job.story_id);
    }

    return okJson({
      ok: true,
      action: 'retry_queued',
      jobId,
      attemptSeq: nextAttempt,
    });
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}
