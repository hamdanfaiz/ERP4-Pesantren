type Row = Record<string, any>;

export class SupabaseLmsError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = "SupabaseLmsError"; this.status = status; }
}

function config() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new SupabaseLmsError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { url, key };
}

async function request(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  if (key.startsWith("sb_secret_")) headers.delete("Authorization");
  else headers.set("Authorization", "Bearer " + key);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text();
  let body: any = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (["23505", "23503", "23514"].includes(code) || response.status === 409) throw new SupabaseLmsError(409, body?.message || "Data LMS bertentangan dengan record tenant.");
    if (code === "P0002" || response.status === 404) throw new SupabaseLmsError(404, body?.message || "Record LMS tidak ditemukan.");
    if (code === "42501" || response.status === 403) throw new SupabaseLmsError(403, "Operasi LMS ditolak oleh kebijakan role atau tenant.");
    if (["22023", "22P02"].includes(code) || response.status === 400) throw new SupabaseLmsError(400, body?.message || "Data LMS tidak valid.");
    throw new SupabaseLmsError(503, "Layanan LMS Supabase belum dapat diproses.");
  }
  return body;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function tenantIdFrom(value: string) {
  if (!uuid(value)) throw new SupabaseLmsError(403, "Tenant LMS tidak valid.");
  const rows = await request("/rest/v1/tenants?" + new URLSearchParams({ select: "id,status", id: "eq." + value, limit: "2" }).toString());
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].status !== "active") throw new SupabaseLmsError(403, "Tenant LMS tidak aktif.");
  return value;
}

function inUuid(values: string[]) {
  if (values.some((value) => !uuid(value))) throw new SupabaseLmsError(503, "LMS menemukan relasi tenant dengan ID tidak valid.");
  return "in.(" + values.join(",") + ")";
}

async function rows(path: string, limit: number, label: string) {
  const result = await request(path);
  if (!Array.isArray(result) || result.length > limit) throw new SupabaseLmsError(503, `Data ${label} melewati batas aman tampilan LMS.`);
  return result as Row[];
}

export async function getSupabaseLmsLegacyImportContext(tenantIdentifier: string) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const tenants = await rows("/rest/v1/tenants?" + new URLSearchParams({ select: "id,legacy_tenant_key", id: "eq." + tenantId, limit: "2" }).toString(), 1, "legacy tenant mapping");
  const legacyTenantKey = String(tenants[0]?.legacy_tenant_key || "").trim();
  if (!legacyTenantKey) throw new SupabaseLmsError(409, "Tenant belum memiliki pemetaan arsip Firebase lama.");
  const [existingCategories, existingCourses, existingModules, existingMaterials, existingAssignments, teachers] = await Promise.all([
    rows("/rest/v1/lms_categories?" + new URLSearchParams({ select: "name,source_record_id,source_fingerprint", tenant_id: "eq." + tenantId, limit: "7001" }).toString(), 7000, "LMS categories"),
    rows("/rest/v1/lms_courses?" + new URLSearchParams({ select: "source_record_id,source_fingerprint", tenant_id: "eq." + tenantId, source_system: "eq.legacy_firestore", limit: "7001" }).toString(), 7000, "imported LMS courses"),
    rows("/rest/v1/lms_course_modules?" + new URLSearchParams({ select: "source_record_id,source_fingerprint", tenant_id: "eq." + tenantId, source_system: "eq.legacy_firestore", limit: "7001" }).toString(), 7000, "imported LMS modules"),
    rows("/rest/v1/lms_materials?" + new URLSearchParams({ select: "source_record_id,source_fingerprint", tenant_id: "eq." + tenantId, source_system: "eq.legacy_firestore", limit: "7001" }).toString(), 7000, "imported LMS materials"),
    rows("/rest/v1/lms_assignments?" + new URLSearchParams({ select: "source_record_id,source_fingerprint", tenant_id: "eq." + tenantId, source_system: "eq.legacy_firestore", limit: "7001" }).toString(), 7000, "imported LMS assignments"),
    rows("/rest/v1/profiles?" + new URLSearchParams({ select: "user_id,display_name,role,status", tenant_id: "eq." + tenantId, role: "eq.ustadz", status: "eq.active", limit: "1001" }).toString(), 1000, "active LMS instructors"),
  ]);
  return { tenantId, legacyTenantKey, existingRows: [
    ...existingCategories.map((row) => ({ ...row, kind: "category" })),
    ...existingCourses.map((row) => ({ ...row, kind: "course" })),
    ...existingModules.map((row) => ({ ...row, kind: "module" })),
    ...existingMaterials.map((row) => ({ ...row, kind: "material" })),
    ...existingAssignments.map((row) => ({ ...row, kind: "assignment" })),
  ], teachers };
}

export async function applySupabaseLegacyLmsCatalog(tenantId: string, actorId: string, snapshotFingerprint: string, items: Row[]) {
  if (!uuid(tenantId) || !uuid(actorId) || !/^[0-9a-f]{64}$/.test(snapshotFingerprint) || !Array.isArray(items) || items.length > 7000) {
    throw new SupabaseLmsError(400, "Snapshot impor LMS tidak valid.");
  }
  return request("/rest/v1/rpc/import_legacy_lms_catalog", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_snapshot_fingerprint: snapshotFingerprint, p_items: items }) });
}

export async function getSupabaseLmsSnapshot(tenantIdentifier: string, actorId: string, role: string, linkedSantriId?: string) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const isStudent = role === "Santri";
  const isTeacher = role === "Ustadz";
  if (!uuid(actorId) || (isStudent && !uuid(linkedSantriId))) throw new SupabaseLmsError(403, "Profil LMS belum tertaut dengan benar.");
  const studentId = isStudent ? String(linkedSantriId) : "";
  if (isStudent) {
    const linkedStudents = await rows("/rest/v1/students?" + new URLSearchParams({ select: "id,status", tenant_id: "eq." + tenantId, id: "eq." + studentId, limit: "2" }).toString(), 1, "linked student");
    if (linkedStudents.length !== 1 || ["archived","alumni","graduated","inactive","nonaktif","dikeluarkan"].includes(String(linkedStudents[0].status || "").toLowerCase())) {
      throw new SupabaseLmsError(403, "Santri aktif pada roster tenant tidak ditemukan.");
    }
  }
  let enrollments: Row[] = [];
  if (isStudent) enrollments = await rows("/rest/v1/lms_enrollments?" + new URLSearchParams({
    select: "id,course_id,status,enrolled_at", tenant_id: "eq." + tenantId, student_id: "eq." + studentId, status: "eq.active", order: "enrolled_at.desc", limit: "501",
  }), 500, "enrollment");

  const courseQuery = new URLSearchParams({
    select: "id,category_id,category_name,title,description,grade,instructor_user_id,status,color,created_at,updated_at",
    tenant_id: "eq." + tenantId, order: "updated_at.desc,id.asc", limit: "501",
  });
  if (isTeacher) courseQuery.set("instructor_user_id", "eq." + actorId);
  if (isStudent) {
    const courseIds = [...new Set(enrollments.map((row) => String(row.course_id)))];
    if (!courseIds.length) return emptySnapshot();
    courseQuery.set("id", inUuid(courseIds));
    courseQuery.set("status", "eq.published");
  }
  const [courseRows, categoryRows, instructorRows] = await Promise.all([
    rows("/rest/v1/lms_courses?" + courseQuery.toString(), 500, "course"),
    rows("/rest/v1/lms_categories?" + new URLSearchParams({ select: "id,name,description,status", tenant_id: "eq." + tenantId, status: "eq.active", order: "name.asc", limit: "501" }).toString(), 500, "category"),
    !isTeacher && !isStudent ? rows("/rest/v1/profiles?" + new URLSearchParams({ select: "user_id,display_name", tenant_id: "eq." + tenantId, role: "eq.ustadz", status: "eq.active", order: "display_name.asc", limit: "501" }).toString(), 500, "teacher profile") : Promise.resolve([]),
  ]);
  const courseIds = courseRows.map((row) => String(row.id));
  if (!courseIds.length) return { ...emptySnapshot(), categories: categoryRows, instructors: instructorRows };

  const [enrollmentRows, moduleRows, assignmentRows] = await Promise.all([
    isStudent ? Promise.resolve(enrollments) : rows("/rest/v1/lms_enrollments?" + new URLSearchParams({ select: "id,course_id,student_id,status,enrolled_at", tenant_id: "eq." + tenantId, course_id: inUuid(courseIds), status: "eq.active", order: "enrolled_at.desc", limit: "5001" }).toString(), 5000, "enrollment"),
    rows("/rest/v1/lms_course_modules?" + new URLSearchParams({ select: "id,course_id,title,description,display_order", tenant_id: "eq." + tenantId, course_id: inUuid(courseIds), order: "display_order.asc", limit: "2001" }).toString(), 2000, "module"),
    rows("/rest/v1/lms_assignments?" + new URLSearchParams({ select: "id,course_id,module_id,title,instructions,due_at,allow_late,max_score,status", tenant_id: "eq." + tenantId, course_id: inUuid(courseIds), ...(isStudent ? { status: "eq.published" } : {}), order: "due_at.asc.nullslast,created_at.desc", limit: "2001" }).toString(), 2000, "assignment"),
  ]);
  const moduleIds = moduleRows.map((row) => String(row.id));
  const assignmentIds = assignmentRows.map((row) => String(row.id));
  const [materialRows, studentRows, submissionRows, progressRows, noteRows] = await Promise.all([
    moduleIds.length ? rows("/rest/v1/lms_materials?" + new URLSearchParams({ select: "id,module_id,title,material_type,resource_url,body,duration_seconds,display_order", tenant_id: "eq." + tenantId, module_id: inUuid(moduleIds), order: "display_order.asc", limit: "5001" }).toString(), 5000, "material") : Promise.resolve([]),
    isStudent ? Promise.resolve([]) : (!isTeacher ? rows("/rest/v1/students?" + new URLSearchParams({ select: "id,name,grade,class_id,status", tenant_id: "eq." + tenantId, limit: "2001" }).toString(), 2000, "student roster") : [...new Set(enrollmentRows.map((row) => String(row.student_id)))].length ? rows("/rest/v1/students?" + new URLSearchParams({ select: "id,name,grade,class_id,status", tenant_id: "eq." + tenantId, id: inUuid([...new Set(enrollmentRows.map((row) => String(row.student_id)))]) , limit: "2001" }).toString(), 2000, "student roster") : Promise.resolve([])),
    assignmentIds.length ? rows("/rest/v1/lms_submissions?" + new URLSearchParams({ select: "id,assignment_id,student_id,response_text,resource_url,submitted_at,score,feedback,graded_by,graded_at", tenant_id: "eq." + tenantId, assignment_id: inUuid(assignmentIds), ...(isStudent ? { student_id: "eq." + studentId } : {}), order: "submitted_at.desc", limit: "5001" }).toString(), 5000, "submission") : Promise.resolve([]),
    isStudent ? rows("/rest/v1/lms_material_progress?" + new URLSearchParams({ select: "material_id,position_seconds,completed_at,updated_at", tenant_id: "eq." + tenantId, student_id: "eq." + studentId, limit: "2001" }).toString(), 2000, "progress") : Promise.resolve([]),
    isStudent ? rows("/rest/v1/lms_student_notes?" + new URLSearchParams({ select: "id,material_id,timestamp_seconds,note,created_at", tenant_id: "eq." + tenantId, student_id: "eq." + studentId, order: "created_at.desc", limit: "2001" }).toString(), 2000, "notes") : Promise.resolve([]),
  ]);
  const commentRows = isStudent && materialRows.length
    ? await rows("/rest/v1/lms_material_comments?" + new URLSearchParams({ select: "id,material_id,student_id,timestamp_seconds,comment,created_at", tenant_id: "eq." + tenantId, material_id: inUuid(materialRows.map((row) => String(row.id))), order: "created_at.asc", limit: "5001" }).toString(), 5000, "comments")
    : [];
  const classIds = [...new Set(studentRows.map((row) => String(row.class_id || "")).filter(Boolean))];
  const classRows = classIds.length ? await rows("/rest/v1/master_data_records?" + new URLSearchParams({ select: "id,name", tenant_id: "eq." + tenantId, id: inUuid(classIds), category: "eq.Kelas", limit: "501" }).toString(), 500, "classes") : [];
  const classNames = new Map<string, string>(classRows.map((row): [string, string] => [String(row.id), String(row.name || "")]));
  const students = studentRows.filter((row) => !["archived","alumni","graduated","inactive","nonaktif","dikeluarkan"].includes(String(row.status || "").toLowerCase()))
    .map((row) => ({ id: String(row.id), name: String(row.name || ""), grade: String(row.grade || ""), className: classNames.get(String(row.class_id || "")) || "" }));
  const studentById = new Map<string, Row>(students.map((row): [string, Row] => [row.id, row]));
  const materialsByModule = new Map<string, Row[]>();
  for (const material of materialRows) materialsByModule.set(String(material.module_id), [...(materialsByModule.get(String(material.module_id)) || []), material]);
  const modulesByCourse = new Map<string, Row[]>();
  for (const module of moduleRows) modulesByCourse.set(String(module.course_id), [...(modulesByCourse.get(String(module.course_id)) || []), { ...module, materials: materialsByModule.get(String(module.id)) || [] }]);
  const categories = categoryRows.map((row) => ({ id: String(row.id), name: String(row.name), description: String(row.description || "") }));
  const categoryById = new Map<string, string>(categories.map((row): [string, string] => [row.id, row.name]));
  const courses = courseRows.map((row) => ({
    id: String(row.id), title: String(row.title), description: String(row.description || ""), grade: String(row.grade || ""),
    categoryId: row.category_id || null, category: String(row.category_name || categoryById.get(String(row.category_id || "")) || "Umum"),
    instructorUserId: String(row.instructor_user_id), status: String(row.status), color: String(row.color || "indigo"),
    modules: modulesByCourse.get(String(row.id)) || [],
    enrollmentCount: enrollmentRows.filter((enrollment) => String(enrollment.course_id) === String(row.id)).length,
  }));
  const assignments = assignmentRows.map((row) => ({ ...row, id: String(row.id), courseId: String(row.course_id), moduleId: row.module_id || null,
    title: String(row.title), instructions: String(row.instructions || ""), dueAt: row.due_at || null, allowLate: Boolean(row.allow_late), maxScore: Number(row.max_score), status: String(row.status) }));
  const assignmentById = new Map<string, Row>(assignments.map((row): [string, Row] => [row.id, row]));
  const submissions = submissionRows.map((row) => ({
    id: String(row.id), assignmentId: String(row.assignment_id), assignmentTitle: assignmentById.get(String(row.assignment_id))?.title || "Tugas",
    studentId: String(row.student_id), studentName: studentById.get(String(row.student_id))?.name || (isStudent ? "Saya" : "Santri diarsipkan"),
    responseText: String(row.response_text || ""), resourceUrl: String(row.resource_url || ""), submittedAt: row.submitted_at,
    score: row.score == null ? null : Number(row.score), feedback: String(row.feedback || ""), gradedAt: row.graded_at || null,
  }));
  const progress = progressRows.map((row) => ({ materialId: String(row.material_id), positionSeconds: Number(row.position_seconds), completedAt: row.completed_at || null }));
  const notes = noteRows.map((row) => ({ id: String(row.id), materialId: String(row.material_id), timestampSeconds: Number(row.timestamp_seconds), note: String(row.note), createdAt: row.created_at }));
  const comments = commentRows.map((row) => ({ id: String(row.id), materialId: String(row.material_id), studentName: studentById.get(String(row.student_id))?.name || "Santri", timestampSeconds: Number(row.timestamp_seconds), comment: String(row.comment), createdAt: row.created_at }));
  return { courses, categories, instructors: instructorRows.map((row) => ({ id: String(row.user_id), name: String(row.display_name || "Pengajar") })), students, enrollments: enrollmentRows, assignments, submissions, progress, notes, comments };
}

function emptySnapshot() { return { courses: [], categories: [], instructors: [], students: [], enrollments: [], assignments: [], submissions: [], progress: [], notes: [], comments: [] }; }

export async function manageSupabaseLmsCatalog(tenantId: string, actorId: string, action: string, item: unknown) {
  if (!uuid(tenantId) || !uuid(actorId) || !item || typeof item !== "object" || Array.isArray(item)) throw new SupabaseLmsError(400, "Data LMS tidak valid.");
  if (!["category","course","module","material","assignment","enroll"].includes(action)) throw new SupabaseLmsError(400, "Aksi katalog LMS tidak didukung.");
  return request("/rest/v1/rpc/manage_lms_catalog", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_action: action, p_item: item }) });
}

export async function saveSupabaseLmsProgress(tenantId: string, actorId: string, item: any) {
  if (!uuid(item?.materialId) || !Number.isInteger(item?.positionSeconds) || typeof item?.completed !== "boolean") throw new SupabaseLmsError(400, "Status materi LMS tidak valid.");
  return request("/rest/v1/rpc/save_lms_progress", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_material_id: item.materialId, p_position_seconds: item.positionSeconds, p_completed: item.completed }) });
}

export async function addSupabaseLmsLearningRecord(tenantId: string, actorId: string, item: any) {
  if (!uuid(item?.materialId) || !["note","comment"].includes(item?.kind) || !Number.isInteger(item?.timestampSeconds) || typeof item?.text !== "string") throw new SupabaseLmsError(400, "Catatan atau komentar materi tidak valid.");
  return request("/rest/v1/rpc/add_lms_learning_record", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_kind: item.kind, p_material_id: item.materialId, p_timestamp_seconds: item.timestampSeconds, p_text: item.text }) });
}

export async function submitSupabaseLmsAssignment(tenantId: string, actorId: string, assignmentId: string, item: any) {
  if (!uuid(assignmentId) || typeof item?.responseText !== "string" || typeof item?.resourceUrl !== "string") throw new SupabaseLmsError(400, "Jawaban tugas LMS tidak valid.");
  return request("/rest/v1/rpc/submit_lms_assignment", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_assignment_id: assignmentId, p_text: item.responseText, p_url: item.resourceUrl }) });
}

export async function gradeSupabaseLmsSubmission(tenantId: string, actorId: string, submissionId: string, item: any) {
  if (!uuid(submissionId) || !Number.isFinite(item?.score) || typeof item?.feedback !== "string") throw new SupabaseLmsError(400, "Nilai atau umpan balik tugas tidak valid.");
  return request("/rest/v1/rpc/grade_lms_submission", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_submission_id: submissionId, p_score: item.score, p_feedback: item.feedback }) });
}
