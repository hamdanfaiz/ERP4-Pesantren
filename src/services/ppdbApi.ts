import { auth } from "../firebase";
import { Candidate } from "../types";

async function requestPpdb<T>(path: string, init: RequestInit = {}): Promise<T> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");
  const token = await currentUser.getIdToken();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Permintaan PPDB gagal diproses.");
  return payload as T;
}

export async function listPpdbCandidates() {
  const result = await requestPpdb<{ candidates: Candidate[] }>("/api/ppdb/candidates");
  return Array.isArray(result.candidates) ? result.candidates : [];
}

export async function createPpdbCandidate(candidate: Partial<Candidate>) {
  const result = await requestPpdb<{ candidate: Candidate }>("/api/ppdb/candidates", {
    method: "POST",
    body: JSON.stringify({ candidate }),
  });
  return result.candidate;
}

function inferPpdbMimeType(file: File) {
  if (["application/pdf", "image/jpeg", "image/png"].includes(file.type)) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  return "";
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export async function updatePpdbCandidate(id: string, patch: Record<string, unknown>) {
  await requestPpdb<{ ok: true }>("/api/ppdb/candidates/" + encodeURIComponent(id), {
    method: "PATCH",
    body: JSON.stringify({ patch }),
  });
}

export async function uploadPpdbCandidateDocument(id: string, docKey: string, file: File) {
  const mimeType = inferPpdbMimeType(file);
  if (!mimeType || file.size <= 0 || file.size > 2 * 1024 * 1024) {
    throw new Error("Dokumen harus berupa PDF, JPG, atau PNG dengan ukuran maksimal 2 MB.");
  }
  await requestPpdb<{ ok: true }>("/api/ppdb/candidates/" + encodeURIComponent(id) + "/documents", {
    method: "POST",
    body: JSON.stringify({
      docKey,
      file: { base64: await fileToBase64(file), mimeType, fileName: file.name },
    }),
  });
}

export async function updatePpdbCandidates(updates: Array<{ id: string; patch: Record<string, unknown> }>) {
  const result = await requestPpdb<{ updatedCount: number }>("/api/ppdb/candidates/batch", {
    method: "PATCH",
    body: JSON.stringify({ updates }),
  });
  return result.updatedCount;
}
