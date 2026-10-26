import assert from "node:assert/strict";
import {
  ACADEMIC_PORTAL_PAGE_SIZE,
  buildAcademicPortalAssessmentParams,
  decodeAcademicPortalCursor,
  encodeAcademicPortalCursor,
  resolveAcademicPortalStudentId,
} from "../src/lib/academicPortalPagination";
import { mapSupabaseAcademicPortalAssessment } from "../src/server/supabaseAcademic";

const tenantId = "11111111-1111-4111-8111-111111111111";
const studentA = "22222222-2222-4222-8222-222222222222";
const studentB = "33333333-3333-4333-8333-333333333333";
const otherStudent = "44444444-4444-4444-8444-444444444444";
const recordId = "55555555-5555-4555-8555-555555555555";
const updatedAt = "2026-10-26T08:30:00.123456+07:00";

assert.equal(resolveAcademicPortalStudentId({ role: "Santri", linkedSantriId: studentA }), studentA);
assert.throws(
  () => resolveAcademicPortalStudentId({ role: "Santri", linkedSantriId: studentA, requestedStudentId: studentB }),
  /miliknya sendiri/,
);
assert.equal(resolveAcademicPortalStudentId({ role: "Walisantri", guardianStudentIds: [studentA, studentB] }), studentA);
assert.equal(resolveAcademicPortalStudentId({ role: "Walisantri", guardianStudentIds: [studentA, studentB], requestedStudentId: studentB }), studentB);
assert.throws(
  () => resolveAcademicPortalStudentId({ role: "Walisantri", guardianStudentIds: [studentA, studentB], requestedStudentId: otherStudent }),
  /tidak tertaut/,
);
assert.throws(() => resolveAcademicPortalStudentId({ role: "Santri", linkedSantriId: null }), /miliknya sendiri/);

const cursor = { updatedAt, id: recordId };
assert.deepEqual(decodeAcademicPortalCursor(encodeAcademicPortalCursor(cursor)), cursor);
assert.throws(() => decodeAcademicPortalCursor("not-a-cursor"), /tidak valid/);
assert.throws(() => encodeAcademicPortalCursor({ updatedAt, id: "not-a-uuid" }), /tidak valid/);

const firstPage = buildAcademicPortalAssessmentParams({ tenantId, studentId: studentA });
assert.equal(firstPage.get("tenant_id"), `eq.${tenantId}`);
assert.equal(firstPage.get("kind"), "eq.assessment");
assert.equal(firstPage.get("student_id"), `eq.${studentA}`);
assert.equal(firstPage.get("deleted_at"), "is.null");
assert.equal(firstPage.get("order"), "updated_at.desc,id.desc");
assert.equal(firstPage.get("limit"), String(ACADEMIC_PORTAL_PAGE_SIZE + 1));
assert.equal(firstPage.has("or"), false);

const nextPage = buildAcademicPortalAssessmentParams({ tenantId, studentId: studentA, cursor });
assert.equal(nextPage.get("or"), `(updated_at.lt.${updatedAt},and(updated_at.eq.${updatedAt},id.lt.${recordId}))`);
assert.throws(() => buildAcademicPortalAssessmentParams({ tenantId, studentId: otherStudent, cursor: { ...cursor, id: "bad" } }), /tidak valid/);

const safeAssessment = mapSupabaseAcademicPortalAssessment({
  id: recordId,
  tenant_id: tenantId,
  student_id: studentA,
  teacher_user_id: otherStudent,
  updated_at: updatedAt,
  record_data: {
    subject: "Fiqih",
    assessmentType: "Ulangan",
    category: "Summative",
    score: 92,
    remedialStatus: "None",
    className: "VII A",
    studentName: "Nama santri tidak boleh diambil dari payload nilai",
    teacherName: "Nama pengajar tidak boleh ikut",
    privateComment: "Tidak boleh bocor",
  },
});
assert.deepEqual(Object.keys(safeAssessment).sort(), ["assessmentType", "category", "className", "id", "remedialStatus", "score", "subject", "updatedAt"].sort());
assert.equal(safeAssessment.score, 92);
assert.equal(safeAssessment.category, "Sumatif");
assert.throws(() => mapSupabaseAcademicPortalAssessment({ id: recordId, updated_at: updatedAt, record_data: { score: 150 } }), /format tidak valid/);

console.log("Academic portal tenant, student, cursor, and response-field scoping checks passed.");
