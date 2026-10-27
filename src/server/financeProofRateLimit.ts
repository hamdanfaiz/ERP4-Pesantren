import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class FinanceProofRateLimitError extends Error {
  status = 503;

  constructor() {
    super("Batas unggahan bukti pembayaran belum dapat diverifikasi.");
    this.name = "FinanceProofRateLimitError";
  }
}

let adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !secretKey) throw new FinanceProofRateLimitError();

  if (!adminClient) {
    adminClient = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

function actorFingerprint(tenantId: string, actorId: string): string {
  const keyHex = String(process.env.PII_FINGERPRINT_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex) || !tenantId || !actorId) {
    throw new FinanceProofRateLimitError();
  }

  return createHmac("sha256", Buffer.from(keyHex, "hex"))
    .update(`finance-proof-upload:${tenantId}:${actorId}`)
    .digest("hex");
}

export async function consumeFinanceProofUploadRateLimit(
  tenantId: string,
  actorId: string,
  limit = 12,
): Promise<boolean> {
  try {
    const { data, error } = await getAdminClient().rpc("consume_finance_proof_upload_rate_limit", {
      p_tenant_id: tenantId,
      p_actor_fingerprint_hex: actorFingerprint(tenantId, actorId),
      p_limit: limit,
    });
    if (error || typeof data !== "boolean") throw new FinanceProofRateLimitError();
    return data;
  } catch {
    throw new FinanceProofRateLimitError();
  }
}
