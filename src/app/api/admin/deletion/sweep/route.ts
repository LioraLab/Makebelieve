import { type NextRequest } from 'next/server';

import { failJson, okJson } from '../../../../../lib/api/response';
import { adminAuthFailureMessage, isAdminRequest } from '../../../../../lib/api/admin';
import { listDeletionCandidates, purgeStory } from '../../../../../lib/ops/deletion';

type SweepBody = {
  hours?: number;
  execute?: boolean;
  storyIds?: string[];
};

function parseNumber(raw: number | undefined, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(raw), 1), 8760);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return failJson('UNAUTHORIZED', adminAuthFailureMessage(), 401);
  }

  let body: SweepBody;
  try {
    body = (await req.json()) as SweepBody;
  } catch {
    body = {};
  }

  const hours = parseNumber(body.hours, 168);
  const execute = body.execute === true;

  if (body.storyIds && body.storyIds.some((storyId) => typeof storyId !== 'string' || !isUuid(storyId))) {
    return failJson('VALIDATION_ERROR', 'storyIds must be UUID array', 400);
  }

  try {
    if (body.storyIds?.length) {
      const requestedIds = [...new Set(body.storyIds)];
      if (!execute) {
        return okJson({
          execute: false,
          hours,
          targets: requestedIds,
          message: 'Dry-run. Set execute=true to purge.',
        });
      }

      const results = await Promise.all(
        requestedIds.map(async (storyId) => {
          try {
            return { ...await purgeStory(storyId), success: true };
          } catch (error) {
            return {
              storyId,
              assetsDeleted: 0,
              storyDeleted: false,
              storageErrors: [error instanceof Error ? error.message : 'Unknown error'],
              success: false,
            };
          }
        }),
      );

      return okJson({
        execute,
        hours,
        total: results.length,
        results,
      });
    }

    const candidates = await listDeletionCandidates(hours);
    if (!execute) {
      return okJson({
        execute,
        hours,
        candidateCount: candidates.length,
        candidates,
        message: 'Dry-run. Set execute=true to purge.',
      });
    }

    const results = await Promise.all(
      candidates.map(async (candidate) => {
        try {
          return { ...await purgeStory(candidate.storyId), success: true };
        } catch (error) {
          return {
            storyId: candidate.storyId,
            assetsDeleted: 0,
            storyDeleted: false,
            storageErrors: [error instanceof Error ? error.message : 'Unknown error'],
            success: false,
          };
        }
      }),
    );

    return okJson({
      execute,
      hours,
      candidateCount: candidates.length,
      results,
    });
  } catch (error) {
    return failJson(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Deletion sweep failed',
      500,
    );
  }
}
