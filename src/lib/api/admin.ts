import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN?.trim();
const ADMIN_HEADER_NAME = 'x-admin-token';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function normalizeToken(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeMatch(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);

  if (leftBuf.length !== rightBuf.length) {
    return false;
  }

  return timingSafeEqual(leftBuf, rightBuf);
}

function getRequestedToken(req: NextRequest): string | null {
  const headerToken = normalizeToken(req.headers.get(ADMIN_HEADER_NAME));
  if (headerToken) {
    return headerToken;
  }

  return extractBearerToken(normalizeToken(req.headers.get('authorization')));
}

export function isAdminRequest(req: NextRequest): boolean {
  if (!ADMIN_TOKEN) {
    return false;
  }

  const requestedToken = getRequestedToken(req);
  if (!requestedToken) {
    return false;
  }

  return safeMatch(requestedToken, ADMIN_TOKEN);
}

export function adminAuthFailureMessage(): string {
  if (!ADMIN_TOKEN) {
    return 'ADMIN_API_TOKEN is not configured';
  }

  return 'Invalid admin token';
}
