import { Buffer } from 'node:buffer';

const BUCKET = 'erp4-private-finance-proofs';

export class FinanceProofStorageError extends Error {
  status: number;
  constructor(status = 503, message = 'Berkas bukti pembayaran belum dapat diproses.') {
    super(message);
    this.name = 'FinanceProofStorageError';
    this.status = status;
  }
}

function storageConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || '').trim();
  if (!baseUrl || !secretKey) throw new FinanceProofStorageError(503, 'Konfigurasi Storage Supabase belum lengkap.');
  return { baseUrl, secretKey };
}

async function storageRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const { baseUrl, secretKey } = storageConfig();
  const headers = new Headers(init.headers || {});
  headers.set('apikey', secretKey);
  if (secretKey.startsWith('sb_secret_')) headers.delete('Authorization');
  else headers.set('Authorization', 'Bearer ' + secretKey);
  headers.set('Accept', 'application/json');
  return fetch(baseUrl + '/storage/v1' + path, { ...init, headers, cache: 'no-store' });
}

function encodedObjectPath(path: string): string {
  return validateObjectPath(path).split('/').map(encodeURIComponent).join('/');
}

function validateObjectPath(path: string): string {
  const value = String(path || '').trim();
  if (!value || value.length > 900 || !value.startsWith('financeProofs/') || value.includes('..') || value.startsWith('/')) {
    throw new FinanceProofStorageError(400, 'Lokasi bukti pembayaran tidak valid.');
  }
  return value;
}

export async function uploadSupabaseFinanceProof(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const objectPath = encodedObjectPath(path);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const blob = new Blob([body], { type: contentType });
  const response = await storageRequest('/object/' + BUCKET + '/' + objectPath, {
    method: 'POST',
    headers: { 'Content-Type': contentType, 'x-upsert': 'false' },
    body: blob,
  });
  if (!response.ok) throw new FinanceProofStorageError(response.status === 409 ? 409 : 503);
}

export async function downloadSupabaseFinanceProof(path: string): Promise<{ bytes: Buffer; contentType: string }> {
  const objectPath = encodedObjectPath(path);
  const response = await storageRequest('/object/' + BUCKET + '/' + objectPath, { method: 'GET' });
  if (!response.ok) throw new FinanceProofStorageError(response.status === 404 ? 404 : 503, 'Berkas bukti transfer tidak dapat dibuka.');
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, contentType: response.headers.get('content-type') || '' };
}

export async function deleteSupabaseFinanceProof(path: string): Promise<void> {
  const response = await storageRequest('/object/' + BUCKET, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [validateObjectPath(path)] }),
  });
  if (!response.ok) throw new FinanceProofStorageError();
}
