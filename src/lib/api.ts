import { NextRequest, NextResponse } from 'next/server';
import type { ApiErr, ApiErrorCode, ApiResponse } from './types';

export const API_CONTENT_TYPE = 'application/json';

export function jsonOk<T>(data: T, init: ResponseInit = {}): Response {
  return NextResponse.json<ApiResponse<T>>({ ok: true, data }, init);
}

export function jsonError(
  code: ApiErrorCode,
  message: string,
  init: ResponseInit = {},
): Response {
  return NextResponse.json<ApiResponse<never>>({ ok: false, error: { code, message } }, init);
}

export async function parseJson(req: NextRequest): Promise<unknown> {
  return req.json();
}

export function requireFields<T extends Record<string, unknown>>(
  body: Record<string, unknown>,
  keys: Array<keyof T>,
): string[] {
  return keys.filter((key) => body[key] === undefined || body[key] === null);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function badRequest(message: string): Response {
  return jsonError('VALIDATION_ERROR', message, { status: 400 });
}

export function unauthorized(message = 'Unauthorized'): Response {
  return jsonError('UNAUTHORIZED', message, { status: 401 });
}

export function forbidden(message = 'Forbidden'): Response {
  return jsonError('FORBIDDEN', message, { status: 403 });
}

export function notFound(message = 'Resource not found'): Response {
  return jsonError('NOT_FOUND', message, { status: 404 });
}

export function conflict(message: string): Response {
  return jsonError('CONFLICT', message, { status: 409 });
}
