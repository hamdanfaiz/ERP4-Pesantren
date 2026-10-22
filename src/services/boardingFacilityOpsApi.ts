import { getAccessToken } from "../authSession";

export type FacilityOpsSnapshot = {
  rooms: Array<{ id: string; name: string; buildingId: string | null }>;
  audits: Array<{ id: string; roomId: string; room: string; date: string; score: number; notes: string; inspector: string; createdAt: string }>;
  tickets: Array<{ id: string; roomId: string; room: string; issue: string; description: string; priority: string; status: string; reportedBy: string; date: string; resolvedAt: string | null }>;
  canCreateAudit: boolean; canCreateTicket: boolean; canResolveTicket: boolean;
};
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Permintaan operasional asrama belum dapat diproses.");
  return payload as T;
}
export function listSupabaseBoardingFacilityOps() {
  return request<FacilityOpsSnapshot>("/api/boarding/facility-ops");
}
export function createSupabaseCleanlinessAudit(input: { clientRequestId: string; roomId: string; date: string; score: number; notes: string }) {
  return request<{ auditId: string; alreadyApplied: boolean }>("/api/boarding/facility-ops/audits", { method: "POST", body: JSON.stringify(input) });
}
export function createSupabaseFacilityTicket(input: { clientRequestId: string; roomId: string; issue: string; description: string; priority: string }) {
  return request<{ ticketId: string; status: string; alreadyApplied: boolean }>("/api/boarding/facility-ops/tickets", { method: "POST", body: JSON.stringify(input) });
}
export function resolveSupabaseFacilityTicket(ticketId: string, clientRequestId: string) {
  return request<{ ticketId: string; status: string; alreadyApplied: boolean }>(
    "/api/boarding/facility-ops/tickets/" + encodeURIComponent(ticketId) + "/resolve",
    { method: "POST", body: JSON.stringify({ clientRequestId }) },
  );
}
export type FacilityOpsMigrationReport = {
  dryRun: boolean;
  previewFingerprint: string;
  sourceCount: { audits: number; tickets: number };
  planned: { audits: number; tickets: number };
  alreadyImported: { audits: number; tickets: number };
  blockingIssues: Array<{ id: string; type: string; message: string }>;
  canApply: boolean;
  imported?: { audits: number; tickets: number };
  unchanged?: { audits: number; tickets: number };
};
export function migrateSupabaseFacilityOps(apply = false, previewFingerprint = "") {
  return request<FacilityOpsMigrationReport>("/api/boarding/facility-ops/migrate", {
    method: "POST",
    body: JSON.stringify({ apply, previewFingerprint, ...(apply ? { confirmation: "IMPORT_BOARDING_FACILITY_OPS" } : {}) }),
  });
}
