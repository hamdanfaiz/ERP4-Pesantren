import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

export class SupabaseCrmError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseCrmError";
    this.status = status;
  }
}

let serviceClient: SupabaseClient | null = null;
function client(): SupabaseClient {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new SupabaseCrmError(503, "Konfigurasi backend Supabase belum lengkap.");
  if (!serviceClient) serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return serviceClient;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function fail(error: any, fallback: string): never {
  const code = String(error?.code || "");
  const status = Number(error?.status || error?.statusCode || 0);
  if (["23505", "23503", "23514", "55000"].includes(code) || status === 409) {
    throw new SupabaseCrmError(409, "Perubahan CRM bertentangan dengan kontak atau permintaan yang sudah tercatat.");
  }
  if (["22023", "22007", "22008", "22P02"].includes(code) || status === 400) {
    throw new SupabaseCrmError(400, "Data CRM tidak valid.");
  }
  if (code === "42501" || status === 403) throw new SupabaseCrmError(403, "Akses CRM ditolak oleh role atau tenant.");
  if (code === "P0002" || status === 404) throw new SupabaseCrmError(404, "Kontak CRM tidak ditemukan pada tenant ini.");
  throw new SupabaseCrmError(503, fallback);
}

function cleanText(value: unknown, max: number, label: string, required = false): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && (!text || text.length < 1)) throw new SupabaseCrmError(400, `${label} wajib diisi.`);
  if (text.length > max || /[\u0000-\u001f\u007f]/.test(text)) throw new SupabaseCrmError(400, `${label} tidak valid.`);
  return text || null;
}

function roleForDatabase(role: string) {
  if (role === "Admin") return "admin";
  if (role === "SuperAdmin") return "super_admin";
  throw new SupabaseCrmError(403, "Pengelolaan CRM hanya tersedia bagi Admin dan SuperAdmin.");
}

type CrmCursor = { createdAt: string; id: string };
function decodeCursor(raw: unknown): CrmCursor | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 500) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as CrmCursor;
    if (!value || !uuid(value.id) || typeof value.createdAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value.createdAt)) return null;
    return value;
  } catch { return null; }
}
function encodeCursor(value: CrmCursor) { return Buffer.from(JSON.stringify(value), "utf8").toString("base64url"); }

function contactDto(row: any) {
  return {
    id: String(row.id), contactType: String(row.contact_type), name: String(row.name),
    organizationName: row.organization_name ? String(row.organization_name) : "",
    email: row.email ? String(row.email) : "", phone: row.phone ? String(row.phone) : "",
    lifecycleStage: String(row.lifecycle_stage), marketingConsent: String(row.marketing_consent),
    consentSource: row.consent_source ? String(row.consent_source) : "",
    consentRecordedAt: row.consent_recorded_at ? String(row.consent_recorded_at) : null,
    lastInteractionAt: row.last_interaction_at ? String(row.last_interaction_at) : null,
    interactionCount: Number(row.interaction_count || 0),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function interactionDto(row: any) {
  return {
    id: String(row.id), contactId: String(row.contact_id), interactionType: String(row.interaction_type),
    direction: String(row.direction), subject: String(row.subject), summary: row.summary ? String(row.summary) : "",
    occurredAt: String(row.occurred_at), createdAt: String(row.created_at),
  };
}

export async function listSupabaseCrmContactsPage(
  tenantId: string, actorId: string, role: string,
  query: { cursor?: unknown; search?: unknown; contactType?: unknown; lifecycleStage?: unknown; pageSize?: unknown } = {},
) {
  if (!uuid(tenantId) || !uuid(actorId)) throw new SupabaseCrmError(403, "Profil tenant CRM tidak valid.");
  const rawCursor = query.cursor;
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) throw new SupabaseCrmError(400, "Penanda halaman CRM tidak valid.");
  const search = cleanText(query.search, 100, "Pencarian") || null;
  if (search && search.length < 3) throw new SupabaseCrmError(400, "Pencarian CRM minimal 3 karakter.");
  const contactType = cleanText(query.contactType, 20, "Jenis kontak") || null;
  const lifecycleStage = cleanText(query.lifecycleStage, 20, "Tahap kontak") || null;
  const requestedSize = Number(query.pageSize ?? 50);
  const pageSize = Number.isSafeInteger(requestedSize) ? Math.max(1, Math.min(100, requestedSize)) : 50;
  const { data, error } = await client().rpc("list_tenant_crm_contacts_page", {
    p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: roleForDatabase(role),
    p_search: search, p_contact_type: contactType, p_lifecycle_stage: lifecycleStage,
    p_cursor_created_at: cursor?.createdAt ?? null, p_cursor_id: cursor?.id ?? null, p_page_size: pageSize,
  });
  if (error) fail(error, "Daftar kontak CRM belum dapat dimuat.");
  const result = data as { contacts?: any[]; nextCursor?: { createdAt?: string; id?: string } | null; summary?: Record<string, number> };
  const next = result?.nextCursor;
  return {
    contacts: Array.isArray(result?.contacts) ? result.contacts.map(contactDto) : [],
    nextCursor: next && typeof next.createdAt === "string" && uuid(next.id) ? encodeCursor({ createdAt: next.createdAt, id: next.id }) : null,
    summary: {
      totalContacts: Number(result?.summary?.totalContacts || 0),
      openLeads: Number(result?.summary?.openLeads || 0),
      interactionsLast30Days: Number(result?.summary?.interactionsLast30Days || 0),
      marketingConsentedContacts: Number(result?.summary?.marketingConsentedContacts || 0),
    },
  };
}

export async function listSupabaseCrmInteractionsPage(
  tenantId: string, actorId: string, role: string, contactId: string, rawCursor?: unknown,
) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(contactId)) throw new SupabaseCrmError(403, "Profil atau kontak CRM tidak valid.");
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) throw new SupabaseCrmError(400, "Penanda halaman interaksi CRM tidak valid.");
  const { data, error } = await client().rpc("list_tenant_crm_interactions_page", {
    p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: roleForDatabase(role), p_contact_id: contactId,
    p_cursor_created_at: cursor?.createdAt ?? null, p_cursor_id: cursor?.id ?? null, p_page_size: 50,
  });
  if (error) fail(error, "Riwayat interaksi CRM belum dapat dimuat.");
  const result = data as { interactions?: any[]; nextCursor?: { createdAt?: string; id?: string } | null };
  const next = result?.nextCursor;
  return {
    interactions: Array.isArray(result?.interactions) ? result.interactions.map(interactionDto) : [],
    nextCursor: next && typeof next.createdAt === "string" && uuid(next.id) ? encodeCursor({ createdAt: next.createdAt, id: next.id }) : null,
  };
}

export type CrmContactDraft = {
  clientRequestId: string; contactId?: string; contactType: string; name: string;
  organizationName?: string; email?: string; phone?: string; lifecycleStage: string;
  marketingConsent: string; consentSource?: string;
};

export async function saveSupabaseCrmContact(tenantId: string, actorId: string, role: string, raw: CrmContactDraft) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(raw?.clientRequestId)) throw new SupabaseCrmError(400, "ID permintaan CRM tidak valid.");
  const action = raw.contactId ? "update" : "create";
  if (action === "update" && !uuid(raw.contactId)) throw new SupabaseCrmError(400, "ID kontak CRM tidak valid.");
  const contactType = String(raw.contactType || "").trim().toLowerCase();
  const lifecycleStage = String(raw.lifecycleStage || "").trim().toLowerCase();
  const marketingConsent = String(raw.marketingConsent || "unknown").trim().toLowerCase();
  if (!["parent", "prospect", "alumni", "donor", "partner"].includes(contactType)) throw new SupabaseCrmError(400, "Jenis kontak CRM tidak valid.");
  if (!["lead", "qualified", "engaged", "active", "lost"].includes(lifecycleStage)) throw new SupabaseCrmError(400, "Tahap relasi CRM tidak valid.");
  if (!["unknown", "granted", "revoked"].includes(marketingConsent)) throw new SupabaseCrmError(400, "Status persetujuan pemasaran tidak valid.");
  const name = cleanText(raw.name, 160, "Nama kontak", true) || "";
  if (name.length < 2) throw new SupabaseCrmError(400, "Nama kontak minimal 2 karakter.");
  const organizationName = cleanText(raw.organizationName, 200, "Nama lembaga");
  const email = cleanText(raw.email, 254, "Email")?.toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SupabaseCrmError(400, "Format email tidak valid.");
  const phone = cleanText(raw.phone, 32, "Nomor telepon");
  const consentSource = cleanText(raw.consentSource, 120, "Sumber persetujuan");
  if (marketingConsent === "granted" && !consentSource) throw new SupabaseCrmError(400, "Sumber persetujuan pemasaran wajib dicatat.");
  if (marketingConsent === "unknown" && consentSource) throw new SupabaseCrmError(400, "Sumber persetujuan tidak dapat diisi jika status belum diketahui.");
  const contactId = raw.contactId || randomUUID();
  const item = { contactType, name, organizationName, email, phone, lifecycleStage, marketingConsent, consentSource };
  const { data, error } = await client().rpc("manage_tenant_crm_contact", {
    p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: roleForDatabase(role),
    p_client_request_id: raw.clientRequestId, p_contact_id: contactId, p_action: action, p_item: item,
  });
  if (error) fail(error, "Kontak CRM belum dapat disimpan.");
  const result = data as { contactId?: string; alreadyApplied?: boolean };
  if (!uuid(result?.contactId)) throw new SupabaseCrmError(503, "Respons penyimpanan CRM tidak valid.");
  return { contactId: result.contactId, alreadyApplied: result.alreadyApplied === true };
}

export type CrmInteractionDraft = {
  clientRequestId: string; contactId: string; interactionType: string; direction: string; subject: string; summary?: string;
};

export async function recordSupabaseCrmInteraction(tenantId: string, actorId: string, role: string, raw: CrmInteractionDraft) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(raw?.clientRequestId) || !uuid(raw?.contactId)) {
    throw new SupabaseCrmError(400, "ID permintaan atau kontak interaksi tidak valid.");
  }
  const interactionType = String(raw.interactionType || "").trim().toLowerCase();
  const direction = String(raw.direction || "").trim().toLowerCase();
  if (!["call", "email", "meeting", "message", "note"].includes(interactionType)) throw new SupabaseCrmError(400, "Jenis interaksi tidak valid.");
  if (!["inbound", "outbound", "internal"].includes(direction)) throw new SupabaseCrmError(400, "Arah interaksi tidak valid.");
  const subject = cleanText(raw.subject, 200, "Judul interaksi", true) || "";
  const summary = cleanText(raw.summary, 2000, "Ringkasan interaksi");
  const interactionId = randomUUID();
  const item = { contactId: raw.contactId, interactionType, direction, subject, summary };
  const { data, error } = await client().rpc("record_tenant_crm_interaction", {
    p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: roleForDatabase(role),
    p_client_request_id: raw.clientRequestId, p_interaction_id: interactionId, p_item: item,
  });
  if (error) fail(error, "Catatan interaksi CRM belum dapat disimpan.");
  const result = data as { interactionId?: string; alreadyApplied?: boolean };
  if (!uuid(result?.interactionId)) throw new SupabaseCrmError(503, "Respons pencatatan interaksi CRM tidak valid.");
  return { interactionId: result.interactionId, alreadyApplied: result.alreadyApplied === true };
}
