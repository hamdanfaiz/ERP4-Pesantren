import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StoredUserProfile } from "./identityStore";
import { CommunicationStoreError } from "./communicationAnnouncements";

type Row = Record<string, any>;

let serviceClient: SupabaseClient | null = null;

function client(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new CommunicationStoreError(503, "Konfigurasi backend Supabase belum lengkap.");
  if (!serviceClient) {
    serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return serviceClient;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function roleOf(actor: StoredUserProfile): string {
  return String(actor.role || "").trim().toLowerCase();
}

function isAdmin(actor: StoredUserProfile): boolean {
  return ["admin", "superadmin", "super_admin"].includes(roleOf(actor));
}

async function resolveTenantUuid(tenantIdentifier: string): Promise<string> {
  const identifier = String(tenantIdentifier || "").trim();
  if (!identifier) throw new CommunicationStoreError(403, "Tenant aktif tidak ditemukan pada profil.");
  const query = client().from("tenants").select("id,status").limit(2);
  const result = isUuid(identifier) ? await query.eq("id", identifier) : await query.eq("legacy_tenant_key", identifier);
  let rows = result.data;
  let error = result.error;
  if (!error && (!rows || rows.length === 0) && !isUuid(identifier)) {
    const bySlug = await client().from("tenants").select("id,status").eq("slug", identifier.toLowerCase()).limit(2);
    rows = bySlug.data;
    error = bySlug.error;
  }
  if (error) throw new CommunicationStoreError(503, "Tenant belum dapat diverifikasi pada Supabase.");
  if (!Array.isArray(rows) || rows.length !== 1 || String(rows[0].status).toLowerCase() !== "active") {
    throw new CommunicationStoreError(403, "Tenant aktif tidak ditemukan pada Supabase.");
  }
  return String(rows[0].id);
}

function mapRpcError(error: any): never {
  const code = String(error?.code || "");
  if (code === "42501") throw new CommunicationStoreError(403, error?.message || "Operasi komunikasi ditolak.");
  if (code === "P0002") throw new CommunicationStoreError(404, error?.message || "Data komunikasi tidak ditemukan.");
  if (["22023", "22P02", "23514"].includes(code)) throw new CommunicationStoreError(400, error?.message || "Data komunikasi tidak valid.");
  if (["23505", "23503"].includes(code)) throw new CommunicationStoreError(409, error?.message || "Permintaan komunikasi bertentangan dengan data tenant.");
  throw new CommunicationStoreError(503, "Layanan komunikasi operasional belum dapat diproses.");
}

export async function listCommunicationOps(tenantId: string, actor: StoredUserProfile) {
  const tenantUuid = await resolveTenantUuid(tenantId);
  const admin = isAdmin(actor);
  const [templatesResult, ticketsResult, messagesResult, profilesResult] = await Promise.all([
    client().from("communication_templates")
      .select("id,name,content,status,created_at,updated_at")
      .eq("tenant_id", tenantUuid)
      .order("updated_at", { ascending: false })
      .limit(500),
    client().from("communication_tickets")
      .select("id,subject,category,description,status,requested_by_user_id,requested_by_name,resolved_at,created_at,updated_at")
      .eq("tenant_id", tenantUuid)
      .order("created_at", { ascending: false })
      .limit(500),
    client().from("communication_direct_messages")
      .select("id,from_user_id,from_name,to_user_id,to_name,body,status,created_at,updated_at")
      .eq("tenant_id", tenantUuid)
      .or(`from_user_id.eq.${actor.uid},to_user_id.eq.${actor.uid}`)
      .order("created_at", { ascending: false })
      .limit(500),
    client().from("profiles")
      .select("user_id,display_name,email,role,status")
      .eq("tenant_id", tenantUuid)
      .eq("status", "active")
      .order("display_name", { ascending: true })
      .limit(500),
  ]);
  if (templatesResult.error || ticketsResult.error || messagesResult.error || profilesResult.error) {
    throw new CommunicationStoreError(503, "Data operasional komunikasi belum dapat dimuat.");
  }
  const tickets = ((ticketsResult.data || []) as Row[]).filter((ticket) =>
    admin || String(ticket.requested_by_user_id) === actor.uid);
  const templates = ((templatesResult.data || []) as Row[])
    .filter((item) => admin || item.status === "active")
    .map((item) => ({
      id: String(item.id),
      name: String(item.name),
      content: String(item.content),
      status: String(item.status),
      createdAt: String(item.created_at),
      updatedAt: String(item.updated_at),
    }));
  const directory = ((profilesResult.data || []) as Row[])
    .filter((profile) => String(profile.user_id) !== actor.uid)
    .filter((profile) => admin || ["admin", "super_admin"].includes(String(profile.role || "").toLowerCase()))
    .map((profile) => ({
      userId: String(profile.user_id),
      name: String(profile.display_name || profile.email || profile.user_id),
      role: String(profile.role || ""),
    }));
  return {
    templates,
    tickets: tickets.map((item) => ({
      id: String(item.id),
      subject: String(item.subject),
      category: String(item.category),
      description: String(item.description),
      status: String(item.status),
      requestedByUserId: String(item.requested_by_user_id),
      requestedByName: String(item.requested_by_name),
      resolvedAt: item.resolved_at ? String(item.resolved_at) : null,
      createdAt: String(item.created_at),
      updatedAt: String(item.updated_at),
    })),
    messages: ((messagesResult.data || []) as Row[]).map((item) => ({
      id: String(item.id),
      fromUserId: String(item.from_user_id),
      fromName: String(item.from_name),
      toUserId: String(item.to_user_id),
      toName: String(item.to_name),
      body: String(item.body),
      status: String(item.status),
      createdAt: String(item.created_at),
      updatedAt: String(item.updated_at),
    })),
    directory,
  };
}

export async function createCommunicationTicket(
  tenantId: string,
  actor: StoredUserProfile,
  input: { subject?: unknown; category?: unknown; description?: unknown; clientRequestId?: unknown },
) {
  const tenantUuid = await resolveTenantUuid(tenantId);
  const subject = String(input.subject || "").trim();
  const category = String(input.category || "").trim();
  const description = String(input.description || "").trim();
  const clientRequestId = String(input.clientRequestId || "").trim();
  if (!isUuid(clientRequestId) || subject.length < 2 || subject.length > 180
    || !["Teknis", "Akademik", "Asrama", "Keuangan", "Lainnya"].includes(category)
    || description.length < 1 || description.length > 4000) {
    throw new CommunicationStoreError(400, "Subjek, kategori, atau uraian tiket tidak valid.");
  }
  const { data, error } = await client().rpc("create_communication_ticket", {
    p_tenant_id: tenantUuid,
    p_actor_user_id: actor.uid,
    p_subject: subject,
    p_category: category,
    p_description: description,
    p_requested_by_name: String(actor.name || actor.email || "Pengguna").slice(0, 180),
    p_client_request_id: clientRequestId,
  });
  if (error) mapRpcError(error);
  return data as Row;
}

export async function transitionCommunicationTicket(
  tenantId: string,
  actor: StoredUserProfile,
  ticketId: string,
  input: { status?: unknown; clientRequestId?: unknown },
) {
  if (!isAdmin(actor)) throw new CommunicationStoreError(403, "Hanya Admin yang dapat mengubah status tiket.");
  const tenantUuid = await resolveTenantUuid(tenantId);
  const status = String(input.status || "").trim();
  const clientRequestId = String(input.clientRequestId || "").trim();
  if (!isUuid(ticketId) || !isUuid(clientRequestId) || !["in_progress", "resolved", "closed"].includes(status)) {
    throw new CommunicationStoreError(400, "Transisi tiket tidak valid.");
  }
  const { data, error } = await client().rpc("transition_communication_ticket", {
    p_tenant_id: tenantUuid,
    p_actor_user_id: actor.uid,
    p_ticket_id: ticketId,
    p_next_status: status,
    p_client_request_id: clientRequestId,
  });
  if (error) mapRpcError(error);
  return data as Row;
}

export async function createCommunicationDirectMessage(
  tenantId: string,
  actor: StoredUserProfile,
  input: { toUserId?: unknown; body?: unknown; clientRequestId?: unknown },
) {
  const tenantUuid = await resolveTenantUuid(tenantId);
  const toUserId = String(input.toUserId || "").trim();
  const body = String(input.body || "").trim();
  const clientRequestId = String(input.clientRequestId || "").trim();
  if (!isUuid(toUserId) || !isUuid(clientRequestId) || body.length < 1 || body.length > 4000) {
    throw new CommunicationStoreError(400, "Penerima atau isi pesan tidak valid.");
  }
  const { data: recipient, error: recipientError } = await client().from("profiles")
    .select("user_id,display_name,email,status")
    .eq("tenant_id", tenantUuid)
    .eq("user_id", toUserId)
    .maybeSingle();
  if (recipientError) throw new CommunicationStoreError(503, "Penerima pesan belum dapat diverifikasi.");
  if (!recipient || String(recipient.status).toLowerCase() !== "active") {
    throw new CommunicationStoreError(404, "Penerima pesan tidak ditemukan pada tenant.");
  }
  const { data, error } = await client().rpc("create_communication_direct_message", {
    p_tenant_id: tenantUuid,
    p_actor_user_id: actor.uid,
    p_to_user_id: toUserId,
    p_from_name: String(actor.name || actor.email || "Pengguna").slice(0, 180),
    p_to_name: String(recipient.display_name || recipient.email || toUserId).slice(0, 180),
    p_body: body,
    p_client_request_id: clientRequestId,
  });
  if (error) mapRpcError(error);
  return data as Row;
}

export async function transitionCommunicationDirectMessage(
  tenantId: string,
  actor: StoredUserProfile,
  messageId: string,
  input: { status?: unknown; clientRequestId?: unknown },
) {
  const tenantUuid = await resolveTenantUuid(tenantId);
  const status = String(input.status || "").trim();
  const clientRequestId = String(input.clientRequestId || "").trim();
  if (!isUuid(messageId) || !isUuid(clientRequestId) || !["read", "archived"].includes(status)) {
    throw new CommunicationStoreError(400, "Transisi pesan tidak valid.");
  }
  const { data, error } = await client().rpc("transition_communication_direct_message", {
    p_tenant_id: tenantUuid,
    p_actor_user_id: actor.uid,
    p_message_id: messageId,
    p_next_status: status,
    p_client_request_id: clientRequestId,
  });
  if (error) mapRpcError(error);
  return data as Row;
}

export async function upsertCommunicationTemplate(
  tenantId: string,
  actor: StoredUserProfile,
  input: { id?: unknown; name?: unknown; content?: unknown; status?: unknown; clientRequestId?: unknown },
) {
  if (!isAdmin(actor)) throw new CommunicationStoreError(403, "Hanya Admin yang dapat mengelola templat.");
  const tenantUuid = await resolveTenantUuid(tenantId);
  const idRaw = String(input.id || "").trim();
  const name = String(input.name || "").trim();
  const content = String(input.content || "").trim();
  const status = String(input.status || "active").trim();
  const clientRequestId = String(input.clientRequestId || "").trim();
  if ((idRaw && !isUuid(idRaw)) || !isUuid(clientRequestId)
    || name.length < 2 || name.length > 120
    || content.length < 1 || content.length > 12000
    || !["active", "archived"].includes(status)) {
    throw new CommunicationStoreError(400, "Data templat tidak valid.");
  }
  const { data, error } = await client().rpc("upsert_communication_template", {
    p_tenant_id: tenantUuid,
    p_actor_user_id: actor.uid,
    p_template_id: idRaw || null,
    p_name: name,
    p_content: content,
    p_status: status,
    p_client_request_id: clientRequestId,
  });
  if (error) mapRpcError(error);
  return data as Row;
}
