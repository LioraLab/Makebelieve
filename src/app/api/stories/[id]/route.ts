import { type NextRequest } from 'next/server';
import { getServiceSupabaseClient } from '../../../../lib/supabase/admin';
import { failJson, okJson } from '../../../../lib/api/response';
import { getGuestSessionId } from '../../../../lib/api/request';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = resolveActor(req);
  if (!actor) {
    return failJson('UNAUTHORIZED', 'guest session id or auth header required', 401);
  }

  const { id } = params;
  if (!UUID_RE.test(id)) {
    return failJson('VALIDATION_ERROR', 'Invalid story id', 400);
  }

  try {
    let query = getServiceSupabaseClient()
      .from('stories')
      .select(
        `
        id, child_name, age_band, theme, tone, language,
        payment_status, fulfillment_status, status, created_at, updated_at,
        assets(*),
        children_profiles(*),
        orders(*)
      `,
      )
      .eq('id', id);

    if (actor.type === 'user') {
      query = query.eq('user_id', actor.userId);
    } else {
      query = query.eq('guest_session_id', actor.guestSessionId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return failJson('NOT_FOUND', 'Story not found', 404);
      }
      return failJson('INTERNAL_ERROR', error.message, 500);
    }

    if (!data) {
      return failJson('NOT_FOUND', 'Story not found', 404);
    }

    const latestOrder = Array.isArray(data.orders) && data.orders.length > 0 ? data.orders[0] : null;

    return okJson({
      story: data,
      assets: data.assets ?? [],
      childProfiles: data.children_profiles ?? [],
      order: latestOrder,
    });
  } catch {
    return failJson('INTERNAL_ERROR', 'Unexpected server error', 500);
  }
}
