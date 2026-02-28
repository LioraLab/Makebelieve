import { randomUUID } from 'crypto';
import type { Actor, SignedUploadRequest, StoryInput, StoryRecord } from './types';

const stories = new Map<string, StoryRecord>();

function nowIso(): string {
  return new Date().toISOString();
}

function toStory(actor: Actor, input: StoryInput): StoryRecord {
  return {
    id: randomUUID(),
    userId: actor.type === 'user' ? actor.userId ?? null : null,
    guestSessionId: actor.type === 'guest' ? actor.guestSessionId ?? null : null,
    childProfileId: randomUUID(),
    theme: input.theme,
    tone: input.tone ?? null,
    language: input.language,
    photos: input.photos,
    payment_status: 'payment_pending',
    fulfillment_status: 'none',
  };
}

export function createStory(actor: Actor, input: StoryInput): StoryRecord {
  const story = toStory(actor, input);
  stories.set(story.id, story);
  return story;
}

export function findStory(id: string): StoryRecord | undefined {
  return stories.get(id);
}

export function mapSignedUploadPath(_actor: Actor, payload: SignedUploadRequest): string {
  const safeName = payload.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `uploads/${payload.kind}/${safeName}`;
}

export function listStories(): StoryRecord[] {
  return Array.from(stories.values());
}

export function audit(action: string, payload: Record<string, unknown>): void {
  console.log(`audit:${action}`, JSON.stringify(payload));
}

export function snapshotStoryStore(): { size: number; createdAt: string } {
  return {
    size: stories.size,
    createdAt: nowIso(),
  };
}
