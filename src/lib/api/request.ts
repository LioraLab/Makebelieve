import { randomUUID } from 'crypto';

const FILE_NAME_SAFE = /[^a-zA-Z0-9._-]/g;

export function toSafeFileName(fileName: string) {
  const normalized = fileName.replace(FILE_NAME_SAFE, '_').slice(0, 120);
  return normalized || `upload-${Date.now()}`;
}

export function buildUploadPath(kind: string, fileName: string) {
  const safeKind = kind.replace(/[^a-zA-Z0-9_-]/g, 'x');
  const safeName = toSafeFileName(fileName);
  const token = randomUUID();
  return `${safeKind}/${token}/${safeName}`;
}

export function getGuestSessionId(req: Request) {
  return req.headers.get('x-guest-session-id')?.trim() || null;
}
