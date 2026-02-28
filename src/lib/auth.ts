import type { Actor } from './types';

function parseAuthorizationHeader(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export function resolveActor(req: Request): Actor {
  const auth = parseAuthorizationHeader(req.headers.get('authorization'));

  // TODO: replace with real JWT verification/lookup.
  // For now: user id can be passed as Bearer user:<uuid>.
  if (auth?.startsWith('user:')) {
    return {
      type: 'user',
      userId: auth.slice('user:'.length),
    };
  }

  const guestSessionId = req.headers.get('x-guest-session-id')?.trim();
  if (!guestSessionId) {
    return {
      type: 'guest',
      guestSessionId: crypto.randomUUID(),
    };
  }

  return {
    type: 'guest',
    guestSessionId,
  };
}
