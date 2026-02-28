import { type NextRequest } from 'next/server';

import { getServiceSupabaseClient } from '../../../../../lib/supabase/admin';
import { failJson, okJson } from '../../../../../lib/api/response';
import { getGuestSessionId } from '../../../../../lib/api/request';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const PREVIEW_RETRYABLE_STATUSES = ['none', 'preview_failed'] as const;

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

function buildPreviewPages(childName: string, theme: string) {
  return [
    {
      title: '시작',
      text: `${childName}의 이야기가 조용한 숲에서 시작돼요. ${theme}의 마법이 살짝 움직이기 시작합니다.`,
    },
    {
      title: '전개',
      text: `${childName}는 용기 있는 친구를 만나 오늘 밤의 모험으로 한 걸음 더 나아갑니다.`,
    },
    {
      title: '클라이맥스',
      text: `별빛 아래, ${childName}는 자신만의 힘으로 문제를 해결하고 새로운 용기를 발견해요.`,
    },
  ];
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
    let storyQuery = supabase.from('stories').select('id, fulfillment_status, child_name, theme').eq('id', storyId);

    if (actor.type === 'user') {
      storyQuery = storyQuery.eq('user_id', actor.userId);
    } else {
      storyQuery = storyQuery.eq('guest_session_id', actor.guestSessionId);
    }

    const { data: story, error: storyError } = await storyQuery.single();

    if (storyError) {
      if (storyError.code === 'PGRST116') {
        return failJson('NOT_FOUND', 'Story not found', 404);
      }
      return failJson('INTERNAL_ERROR', storyError.message, 500);
    }

    if (!PREVIEW_RETRYABLE_STATUSES.includes(story.fulfillment_status as (typeof PREVIEW_RETRYABLE_STATUSES)[number])) {
      return failJson(
        'CONFLICT',
        story.fulfillment_status === 'preview_ready'
          ? 'Preview already ready'
          : 'Preview request is already processing',
        409,
      );
    }

    const previewPages = buildPreviewPages(story.child_name, story.theme);
    const nowIso = new Date().toISOString();

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        story_id: storyId,
        type: 'preview',
        status: 'running',
        attempt_seq: 1,
        payload: {
          requestedBy: actor.type,
          requestedAt: nowIso,
        },
        result: {
          pages: previewPages,
        },
        started_at: nowIso,
      })
      .select('id')
      .single();

    if (jobError || !job?.id) {
      return failJson('INTERNAL_ERROR', jobError?.message ?? 'Failed to create preview job', 500);
    }

    const { error: storyUpdateError } = await supabase
      .from('stories')
      .update({ fulfillment_status: 'preview_ready', updated_at: nowIso })
      .eq('id', storyId);

    if (storyUpdateError) {
      return failJson('INTERNAL_ERROR', storyUpdateError.message, 500);
    }

    const { error: jobUpdateError } = await supabase
      .from('jobs')
      .update({ status: 'ready', completed_at: nowIso })
      .eq('id', job.id);

    if (jobUpdateError) {
      return failJson('INTERNAL_ERROR', jobUpdateError.message, 500);
    }

    return okJson({
      jobId: job.id,
      storyId,
      status: 'preview_ready',
      previewPages,
    });
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}
