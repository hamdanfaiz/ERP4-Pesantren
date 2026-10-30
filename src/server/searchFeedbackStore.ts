import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class SearchFeedbackStoreError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SearchFeedbackStoreError';
    this.status = status;
  }
}

let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new SearchFeedbackStoreError(503, 'Konfigurasi backend Supabase belum lengkap.');
  if (!serviceClient) {
    serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return serviceClient;
}

export async function recordTenantSearchFeedback(
  tenantIdentifier: string,
  actorUserId: string,
  requestId: string,
  rating: -1 | 1,
) {
  const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  if (!tenantIdentifier.trim() || !isUuid(actorUserId)
    || !isUuid(requestId) || ![-1, 1].includes(rating)) {
    throw new SearchFeedbackStoreError(400, 'Feedback pencarian tidak valid.');
  }
  const { data, error } = await getServiceClient().rpc('record_search_feedback', {
    p_tenant_identifier: tenantIdentifier,
    p_actor_user_id: actorUserId,
    p_request_id: requestId,
    p_rating: rating,
  });
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 400 : 503;
    throw new SearchFeedbackStoreError(status, status >= 500 ? 'Feedback belum dapat disimpan.' : error.message);
  }
  return data as { success: boolean; alreadyRecorded: boolean };
}
