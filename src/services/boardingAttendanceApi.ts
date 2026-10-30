import { getAccessToken } from "../authSession";

export type BoardingAttendanceRecord = {
  studentId: string; studentName: string; nis: string; roomId: string; room: string; status: "Hadir" | "Ghaib" | null; markedAt: string | null;
};
export type BoardingAttendanceSnapshot = { attendanceDate: string; records: BoardingAttendanceRecord[] };
export type BoardingAttendanceImportReport = {
  attendanceDate: string; dryRun: boolean; previewFingerprint: string; sourceCount: number; planned: number;
  alreadyImported: number; imported: number; unchanged: number; canApply: boolean;
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
  if (!response.ok) throw new Error(payload.error || "Permintaan kehadiran asrama belum dapat diproses.");
  return payload as T;
}

export function listSupabaseBoardingAttendance(date: string) {
  return request<BoardingAttendanceSnapshot>("/api/boarding/attendance?date=" + encodeURIComponent(date));
}

export function setSupabaseBoardingAttendanceStatus(input: {
  clientRequestId: string; studentId: string; attendanceDate: string; status: "Hadir" | "Ghaib";
}) {
  return request<{ recordId: string; status: string; alreadyApplied: boolean }>("/api/boarding/attendance", {
    method: "POST", body: JSON.stringify(input),
  });
}

export function migrateSupabaseBoardingAttendance(date: string, apply: boolean, previewFingerprint?: string) {
  return request<BoardingAttendanceImportReport>("/api/boarding/attendance/migrate", {
    method: "POST", body: JSON.stringify(apply
      ? { attendanceDate: date, apply: true, confirmation: "IMPORT_BOARDING_ATTENDANCE", previewFingerprint }
      : { attendanceDate: date, apply: false }),
  });
}
