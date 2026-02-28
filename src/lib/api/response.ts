import { NextResponse } from 'next/server';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYMENT_PENDING'
  | 'INTERNAL_ERROR';

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: ApiErrorCode; message: string } };

export function okJson<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiOk<T>>({ ok: true, data }, init);
}

export function failJson(code: ApiErrorCode, message: string, status = 400) {
  return NextResponse.json<ApiErr>(
    {
      ok: false,
      error: { code, message },
    },
    { status },
  );
}
