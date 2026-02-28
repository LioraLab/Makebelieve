import { type NextRequest } from 'next/server';
import { ZodError } from 'zod';

import { getServiceSupabaseClient } from '../../../lib/supabase/admin';
import { failJson, okJson } from '../../../lib/api/response';
import { getGuestSessionId } from '../../../lib/api/request';
import { createStorySchema, formatValidationErrors, parseBody } from '../../../lib/api/validate';

const STORAGE_BUCKET = process.env.STORY_ASSETS_BUCKET || 'story-uploads';

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

export async function POST(req: NextRequest) {
  const guestSessionId = getGuestSessionId(req);

  try {
    const body = parseBody(createStorySchema, await req.json());

    if (!guestSessionId && !req.headers.get('authorization')) {
      return failJson('UNAUTHORIZED', 'guest session id or auth header required', 401);
    }

    const supabase = getServiceSupabaseClient();

    const { data: storyData, error: storyError } = await supabase
      .from('stories')
      .insert({
        user_id: null,
        guest_session_id: guestSessionId,
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
    const error = err instanceof ZodError
      ? `Invalid request: ${formatValidationErrors(err)}`
      : 'Unexpected server error';

    const code = err instanceof ZodError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR';
    const status = err instanceof ZodError ? 400 : 500;
    return failJson(code, error, status);
  }
}

export async function GET() {
  return failJson('UNAUTHORIZED', 'Story listing endpoint requires explicit route-level implementation', 404);
}
