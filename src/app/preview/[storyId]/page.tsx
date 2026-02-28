'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

const SESSION_KEY = 'makebelieve-guest-session-id';
const POLL_INTERVAL_MS = 2500;

type FulfillmentStatus =
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

type PaymentStatus = 'payment_pending' | 'paid' | 'refunded' | 'chargeback' | 'disputed';

type StoryRecord = {
  id: string;
  child_name: string;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
};

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string } };

type PreviewPayload = {
  story: StoryRecord;
  assets: Array<{
    id: string;
    kind: string;
    storage_path: string;
    file_name: string | null;
    is_preview: boolean;
  }>;
  order: Record<string, unknown> | null;
};

function getGuestSessionId(): string {
  if (typeof window === 'undefined') {
    return 'server-session';
  }

  const session = window.localStorage.getItem(SESSION_KEY);
  if (session) {
    return session;
  }

  const generated = window.crypto?.randomUUID?.() || `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(SESSION_KEY, generated);
  return generated;
}

async function callJson<T>(input: string, init?: RequestInit): Promise<ApiOk<T> | ApiErr> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'x-guest-session-id': getGuestSessionId(),
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiOk<T> | ApiErr;
  return payload;
}

function statusCopy(status: FulfillmentStatus): string {
  switch (status) {
    case 'none':
      return '미시작';
    case 'preview_queued':
      return '요청 접수';
    case 'preview_generating':
      return '프리뷰 생성 중';
    case 'preview_ready':
      return '프리뷰 준비됨';
    case 'preview_failed':
      return '프리뷰 실패';
    case 'full_queued':
      return '전체 생성 대기';
    case 'full_generating':
      return '전체 생성 중';
    case 'full_ready':
      return '전체 준비 완료';
    case 'full_failed':
      return '전체 생성 실패';
    case 'delivery_locked':
      return '다운로드 잠금';
    default:
      return '확인 중';
  }
}

export default function PreviewPage() {
  const params = useParams();
  const storyId = params.storyId;

  const [story, setStory] = useState<StoryRecord | null>(null);
  const [assets, setAssets] = useState<PreviewPayload['assets']>([]);
  const [isLoading, setLoading] = useState(true);
  const [isRequesting, setRequesting] = useState(false);
  const [error, setError] = useState('');

  const canUsePolling = useMemo(() => {
    if (!story) {
      return true;
    }

    if (story.fulfillment_status === 'preview_ready') {
      return false;
    }

    return ['preview_failed', 'full_failed', 'delivery_locked'].includes(story.fulfillment_status) ? false : true;
  }, [story]);

  const loadStory = useCallback(async () => {
    if (typeof storyId !== 'string') {
      setError('유효하지 않은 스토리 ID입니다.');
      return;
    }

    const response = await callJson<PreviewPayload>(`/api/stories/${storyId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      setError(response.error.message);
      return;
    }

    setStory(response.data.story);
    setAssets(response.data.assets ?? []);
    setError('');
  }, [storyId]);

  const requestPreview = useCallback(async () => {
    if (typeof storyId !== 'string') {
      setError('유효하지 않은 스토리 ID입니다.');
      return;
    }

    if (isRequesting) {
      return;
    }

    setRequesting(true);
    try {
      const response = await callJson<{ jobId: string }>(`/api/stories/${storyId}/preview`, {
        method: 'POST',
      });

      if (!response.ok && response.error.code !== 'CONFLICT') {
        setError(response.error.message);
      }
    } catch {
      setError('프리뷰 요청 중 네트워크 오류가 발생했습니다.');
    } finally {
      setRequesting(false);
    }
  }, [isRequesting, storyId]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function pollLoop() {
      if (!alive) {
        return;
      }

      setLoading(true);
      await loadStory();
      setLoading(false);

      if (!alive) {
        return;
      }

      if (!canUsePolling) {
        return;
      }

      if (!isRequesting && story?.fulfillment_status === 'none') {
        await requestPreview();
      }

      timer = setTimeout(pollLoop, POLL_INTERVAL_MS);
    }

    void pollLoop();

    return () => {
      alive = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [canUsePolling, loadStory, requestPreview, isRequesting, story?.fulfillment_status]);

  const isReady = story?.fulfillment_status === 'preview_ready';
  const isLocked = story?.payment_status !== 'paid';

  return (
    <main style={{ maxWidth: 840, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>동화 프리뷰</h1>
      <p style={{ color: '#4b5563', marginBottom: 24 }}>프리뷰 상태: {story ? statusCopy(story.fulfillment_status) : '로딩 중'}</p>

      {error && <p style={{ color: '#dc2626', fontWeight: 600 }}>{error}</p>}

      <section
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
          minHeight: 280,
        }}
      >
        {isReady ? (
          <>
            <h2 style={{ marginBottom: 12 }}>프리뷰 완료 ✓</h2>
            <div
              style={{
                opacity: isLocked ? 0.6 : 1,
                filter: isLocked ? 'blur(2px)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <p style={{ marginBottom: 12 }}>
                {`아이 이름: ${story?.child_name ?? '알 수 없음'} / 테마 기반: ${story?.id ? '완료' : ''}`}
              </p>
              <div style={{ display: 'grid', gap: 10 }}>
                {['page_1', 'page_2', 'page_3'].map((pageKey, index) => (
                  <article
                    key={pageKey}
                    style={{ background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb', padding: 16 }}
                  >
                    <h3 style={{ marginBottom: 8 }}>{`페이지 ${index + 1}`}</h3>
                    <p>
                      {story?.child_name
                        ? `${story.child_name}가 모험을 이어갑니다. `
                        : ''}
                      사진으로 설정한 분위기와 테마를 반영한 샘플 텍스트입니다.
                    </p>
                  </article>
                ))}
              </div>
            </div>

            {isLocked ? (
              <div
                style={{
                  marginTop: 20,
                  border: '1px solid #fee2e2',
                  background: '#fff7ed',
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <h3 style={{ marginTop: 0 }}>🔒 결제 잠금(placeholder)</h3>
                <p style={{ marginBottom: 12 }}>전체 동화와 PDF는 결제 후에 열립니다. 현재는 결제 플로우가 준비 단계라 잠금 상태입니다.</p>
                <button type="button" disabled style={{ border: 'none', padding: '10px 14px', borderRadius: 8, background: '#f97316', color: '#fff' }}>
                  결제 후 잠금 해제 예정
                </button>
              </div>
            ) : (
              <p style={{ marginTop: 16, color: '#059669' }}>이미 결제가 완료되어 전체 접근이 해제됩니다.</p>
            )}
          </>
        ) : (
          <div>
            <p>
              프리뷰를 생성하고 있습니다. 잠시만 기다려 주세요.
              {story?.fulfillment_status === 'preview_failed' && ' 프리뷰 생성이 실패했습니다. 다시 시도해 주세요.'}
            </p>
            {story?.fulfillment_status === 'preview_failed' && (
              <button
                type="button"
                onClick={() => {
                  void requestPreview();
                }}
                disabled={isRequesting}
                style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #7c3aed',
                  background: '#7c3aed',
                  color: 'white',
                  fontWeight: 600,
                }}
              >
                {isRequesting ? '재요청 중...' : '다시 생성'}
              </button>
            )}
          </div>
        )}

        {assets.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ marginBottom: 8 }}>등록된 자산</h4>
            <ul style={{ paddingLeft: 16, margin: 0 }}>
              {assets.slice(0, 3).map((asset) => (
                <li key={asset.id}>
                  {asset.file_name || asset.storage_path}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => {
          void loadStory();
        }}
        disabled={isLoading}
        style={{
          border: '1px solid #4b5563',
          padding: '10px 14px',
          borderRadius: 8,
          background: 'white',
        }}
      >
        {isLoading ? '갱신 중...' : '상태 새로고침'}
      </button>
    </main>
  );
}
