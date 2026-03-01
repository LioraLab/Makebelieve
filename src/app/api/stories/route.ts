import { type NextRequest } from 'next/server';
import { ZodError } from 'zod';

import { getServiceSupabaseClient } from '../../../lib/supabase/admin';
import { failJson, okJson } from '../../../lib/api/response';
import { getGuestSessionId } from '../../../lib/api/request';
import { checkAbuseControls } from '../../../lib/ops/abuse-controls';
import { createStorySchema, formatValidationErrors, parseBody } from '../../../lib/api/validate';

const STORAGE_BUCKET = process.env.STORY_ASSETS_BUCKET || 'story-uploads';

type StoryActor =
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

function fileNameFromUrl(photoUrl: string, fallbackIndex: number) {
  try {
    const parsed = new URL(photoUrl);
    const base = parsed.pathname.split('/').filter(Boolean).pop();
    if (base && base.length > 0) return base;
  } catch {
    // ignore invalid URLs; fallback below.
  }

  return `photo-${fallbackIndex + 1}.jpg`;
}

function resolveActor(req: NextRequest): StoryActor | null {
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

export async function POST(req: NextRequest) {
  const actor = resolveActor(req);

  if (!actor) {
    return failJson('UNAUTHORIZED', 'guest session id or auth header required', 401);
  }

  const actorForGuard = actor as {
    type: 'user' | 'guest';
    userId?: string | null;
    guestSessionId?: string | null;
  };
  const guard = checkAbuseControls(req, actorForGuard, { operation: 'story_create' });
  if (!guard.allowed) {
    return failJson(guard.code, guard.message, guard.status);
  }

  try {
    const body = parseBody(createStorySchema, await req.json());

    const supabase = getServiceSupabaseClient();

    const { data: storyData, error: storyError } = await supabase
      .from('stories')
      .insert({
        user_id: actor.type === 'user' ? actor.userId : null,
        guest_session_id: actor.type === 'guest' ? actor.guestSessionId : null,
        child_name: body.childName,
        age_band: body.ageBand ?? null,
        theme: body.theme,
        tone: body.tone ?? null,
        language: body.language,
        request_payload: {
          photos: body.photos,
        },
      })
      .select('id')
      .single();

    if (storyError || !storyData?.id) {
      return failJson('INTERNAL_ERROR', storyError?.message ?? 'Could not create story', 500);
    }

    const storyId = storyData.id;

    const { error: childError } = await supabase.from('children_profiles').insert({
      story_id: storyId,
      child_name: body.childName,
      age_band: body.ageBand ?? null,
    });

    if (childError) {
      return failJson('INTERNAL_ERROR', childError.message, 500);
    }

    if (body.photos.length > 0) {
      const { error: assetError } = await supabase.from('assets').insert(
        body.photos.map((photoUrl: string, idx: number) => ({
          story_id: storyId,
          kind: 'photo',
          storage_bucket: STORAGE_BUCKET,
          storage_path: `imports/${storyId}/input/${idx + 1}/${fileNameFromUrl(photoUrl, idx)}`,
          file_name: fileNameFromUrl(photoUrl, idx),
          content_type: 'image/jpeg',
          metadata: {
            sourceUrl: photoUrl,
          },
        })),
      );

      if (assetError) {
        return failJson('INTERNAL_ERROR', assetError.message, 500);
      }
    }

    return okJson({ storyId });
} catch (err) {
    console.error('[api/stories][POST]', err);
    const error =
      err instanceof ZodError
        ? `Invalid request: ${formatValidationErrors(err)}`
        : err instanceof Error
          ? err.message
          : 'Unexpected server error';

    const code = err instanceof ZodError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR';
    const status = err instanceof ZodError ? 400 : 500;
    return failJson(code, error, status);
  }
}

export async function GET(req: NextRequest) {
  const actor = resolveActor(req);
  if (!actor) {
    return failJson('UNAUTHORIZED', 'guest session id or auth header required', 401);
  }

  try {
    const supabase = getServiceSupabaseClient();
    let query = supabase
      .from('stories')
      .select(`
        id,
        child_name,
        age_band,
        theme,
        tone,
        language,
        payment_status,
        fulfillment_status,
        created_at,
        status,
        assets(id, storage_bucket, storage_path, file_name, content_type, kind, is_locked, is_preview, updated_at),
        orders(id, status, is_active_paid, amount_cents, currency, created_at)
      `)
      .order('created_at', { ascending: false });

    if (actor.type === 'user') {
      query = query.eq('user_id', actor.userId);
    } else {
      query = query.eq('guest_session_id', actor.guestSessionId);
    }

    const { data, error } = await query;
    if (error) {
      return failJson('INTERNAL_ERROR', error.message, 500);
    }

    return okJson({ stories: data ?? [] });
  } catch (err) {
    console.error('[api/stories][GET]', err);
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return failJson('INTERNAL_ERROR', message, 500);
  }
}
