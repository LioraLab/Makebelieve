import { type NextRequest } from 'next/server';

import { getServiceSupabaseClient } from '../../../../../lib/supabase/admin';
import { failJson, okJson } from '../../../../../lib/api/response';
import { getGuestSessionId } from '../../../../../lib/api/request';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_SIGNED_URL_SECONDS = 600;

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
  fulfillment_status: 'none' | 'preview_queued' | 'preview_generating' | 'preview_ready' | 'preview_failed' | 'full_queued' | 'full_generating' | 'full_ready' | 'full_failed' | 'delivery_locked';
};

type AssetRow = {
  id: string;
  story_id: string;
  storage_bucket: string;
  storage_path: string;
  is_locked: boolean;
  kind: string;
  file_name: string | null;
};

type DownloadBody = {
  signedUrl: string;
  expiresAt: string;
  expiresIn: number;
  assetId: string;
  fileName: string | null;
};

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

function isUnlocked(story: StoryRow, asset: AssetRow) {
  if (!asset.is_locked && story.fulfillment_status === 'full_ready' && story.payment_status === 'paid') {
    return true;
  }

  return false;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = resolveActor(req);
  if (!actor) {
    return failJson('UNAUTHORIZED', 'guest session id or auth header required', 401);
  }

  const assetId = params.id;
  if (!UUID_RE.test(assetId)) {
    return failJson('VALIDATION_ERROR', 'Invalid asset id', 400);
  }

  try {
    const supabase = getServiceSupabaseClient();
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .select('id, story_id, storage_bucket, storage_path, is_locked, kind, file_name')
      .eq('id', assetId)
      .single<AssetRow>();

    if (assetError) {
      if (assetError.code === 'PGRST116') {
        return failJson('NOT_FOUND', 'Asset not found', 404);
      }
      return failJson('INTERNAL_ERROR', assetError.message, 500);
    }

    if (!asset) {
      return failJson('NOT_FOUND', 'Asset not found', 404);
    }

    let storyQuery = supabase
      .from('stories')
      .select('id, payment_status, fulfillment_status')
      .eq('id', asset.story_id);

    if (actor.type === 'user') {
      storyQuery = storyQuery.eq('user_id', actor.userId);
    } else {
      storyQuery = storyQuery.eq('guest_session_id', actor.guestSessionId);
    }

    const { data: story, error: storyError } = await storyQuery.single<StoryRow>();

    if (storyError) {
      if (storyError.code === 'PGRST116') {
        return failJson('FORBIDDEN', 'Asset access denied', 403);
      }
      return failJson('INTERNAL_ERROR', storyError.message, 500);
    }

    if (!story) {
      return failJson('FORBIDDEN', 'Asset access denied', 403);
    }

    if (!isUnlocked(story, asset)) {
      if (story.payment_status !== 'paid') {
        return failJson('PAYMENT_PENDING', 'Payment required to download this asset', 402);
      }

      return failJson('FORBIDDEN', 'Asset is locked', 403);
    }

    const bucket = process.env.STORY_ASSETS_BUCKET || asset.storage_bucket;

    const { data: signedUrlData, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(asset.storage_path, DEFAULT_SIGNED_URL_SECONDS);

    if (signError || !signedUrlData?.signedUrl) {
      return failJson('INTERNAL_ERROR', signError?.message ?? 'Failed to create signed URL', 500);
    }

    const now = new Date();

    const responseBody: DownloadBody = {
      signedUrl: signedUrlData.signedUrl,
      expiresAt: new Date(now.getTime() + DEFAULT_SIGNED_URL_SECONDS * 1000).toISOString(),
      expiresIn: DEFAULT_SIGNED_URL_SECONDS,
      assetId: asset.id,
      fileName: asset.file_name,
    };

    return okJson(responseBody);
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}
