'use client';

import { FormEvent, useEffect, useState } from 'react';

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

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string } };

type AssetRecord = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string | null;
  content_type: string | null;
  kind: string;
  is_locked: boolean;
};

type StoryRecord = {
  id: string;
  child_name: string;
  age_band: string | null;
  theme: string;
  tone: string | null;
  language: string;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  created_at: string;
  status: string | null;
  assets: AssetRecord[];
};

type LibraryResponse = {
  stories: StoryRecord[];
};

type DownloadResponse = {
  signedUrl: string;
  expiresAt: string;
  expiresIn: number;
  assetId: string;
  fileName: string | null;
};

const SESSION_KEY = 'makebelieve-guest-session-id';

function getGuestSessionId() {
  if (typeof window === 'undefined') {
    return 'server-session';
  }

  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }

  const generated =
    window.crypto?.randomUUID?.() || `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
      return '미생성';
    case 'preview_queued':
      return '프리뷰 요청 중';
    case 'preview_generating':
      return '프리뷰 생성 중';
    case 'preview_ready':
      return '프리뷰 준비 완료';
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

function canDownload(status: FulfillmentStatus, payment: PaymentStatus, isLocked: boolean) {
  return status === 'full_ready' && payment === 'paid' && !isLocked;
}

export default function LibraryPage() {
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyAssetId, setBusyAssetId] = useState('');

  useEffect(() => {
    let alive = true;

    async function loadStories() {
      setLoading(true);
      const response = await callJson<LibraryResponse>('/api/stories', {
        method: 'GET',
      });

      if (!alive) {
        return;
      }

      if (!response.ok) {
        setError(response.error.message);
      } else {
        setStories(response.data.stories);
        setError('');
      }
      setLoading(false);
    }

    void loadStories();

    return () => {
      alive = false;
    };
  }, []);

  const onDownload = async (event: FormEvent<HTMLButtonElement>, assetId: string, fileName: string | null) => {
    event.preventDefault();

    if (busyAssetId) {
      return;
    }

    setBusyAssetId(assetId);
    try {
      const response = await callJson<DownloadResponse>(`/api/assets/${assetId}/download`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        setError(response.error.message);
        return;
      }

      const link = document.createElement('a');
      link.href = response.data.signedUrl;
      link.rel = 'noopener noreferrer';
      link.target = '_blank';
      link.download = fileName ?? 'makebelieve-asset';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setError('');
    } catch {
      setError('다운로드 처리 중 오류가 발생했습니다.');
    } finally {
      setBusyAssetId('');
    }
  };

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>나의 라이브러리</h1>
      <p style={{ color: '#4b5563', marginBottom: 16 }}>구매 완료된 동화와 PDF 자산을 확인하고 다운로드하세요.</p>

      {error ? <p style={{ color: '#dc2626', fontWeight: 600 }}>{error}</p> : null}

      {isLoading ? (
        <p>라이브러리 목록을 불러오는 중...</p>
      ) : stories.length === 0 ? (
        <p>표시할 동화가 없습니다. 스토리를 생성한 뒤 라이브러리에서 확인하세요.</p>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {stories.map((story) => (
            <section
              key={story.id}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 16,
                background: '#fff',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 8 }}>{story.child_name} 동화</h2>
              <p style={{ marginTop: 0, color: '#6b7280' }}>
                {story.theme} · {story.age_band || '연령 미입력'}
              </p>

              <p style={{ margin: '8px 0 12px', color: '#374151' }}>
                상태: <strong>{statusCopy(story.fulfillment_status)}</strong>
              </p>

              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {story.assets.length > 0 ? (
                  story.assets.map((asset) => (
                    <li
                      key={asset.id}
                      style={{
                        border: '1px solid #eef2ff',
                        borderRadius: 8,
                        padding: 10,
                        display: 'flex',
                        gap: 12,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <strong>{asset.file_name || asset.storage_path}</strong>
                        <div style={{ color: '#6b7280', fontSize: 13 }}>종류: {asset.kind}</div>
                      </div>

                      <button
                        type="button"
                        onClick={(event) => {
                          void onDownload(event, asset.id, asset.file_name);
                        }}
                        disabled={busyAssetId === asset.id || !canDownload(story.fulfillment_status, story.payment_status, asset.is_locked)}
                        style={{
                          border: 'none',
                          borderRadius: 8,
                          background: canDownload(story.fulfillment_status, story.payment_status, asset.is_locked)
                            ? '#16a34a'
                            : '#9ca3af',
                          color: '#fff',
                          padding: '8px 12px',
                          cursor: canDownload(story.fulfillment_status, story.payment_status, asset.is_locked)
                            ? 'pointer'
                            : 'not-allowed',
                        }}
                      >
                        {busyAssetId === asset.id
                          ? '다운로드 중'
                          : canDownload(story.fulfillment_status, story.payment_status, asset.is_locked)
                            ? '다운로드'
                            : '잠금됨'}
                      </button>
                    </li>
                  ))
                ) : (
                  <li style={{ color: '#9ca3af' }}>생성 자산이 아직 없습니다.</li>
                )}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
