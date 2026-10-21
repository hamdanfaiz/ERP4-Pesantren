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

export async function updatePpdbCandidate(id: string, patch: Record<string, unknown>) {
  await requestPpdb<{ ok: true }>("/api/ppdb/candidates/" + encodeURIComponent(id), {
    method: "PATCH",
    body: JSON.stringify({ patch }),
  });
}

export async function updatePpdbCandidates(updates: Array<{ id: string; patch: Record<string, unknown> }>) {
  const result = await requestPpdb<{ updatedCount: number }>("/api/ppdb/candidates/batch", {
    method: "PATCH",
    body: JSON.stringify({ updates }),
  });
  return result.updatedCount;
}
