import type { API_ENDPOINTS, StorageError } from './storage.types';

export type StorageUploadSession = {
  uploadUrl: string;
  path: string;
  expiresAt: string;
};

export type API_ENDPOINTS = {
  baseUrl: string;
};

export type StorageError = {
  message: string;
};

const DEFAULT_TTL_SECONDS = 900;

function ensureSignedUploadConfig(): API_ENDPOINTS {
  const baseUrl = process.env.STORAGE_URL;
  if (!baseUrl) {
    throw new Error('STORAGE_URL is missing. Configure storage endpoint.');
  }
  return { baseUrl };
}

export function createUploadSignedUrl(path: string, _contentType: string): StorageUploadSession {
  const config = ensureSignedUploadConfig();
  const expiry = new Date(Date.now() + DEFAULT_TTL_SECONDS * 1000);

  // NOTE: In production, replace this with real Supabase storage signing call.
  const encoded = encodeURIComponent(path);
  return {
    uploadUrl: `${config.baseUrl}/storage/v1/object/uploads/${encoded}`,
    path,
    expiresAt: expiry.toISOString(),
  };
}
