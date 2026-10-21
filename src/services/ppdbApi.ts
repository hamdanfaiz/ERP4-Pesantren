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


export interface PpdbFinanceBilling {
  id: string;
  tenantId: string;
  candidateId?: string;
  candidateRegistrationId?: string;
  santriId?: string;
  santriName: string;
  grade: string;
  paymentType: "registration" | "tuition";
  type: string;
  period: string;
  amount: number;
  paidAmount: number;
  status: "Paid" | "Unpaid" | "Partial" | "Verification" | "Overdue" | "Rejected";
  date: string;
  paymentMethod: string | null;
  proofFile: string | null;
  proofStoragePath?: string;
  receiptNo?: string | null;
  paidAt?: string;
}

export async function listPpdbFinanceBillings() {
  const result = await requestPpdb<{ billings: PpdbFinanceBilling[] }>("/api/finance/supabase/billings?scope=ppdb");
  return Array.isArray(result.billings) ? result.billings : [];
}

export async function generatePpdbFinanceBillings(
  candidateIds: string[],
  paymentType: "registration" | "tuition",
  amount: number
) {
  const aggregate = { createdCount: 0, skippedCount: 0, failedCount: 0, errors: [] as Array<{ candidateId: string; error: string }> };
  for (let offset = 0; offset < candidateIds.length; offset += 500) {
    const result = await requestPpdb<{
      createdCount: number;
      skippedCount: number;
      failedCount: number;
      errors: Array<{ candidateId: string; error: string }>;
    }>("/api/finance/supabase/ppdb-billings/generate", {
      method: "POST",
      body: JSON.stringify({ candidateIds: candidateIds.slice(offset, offset + 500), paymentType, amount }),
    });
    aggregate.createdCount += Number(result.createdCount || 0);
    aggregate.skippedCount += Number(result.skippedCount || 0);
    aggregate.failedCount += Number(result.failedCount || 0);
    if (Array.isArray(result.errors)) aggregate.errors.push(...result.errors);
  }
  return aggregate;
}

export async function recordPpdbFinancePayment(
  candidateId: string,
  details: {
    paymentType: "registration" | "tuition";
    paidAmount: number;
    status: "Unpaid" | "Overdue" | "Partial" | "Verification" | "Paid";
    method: string;
    receiptNo: string;
  }
) {
  return requestPpdb<{
    id: string;
    status: string;
    receiptNo: string | null;
    alreadyRecorded: boolean;
  }>("/api/finance/supabase/ppdb-candidates/" + encodeURIComponent(candidateId) + "/payments", {
    method: "POST",
    body: JSON.stringify(details),
  });
}

export async function rejectPpdbFinancePayment(
  candidateId: string,
  paymentType: "registration" | "tuition",
  reason: string
) {
  return requestPpdb<{ id: string; status: string }>(
    "/api/finance/supabase/ppdb-candidates/" + encodeURIComponent(candidateId) + "/payment-rejection",
    { method: "POST", body: JSON.stringify({ paymentType, reason }) }
  );
}


export async function uploadSupabaseFinanceProof(
  billingId: string,
  file: File,
  payChannel: string
) {
  const mimeType = inferPpdbMimeType(file);
  if (!mimeType || file.size <= 0 || file.size > 3 * 1024 * 1024) {
    throw new Error("Pilih PNG/JPG/PDF berukuran maksimal 3 MB.");
  }
  return requestPpdb<{ ok: true; proofFile: string; proofStoragePath: string }>(
    "/api/finance/supabase/payment-proofs",
    {
      method: "POST",
      body: JSON.stringify({
        billingId,
        fileName: file.name,
        mimeType,
        base64: await fileToBase64(file),
        payChannel,
      }),
    }
  );
}

export async function downloadSupabaseFinanceProof(billingId: string): Promise<Blob> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");
  const token = await currentUser.getIdToken();
  const response = await fetch(
    "/api/finance/supabase/payment-proofs/" + encodeURIComponent(billingId),
    { headers: { Authorization: "Bearer " + token }, cache: "no-store" }
  );
  if (!response.ok) {
    const payload: any = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Bukti pembayaran Supabase tidak dapat dibuka.");
  }
  return response.blob();
}
