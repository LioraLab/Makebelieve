import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type SupabaseEnv = {
  url: string;
  serviceKey: string;
};

function readEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Supabase env vars NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  return { url, serviceKey };
}

export function getServiceSupabaseClient(): SupabaseClient {
  const { url, serviceKey } = readEnv();
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
