import assert from "node:assert/strict";
import {
  ACADEMIC_RECORD_PAGE_SIZE,
  buildAcademicRecordPageParams,
  decodeAcademicRecordCursor,
  encodeAcademicRecordCursor,
} from "../src/lib/academicRecordsPagination";

const tenantId = "11111111-1111-4111-8111-111111111111";
const teacherId = "22222222-2222-4222-8222-222222222222";
const unitId = "33333333-3333-4333-8333-333333333333";
const cursor = { createdAt: "2026-11-04T08:30:00.000Z", id: "44444444-4444-4444-8444-444444444444" };

assert.equal(ACADEMIC_RECORD_PAGE_SIZE, 50);
assert.deepEqual(decodeAcademicRecordCursor(encodeAcademicRecordCursor(cursor)), cursor);
assert.equal(decodeAcademicRecordCursor(undefined), null);
assert.throws(() => decodeAcademicRecordCursor("not-a-cursor"), /Kursor catatan akademik tidak valid/);
assert.throws(() => encodeAcademicRecordCursor({ ...cursor, id: "not-a-uuid" }), /Kursor catatan akademik tidak valid/);

const adminPage = buildAcademicRecordPageParams({ tenantId, kind: "journal", cursor });
assert.equal(adminPage.get("tenant_id"), `eq.${tenantId}`);
assert.equal(adminPage.get("kind"), "eq.journal");
assert.equal(adminPage.get("deleted_at"), "is.null");
assert.equal(adminPage.get("order"), "created_at.desc,id.desc");
assert.equal(adminPage.get("limit"), "51");
assert.equal(adminPage.get("or"), `(created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id}))`);
assert.equal(adminPage.has("teacher_user_id"), false);

const teacherUnitPage = buildAcademicRecordPageParams({
  tenantId,
  kind: "assessment",
  includeOrganizationUnit: true,
  organizationUnitId: unitId,
  teacherUserId: teacherId,
});
assert.equal(teacherUnitPage.get("kind"), "eq.assessment");
assert.equal(teacherUnitPage.get("organization_unit_id"), `eq.${unitId}`);
assert.equal(teacherUnitPage.get("teacher_user_id"), `eq.${teacherId}`);
assert.ok(teacherUnitPage.get("select")?.includes("organization_unit_id"));

const unassignedPage = buildAcademicRecordPageParams({ tenantId, kind: "journal", includeUnassignedUnit: true });
assert.equal(unassignedPage.get("organization_unit_id"), "is.null");
assert.throws(() => buildAcademicRecordPageParams({ tenantId: "bad", kind: "journal" }), /Tenant akademik tidak valid/);
assert.throws(() => buildAcademicRecordPageParams({ tenantId, kind: "schedule" as never }), /Jenis catatan akademik tidak valid/);
assert.throws(() => buildAcademicRecordPageParams({ tenantId, kind: "journal", organizationUnitId: "bad" }), /Unit Akademik tidak valid/);
assert.throws(() => buildAcademicRecordPageParams({ tenantId, kind: "journal", teacherUserId: "bad" }), /Pengajar akademik tidak valid/);

console.log("Academic records cursor pagination passed: tenant, role, unit, cursor, and stable ordering checks.");
