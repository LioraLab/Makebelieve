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

type FailJsonInit = number | (ResponseInit & { status?: number });

export function failJson(code: ApiErrorCode, message: string, init: FailJsonInit = 400) {
  if (typeof init === 'number') {
    return NextResponse.json<ApiErr>(
      {
        ok: false,
        error: { code, message },
      },
      { status: init },
    );
  }

  return NextResponse.json<ApiErr>(
    {
      ok: false,
      error: { code, message },
    },
    { status: init.status ?? 400, ...init },
  );
}
