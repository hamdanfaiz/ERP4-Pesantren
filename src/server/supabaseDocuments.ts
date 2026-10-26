import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

const BUCKET = "erp4-private-document-attachments";
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export class SupabaseDocumentError extends Error {
  status: number;
  constructor(status = 503, message = "Layanan Dokumen Digital belum dapat diproses.") {
    super(message);
    this.name = "SupabaseDocumentError";
    this.status = status;
  }
}

let serviceClient: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new SupabaseDocumentError(503, "Konfigurasi Supabase server belum lengkap.");
  if (!serviceClient) serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return serviceClient;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function throwServiceError(error: any, fallback: string): never {
  const code = String(error?.code || "");
  const status = Number(error?.status || error?.statusCode || 0);
  if (["23505", "23503", "23514"].includes(code) || status === 409) {
    throw new SupabaseDocumentError(409, "Dokumen bertentangan dengan nomor, status, atau data tenant yang sudah ada.");
  }
  if (["22023", "22007", "22008", "22P02"].includes(code) || status === 400) {
    throw new SupabaseDocumentError(400, "Data Dokumen Digital tidak valid.");
  }
  if (code === "42501" || status === 403) throw new SupabaseDocumentError(403, "Akses Dokumen Digital ditolak oleh kebijakan tenant.");
  if (code === "P0002" || status === 404) throw new SupabaseDocumentError(404, "Dokumen tidak ditemukan pada tenant ini.");
  throw new SupabaseDocumentError(503, fallback);
}

function requiredText(value: unknown, max: number, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new SupabaseDocumentError(400, `${label} wajib diisi dan tidak boleh melebihi ${max} karakter.`);
  }
  return text;
}

function optionalText(value: unknown, max: number, label: string) {
  if (value == null || value === "") return null;
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new SupabaseDocumentError(400, `${label} tidak valid.`);
  }
  return text || null;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export type DocumentDraft = {
  clientRequestId: string;
  documentNumber: string;
  direction: "incoming" | "outgoing" | "internal";
  subject: string;
  senderName?: string | null;
  recipientName?: string | null;
  documentDate: string;
  summary?: string | null;
};

function validateDocumentDraft(input: DocumentDraft) {
  if (!isUuid(input?.clientRequestId)) throw new SupabaseDocumentError(400, "ID permintaan dokumen tidak valid.");
  const direction = input.direction;
  if (!(["incoming", "outgoing", "internal"] as unknown[]).includes(direction)) {
    throw new SupabaseDocumentError(400, "Jenis dokumen tidak valid.");
  }
  if (!isCalendarDate(input.documentDate)) throw new SupabaseDocumentError(400, "Tanggal dokumen tidak valid.");
  return {
    clientRequestId: input.clientRequestId,
    documentNumber: requiredText(input.documentNumber, 80, "Nomor dokumen"),
    direction,
    subject: requiredText(input.subject, 240, "Perihal"),
    senderName: optionalText(input.senderName, 200, "Pengirim"),
    recipientName: optionalText(input.recipientName, 200, "Penerima"),
    documentDate: input.documentDate,
    summary: optionalText(input.summary, 2000, "Ringkasan"),
  };
}

export async function createSupabaseDocumentRecord(
  tenantId: string, actorId: string, role: string, rawInput: DocumentDraft,
) {
  if (!isUuid(tenantId) || !isUuid(actorId)) throw new SupabaseDocumentError(403, "Profil tenant Dokumen Digital tidak valid.");
  const input = validateDocumentDraft(rawInput);
  const documentId = randomUUID();
  const { data, error } = await getClient().rpc("register_tenant_document", {
    p_tenant_id: tenantId,
    p_actor_user_id: actorId,
    p_expected_role: String(role || "").toLowerCase(),
    p_client_request_id: input.clientRequestId,
    p_document_id: documentId,
    p_document_number: input.documentNumber,
    p_direction: input.direction,
    p_subject: input.subject,
    p_sender_name: input.senderName,
    p_recipient_name: input.recipientName,
    p_document_date: input.documentDate,
    p_summary: input.summary,
  });
  if (error) throwServiceError(error, "Dokumen belum dapat didaftarkan.");
  const result = data as { documentId?: string; alreadyApplied?: boolean };
  if (!isUuid(result?.documentId)) throw new SupabaseDocumentError(503, "Respons pendaftaran dokumen tidak valid.");
  return { documentId: result.documentId, alreadyApplied: result.alreadyApplied === true };
}

export async function transitionSupabaseDocument(
  tenantId: string, actorId: string, role: string, documentId: string, nextStatus: string, note?: unknown,
) {
  if (!isUuid(tenantId) || !isUuid(actorId) || !isUuid(documentId)) throw new SupabaseDocumentError(400, "ID dokumen tidak valid.");
  const cleanNote = optionalText(note, 1000, "Catatan");
  const { data, error } = await getClient().rpc("transition_tenant_document", {
    p_tenant_id: tenantId,
    p_actor_user_id: actorId,
    p_expected_role: String(role || "").toLowerCase(),
    p_document_id: documentId,
    p_next_status: nextStatus,
    p_note: cleanNote,
  });
  if (error) throwServiceError(error, "Perubahan status dokumen belum dapat disimpan.");
  const result = data as { documentId?: string; status?: string; alreadyApplied?: boolean };
  if (!isUuid(result?.documentId) || typeof result.status !== "string") {
    throw new SupabaseDocumentError(503, "Respons perubahan status dokumen tidak valid.");
  }
  return { documentId: result.documentId, status: result.status, alreadyApplied: result.alreadyApplied === true };
}

type DocumentCursor = { createdAt: string; id: string };
function decodeCursor(raw: unknown): DocumentCursor | null {
  if (typeof raw !== "string" || !raw || raw.length > 500) return null;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as DocumentCursor;
    if (!decoded || typeof decoded.createdAt !== "string" || !isUuid(decoded.id)
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(decoded.createdAt)) return null;
    return decoded;
  } catch { return null; }
}
function encodeCursor(cursor: DocumentCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export async function listSupabaseDocumentRecords(tenantId: string, rawCursor?: unknown) {
  if (!isUuid(tenantId)) throw new SupabaseDocumentError(403, "Tenant Dokumen Digital tidak valid.");
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) throw new SupabaseDocumentError(400, "Penanda halaman dokumen tidak valid.");
  const client = getClient();
  let query = client.from("document_records")
    .select("id,document_number,direction,subject,sender_name,recipient_name,document_date,summary,status,created_at,updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(101);
  if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  const { data: rows, error } = await query;
  if (error) throwServiceError(error, "Daftar dokumen belum dapat dimuat.");
  const fetched = rows || [];
  const page = fetched.slice(0, 100);
  const ids = page.map((row: any) => String(row.id));
  let attachments: any[] = [];
  if (ids.length) {
    const { data, error: attachmentError } = await client.from("document_attachments")
      .select("id,document_id,original_file_name,content_type,file_size,uploaded_at")
      .eq("tenant_id", tenantId).in("document_id", ids)
      .order("uploaded_at", { ascending: false }).order("id", { ascending: false }).limit(1000);
    if (attachmentError) throwServiceError(attachmentError, "Lampiran dokumen belum dapat dimuat.");
    attachments = data || [];
  }
  const byDocument = new Map<string, any[]>();
  for (const row of attachments) {
    const key = String(row.document_id);
    const list = byDocument.get(key) || [];
    list.push({
      id: String(row.id), fileName: String(row.original_file_name), contentType: String(row.content_type),
      fileSize: Number(row.file_size), uploadedAt: String(row.uploaded_at),
    });
    byDocument.set(key, list);
  }
  return {
    documents: page.map((row: any) => ({
      id: String(row.id), documentNumber: String(row.document_number), direction: String(row.direction),
      subject: String(row.subject), senderName: row.sender_name ? String(row.sender_name) : null,
      recipientName: row.recipient_name ? String(row.recipient_name) : null,
      documentDate: String(row.document_date), summary: row.summary ? String(row.summary) : null,
      status: String(row.status), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      attachments: byDocument.get(String(row.id)) || [],
    })),
    nextCursor: fetched.length > 100 ? encodeCursor({ createdAt: String(page[page.length - 1].created_at), id: String(page[page.length - 1].id) }) : null,
  };
}

type UploadInput = {
  clientRequestId: string; documentId: string; fileName: string; contentType: string;
  fileSize: number; contentSha256: string;
};
function validateUpload(input: UploadInput) {
  const fileName = typeof input?.fileName === "string" ? input.fileName.trim() : "";
  const contentType = String(input?.contentType || "").trim().toLowerCase();
  const fileSize = Number(input?.fileSize);
  const contentSha256 = String(input?.contentSha256 || "").trim().toLowerCase();
  if (!isUuid(input?.clientRequestId) || !isUuid(input?.documentId)) throw new SupabaseDocumentError(400, "ID dokumen atau permintaan upload tidak valid.");
  if (!fileName || fileName.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(fileName) || fileName === "." || fileName === ".." || !fileName.toLowerCase().endsWith(".pdf")) {
    throw new SupabaseDocumentError(400, "Nama lampiran harus berupa nama berkas PDF yang valid.");
  }
  if (contentType !== "application/pdf") throw new SupabaseDocumentError(415, "Lampiran Dokumen Digital saat ini hanya menerima PDF.");
  if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_FILE_SIZE) throw new SupabaseDocumentError(413, "Ukuran berkas harus antara 1 byte dan 25 MB.");
  if (!/^[0-9a-f]{64}$/.test(contentSha256)) throw new SupabaseDocumentError(400, "Sidik berkas SHA-256 tidak valid.");
  return { clientRequestId: input.clientRequestId, documentId: input.documentId, fileName, contentType, fileSize, contentSha256 };
}

function pdfSignatureMatches(prefix: Uint8Array) {
  return prefix.length >= 5 && String.fromCharCode(...prefix.subarray(0, 5)) === "%PDF-";
}

async function findStorageObject(path: string) {
  const directory = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await getClient().storage.from(BUCKET).list(directory, { limit: 20, search: name });
  if (error) throwServiceError(error, "Status lampiran pada penyimpanan belum dapat diperiksa.");
  return (data || []).find((row) => row.name === name) || null;
}

async function verifyStorageObject(path: string, expectedSize: number, expectedHash: string) {
  const client = getClient();
  const object = await findStorageObject(path);
  const metadata = object?.metadata as Record<string, unknown> | undefined;
  const size = Number(metadata?.size);
  const contentType = String(metadata?.mimetype || "").toLowerCase();
  if (!object || size !== expectedSize || contentType !== "application/pdf") {
    if (object) await client.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw new SupabaseDocumentError(422, "Ukuran atau jenis lampiran di penyimpanan tidak sesuai reservasi.");
  }
  const { data: signed, error: signError } = await client.storage.from(BUCKET).createSignedUrl(path, 120);
  if (signError || !signed?.signedUrl) throw new SupabaseDocumentError(503, "Lampiran belum dapat diverifikasi secara privat.");
  const response = await fetch(signed.signedUrl, { cache: "no-store" });
  if (!response.ok || !response.body) throw new SupabaseDocumentError(422, "Isi lampiran belum dapat dibaca dari penyimpanan.");
  const reader = response.body.getReader();
  const hasher = createHash("sha256");
  const prefix: number[] = [];
  let actualSize = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      actualSize += chunk.value.byteLength;
      if (actualSize > MAX_FILE_SIZE || actualSize > expectedSize) {
        await reader.cancel().catch(() => undefined);
        await client.storage.from(BUCKET).remove([path]).catch(() => undefined);
        throw new SupabaseDocumentError(413, "Ukuran lampiran di penyimpanan melebihi batas.");
      }
      hasher.update(chunk.value);
      if (prefix.length < 16) prefix.push(...chunk.value.subarray(0, 16 - prefix.length));
    }
  } finally { await reader.cancel().catch(() => undefined); }
  if (actualSize !== expectedSize || !pdfSignatureMatches(Uint8Array.from(prefix)) || hasher.digest("hex") !== expectedHash) {
    await client.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw new SupabaseDocumentError(422, "Isi lampiran tidak cocok dengan data PDF yang didaftarkan.");
  }
  return { fileSize: actualSize, contentType };
}

export async function reserveSupabaseDocumentAttachmentUpload(
  tenantId: string, actorId: string, role: string, rawInput: UploadInput,
) {
  if (!isUuid(tenantId) || !isUuid(actorId)) throw new SupabaseDocumentError(403, "Profil tenant Dokumen Digital tidak valid.");
  const input = validateUpload(rawInput);
  const attachmentId = randomUUID();
  const { data, error } = await getClient().rpc("reserve_tenant_document_attachment_upload", {
    p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: String(role || "").toLowerCase(),
    p_client_request_id: input.clientRequestId, p_attachment_id: attachmentId,
    p_document_id: input.documentId, p_original_file_name: input.fileName,
    p_declared_file_size: input.fileSize, p_content_sha256: input.contentSha256,
  });
  if (error) throwServiceError(error, "Permintaan upload lampiran belum dapat disimpan.");
  const reservation = data as { attachmentId?: string; storagePath?: string; alreadyCompleted?: boolean };
  if (!isUuid(reservation?.attachmentId) || typeof reservation.storagePath !== "string") throw new SupabaseDocumentError(503, "Respons reservasi lampiran tidak valid.");
  if (reservation.alreadyCompleted) return { alreadyCompleted: true, attachmentId: reservation.attachmentId };
  if (await findStorageObject(reservation.storagePath)) {
    return { alreadyCompleted: false, objectAlreadyUploaded: true, attachmentId: reservation.attachmentId, storagePath: reservation.storagePath };
  }
  const { data: signed, error: signError } = await getClient().storage.from(BUCKET)
    .createSignedUploadUrl(reservation.storagePath, { upsert: false });
  if (signError || !signed?.token || !signed?.signedUrl) throw new SupabaseDocumentError(503, "Tautan upload privat belum dapat dibuat.");
  return {
    alreadyCompleted: false, objectAlreadyUploaded: false, attachmentId: reservation.attachmentId,
    storagePath: reservation.storagePath, uploadToken: signed.token, signedUrl: signed.signedUrl,
  };
}

export async function finalizeSupabaseDocumentAttachmentUpload(
  tenantId: string, actorId: string, role: string, clientRequestId: string,
) {
  if (!isUuid(tenantId) || !isUuid(actorId) || !isUuid(clientRequestId)) throw new SupabaseDocumentError(400, "ID permintaan upload tidak valid.");
  const client = getClient();
  const { data: request, error: requestError } = await client.from("document_attachment_upload_requests")
    .select("attachment_id,document_id,actor_user_id,expected_role,status,declared_file_size,content_sha256,storage_path")
    .eq("tenant_id", tenantId).eq("client_request_id", clientRequestId).maybeSingle();
  if (requestError) throwServiceError(requestError, "Status lampiran belum dapat dimuat.");
  if (!request || request.actor_user_id !== actorId || request.expected_role !== String(role || "").toLowerCase()) {
    throw new SupabaseDocumentError(404, "Permintaan lampiran tidak ditemukan pada tenant ini.");
  }
  if (request.status === "completed") return { alreadyApplied: true, attachmentId: String(request.attachment_id) };
  const expectedHash = String(request.content_sha256 || "").replace(/^\\x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedHash)) throw new SupabaseDocumentError(503, "Sidik lampiran belum dapat dimuat.");
  const verified = await verifyStorageObject(String(request.storage_path), Number(request.declared_file_size), expectedHash);
  const { data, error } = await client.rpc("finalize_tenant_document_attachment_upload", {
    p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: String(role || "").toLowerCase(),
    p_client_request_id: clientRequestId, p_verified_file_size: verified.fileSize,
    p_verified_content_type: verified.contentType, p_verified_content_sha256: expectedHash,
  });
  if (error) throwServiceError(error, "Metadata lampiran belum dapat diselesaikan.");
  const result = data as { attachmentId?: string; alreadyApplied?: boolean };
  if (!isUuid(result?.attachmentId)) throw new SupabaseDocumentError(503, "Respons finalisasi lampiran tidak valid.");
  return { alreadyApplied: result.alreadyApplied === true, attachmentId: result.attachmentId, documentId: String(request.document_id) };
}

export async function createSupabaseDocumentAttachmentDownloadUrl(tenantId: string, attachmentId: string) {
  if (!isUuid(tenantId) || !isUuid(attachmentId)) throw new SupabaseDocumentError(404, "Lampiran tidak ditemukan.");
  const client = getClient();
  const { data: attachment, error } = await client.from("document_attachments")
    .select("id,document_id,original_file_name,content_type,file_size,storage_path,uploaded_at")
    .eq("tenant_id", tenantId).eq("id", attachmentId).maybeSingle();
  if (error) throwServiceError(error, "Lampiran dokumen belum dapat dimuat.");
  if (!attachment) throw new SupabaseDocumentError(404, "Lampiran tidak ditemukan pada tenant ini.");
  const { data: signed, error: signError } = await client.storage.from(BUCKET)
    .createSignedUrl(String(attachment.storage_path), 60, { download: String(attachment.original_file_name) });
  if (signError || !signed?.signedUrl) throw new SupabaseDocumentError(503, "Tautan unduh privat belum dapat dibuat.");
  return {
    attachment: {
      id: String(attachment.id), documentId: String(attachment.document_id),
      fileName: String(attachment.original_file_name), contentType: String(attachment.content_type),
      fileSize: Number(attachment.file_size), uploadedAt: String(attachment.uploaded_at),
    },
    signedUrl: signed.signedUrl,
    expiresInSeconds: 60,
  };
}
