import { getAccessToken } from "../authSession";

export type BoardingPermit = {
  id: string;
  studentId: string;
  santriName: string;
  nis: string;
  roomId: string;
  room: string;
  type: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
};

export type BoardingPermitStudent = { id: string; name: string; nis: string; roomId: string | null };
export type BoardingPermitsSnapshot = {
  permits: BoardingPermit[];
  students: BoardingPermitStudent[];
  canManage: boolean;
  canRequest: boolean;
  canFinalize: boolean;
};
export type BoardingPermitsImportReport = {
  dryRun: boolean;
  previewFingerprint: string;
  sourceCount: number;
  planned: number;
  alreadyImported: number;
  imported: number;
  unchanged: number;
  canApply: boolean;
  issues: Array<{ sourceId: string; reason: string }>;
  warnings: Array<{ sourceId: string; reason: string }>;
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
  if (!response.ok) throw new Error(payload.error || "Permintaan izin asrama belum dapat diproses.");
  return payload as T;
}

export function listSupabaseBoardingPermits() {
  return request<BoardingPermitsSnapshot>("/api/boarding/permits");
}

export function requestSupabaseBoardingPermit(input: {
  clientRequestId: string;
  studentId: string;
  type: string;
  reason: string;
  startDate: string;
  endDate: string;
}) {
  return request<{ permitId: string; alreadyApplied: boolean }>("/api/boarding/permits", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function transitionSupabaseBoardingPermit(permitId: string, status: string, clientRequestId: string) {
  return request<{ permitId: string; status: string; alreadyApplied: boolean }>(
    "/api/boarding/permits/" + encodeURIComponent(permitId) + "/status",
    { method: "POST", body: JSON.stringify({ status, clientRequestId }) },
  );
}

export function migrateSupabaseBoardingPermits(
  apply: boolean,
  previewFingerprint?: string,
): Promise<BoardingPermitsImportReport> {
  return request<BoardingPermitsImportReport>("/api/boarding/permits/migrate", {
    method: "POST",
    body: JSON.stringify(apply
      ? { apply: true, confirmation: "IMPORT_BOARDING_PERMITS", previewFingerprint }
      : { apply: false }),
  });
}
