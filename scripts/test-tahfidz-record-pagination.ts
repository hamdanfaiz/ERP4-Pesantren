import assert from "node:assert/strict";
import {
  buildTahfidzRecordPageParams,
  decodeTahfidzRecordCursor,
  encodeTahfidzRecordCursor,
  TAHFIDZ_RECORD_PAGE_SIZE,
} from "../src/lib/tahfidzRecordPagination";

const tenantId = "00000000-0000-4000-8000-000000000001";
const halaqahId = "00000000-0000-4000-8000-000000000002";
const studentId = "00000000-0000-4000-8000-000000000003";
const timestamp = "2026-10-25T12:30:45.123456+07:00";
const cursor = encodeTahfidzRecordCursor({ performedAt: timestamp, id: studentId });

assert.equal(TAHFIDZ_RECORD_PAGE_SIZE, 100, "halaman riwayat dibatasi");
assert.deepEqual(decodeTahfidzRecordCursor(cursor), { performedAt: timestamp, id: studentId }, "cursor mempertahankan presisi timestamp database");

const adminParams = buildTahfidzRecordPageParams({ tenantId, role: "Admin", cursor });
assert.ok(adminParams);
assert.equal(adminParams.get("tenant_id"), `eq.${tenantId}`);
assert.equal(adminParams.get("order"), "performed_at.desc,id.desc");
assert.equal(adminParams.get("limit"), "101", "satu baris tambahan dipakai untuk menentukan hasMore");
assert.equal(adminParams.get("or"), `(performed_at.lt.${timestamp},and(performed_at.eq.${timestamp},id.lt.${studentId}))`);

const ustadzParams = buildTahfidzRecordPageParams({
  tenantId,
  role: "Ustadz",
  halaqahIds: [halaqahId, halaqahId],
});
assert.equal(ustadzParams?.get("halaqah_id"), `in.(${halaqahId})`, "riwayat Ustadz dibatasi pada halaqah yang diizinkan");
assert.equal(buildTahfidzRecordPageParams({ tenantId, role: "Ustadz", halaqahIds: [] }), null, "Ustadz tanpa halaqah tidak mendapat baris tenant lain");

const waliParams = buildTahfidzRecordPageParams({
  tenantId,
  role: "Walisantri",
  studentIds: [studentId],
});
assert.equal(waliParams?.get("student_id"), `in.(${studentId})`, "Wali hanya dapat meminta riwayat santri tertaut");
assert.equal(waliParams?.get("halaqah_id"), null);

assert.throws(() => decodeTahfidzRecordCursor("not-a-cursor"), /Kursor riwayat/);
assert.throws(() => decodeTahfidzRecordCursor("A".repeat(513)), /Kursor riwayat/);
assert.throws(() => buildTahfidzRecordPageParams({ tenantId: "tenant", role: "Admin" }), /Tenant Tahfidz/);
assert.throws(() => buildTahfidzRecordPageParams({ tenantId, role: "Ustadz", halaqahIds: ["bad-id"] }), /Cakupan halaqah/);
assert.throws(() => buildTahfidzRecordPageParams({ tenantId, role: "Santri", studentIds: [studentId], cursor: "bad" }), /Kursor riwayat/);
assert.throws(() => buildTahfidzRecordPageParams({ tenantId, role: "Guest" }), /Role/);

console.log("Tes pagination riwayat Tahfidz lulus.");
