import { Buffer } from "node:buffer";

const BUCKET = "ppdb-documents";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const OBJECT_PATH = new RegExp(`^(${UUID})/(${UUID})/(kk|birthCertificate|reportCards|ijazah|skhun|pasPhoto)-(${UUID})\\.(pdf|jpg|png)$`, "i");

export class PpdbDocumentStorageError extends Error {
  status: number;
  constructor(status = 503, message = "Berkas PPDB belum dapat diproses.") {
    super(message);
    this.name = "PpdbDocumentStorageError";
    this.status = status;
  }
}

function storageConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !secretKey) throw new PpdbDocumentStorageError(503, "Konfigurasi Storage Supabase belum lengkap.");
  return { baseUrl, secretKey };
}

function encodedObjectPath(path: string, tenantId: string, candidateId: string, documentKey: string) {
  const value = String(path || "").trim();
  const match = OBJECT_PATH.exec(value);
  if (!match || match[1].toLowerCase() !== tenantId.toLowerCase()
    || match[2].toLowerCase() !== candidateId.toLowerCase()
    || match[3] !== documentKey || value.includes("..")) {
    throw new PpdbDocumentStorageError(404, "Berkas PPDB tidak ditemukan pada tenant ini.");
  }
  return value.split("/").map(encodeURIComponent).join("/");
}

function detectMime(bytes: Buffer, extension: string) {
  if (extension === "pdf" && bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (extension === "png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (extension === "jpg" && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  throw new PpdbDocumentStorageError(415, "Format berkas PPDB tidak dapat dikenali.");
}

export async function downloadSupabasePpdbDocument(path: string, tenantId: string, candidateId: string, documentKey: string) {
  const encodedPath = encodedObjectPath(path, tenantId, candidateId, documentKey);
  const { baseUrl, secretKey } = storageConfig();
  const headers = new Headers({ Accept: "application/octet-stream", apikey: secretKey });
  if (!secretKey.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${secretKey}`);
  const response = await fetch(`${baseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`, {
    method: "GET", headers, cache: "no-store",
  });
  if (!response.ok) throw new PpdbDocumentStorageError(response.status === 404 ? 404 : 503, "Berkas PPDB privat tidak dapat dibuka.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.byteLength > 1024 * 1024) throw new PpdbDocumentStorageError(413, "Ukuran berkas PPDB melebihi batas aman.");
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const contentType = detectMime(bytes, extension);
  return { bytes, contentType };
}

export async function uploadSupabasePpdbDocument(
  path: string,
  tenantId: string,
  candidateId: string,
  documentKey: string,
  bytes: Buffer,
  contentType: string,
) {
  const encodedPath = encodedObjectPath(path, tenantId, candidateId, documentKey);
  if (!bytes.length || bytes.byteLength > 1024 * 1024) {
    throw new PpdbDocumentStorageError(413, "Ukuran berkas PPDB melebihi batas 1 MB.");
  }
  const extension = contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : contentType === "image/jpeg" ? "jpg" : "";
  if (!extension || path.slice(path.lastIndexOf(".") + 1).toLowerCase() !== extension
      || detectMime(bytes, extension) !== contentType) {
    throw new PpdbDocumentStorageError(415, "Isi berkas tidak sesuai dengan format PDF, JPG, atau PNG.");
  }
  const { baseUrl, secretKey } = storageConfig();
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": contentType,
    "x-upsert": "false",
    apikey: secretKey,
  });
  if (!secretKey.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${secretKey}`);
  const response = await fetch(`${baseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`, {
    method: "POST", headers, body: new Uint8Array(bytes), cache: "no-store",
  });
  if (!response.ok) throw new PpdbDocumentStorageError(response.status === 409 ? 409 : 503, "Berkas PPDB privat belum dapat diunggah.");
}

export async function removeSupabasePpdbDocument(path: string, tenantId: string, candidateId: string, documentKey: string) {
  const encodedPath = encodedObjectPath(path, tenantId, candidateId, documentKey);
  const { baseUrl, secretKey } = storageConfig();
  const headers = new Headers({ Accept: "application/json", "Content-Type": "application/json", apikey: secretKey });
  if (!secretKey.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${secretKey}`);
  const response = await fetch(`${baseUrl}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ prefixes: [path] }),
    cache: "no-store",
  });
  if (!response.ok) throw new PpdbDocumentStorageError(503, "Berkas sementara PPDB belum dapat dibersihkan.");
}
