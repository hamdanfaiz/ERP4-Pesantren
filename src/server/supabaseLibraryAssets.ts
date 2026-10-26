import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

const BUCKET = "erp4-private-library-assets";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/epub+zip": "epub",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
};

export class SupabaseLibraryAssetError extends Error {
  status: number;
  constructor(status = 503, message = "Berkas perpustakaan belum dapat diproses.") {
    super(message);
    this.name = "SupabaseLibraryAssetError";
    this.status = status;
  }
}

type UploadInput = {
  clientRequestId: string;
  title: string;
  description?: string | null;
  fileName: string;
  contentType: string;
  fileSize: number;
  contentSha256: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getClient(): SupabaseClient {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new SupabaseLibraryAssetError(503, "Konfigurasi Storage server Supabase belum lengkap.");
  if (!serviceClient) serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return serviceClient;
}

let serviceClient: SupabaseClient | null = null;

function throwServiceError(error: any, fallback: string): never {
  const code = String(error?.code || "");
  const status = Number(error?.status || error?.statusCode || 0);
  if (["23505", "23503", "23514"].includes(code) || status === 409) {
    throw new SupabaseLibraryAssetError(409, "Permintaan berkas bertentangan dengan data perpustakaan tenant.");
  }
  if (["22023", "22007", "22008", "22P02"].includes(code) || status === 400) {
    throw new SupabaseLibraryAssetError(400, "Data berkas perpustakaan tidak valid.");
  }
  if (code === "42501" || status === 403) throw new SupabaseLibraryAssetError(403, "Akses berkas ditolak oleh kebijakan tenant.");
  if (code === "P0002" || status === 404) throw new SupabaseLibraryAssetError(404, "Berkas tidak ditemukan pada tenant ini.");
  throw new SupabaseLibraryAssetError(503, fallback);
}

export function validateLibraryDigitalAssetUpload(input: UploadInput) {
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  const fileName = typeof input?.fileName === "string" ? input.fileName.trim() : "";
  const contentType = typeof input?.contentType === "string" ? input.contentType.trim().toLowerCase() : "";
  const fileSize = Number(input?.fileSize);
  const contentSha256 = typeof input?.contentSha256 === "string" ? input.contentSha256.trim().toLowerCase() : "";
  const clientRequestId = typeof input?.clientRequestId === "string" ? input.clientRequestId.trim() : "";
  if (!isUuid(clientRequestId)) throw new SupabaseLibraryAssetError(400, "ID permintaan upload tidak valid.");
  if (!title || title.length > 240 || description.length > 1200) throw new SupabaseLibraryAssetError(400, "Judul atau keterangan aset tidak valid.");
  if (!fileName || fileName.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(fileName) || fileName === "." || fileName === "..") {
    throw new SupabaseLibraryAssetError(400, "Nama berkas tidak valid.");
  }
  if (!Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS, contentType)) {
    throw new SupabaseLibraryAssetError(415, "Jenis berkas yang didukung: PDF, EPUB, MP3, dan M4A.");
  }
  if (!fileName.toLowerCase().endsWith(`.${MIME_EXTENSIONS[contentType]}`)) {
    throw new SupabaseLibraryAssetError(415, "Ekstensi nama berkas harus sesuai dengan jenis berkas.");
  }
  if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_FILE_SIZE) {
    throw new SupabaseLibraryAssetError(413, "Ukuran berkas harus antara 1 byte dan 25 MB.");
  }
  if (!/^[0-9a-f]{64}$/.test(contentSha256)) throw new SupabaseLibraryAssetError(400, "Sidik berkas SHA-256 tidak valid.");
  return { clientRequestId, title, description: description || null, fileName, contentType, fileSize, contentSha256, extension: MIME_EXTENSIONS[contentType] };
}

export function libraryAssetSignatureMatches(contentType: string, bytes: Uint8Array) {
  const b = bytes;
  if (contentType === "application/pdf") return b.length >= 5 && String.fromCharCode(...b.subarray(0, 5)) === "%PDF-";
  if (contentType === "application/epub+zip") return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && [0x03, 0x05, 0x07].includes(b[2]) && [0x04, 0x06, 0x08].includes(b[3]);
  if (contentType === "audio/mpeg") return (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33)
    || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
  if (contentType === "audio/mp4") return b.length >= 12 && String.fromCharCode(...b.subarray(4, 8)) === "ftyp";
  return false;
}

async function requireStorageObject(path: string, expectedSize: number, expectedType: string) {
  const client = getClient();
  const directory = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await client.storage.from(BUCKET).list(directory, { limit: 20, search: name });
  if (error) throwServiceError(error, "Berkas yang diunggah belum dapat diverifikasi.");
  const object = (data || []).find((row) => row.name === name);
  const metadata = object?.metadata as Record<string, unknown> | undefined;
  const size = Number(metadata?.size);
  const mimeType = String(metadata?.mimetype || "").toLowerCase();
  if (!object || !Number.isSafeInteger(size) || size !== expectedSize || mimeType !== expectedType) {
    if (object) await getClient().storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw new SupabaseLibraryAssetError(422, "Ukuran atau jenis berkas di Storage tidak sesuai dengan data upload.");
  }

  const { data: signed, error: signError } = await client.storage.from(BUCKET).createSignedUrl(path, 120);
  if (signError || !signed?.signedUrl) throw new SupabaseLibraryAssetError(503, "Isi berkas di Storage belum dapat diperiksa.");
  const response = await fetch(signed.signedUrl, { cache: "no-store" });
  if (!response.ok) throw new SupabaseLibraryAssetError(422, "Isi berkas di Storage belum dapat dibaca.");
  const reader = response.body?.getReader();
  if (!reader) throw new SupabaseLibraryAssetError(422, "Isi berkas di Storage tidak dapat diverifikasi.");
  const prefix: number[] = [];
  const hasher = createHash("sha256");
  let actualSize = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      actualSize += chunk.value.byteLength;
      if (actualSize > MAX_FILE_SIZE || actualSize > expectedSize) {
        await reader.cancel().catch(() => undefined);
        await client.storage.from(BUCKET).remove([path]).catch(() => undefined);
        throw new SupabaseLibraryAssetError(413, "Ukuran berkas di Storage melebihi batas upload.");
      }
      hasher.update(chunk.value);
      if (prefix.length < 32) prefix.push(...chunk.value.subarray(0, 32 - prefix.length));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (actualSize !== expectedSize) {
    await client.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw new SupabaseLibraryAssetError(422, "Ukuran berkas di Storage berubah setelah upload.");
  }
  if (!libraryAssetSignatureMatches(expectedType, Uint8Array.from(prefix))) {
    await client.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw new SupabaseLibraryAssetError(415, "Isi berkas tidak cocok dengan jenis berkas yang dipilih.");
  }
  return { size: actualSize, contentType: mimeType, contentSha256: hasher.digest("hex") };
}

export async function reserveSupabaseLibraryDigitalAssetUpload(
  tenantId: string,
  actorId: string,
  role: string,
  rawInput: UploadInput,
) {
  const input = validateLibraryDigitalAssetUpload(rawInput);
  if (!isUuid(tenantId) || !isUuid(actorId)) throw new SupabaseLibraryAssetError(403, "Profil perpustakaan tenant tidak valid.");
  const assetId = randomUUID();
  const { data, error } = await getClient().rpc("reserve_tenant_library_digital_asset_upload", {
    p_tenant_id: tenantId,
    p_actor_user_id: actorId,
    p_expected_role: String(role || "").toLowerCase(),
    p_client_request_id: input.clientRequestId,
    p_asset_id: assetId,
    p_title: input.title,
    p_description: input.description,
    p_original_file_name: input.fileName,
    p_content_type: input.contentType,
    p_declared_file_size: input.fileSize,
    p_content_sha256: input.contentSha256,
  });
  if (error) throwServiceError(error, "Permintaan upload berkas belum dapat disimpan.");
  const reservation = data as { assetId: string; storagePath: string; alreadyCompleted: boolean };
  if (!reservation || !isUuid(String(reservation.assetId || "")) || typeof reservation.storagePath !== "string") {
    throw new SupabaseLibraryAssetError(503, "Respons reservasi upload tidak valid.");
  }
  if (reservation.alreadyCompleted) {
    const asset = await getSupabaseLibraryDigitalAsset(tenantId, reservation.assetId);
    const { storagePath: _storagePath, ...safeAsset } = asset;
    return { alreadyCompleted: true, asset: safeAsset };
  }

  // If a previous request uploaded successfully but its response was lost, let the
  // caller finalize that exact immutable path instead of trying to overwrite it.
  const existing = await findSupabaseLibraryStorageObject(reservation.storagePath);
  if (existing) return { alreadyCompleted: false, objectAlreadyUploaded: true, assetId: reservation.assetId, storagePath: reservation.storagePath };
  const { data: signed, error: signError } = await getClient().storage.from(BUCKET).createSignedUploadUrl(reservation.storagePath, { upsert: false });
  if (signError || !signed?.token || !signed?.signedUrl) throw new SupabaseLibraryAssetError(503, "Tautan upload privat belum dapat dibuat.");
  return {
    alreadyCompleted: false,
    objectAlreadyUploaded: false,
    assetId: reservation.assetId,
    storagePath: reservation.storagePath,
    signedUrl: signed.signedUrl,
    uploadToken: signed.token,
  };
}

async function findSupabaseLibraryStorageObject(path: string) {
  const directory = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await getClient().storage.from(BUCKET).list(directory, { limit: 20, search: name });
  if (error) throwServiceError(error, "Status berkas pada Storage belum dapat diperiksa.");
  return (data || []).some((row) => row.name === name);
}

export async function finalizeSupabaseLibraryDigitalAssetUpload(
  tenantId: string,
  actorId: string,
  role: string,
  clientRequestId: string,
) {
  if (!isUuid(tenantId) || !isUuid(actorId) || !isUuid(clientRequestId)) throw new SupabaseLibraryAssetError(400, "Data permintaan upload tidak valid.");
  const client = getClient();
  const { data: request, error: requestError } = await client.from("library_digital_asset_upload_requests")
    .select("asset_id,actor_user_id,expected_role,status,declared_file_size,content_type,content_sha256,storage_path")
    .eq("tenant_id", tenantId).eq("client_request_id", clientRequestId).maybeSingle();
  if (requestError) throwServiceError(requestError, "Status upload belum dapat dimuat.");
  if (!request || request.actor_user_id !== actorId || request.expected_role !== String(role || "").toLowerCase()) {
    throw new SupabaseLibraryAssetError(404, "Permintaan upload tidak ditemukan pada tenant ini.");
  }
  if (request.status === "completed") {
    return { alreadyApplied: true, asset: await getSupabaseLibraryDigitalAsset(tenantId, request.asset_id) };
  }
  const expectedSha256 = String(request.content_sha256 || "").replace(/^\\x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedSha256)) throw new SupabaseLibraryAssetError(503, "Sidik berkas upload belum dapat dimuat.");
  const verified = await requireStorageObject(request.storage_path, Number(request.declared_file_size), String(request.content_type));
  if (verified.contentSha256 !== expectedSha256) {
    await client.storage.from(BUCKET).remove([request.storage_path]).catch(() => undefined);
    throw new SupabaseLibraryAssetError(422, "Isi berkas berubah setelah sidik berkas dihitung. Silakan mulai upload kembali.");
  }
  const { data, error } = await client.rpc("finalize_tenant_library_digital_asset_upload", {
    p_tenant_id: tenantId,
    p_actor_user_id: actorId,
    p_expected_role: String(role || "").toLowerCase(),
    p_client_request_id: clientRequestId,
    p_verified_file_size: verified.size,
    p_verified_content_type: verified.contentType,
    p_verified_content_sha256: verified.contentSha256,
  });
  if (error) throwServiceError(error, "Metadata berkas belum dapat diselesaikan.");
  const asset = await getSupabaseLibraryDigitalAsset(tenantId, request.asset_id);
  const { storagePath: _storagePath, ...safeAsset } = asset;
  return { ...data, asset: safeAsset };
}

export async function findSupabaseLibraryDigitalAssetUpload(
  tenantId: string,
  actorId: string,
  role: string,
  clientRequestId: string,
) {
  if (!isUuid(tenantId) || !isUuid(actorId) || !isUuid(clientRequestId)) throw new SupabaseLibraryAssetError(400, "Data permintaan upload tidak valid.");
  const { data, error } = await getClient().from("library_digital_asset_upload_requests")
    .select("asset_id,actor_user_id,expected_role,status,storage_path")
    .eq("tenant_id", tenantId).eq("client_request_id", clientRequestId).maybeSingle();
  if (error) throwServiceError(error, "Status upload belum dapat dimuat.");
  if (!data || data.actor_user_id !== actorId || data.expected_role !== String(role || "").toLowerCase()) {
    throw new SupabaseLibraryAssetError(404, "Permintaan upload tidak ditemukan pada tenant ini.");
  }
  return data;
}

export type LibraryDigitalAsset = {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
};

function mapAsset(row: any): LibraryDigitalAsset {
  return {
    id: String(row.id), title: String(row.title || ""), description: row.description ? String(row.description) : null,
    fileName: String(row.original_file_name || ""), contentType: String(row.content_type || ""),
    fileSize: Number(row.file_size || 0), uploadedAt: String(row.uploaded_at || ""),
  };
}

export async function listSupabaseLibraryDigitalAssets(tenantId: string) {
  if (!isUuid(tenantId)) throw new SupabaseLibraryAssetError(403, "Tenant perpustakaan tidak valid.");
  const client = getClient();
  const output: LibraryDigitalAsset[] = [];
  const pageSize = 500;
  for (let offset = 0; offset <= 5000; offset += pageSize) {
    const { data, error } = await client.from("library_digital_assets")
      .select("id,title,description,original_file_name,content_type,file_size,uploaded_at")
      .eq("tenant_id", tenantId).eq("status", "active")
      .order("uploaded_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throwServiceError(error, "Daftar aset digital perpustakaan belum dapat dimuat.");
    const rows = data || [];
    output.push(...rows.map(mapAsset));
    if (rows.length < pageSize) return output;
  }
  throw new SupabaseLibraryAssetError(503, "Daftar aset digital melebihi batas tampilan aman.");
}

export async function getSupabaseLibraryDigitalAsset(tenantId: string, assetId: string) {
  if (!isUuid(tenantId) || !isUuid(assetId)) throw new SupabaseLibraryAssetError(404, "Aset digital tidak ditemukan.");
  const { data, error } = await getClient().from("library_digital_assets")
    .select("id,title,description,original_file_name,content_type,file_size,uploaded_at,storage_path")
    .eq("tenant_id", tenantId).eq("id", assetId).eq("status", "active").maybeSingle();
  if (error) throwServiceError(error, "Aset digital belum dapat dimuat.");
  if (!data) throw new SupabaseLibraryAssetError(404, "Aset digital tidak ditemukan pada tenant ini.");
  return { ...mapAsset(data), storagePath: String(data.storage_path) };
}

export async function createSupabaseLibraryDigitalAssetDownloadUrl(tenantId: string, assetId: string) {
  const asset = await getSupabaseLibraryDigitalAsset(tenantId, assetId);
  const { data, error } = await getClient().storage.from(BUCKET).createSignedUrl(asset.storagePath, 60, { download: asset.fileName });
  if (error || !data?.signedUrl) throw new SupabaseLibraryAssetError(503, "Tautan unduh privat belum dapat dibuat.");
  const { storagePath: _storagePath, ...safeAsset } = asset;
  return { asset: safeAsset, signedUrl: data.signedUrl, expiresInSeconds: 60 };
}
