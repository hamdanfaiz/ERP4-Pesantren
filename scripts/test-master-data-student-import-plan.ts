import assert from "node:assert/strict";
import { previewSupabaseMasterDataStudentImport } from "../src/server/supabaseOnboarding";

const tenantId = "e1900000-0000-4000-8000-000000000001";
const adminId = "e1900000-0000-4000-8000-000000000011";
const gradeVIIId = "e1900000-0000-4000-8000-000000000101";
const gradeVIIIId = "e1900000-0000-4000-8000-000000000102";

const structures = [
  { tenant_id: tenantId, category: "Gedung", id: "BUILDING-A", name: "Asrama A", status: "Active", gender_code: "L" },
  { tenant_id: tenantId, category: "Gedung", id: "BUILDING-B", name: "Asrama B", status: "Active", gender_code: "P" },
  { tenant_id: tenantId, category: "Gedung", id: "BUILDING-OFF", name: "Asrama Nonaktif", status: "Inactive", gender_code: "L" },
  { tenant_id: tenantId, category: "Kamar", id: "ROOM-A", name: "Kamar A", status: "Active", parent_id: "BUILDING-A", capacity: 5, occupied: 0, gender_code: null },
  { tenant_id: tenantId, category: "Kamar", id: "ROOM-LIMITED", name: "Kamar Terbatas", status: "Active", parent_id: "BUILDING-A", capacity: 1, occupied: 0, gender_code: "L" },
  { tenant_id: tenantId, category: "Kamar", id: "ROOM-OFF", name: "Kamar Nonaktif", status: "Inactive", parent_id: "BUILDING-A", capacity: 2, occupied: 0, gender_code: "L" },
  { tenant_id: tenantId, category: "Kelas", id: "CLASS-VII", name: "VII A", status: "Active", grade: "VII", grade_level_reference_id: gradeVIIId },
  { tenant_id: tenantId, category: "Kelas", id: "CLASS-VIII", name: "VIII A", status: "Active", grade: "VIII", grade_level_reference_id: gradeVIIIId },
  { tenant_id: tenantId, category: "Kelas", id: "CLASS-OFF", name: "Kelas Nonaktif", status: "Inactive", grade: "VII", grade_level_reference_id: gradeVIIId },
];
const gradeReferences = [
  { id: gradeVIIId, name: "VII", status: "active" },
  { id: gradeVIIIId, name: "VIII", status: "active" },
];

const rpcPayloads: Array<Record<string, any>> = [];
const originalFetch = globalThis.fetch;
process.env.SUPABASE_URL = "https://supabase-test.invalid";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test_only";

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  if (url.pathname === "/rest/v1/tenants") {
    return Response.json([{ id: tenantId, slug: "import-test", status: "active" }]);
  }
  if (url.pathname === "/rest/v1/master_data_records") return Response.json(structures);
  if (url.pathname === "/rest/v1/tenant_reference_items") return Response.json(gradeReferences);
  if (url.pathname === "/rest/v1/students") return Response.json([]);
  if (url.pathname === "/rest/v1/rpc/import_legacy_master_data_student_with_actor") {
    rpcPayloads.push(JSON.parse(String(init?.body || "{}")));
    return Response.json({ status: "planned" });
  }
  throw new Error("Unexpected test request: " + url.pathname);
}) as typeof fetch;

try {
  const rows = [
    { id: "source-valid", name: "Santri Valid", gender: "L", grade: "VII", className: "VII A", room: "Kamar A" },
    { id: "source-status-aktif", name: "Santri Status Aktif", gender: "L", grade: "VII", className: "VII A", status: "Aktif" },
    { id: "source-status-tidak-aktif", name: "Santri Status Tidak Aktif", gender: "L", grade: "VII", className: "VII A", status: "Tidak Aktif" },
    { id: "source-status-ditangguhkan", name: "Santri Status Ditangguhkan", gender: "L", grade: "VII", className: "VII A", status: "Ditangguhkan" },
    { id: "source-status-invalid", name: "Santri Status Tidak Dikenal", gender: "L", grade: "VII", className: "VII A", status: "Lepas" },
    { id: "source-derived-building", name: "Santri Gedung Turunan", gender: "L", grade: "VII", room: "Kamar A" },
    { id: "source-free-grade", name: "Jenjang Bebas", gender: "L", grade: "VII Bebas" },
    { id: "source-wrong-class", name: "Kelas Tidak Sesuai", gender: "L", grade: "VII", className: "VIII A" },
    { id: "source-wrong-building", name: "Gedung Tidak Sesuai", gender: "L", grade: "VII", dormitory: "Asrama B", room: "Kamar A" },
    { id: "source-inactive-room", name: "Kamar Nonaktif", gender: "L", grade: "VII", room: "Kamar Nonaktif" },
    { id: "source-inactive-class", name: "Kelas Nonaktif", gender: "L", grade: "VII", className: "Kelas Nonaktif" },
    { id: "source-wrong-gender", name: "Gender Tidak Sesuai", gender: "P", grade: "VII", room: "Kamar A" },
    { id: "source-capacity-one", name: "Kapasitas Satu A", gender: "L", grade: "VII", room: "Kamar Terbatas" },
    { id: "source-capacity-two", name: "Kapasitas Satu B", gender: "L", grade: "VII", room: "Kamar Terbatas" },
  ];
  const result = await previewSupabaseMasterDataStudentImport("import-test", adminId, rows);
  const byId = new Map(result.items.map((item: any) => [item.id, item]));

  assert.equal(byId.get("source-valid")?.status, "ready", "active grade, class, room, and gender relation should pass");
  assert.equal(byId.get("source-status-aktif")?.status, "ready", "Indonesian active status should be accepted");
  assert.equal(byId.get("source-status-tidak-aktif")?.status, "ready", "Indonesian inactive status should be accepted");
  assert.equal(byId.get("source-status-ditangguhkan")?.status, "ready", "Indonesian suspended status should be accepted");
  assert.equal(byId.get("source-status-invalid")?.status, "error", "unknown status values must be rejected");
  assert.match(byId.get("source-status-invalid")?.messages.join(" ") || "", /Status harus Aktif, Tidak Aktif, Alumni, atau Ditangguhkan\./, "status validation should use Indonesian labels");
  assert.equal(byId.get("source-derived-building")?.status, "ready", "building should be derived from the selected room");
  assert.equal(byId.get("source-free-grade")?.status, "error", "free-typed grade must fail against the active tenant catalog");
  assert.equal(byId.get("source-wrong-class")?.status, "error", "class and grade must match");
  assert.equal(byId.get("source-wrong-building")?.status, "error", "room must belong to the selected building");
  assert.equal(byId.get("source-inactive-room")?.status, "error", "inactive rooms must not be selectable");
  assert.equal(byId.get("source-inactive-class")?.status, "error", "inactive classes must not be selectable");
  assert.equal(byId.get("source-wrong-gender")?.status, "error", "room placement must respect gender restrictions");
  assert.equal(byId.get("source-capacity-one")?.status, "ready", "the first row must reserve the remaining room capacity");
  assert.equal(byId.get("source-capacity-two")?.status, "error", "the batch must not overbook a room");

  const plannedRecords = rpcPayloads.map((payload) => payload.p_student);
  assert.equal(plannedRecords.find((record) => record.sourceRecordId === "source-valid")?.grade, "VII", "grade must remain the canonical grade label");
  assert.equal(plannedRecords.find((record) => record.sourceRecordId === "source-valid")?.classId, "CLASS-VII", "class must map to its own className column");
  assert.equal(plannedRecords.find((record) => record.sourceRecordId === "source-status-aktif")?.status, "Active", "Indonesian active status should map to the canonical database value");
  assert.equal(plannedRecords.find((record) => record.sourceRecordId === "source-status-tidak-aktif")?.status, "Inactive", "Indonesian inactive status should map to the canonical database value");
  assert.equal(plannedRecords.find((record) => record.sourceRecordId === "source-status-ditangguhkan")?.status, "Suspended", "Indonesian suspended status should map to the canonical database value");
  assert.equal(plannedRecords.find((record) => record.sourceRecordId === "source-derived-building")?.buildingId, "BUILDING-A", "room import must derive the tenant building ID");
  assert.equal(rpcPayloads.length, result.readyCount, "only rows passing relational validation may reach backend preflight");
  console.log("Master Data student import plan checks passed: tenant references, room capacity, Indonesian status aliases, and canonical status mapping.");
} finally {
  globalThis.fetch = originalFetch;
}
