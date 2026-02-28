export type Actor = {
  type: 'user' | 'guest';
  userId?: string;
  guestSessionId?: string;
};

export type StoryInput = {
  childName: string;
  ageBand?: string;
  theme: string;
  tone?: string;
  language: string;
  photos: string[];
};

export type SignedUploadRequest = {
  fileName: string;
  contentType: string;
  kind: 'input_photo';
};

export type UploadSignature = {
  uploadUrl: string;
  path: string;
  expiresAt: string;
};

export type StoryStatusPayload = {
  payment_status: 'payment_pending' | 'paid' | 'refunded' | 'chargeback' | 'disputed';
  fulfillment_status:
    | 'none'
    | 'preview_queued'
    | 'preview_generating'
    | 'preview_ready'
    | 'preview_failed'
    | 'full_queued'
    | 'full_generating'
    | 'full_ready'
    | 'full_failed'
    | 'delivery_locked';
};

export type StoryRecord = StoryStatusPayload & {
  id: string;
  userId: string | null;
  guestSessionId: string | null;
  childProfileId: string | null;
  theme: string;
  tone: string | null;
  language: string;
  photos: string[];
};

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
export type ApiResponse<T> = ApiOk<T> | ApiErr;
