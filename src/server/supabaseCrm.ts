import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";

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
  if (!url || !key) throw new SupabaseCrmError(503, "Layanan ini belum tersedia saat ini. Silakan hubungi administrator pesantren.");
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

export type CrmBroadcastDraft = {
  clientRequestId: string;
  message: string;
  subject?: string;
  contactIds: string[];
  dryRun?: boolean;
};

export function normalizeCrmBroadcastContactIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new SupabaseCrmError(400, "Pilih sedikitnya satu penerima untuk siaran.");
  }
  if (raw.length > 50) {
    throw new SupabaseCrmError(400, "Maksimal 50 penerima per siaran.");
  }
  if (raw.some((id) => !uuid(id))) {
    throw new SupabaseCrmError(400, "Daftar penerima siaran tidak valid.");
  }
  const ids = [...new Set(raw as string[])];
  if (ids.length === 0 || ids.length > 50) {
    throw new SupabaseCrmError(400, "Pilih 1 sampai 50 penerima untuk siaran.");
  }
  return ids;
}

function crmBroadcastInteractionRequestId(clientRequestId: string, contactId: string) {
  const hex = createHash("sha256").update(clientRequestId + ":" + contactId).digest("hex").slice(0, 32);
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-4" + hex.slice(13, 16) + "-8" + hex.slice(17, 20) + "-" + hex.slice(20, 32);
}

async function readSupabaseCrmBroadcastStatus(
  tenantId: string, actorId: string, role: string, clientRequestId: string,
) {
  const { data, error } = await client().rpc("get_tenant_crm_broadcast_status", {
    p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: roleForDatabase(role),
    p_client_request_id: clientRequestId,
  });
  if (error) fail(error, "Status siaran CRM belum dapat dimuat.");
  const result = data as any;
  if (!result || !uuid(result.clientRequestId) || !["processing", "completed", "uncertain"].includes(result.status)
    || !Array.isArray(result.results)) {
    throw new SupabaseCrmError(503, "Status siaran CRM tidak valid.");
  }
  return {
    dryRun: false,
    provider: "open-wa",
    clientRequestId: result.clientRequestId,
    status: result.status as "processing" | "completed" | "uncertain",
    sent: Number(result.sent || 0),
    failed: Number(result.failed || 0),
    unknown: Number(result.unknown || 0),
    pending: Number(result.pending || 0),
    results: result.results,
  };
}

export async function sendSupabaseCrmOpenWaBroadcast(
  tenantId: string,
  actorId: string,
  role: string,
  raw: CrmBroadcastDraft,
) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(raw?.clientRequestId)) {
    throw new SupabaseCrmError(400, "ID permintaan siaran CRM tidak valid.");
  }
  const message = cleanText(raw.message, 4000, "Isi siaran", true) || "";
  if (message.length < 5) throw new SupabaseCrmError(400, "Isi siaran minimal 5 karakter.");
  const subject = cleanText(raw.subject, 200, "Judul siaran") || "Siaran WhatsApp CRM";
  const requestedIds = normalizeCrmBroadcastContactIds(raw.contactIds);
  const { openWaSendText, normalizeOpenWaChatId, OpenWaGatewayError, getOpenWaStatus } = await import("./openWaGateway");

  const readSelectedContacts = async () => {
    const { data, error } = await client().from("crm_contacts")
      .select("id,name,phone,marketing_consent")
      .eq("tenant_id", tenantId)
      .in("id", requestedIds);
    if (error) fail(error, "Daftar penerima siaran CRM belum dapat dimuat.");
    const contacts = new Map<string, { id: string; name: string; phone: string; consent: string; chatId: string | null }>();
    for (const row of (Array.isArray(data) ? data : []) as any[]) {
      contacts.set(String(row.id), {
        id: String(row.id),
        name: String(row.name || ""),
        phone: row.phone ? String(row.phone) : "",
        consent: String(row.marketing_consent || "unknown"),
        chatId: normalizeOpenWaChatId(row.phone),
      });
    }
    const missing = requestedIds.filter((id) => !contacts.has(id));
    if (missing.length) throw new SupabaseCrmError(503, "Data penerima siaran CRM berubah dan perlu dimuat ulang.");
    return contacts;
  };

  if (raw.dryRun) {
    const gatewayStatus = await getOpenWaStatus(tenantId);
    const contacts = await readSelectedContacts();
    const recipients = requestedIds.map((id) => contacts.get(id)!).filter((contact) =>
      contact.consent === "granted" && Boolean(contact.chatId));
    if (recipients.length !== requestedIds.length) {
      throw new SupabaseCrmError(400, "Sebagian kontak tidak memiliki persetujuan atau nomor WhatsApp valid.");
    }
    return {
      dryRun: true,
      configured: Boolean(gatewayStatus.configured),
      provider: "open-wa",
      recipientCount: recipients.length,
      recipients: recipients.map(({ id, name, phone, chatId }) => ({ id, name, phone, chatId })),
    };
  }

  const payloadSha256 = createHash("sha256").update(JSON.stringify({
    tenantId,
    actorId,
    subject,
    message,
    contactIds: [...requestedIds].sort(),
  })).digest("hex");
  const { data: reservationData, error: reservationError } = await client().rpc("reserve_tenant_crm_broadcast", {
    p_tenant_id: tenantId,
    p_actor_user_id: actorId,
    p_expected_role: roleForDatabase(role),
    p_client_request_id: raw.clientRequestId,
    p_payload_sha256: "\\x" + payloadSha256,
    p_contact_ids: requestedIds,
  });
  if (reservationError) fail(reservationError, "Permintaan siaran CRM belum dapat dicatat.");
  const reservation = reservationData as { created?: boolean; status?: string } | null;
  if (!reservation || typeof reservation.created !== "boolean") {
    throw new SupabaseCrmError(503, "Respons pencatatan siaran CRM tidak valid.");
  }
  if (!reservation.created && reservation.status !== "processing") {
    return {
      ...(await readSupabaseCrmBroadcastStatus(tenantId, actorId, role, raw.clientRequestId)),
      alreadyApplied: true,
    };
  }

  const gatewayStatus = await getOpenWaStatus(tenantId);
  const contacts = await readSelectedContacts();
  for (const id of requestedIds) {
    const recipient = contacts.get(id)!;
    const { data: claimData, error: claimError } = await client().rpc("claim_tenant_crm_broadcast_recipient", {
      p_tenant_id: tenantId,
      p_actor_user_id: actorId,
      p_expected_role: roleForDatabase(role),
      p_client_request_id: raw.clientRequestId,
      p_contact_id: recipient.id,
    });
    if (claimError) fail(claimError, "Penerima siaran CRM belum dapat diproses.");
    if (!(claimData as any)?.claimed) continue;

    if (!recipient.chatId) {
      const { error } = await client().rpc("record_tenant_crm_broadcast_delivery", {
        p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: roleForDatabase(role),
        p_client_request_id: raw.clientRequestId, p_contact_id: recipient.id,
        p_status: "failed", p_message_id: null, p_error_code: "invalid_recipient",
      });
      if (error) fail(error, "Status penerima siaran CRM belum dapat dicatat.");
      continue;
    }
    if (!gatewayStatus.configured) {
      const { error } = await client().rpc("record_tenant_crm_broadcast_delivery", {
        p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: roleForDatabase(role),
        p_client_request_id: raw.clientRequestId, p_contact_id: recipient.id,
        p_status: "failed", p_message_id: null, p_error_code: "provider_unavailable",
      });
      if (error) fail(error, "Status siaran CRM belum dapat dicatat.");
      continue;
    }

    let sent: { messageId?: string | null };
    try {
      sent = await openWaSendText(tenantId, recipient.chatId, message);
    } catch (error) {
      const deliveryUnknown = error instanceof OpenWaGatewayError ? error.deliveryUnknown : true;
      const deliveryStatus = deliveryUnknown ? "unknown" : "failed";
      const errorCode = deliveryUnknown
        ? "delivery_unknown"
        : error instanceof OpenWaGatewayError && error.status === 503
          ? "provider_unavailable"
          : "provider_rejected";
      const { error: recordError } = await client().rpc("record_tenant_crm_broadcast_delivery", {
        p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: roleForDatabase(role),
        p_client_request_id: raw.clientRequestId, p_contact_id: recipient.id,
        p_status: deliveryStatus, p_message_id: null, p_error_code: errorCode,
      });
      if (recordError) console.error("CRM broadcast outcome could not be persisted:", String(recordError.code || "database_error"));
      continue;
    }

    const { error: deliveryError } = await client().rpc("record_tenant_crm_broadcast_delivery", {
      p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: roleForDatabase(role),
      p_client_request_id: raw.clientRequestId, p_contact_id: recipient.id,
      p_status: "sent", p_message_id: sent.messageId || null, p_error_code: null,
    });
    if (deliveryError) console.error("CRM accepted delivery outcome could not be persisted:", String(deliveryError.code || "database_error"));

    let interactionLogged = false;
    try {
      await recordSupabaseCrmInteraction(tenantId, actorId, role, {
        clientRequestId: crmBroadcastInteractionRequestId(raw.clientRequestId, recipient.id),
        contactId: recipient.id,
        interactionType: "message",
        direction: "outbound",
        subject,
        summary: "Siaran WhatsApp · " + message.slice(0, 500),
      });
      interactionLogged = true;
    } catch (error) {
      const status = error instanceof SupabaseCrmError ? error.status : "unexpected";
      console.error("CRM broadcast interaction audit failed:", status);
    }
    const { error: interactionStatusError } = await client().rpc("mark_tenant_crm_broadcast_interaction_logged", {
      p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: roleForDatabase(role),
      p_client_request_id: raw.clientRequestId, p_contact_id: recipient.id, p_logged: interactionLogged,
    });
    if (interactionStatusError) console.error("CRM broadcast interaction audit status could not be persisted:", String(interactionStatusError.code || "database_error"));
  }

  const { error: finishError } = await client().rpc("finish_tenant_crm_broadcast", {
    p_tenant_id: tenantId,
    p_actor_user_id: actorId,
    p_expected_role: roleForDatabase(role),
    p_client_request_id: raw.clientRequestId,
  });
  if (finishError) fail(finishError, "Status akhir siaran CRM belum dapat dicatat.");
  return {
    ...(await readSupabaseCrmBroadcastStatus(tenantId, actorId, role, raw.clientRequestId)),
    alreadyApplied: !reservation.created,
  };
}
