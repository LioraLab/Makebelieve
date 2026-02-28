import { type NextRequest } from 'next/server';

import { getServiceSupabaseClient } from '../../../../../lib/supabase/admin';
import { failJson, okJson } from '../../../../../lib/api/response';
import { assessBudgetBreaker } from '../../../../../lib/api/abuse';
import { getGuestSessionId } from '../../../../../lib/api/request';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Actor =
  | {
      type: 'user';
      userId: string;
      guestSessionId: null;
    }
  | {
      type: 'guest';
      userId: null;
      guestSessionId: string;
    };

type StoryRow = {
  id: string;
  payment_status: 'payment_pending' | 'paid' | 'refunded' | 'chargeback' | 'disputed' | null;
  fulfillment_status:
    | 'none'
    | 'preview_queued'
    | 'preview_generating'
    | 'preview_ready'
    | 'preview_failed'
    | 'full_queued'
    | 'full_generating'
    | 'full_ready'
    | 'full_failed'
    | 'delivery_locked';
};

type JobRow = {
  id: string;
  status: 'queued' | 'running' | 'ready' | 'failed' | 'dlq';
};

const ENQUEUEABLE_STATUSES = ['preview_ready', 'full_failed'] as const;

function resolveActor(req: NextRequest): Actor | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer user:')) {
    const userId = auth.slice('Bearer user:'.length).trim();
    if (userId) {
      return { type: 'user', userId, guestSessionId: null };
    }
  }

  const guestSessionId = getGuestSessionId(req);
  if (!guestSessionId) {
    return null;
  }

  return { type: 'guest', userId: null, guestSessionId };
}

function isConflictStatus(status: StoryRow['fulfillment_status']) {
  return status === 'full_queued' || status === 'full_generating';
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = resolveActor(req);
  if (!actor) {
    return failJson('UNAUTHORIZED', 'guest session id or auth header required', 401);
  }

  const storyId = params.id;
  if (!UUID_RE.test(storyId)) {
    return failJson('VALIDATION_ERROR', 'Invalid story id', 400);
  }

  try {
    const supabase = getServiceSupabaseClient();

    let storyQuery = supabase
      .from('stories')
      .select('id, payment_status, fulfillment_status')
      .eq('id', storyId);

    if (actor.type === 'user') {
      storyQuery = storyQuery.eq('user_id', actor.userId);
    } else {
      storyQuery = storyQuery.eq('guest_session_id', actor.guestSessionId);
    }

    const { data: story, error: storyError } = await storyQuery.single<StoryRow>();

    if (storyError) {
      if (storyError.code === 'PGRST116') {
        return failJson('NOT_FOUND', 'Story not found', 404);
      }
      return failJson('INTERNAL_ERROR', storyError.message, 500);
    }

    if (!story) {
      return failJson('NOT_FOUND', 'Story not found', 404);
    }

    const { count: queuedFullJobs } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'full')
      .eq('status', 'queued');

    const { count: runningFullJobs } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'full')
      .eq('status', 'running');

    const budgetDecision = assessBudgetBreaker({
      queuedFullJobs: queuedFullJobs ?? 0,
      runningFullJobs: runningFullJobs ?? 0,
    });

    if (!budgetDecision.allowed) {
      return failJson('CONFLICT', budgetDecision.message, {
        status: budgetDecision.statusCode,
        headers: budgetDecision.headers,
      });
    }

    if (story.payment_status !== 'paid') {
      return failJson('PAYMENT_PENDING', 'Payment is required for full generation', 402);
    }

    if (story.fulfillment_status !== 'preview_ready' && story.fulfillment_status !== 'full_failed') {
      if (isConflictStatus(story.fulfillment_status)) {
        return failJson('CONFLICT', 'Full generation already processing', 409);
      }

      if (story.fulfillment_status === 'full_ready') {
        return failJson('CONFLICT', 'Full generation already completed', 409);
      }

      return failJson('CONFLICT', 'Preview must be ready before full generation', 409);
    }

    const { data: existingJob } = await supabase
      .from('jobs')
      .select('id, status')
      .eq('story_id', storyId)
      .eq('type', 'full')
      .in('status', ['queued', 'running'])
      .maybeSingle<JobRow>();

    if (existingJob) {
      return failJson('CONFLICT', 'Full generation is already queued', 409);
    }

    const nowIso = new Date().toISOString();
    const { error: storyUpdateError } = await supabase
      .from('stories')
      .update({ fulfillment_status: 'full_queued', updated_at: nowIso })
      .eq('id', storyId)
      .eq('payment_status', 'paid')
      .in('fulfillment_status', ENQUEUEABLE_STATUSES);

    if (storyUpdateError) {
      return failJson('INTERNAL_ERROR', storyUpdateError.message, 500);
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        story_id: storyId,
        type: 'full',
        status: 'queued',
        attempt_seq: 1,
        payload: {
          requestedBy: actor.type,
          requestedAt: nowIso,
          source: 'manual_full_request',
        },
      })
      .select('id')
      .single();

    if (jobError) {
      if (jobError.code === '23505') {
        const { data: reroutedJob } = await supabase
          .from('jobs')
          .select('id')
          .eq('story_id', storyId)
          .eq('type', 'full')
          .in('status', ['queued', 'running'])
          .maybeSingle<JobRow>();

        if (reroutedJob) {
          return okJson({
            jobId: reroutedJob.id,
            storyId,
            status: 'full_queued',
            enqueued: true,
          });
        }
      }

      return failJson('INTERNAL_ERROR', jobError.message ?? 'Failed to create full job', 500);
    }

    if (!job?.id) {
      return failJson('INTERNAL_ERROR', 'Failed to create full job', 500);
    }

    return okJson({
      jobId: job.id,
      storyId,
      status: 'full_queued',
      enqueued: true,
    });
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}
