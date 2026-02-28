import { type NextRequest } from 'next/server';
import { getServiceSupabaseClient } from '../../../../lib/supabase/admin';
import { failJson, okJson } from '../../../../lib/api/response';
import { checkAbuseControls } from '../../../../lib/ops/abuse-controls';
import { buildUploadPath, getGuestSessionId } from '../../../../lib/api/request';
import { parseBody, uploadSignSchema, formatValidationErrors } from '../../../../lib/api/validate';
import { ZodError } from 'zod';

export async function POST(req: NextRequest) {
  try {
    const body = parseBody(uploadSignSchema, await req.json());
    const guestSessionId = getGuestSessionId(req);
    const auth = req.headers.get('authorization');
    const actorUserId = auth?.startsWith('Bearer user:') ? auth.slice('Bearer user:'.length).trim() : null;

    const actor = actorUserId
      ? { type: 'user' as const, userId: actorUserId, guestSessionId: null }
      : { type: 'guest' as const, userId: null, guestSessionId: guestSessionId ?? 'unknown' };

    if (!guestSessionId && !actorUserId) {
      return failJson('UNAUTHORIZED', 'guest session id or auth header required', 401);
    }

    const guard = checkAbuseControls(req, actor, { operation: 'upload_sign' });
    if (!guard.allowed) {
      return failJson(guard.code, guard.message, guard.status);
    }


    if (body.kind !== 'input_photo') {
      return failJson('VALIDATION_ERROR', 'kind must be "input_photo"', 400);
    }

    const supabase = getServiceSupabaseClient();
    const bucket = process.env.STORY_ASSETS_BUCKET || 'story-uploads';
    const path = buildUploadPath(body.kind, body.fileName);

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path, { upsert: false });

    if (error || !data?.signedUrl) {
      const message = error?.message ?? 'Failed to create upload URL';
      return failJson('INTERNAL_ERROR', message, 500);
    }

    return okJson({
      uploadUrl: data.signedUrl,
      path,
      bucket,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      guestSessionId,
      contentType: body.contentType,
    });
  } catch (err) {
    const error = err instanceof ZodError
      ? `Invalid request: ${formatValidationErrors(err)}`
      : 'Unexpected server error';

    const code = err instanceof ZodError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR';
    const status = err instanceof ZodError ? 400 : 500;
    return failJson(code, error, status);
  }
}
