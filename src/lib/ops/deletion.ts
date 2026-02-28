import { getServiceSupabaseClient } from '../supabase/admin';

type StoryCandidateRow = {
  id: string;
  child_name: string;
  payment_status: 'payment_pending' | 'paid' | 'refunded' | 'chargeback' | 'disputed' | null;
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
    | 'delivery_locked'
    | null;
  created_at: string;
};

type AssetRow = {
  id: string;
  storage_bucket: string;
  storage_path: string;
};

export type DeletionCandidate = {
  storyId: string;
  childName: string;
  reason: string;
  createdAt: string;
  paymentStatus: StoryCandidateRow['payment_status'];
  fulfillmentStatus: StoryCandidateRow['fulfillment_status'];
};

export type PurgeResult = {
  storyId: string;
  assetsDeleted: number;
  storyDeleted: boolean;
  storageErrors: string[];
};

function candidateFilter(sinceHours: number): string {
  const now = Date.now();
  const cutoff = now - Math.max(1, Math.floor(sinceHours)) * 60 * 60 * 1000;
  return new Date(cutoff).toISOString();
}

export async function listDeletionCandidates(sinceHours: number): Promise<DeletionCandidate[]> {
  const cutoff = candidateFilter(sinceHours);
  const supabase = getServiceSupabaseClient();

  const { data: rows, error } = await supabase
    .from('stories')
    .select('id, child_name, payment_status, fulfillment_status, created_at')
    .lt('created_at', cutoff)
    .in('payment_status', ['refunded', 'chargeback', 'disputed'])
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed loading deletion candidates: ${error.message}`);
  }

  return (rows ?? []).map((row: StoryCandidateRow) => ({
    storyId: row.id,
    childName: row.child_name,
    reason: row.payment_status === 'refunded'
      ? 'refund'
      : row.payment_status === 'chargeback'
        ? 'chargeback'
        : 'dispute',
    createdAt: row.created_at,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
  }));
}

async function removeStorageForStory(storyId: string): Promise<{ removed: number; errors: string[] }> {
  const supabase = getServiceSupabaseClient();
  const errors: string[] = [];

  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, storage_bucket, storage_path')
    .eq('story_id', storyId);

  if (error) {
    throw new Error(`Failed to load assets for story ${storyId}: ${error.message}`);
  }

  if (!assets || assets.length === 0) {
    return { removed: 0, errors };
  }

  const byBucket = new Map<string, string[]>();
  for (const row of assets as AssetRow[]) {
    const paths = byBucket.get(row.storage_bucket) ?? [];
    paths.push(row.storage_path);
    byBucket.set(row.storage_bucket, paths);
  }

  for (const [bucket, paths] of byBucket.entries()) {
    const { error: rmError } = await supabase.storage.from(bucket).remove(paths);
    if (rmError) {
      errors.push(`${bucket}: ${rmError.message}`);
    }
  }

  return {
    removed: assets.length,
    errors,
  };
}

export async function purgeStory(storyId: string): Promise<PurgeResult> {
  const supabase = getServiceSupabaseClient();
  const { error: storyError } = await supabase
    .from('stories')
    .select('id')
    .eq('id', storyId)
    .maybeSingle();

  if (storyError) {
    throw new Error(`Story lookup failed: ${storyError.message}`);
  }

  const storage = await removeStorageForStory(storyId);

  const { error: deleteError } = await supabase.from('stories').delete().eq('id', storyId);
  if (deleteError) {
    throw new Error(`Story deletion failed: ${deleteError.message}`);
  }

  return {
    storyId,
    assetsDeleted: storage.removed,
    storyDeleted: true,
    storageErrors: storage.errors,
  };
}
