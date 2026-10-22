import { getAccessToken } from "../authSession";

export type BoardingAssignmentSnapshot = {
  staff: Array<{ id: string; name: string; email: string }>;
  locations: Array<{ id: string; name: string; category: string; parentId: string | null }>;
  assignments: Array<{ id: string; userId: string; staffName: string; locationId: string; locationName: string; locationType: string; status: string; createdAt: string }>;
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
  if (!response.ok) throw new Error(payload.error || "Penugasan asrama belum dapat diproses.");
  return payload as T;
}

export function listSupabaseBoardingAssignments() {
  return request<BoardingAssignmentSnapshot>("/api/boarding/staff-assignments");
}

export function saveSupabaseBoardingAssignment(input: {
  assignmentId?: string; userId: string; buildingId?: string | null; roomId?: string | null;
  status: "active" | "inactive"; clientRequestId: string;
}) {
  return request<{ assignmentId: string; status: string; alreadyApplied: boolean }>("/api/boarding/staff-assignments", {
    method: "POST", body: JSON.stringify(input),
  });
}
