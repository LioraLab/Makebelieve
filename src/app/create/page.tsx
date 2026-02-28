'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const SESSION_KEY = 'makebelieve-guest-session-id';

function getGuestSessionId(): string {
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

function isImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function CreatePage() {
  const router = useRouter();
  const [childName, setChildName] = useState('');
  const [ageBand, setAgeBand] = useState('');
  const [theme, setTheme] = useState('');
  const [tone, setTone] = useState('');
  const [language, setLanguage] = useState('en');
  const [photoUrls, setPhotoUrls] = useState<string[]>(['']);
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addPhotoField = () => setPhotoUrls((prev) => [...prev, '']);
  const removePhotoField = (index: number) =>
    setPhotoUrls((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));

  const updatePhotoField = (index: number, value: string) => {
    setPhotoUrls((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const cleanedPhotos = photoUrls
      .map((photo) => photo.trim())
      .filter((photo) => photo.length > 0);

    if (!childName.trim()) {
      setError('Child name is required.');
      return;
    }

    if (!theme.trim()) {
      setError('Theme is required.');
      return;
    }

    const invalidPhoto = cleanedPhotos.find((url) => !isImageUrl(url));
    if (invalidPhoto) {
      setError(`Invalid photo URL: ${invalidPhoto}`);
      return;
    }

    setSubmitting(true);

    try {
      const guestSessionId = getGuestSessionId();
      const createBody = {
        childName: childName.trim(),
        ageBand: ageBand.trim() || undefined,
        theme: theme.trim(),
        tone: tone.trim() || undefined,
        language,
        photos: cleanedPhotos,
      };

      const createResponse = await fetch('/api/stories', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-guest-session-id': guestSessionId,
        },
        body: JSON.stringify(createBody),
      });
      const createData = (await createResponse.json()) as {
        ok: boolean;
        data?: { storyId?: string };
        error?: { message?: string };
      };

      if (!createResponse.ok || !createData.ok) {
        setError(createData.error?.message ?? 'Failed to create story.');
        return;
      }

      const storyId = createData.data?.storyId;
      if (!storyId) {
        setError('Story id missing from response.');
        return;
      }

      await fetch(`/api/stories/${storyId}/preview`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-guest-session-id': guestSessionId,
        },
      });

      router.push(`/preview/${storyId}`);
    } catch {
      setError('Network error while creating preview.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 30, marginBottom: 4 }}>Makebelieve Preview Creator</h1>
      <p style={{ color: '#4b5563', marginBottom: 24 }}>
        Enter child details + photo URLs. This builds the core preview flow before checkout.
      </p>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
        <label style={{ display: 'grid', gap: 8 }}>
          <span>Child Name</span>
          <input
            value={childName}
            onChange={(event) => setChildName(event.target.value)}
            placeholder="예: Aiden / 예: 민지"
            required
            disabled={isSubmitting}
            style={{ padding: 12, border: '1px solid #d1d5db', borderRadius: 8 }}
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>Age Band (optional)</span>
          <input
            value={ageBand}
            onChange={(event) => setAgeBand(event.target.value)}
            placeholder="예: 4-6세"
            disabled={isSubmitting}
            style={{ padding: 12, border: '1px solid #d1d5db', borderRadius: 8 }}
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>Theme</span>
          <input
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
            placeholder="예: Magic forest"
            required
            disabled={isSubmitting}
            style={{ padding: 12, border: '1px solid #d1d5db', borderRadius: 8 }}
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>Tone (optional)</span>
          <input
            value={tone}
            onChange={(event) => setTone(event.target.value)}
            placeholder="gentle"
            disabled={isSubmitting}
            style={{ padding: 12, border: '1px solid #d1d5db', borderRadius: 8 }}
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>Language</span>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            disabled={isSubmitting}
            style={{ padding: 12, border: '1px solid #d1d5db', borderRadius: 8 }}
          >
            <option value="en">English</option>
            <option value="ko">Korean</option>
          </select>
        </label>

        <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <legend style={{ padding: '0 8px' }}>Photo URLs</legend>
          <div style={{ display: 'grid', gap: 10 }}>
            {photoUrls.map((photoUrl, idx) => (
              <label key={`photo-${idx}`} style={{ display: 'grid', gap: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{`Photo ${idx + 1}`}</span>
                  {photoUrls.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removePhotoField(idx)}
                      disabled={isSubmitting}
                      style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                    >
                      Remove
                    </button>
                  ) : null}
                </span>
                <input
                  value={photoUrl}
                  onChange={(event) => updatePhotoField(idx, event.target.value)}
                  placeholder="https://..."
                  disabled={isSubmitting}
                  style={{ padding: 12, border: '1px solid #d1d5db', borderRadius: 8 }}
                />
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={addPhotoField}
            disabled={isSubmitting || photoUrls.length >= 5}
            style={{
              marginTop: 12,
              border: '1px dashed #cbd5e1',
              padding: 8,
              borderRadius: 8,
              background: 'white',
            }}
          >
            Add photo
          </button>
        </fieldset>

        {error && <p style={{ color: '#dc2626', fontWeight: 600 }}>{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            background: '#7c3aed',
            color: 'white',
            border: 'none',
            padding: '14px 16px',
            borderRadius: 10,
            fontWeight: 700,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting ? 'Starting preview...' : 'Start preview generation'}
        </button>
      </form>
    </main>
  );
}
