import { getAccessToken } from "../authSession";

export type BoardingDisciplineIncident = {
  id: string; studentId: string; santriName: string; nis: string; roomId: string; room: string;
  offense: string; category: string; points: number; date: string; resolved: boolean;
  photoUrl: string | null; resolution: string; createdAt: string;
};
export type BoardingDisciplineStudent = { id: string; name: string; nis: string; roomId: string | null };
export type BoardingDisciplineSnapshot = { incidents: BoardingDisciplineIncident[]; students: BoardingDisciplineStudent[]; canManage: boolean };
export type BoardingDisciplineImportReport = {
  dryRun: boolean; previewFingerprint: string; sourceCount: number; planned: number; alreadyImported: number;
  imported: number; unchanged: number; canApply: boolean;
  issues: Array<{ sourceId: string; reason: string }>; warnings: Array<{ sourceId: string; reason: string }>;
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
  if (!response.ok) throw new Error(payload.error || "Permintaan kedisiplinan asrama belum dapat diproses.");
  return payload as T;
}

export function listSupabaseBoardingDiscipline() {
  return request<BoardingDisciplineSnapshot>("/api/boarding/discipline");
}

export function createSupabaseBoardingDiscipline(input: {
  clientRequestId: string; studentId: string; offense: string; category: string; points: number;
  incidentDate: string; photoUrl?: string | null; resolution?: string | null;
}) {
  return request<{ incidentId: string; alreadyApplied: boolean }>("/api/boarding/discipline", {
    method: "POST", body: JSON.stringify(input),
  });
}

export function resolveSupabaseBoardingDiscipline(incidentId: string, clientRequestId: string) {
  return request<{ incidentId: string; resolved: boolean; alreadyApplied: boolean }>(
    "/api/boarding/discipline/" + encodeURIComponent(incidentId) + "/resolve",
    { method: "POST", body: JSON.stringify({ clientRequestId }) },
  );
}

export function migrateSupabaseBoardingDiscipline(apply: boolean, previewFingerprint?: string) {
  return request<BoardingDisciplineImportReport>("/api/boarding/discipline/migrate", {
    method: "POST",
    body: JSON.stringify(apply
      ? { apply: true, confirmation: "IMPORT_BOARDING_DISCIPLINE", previewFingerprint }
      : { apply: false }),
  });
}
