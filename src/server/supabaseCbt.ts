import { readPostgrestRowsInPages } from "./postgrestPagination";

type Row = Record<string, any>;

export class SupabaseCbtError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseCbtError";
    this.status = status;
  }
}

function config() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new SupabaseCbtError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { url, key };
}

export async function cbtSupabaseRequest(path: string, init: RequestInit = {}) {
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
    if (["23505", "23503", "23514", "23P01"].includes(code) || response.status === 409) throw new SupabaseCbtError(409, body?.message || "Data CBT bertentangan dengan record tenant.");
    if (code === "P0002" || response.status === 404) throw new SupabaseCbtError(404, body?.message || "Record CBT tidak ditemukan.");
    if (code === "42501" || response.status === 403) throw new SupabaseCbtError(403, "Operasi CBT ditolak oleh kebijakan tenant.");
    if (code === "22023" || response.status === 400) throw new SupabaseCbtError(400, body?.message || "Data CBT tidak valid.");
    throw new SupabaseCbtError(503, "Layanan CBT Supabase belum dapat diproses.");
  }
  return body;
}

const request = cbtSupabaseRequest;

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function boundedText(value: unknown, label: string, max: number, required = false) {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) throw new SupabaseCbtError(400, label + " wajib diisi.");
  if (result.length > max) throw new SupabaseCbtError(400, label + " melebihi batas panjang.");
  return result;
}

function mapQuestion(row: Row) {
  return {
    id: String(row.id), subject: String(row.subject || ""), grade: String(row.grade || ""),
    template: String(row.template || ""), text: String(row.question_html || ""),
    options: Array.isArray(row.options) ? row.options : [], correctAnswer: Number(row.correct_answer),
    explanation: String(row.explanation || ""), difficulty: String(row.difficulty || "Medium"),
    tags: Array.isArray(row.tags) ? row.tags : [], status: String(row.status || "active"),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function tenantIdFrom(identifier: string) {
  const value = String(identifier || "").trim();
  if (!isUuid(value)) throw new SupabaseCbtError(403, "Tenant aktif tidak valid.");
  const params = new URLSearchParams({ select: "id,status", id: "eq." + value, limit: "2" });
  const rows = await request("/rest/v1/tenants?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].status !== "active") throw new SupabaseCbtError(403, "Tenant aktif tidak ditemukan.");
  return value;
}

export async function listSupabaseCbtAdminSnapshot(tenantIdentifier: string) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const [questionRows, examRows, assignmentRows, attemptRows, studentRows, classRows, settingsRows] = await Promise.all([
    readPostgrestRowsInPages<Row>({
      request,
      path: `/rest/v1/cbt_questions?${new URLSearchParams({ select: "id,subject,grade,template,question_html,options,correct_answer,explanation,difficulty,tags,status,created_at,updated_at", tenant_id: "eq." + tenantId, order: "updated_at.desc,id.asc" })}`,
      maxRows: 2000,
      onIncomplete: () => new SupabaseCbtError(503, "Bank soal CBT melewati batas aman atau hasil pemindaian tidak lengkap."),
    }),
    readPostgrestRowsInPages<Row>({
      request,
      path: `/rest/v1/cbt_exams?${new URLSearchParams({ select: "id,title,subject,grade,starts_at,ends_at,duration_minutes,passing_score,correct_points,wrong_points,blank_points,shuffle_questions,status,created_at", tenant_id: "eq." + tenantId, order: "starts_at.desc,id.asc" })}`,
      maxRows: 500,
      onIncomplete: () => new SupabaseCbtError(503, "Daftar ujian CBT melewati batas aman atau hasil pemindaian tidak lengkap."),
    }),
    readPostgrestRowsInPages<Row>({
      request,
      path: `/rest/v1/cbt_exam_assignments?${new URLSearchParams({ select: "id,exam_id,student_id,status,assigned_at", tenant_id: "eq." + tenantId, order: "assigned_at.desc,id.asc" })}`,
      maxRows: 5000,
      onIncomplete: () => new SupabaseCbtError(503, "Daftar penugasan CBT melewati batas aman atau hasil pemindaian tidak lengkap."),
    }),
    readPostgrestRowsInPages<Row>({
      request,
      path: `/rest/v1/cbt_attempts?${new URLSearchParams({ select: "id,assignment_id,score,passed,correct_count,wrong_count,blank_count,submitted_at,expires_at", tenant_id: "eq." + tenantId, order: "submitted_at.desc.nullslast,id.asc" })}`,
      maxRows: 5000,
      onIncomplete: () => new SupabaseCbtError(503, "Hasil ujian CBT melewati batas aman atau hasil pemindaian tidak lengkap."),
    }),
    readPostgrestRowsInPages<Row>({
      request,
      path: `/rest/v1/students?${new URLSearchParams({ select: "id,name,grade,class_id,status", tenant_id: "eq." + tenantId, order: "name.asc,id.asc" })}`,
      maxRows: 2000,
      onIncomplete: () => new SupabaseCbtError(503, "Roster CBT melewati batas aman atau hasil pemindaian tidak lengkap."),
    }),
    readPostgrestRowsInPages<Row>({
      request,
      path: `/rest/v1/master_data_records?${new URLSearchParams({ select: "id,name,status", tenant_id: "eq." + tenantId, category: "eq.Kelas", order: "name.asc,id.asc" })}`,
      maxRows: 500,
      onIncomplete: () => new SupabaseCbtError(503, "Daftar kelas CBT melewati batas aman atau hasil pemindaian tidak lengkap."),
    }),
    request("/rest/v1/cbt_tenant_settings?" + new URLSearchParams({
      select: "subjects,grades,templates,auto_grading,shuffle_questions,correct_points,wrong_points,blank_points,source_system",
      tenant_id: "eq." + tenantId, limit: "2",
    }).toString()),
  ]);
  if (!Array.isArray(settingsRows) || settingsRows.length > 1) {
    throw new SupabaseCbtError(503, "Pengaturan CBT tenant belum dapat diverifikasi.");
  }
  const storedSettings = settingsRows[0] as Row | undefined;
  const settings = {
    subjects: Array.isArray(storedSettings?.subjects) ? storedSettings.subjects : [],
    grades: Array.isArray(storedSettings?.grades) ? storedSettings.grades : [],
    templates: Array.isArray(storedSettings?.templates) ? storedSettings.templates : [],
    autoGrading: storedSettings?.auto_grading == null ? true : Boolean(storedSettings.auto_grading),
    shuffleQuestions: storedSettings?.shuffle_questions == null ? false : Boolean(storedSettings.shuffle_questions),
    correctPoints: storedSettings?.correct_points == null ? 1 : Number(storedSettings.correct_points),
    wrongPoints: storedSettings?.wrong_points == null ? 0 : Number(storedSettings.wrong_points),
    blankPoints: storedSettings?.blank_points == null ? 0 : Number(storedSettings.blank_points),
    sourceSystem: String(storedSettings?.source_system || "defaults"),
  };
  const attemptsByAssignment = new Map<string, Row>();
  for (const attempt of attemptRows) {
    if (!attemptsByAssignment.has(String(attempt.assignment_id))) {
      attemptsByAssignment.set(String(attempt.assignment_id), attempt);
    }
  }
  const assignmentsByExam = new Map<string, Row[]>();
  for (const assignment of assignmentRows as Row[]) {
    assignmentsByExam.set(String(assignment.exam_id), [...(assignmentsByExam.get(String(assignment.exam_id)) || []), assignment]);
  }
  const activeStudents = (studentRows as Row[]).filter((student) =>
    !["archived", "alumni", "graduated", "inactive", "nonaktif", "dikeluarkan"].includes(String(student.status || "").toLowerCase()));
  const studentById = new Map<string, Row>(activeStudents.map((student): [string, Row] => [String(student.id), student]));
  const classById = new Map<string, string>((classRows as Row[])
    .filter((row) => !["inactive", "nonaktif", "disabled", "arsip"].includes(String(row.status || "").toLowerCase()))
    .map((row): [string, string] => [String(row.id), String(row.name || "")]));
  const students = activeStudents.map((student) => ({
    id: String(student.id), name: String(student.name || ""), grade: String(student.grade || ""),
    className: classById.get(String(student.class_id || "")) || "",
  }));
  const exams = (examRows as Row[]).map((exam) => ({
    id: String(exam.id), title: String(exam.title), subject: String(exam.subject), grade: String(exam.grade),
    startsAt: exam.starts_at, endsAt: exam.ends_at, durationMinutes: Number(exam.duration_minutes),
    passingScore: Number(exam.passing_score), correctPoints: Number(exam.correct_points),
    wrongPoints: Number(exam.wrong_points), blankPoints: Number(exam.blank_points),
    shuffleQuestions: Boolean(exam.shuffle_questions), status: String(exam.status),
    assignedCount: (assignmentsByExam.get(String(exam.id)) || []).length,
    completedCount: (assignmentsByExam.get(String(exam.id)) || []).filter((row) => row.status === "completed").length,
  }));
  const results = (assignmentRows as Row[]).map((assignment) => {
    const attempt = attemptsByAssignment.get(String(assignment.id));
    const student = studentById.get(String(assignment.student_id));
    const exam = exams.find((row) => row.id === String(assignment.exam_id));
    return {
      assignmentId: String(assignment.id), examTitle: exam?.title || "Ujian",
      studentName: String(student?.name || "Santri diarsipkan"), className: String(student ? classById.get(String(student.class_id || "")) || "" : ""),
      status: String(assignment.status), score: attempt?.score == null ? null : Number(attempt.score),
      passed: attempt?.passed == null ? null : Boolean(attempt.passed),
      correct: attempt?.correct_count == null ? null : Number(attempt.correct_count),
      wrong: attempt?.wrong_count == null ? null : Number(attempt.wrong_count),
      blank: attempt?.blank_count == null ? null : Number(attempt.blank_count),
      submittedAt: attempt?.submitted_at || null,
    };
  });
  return {
    questions: (questionRows as Row[]).map(mapQuestion),
    exams, results, students, settings,
    classes: [...new Set(students.map((student) => student.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")),
  };
}

export async function upsertSupabaseCbtQuestion(
  tenantIdentifier: string, actorId: string, questionId: unknown, requestId: unknown, value: unknown,
) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  if (!isUuid(actorId) || !isUuid(requestId) || (questionId != null && questionId !== "" && !isUuid(questionId))) {
    throw new SupabaseCbtError(400, "ID actor, soal, atau request tidak valid.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseCbtError(400, "Data soal tidak valid.");
  const item = value as Row;
  const options = Array.isArray(item.options) ? item.options.map((option: unknown) => boundedText(option, "Opsi jawaban", 1000, true)) : [];
  const correctAnswer = Number(item.correctAnswer);
  const tags = Array.isArray(item.tags) ? item.tags.map((tag: unknown) => boundedText(tag, "Tag", 50, true)).filter(Boolean) : [];
  if (options.length < 2 || options.length > 8 || !Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer >= options.length || tags.length > 30) {
    throw new SupabaseCbtError(400, "Pilihan atau kunci jawaban tidak valid.");
  }
  const question = {
    subject: boundedText(item.subject, "Mata pelajaran", 150, true),
    grade: boundedText(item.grade, "Jenjang", 40, true),
    template: boundedText(item.template, "Paket soal", 80, true),
    questionHtml: boundedText(item.text ?? item.questionHtml, "Teks soal", 12000, true),
    options, correctAnswer,
    explanation: boundedText(item.explanation, "Pembahasan", 4000),
    difficulty: ["Easy", "Medium", "Hard"].includes(String(item.difficulty)) ? String(item.difficulty) : "Medium",
    tags,
  };
  const result = await request("/rest/v1/rpc/upsert_cbt_question", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId, p_actor_user_id: actorId, p_question_id: questionId || null,
      p_request_id: requestId, p_question: question,
    }),
  });
  return { id: String(result.id), alreadyApplied: Boolean(result.alreadyApplied) };
}

export async function createSupabaseCbtExam(tenantIdentifier: string, actorId: string, value: unknown) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  if (!isUuid(actorId) || !value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseCbtError(400, "Data ujian tidak valid.");
  const item = value as Row;
  const questionIds = Array.isArray(item.questionIds) ? item.questionIds.map(String) : [];
  const studentIds = Array.isArray(item.studentIds) ? item.studentIds.map(String) : [];
  if (!isUuid(item.clientRequestId) || questionIds.length < 1 || questionIds.length > 500
    || questionIds.some((id: string) => !isUuid(id)) || studentIds.length < 1 || studentIds.length > 500
    || studentIds.some((id: string) => !isUuid(id))) {
    throw new SupabaseCbtError(400, "Pilih 1–500 soal dan santri yang valid.");
  }
  const exam = {
    title: boundedText(item.title, "Judul ujian", 180, true),
    subject: boundedText(item.subject, "Mata pelajaran", 150, true),
    grade: boundedText(item.grade, "Jenjang", 40, true),
    startsAt: String(item.startsAt || ""), endsAt: String(item.endsAt || ""),
    durationMinutes: Number(item.durationMinutes), passingScore: Number(item.passingScore ?? 75),
    correctPoints: Number(item.correctPoints ?? 1), wrongPoints: Number(item.wrongPoints ?? 0), blankPoints: Number(item.blankPoints ?? 0),
    shuffleQuestions: Boolean(item.shuffleQuestions), status: item.status === "draft" ? "draft" : "published",
  };
  if (!Number.isInteger(exam.durationMinutes) || exam.durationMinutes < 1 || exam.durationMinutes > 600
    || !Number.isFinite(exam.passingScore) || exam.passingScore < 0 || exam.passingScore > 100
    || !Number.isFinite(exam.correctPoints) || exam.correctPoints < 0 || exam.correctPoints > 100
    || !Number.isFinite(exam.wrongPoints) || exam.wrongPoints < -100 || exam.wrongPoints > 100
    || !Number.isFinite(exam.blankPoints) || exam.blankPoints < -100 || exam.blankPoints > 100) {
    throw new SupabaseCbtError(400, "Durasi atau kebijakan nilai ujian tidak valid.");
  }
  const startsAt = Date.parse(exam.startsAt), endsAt = Date.parse(exam.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) throw new SupabaseCbtError(400, "Jadwal ujian tidak valid.");
  const result = await request("/rest/v1/rpc/create_cbt_exam", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId, p_actor_user_id: actorId, p_request_id: item.clientRequestId,
      p_exam: exam, p_question_ids: questionIds, p_student_ids: studentIds,
    }),
  });
  return { id: String(result.id), alreadyApplied: Boolean(result.alreadyApplied) };
}

export async function getSupabaseCbtStudentSnapshot(tenantIdentifier: string, studentIdentifier: string) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  if (!isUuid(studentIdentifier)) throw new SupabaseCbtError(403, "Profil santri belum tertaut ke roster tenant.");
  const assignments = await readPostgrestRowsInPages<Row>({
    request,
    path: `/rest/v1/cbt_exam_assignments?${new URLSearchParams({
      select: "id,exam_id,status,assigned_at", tenant_id: "eq." + tenantId, student_id: "eq." + studentIdentifier, order: "assigned_at.desc,id.asc",
    })}`,
    maxRows: 5000,
    onIncomplete: () => new SupabaseCbtError(503, "Riwayat ujian CBT melewati batas aman atau hasil pemindaian tidak lengkap."),
  });
  if (!assignments.length) return { exams: [] };

  const attemptByAssignment = new Map<string, Row>();
  const examById = new Map<string, Row>();
  for (let offset = 0; offset < assignments.length; offset += 200) {
    const batch = assignments.slice(offset, offset + 200);
    const assignmentIds = batch.map((row) => String(row.id));
    const attemptRows = await readPostgrestRowsInPages<Row>({
      request,
      path: `/rest/v1/cbt_attempts?${new URLSearchParams({
        select: "id,assignment_id,score,passed,submitted_at,expires_at", tenant_id: "eq." + tenantId,
        assignment_id: `in.(${assignmentIds.join(",")})`, order: "submitted_at.desc.nullslast,id.asc",
      })}`,
      maxRows: batch.length,
      onIncomplete: () => new SupabaseCbtError(503, "Hasil ujian CBT tidak lengkap."),
    });
    for (const row of attemptRows) {
      if (!attemptByAssignment.has(String(row.assignment_id))) attemptByAssignment.set(String(row.assignment_id), row);
    }

    const examIds = [...new Set(batch.map((row) => String(row.exam_id)))];
    const examRows = await readPostgrestRowsInPages<Row>({
      request,
      path: `/rest/v1/cbt_exams?${new URLSearchParams({
        select: "id,title,subject,grade,starts_at,ends_at,duration_minutes,status", tenant_id: "eq." + tenantId,
        id: `in.(${examIds.join(",")})`,
      })}`,
      maxRows: examIds.length,
      onIncomplete: () => new SupabaseCbtError(503, "Daftar ujian CBT tidak lengkap."),
    });
    for (const row of examRows) examById.set(String(row.id), row);
  }
  return {
    exams: (assignments as Row[]).map((assignment) => {
      const exam = examById.get(String(assignment.exam_id));
      const attempt = attemptByAssignment.get(String(assignment.id));
      if (!exam || (exam.status !== "published" && !attempt)) return null;
      return {
        assignmentId: String(assignment.id), id: String(exam.id), title: String(exam.title), subject: String(exam.subject),
        grade: String(exam.grade), startsAt: exam.starts_at, endsAt: exam.ends_at,
        durationMinutes: Number(exam.duration_minutes), status: String(assignment.status),
        attemptId: attempt?.id || null, score: attempt?.score == null ? null : Number(attempt.score),
        attemptExpiresAt: attempt?.expires_at || null,
        passed: attempt?.passed == null ? null : Boolean(attempt.passed), submittedAt: attempt?.submitted_at || null,
      };
    }).filter(Boolean),
  };
}

export async function startSupabaseCbtAttempt(tenantId: string, actorId: string, examId: string) {
  if (!isUuid(examId)) throw new SupabaseCbtError(400, "ID ujian tidak valid.");
  return request("/rest/v1/rpc/start_cbt_attempt", {
    method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_exam_id: examId }),
  });
}

export async function saveSupabaseCbtAttemptAnswers(tenantId: string, actorId: string, attemptId: string, answers: unknown) {
  if (!isUuid(attemptId) || !answers || typeof answers !== "object" || Array.isArray(answers)) throw new SupabaseCbtError(400, "Jawaban ujian tidak valid.");
  return request("/rest/v1/rpc/save_cbt_attempt_answers", {
    method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_attempt_id: attemptId, p_answers: answers }),
  });
}

export async function submitSupabaseCbtAttempt(tenantId: string, actorId: string, attemptId: string) {
  if (!isUuid(attemptId)) throw new SupabaseCbtError(400, "ID pengerjaan ujian tidak valid.");
  return request("/rest/v1/rpc/submit_cbt_attempt", {
    method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_attempt_id: attemptId }),
  });
}
