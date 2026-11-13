import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
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
  if (!url || !key) throw new SupabaseCbtError(503, "Layanan ini belum tersedia saat ini. Silakan hubungi administrator pesantren.");
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
    subjectReferenceId: row.subject_reference_id == null ? "" : String(row.subject_reference_id),
    gradeLevelReferenceId: row.grade_level_reference_id == null ? "" : String(row.grade_level_reference_id),
    templateReferenceId: row.template_reference_id == null ? "" : String(row.template_reference_id),
    template: String(row.template || ""), text: String(row.question_html || ""),
    options: Array.isArray(row.options) ? row.options : [], correctAnswer: Number(row.correct_answer),
    explanation: String(row.explanation || ""), difficulty: String(row.difficulty || "Medium"),
    tags: Array.isArray(row.tags) ? row.tags : [], status: String(row.status || "active"),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}



const CBT_QUESTION_PAGE_ORDER = "created_at.desc,id.asc";
const CBT_QUESTION_PAGE_SIZE_DEFAULT = 50;
const CBT_QUESTION_PAGE_SIZE_MAX = 100;

export type NormalizedCbtQuestionPageQuery = {
  pageSize: number;
  search: string;
  status: "all" | "active" | "archived";
  subjectReferenceId: string | null;
  gradeLevelReferenceId: string | null;
  templateReferenceId: string | null;
  cursor: string | null;
};

export function normalizeCbtQuestionPageQuery(input: Record<string, unknown>): NormalizedCbtQuestionPageQuery {
  const rawLimit = input.limit;
  let pageSize = CBT_QUESTION_PAGE_SIZE_DEFAULT;
  if (rawLimit !== undefined && rawLimit !== null && rawLimit !== "") {
    if ((typeof rawLimit !== "string" && typeof rawLimit !== "number") || !/^\d+$/.test(String(rawLimit))) {
      throw new SupabaseCbtError(400, "Ukuran halaman soal tidak valid.");
    }
    pageSize = Number(rawLimit);
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > CBT_QUESTION_PAGE_SIZE_MAX) {
    throw new SupabaseCbtError(400, "Ukuran halaman soal harus antara 1 dan 100.");
  }

  const rawSearch = input.search;
  if (rawSearch !== undefined && rawSearch !== null && typeof rawSearch !== "string") {
    throw new SupabaseCbtError(400, "Pencarian soal tidak valid.");
  }
  const search = typeof rawSearch === "string" ? rawSearch.trim() : "";
  if (search.length > 100) throw new SupabaseCbtError(400, "Pencarian soal maksimal 100 karakter.");
  if (search.length > 0 && search.length < 3) {
    throw new SupabaseCbtError(400, "Pencarian soal harus terdiri dari minimal 3 karakter.");
  }

  const rawStatus = input.status === undefined || input.status === null || input.status === "" ? "all" : input.status;
  if (typeof rawStatus !== "string" || !["all", "active", "archived"].includes(rawStatus)) {
    throw new SupabaseCbtError(400, "Status soal tidak valid.");
  }
  const referenceId = (value: unknown, label: string): string | null => {
    if (value === undefined || value === null || value === "") return null;
    if (!isUuid(value)) throw new SupabaseCbtError(400, "Filter " + label + " tidak valid.");
    return String(value).toLowerCase();
  };
  const rawCursor = input.cursor;
  if (rawCursor !== undefined && rawCursor !== null && typeof rawCursor !== "string") {
    throw new SupabaseCbtError(400, "Penanda halaman soal tidak valid.");
  }
  const cursor = typeof rawCursor === "string" ? rawCursor : null;
  if (cursor && (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor))) {
    throw new SupabaseCbtError(400, "Penanda halaman soal tidak valid.");
  }
  return {
    pageSize,
    search,
    status: rawStatus as "all" | "active" | "archived",
    subjectReferenceId: referenceId(input.subjectReferenceId, "mata pelajaran"),
    gradeLevelReferenceId: referenceId(input.gradeLevelReferenceId, "jenjang"),
    templateReferenceId: referenceId(input.templateReferenceId, "paket"),
    cursor,
  };
}

function questionCursorFilterKey(tenantId: string, filters: NormalizedCbtQuestionPageQuery) {
  return JSON.stringify({
    tenantId: tenantId.toLowerCase(),
    order: CBT_QUESTION_PAGE_ORDER,
    pageSize: filters.pageSize,
    search: filters.search,
    status: filters.status,
    subjectReferenceId: filters.subjectReferenceId,
    gradeLevelReferenceId: filters.gradeLevelReferenceId,
    templateReferenceId: filters.templateReferenceId,
  });
}

export function encodeCbtQuestionPageCursor(
  tenantId: string, filters: NormalizedCbtQuestionPageQuery, row: Row,
) {
  const createdAt = typeof row.created_at === "string" ? row.created_at : "";
  if (!isUuid(row.id) || !Number.isFinite(Date.parse(createdAt))) {
    throw new SupabaseCbtError(503, "Penanda halaman soal tidak dapat dibuat.");
  }
  return Buffer.from(JSON.stringify({
    version: 1,
    order: CBT_QUESTION_PAGE_ORDER,
    tenantId: tenantId.toLowerCase(),
    createdAt,
    id: String(row.id).toLowerCase(),
    filters: questionCursorFilterKey(tenantId, filters),
  }), "utf8").toString("base64url");
}

export function decodeCbtQuestionPageCursor(
  cursor: string, tenantId: string, filters: NormalizedCbtQuestionPageQuery,
) {
  let value: Row;
  try { value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); }
  catch { throw new SupabaseCbtError(400, "Penanda halaman soal tidak valid."); }
  const createdAt = typeof value?.createdAt === "string" ? Date.parse(value.createdAt) : Number.NaN;
  if (!value || value.version !== 1 || value.order !== CBT_QUESTION_PAGE_ORDER
    || value.tenantId !== tenantId.toLowerCase() || value.filters !== questionCursorFilterKey(tenantId, filters)
    || !isUuid(value.id) || !Number.isFinite(createdAt)) {
    throw new SupabaseCbtError(400, "Penanda halaman soal tidak cocok dengan filter saat ini.");
  }
  return { createdAt: value.createdAt, id: String(value.id).toLowerCase() };
}

export async function listSupabaseCbtQuestionPage(tenantIdentifier: string, input: Record<string, unknown>) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const filters = normalizeCbtQuestionPageQuery(input);
  const cursor = filters.cursor ? decodeCbtQuestionPageCursor(filters.cursor, tenantId, filters) : null;
  const rows = await request("/rest/v1/rpc/list_cbt_admin_question_page", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_page_size: filters.pageSize + 1,
      p_cursor_created_at: cursor?.createdAt || null,
      p_cursor_id: cursor?.id || null,
      p_search: filters.search || null,
      p_status: filters.status === "all" ? null : filters.status,
      p_subject_reference_id: filters.subjectReferenceId,
      p_grade_level_reference_id: filters.gradeLevelReferenceId,
      p_template_reference_id: filters.templateReferenceId,
    }),
  });
  if (!Array.isArray(rows) || rows.length > filters.pageSize + 1) {
    throw new SupabaseCbtError(503, "Halaman bank soal CBT belum dapat diverifikasi.");
  }
  const hasMore = rows.length > filters.pageSize;
  const pageRows = (rows as Row[]).slice(0, filters.pageSize);
  const lastRow = pageRows[pageRows.length - 1];
  return {
    items: pageRows.map(mapQuestion),
    hasMore,
    nextCursor: hasMore && lastRow ? encodeCbtQuestionPageCursor(tenantId, filters, lastRow) : null,
  };
}


const CBT_STUDENT_PAGE_ORDER = "name.asc,id.asc";
const CBT_STUDENT_PAGE_SIZE_DEFAULT = 50;
const CBT_STUDENT_PAGE_SIZE_MAX = 100;

export type NormalizedCbtStudentPageQuery = {
  pageSize: number;
  search: string;
  cursor: string | null;
};

export function normalizeCbtStudentPageQuery(input: Record<string, unknown>): NormalizedCbtStudentPageQuery {
  const rawLimit = input.limit;
  let pageSize = CBT_STUDENT_PAGE_SIZE_DEFAULT;
  if (rawLimit !== undefined && rawLimit !== null && rawLimit !== "") {
    if ((typeof rawLimit !== "string" && typeof rawLimit !== "number") || !/^\d+$/.test(String(rawLimit))) {
      throw new SupabaseCbtError(400, "Ukuran halaman daftar santri tidak valid.");
    }
    pageSize = Number(rawLimit);
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > CBT_STUDENT_PAGE_SIZE_MAX) {
    throw new SupabaseCbtError(400, "Ukuran halaman daftar santri harus antara 1 dan 100.");
  }

  const rawSearch = input.search;
  if (rawSearch !== undefined && rawSearch !== null && typeof rawSearch !== "string") {
    throw new SupabaseCbtError(400, "Pencarian santri tidak valid.");
  }
  const search = typeof rawSearch === "string" ? rawSearch.normalize("NFKC").trim() : "";
  if (search.length > 100) throw new SupabaseCbtError(400, "Pencarian santri maksimal 100 karakter.");
  if (search.length > 0 && Array.from(search).length < 3) {
    throw new SupabaseCbtError(400, "Pencarian santri harus terdiri dari minimal 3 karakter.");
  }

  const rawCursor = input.cursor;
  if (rawCursor !== undefined && rawCursor !== null && typeof rawCursor !== "string") {
    throw new SupabaseCbtError(400, "Penanda halaman santri tidak valid.");
  }
  const cursor = typeof rawCursor === "string" ? rawCursor : null;
  if (cursor && (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor))) {
    throw new SupabaseCbtError(400, "Penanda halaman santri tidak valid.");
  }
  return { pageSize, search, cursor };
}

function cbtStudentCursorFilterKey(tenantId: string, filters: NormalizedCbtStudentPageQuery) {
  return JSON.stringify({
    tenantId: tenantId.toLowerCase(),
    order: CBT_STUDENT_PAGE_ORDER,
    pageSize: filters.pageSize,
    search: filters.search,
  });
}

function cbtStudentCursorEncryptionKey() {
  const secret = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!secret) throw new SupabaseCbtError(503, "Layanan ini belum tersedia saat ini. Silakan hubungi administrator pesantren.");
  return createHash("sha256").update("erp4-cbt-student-page-cursor-v1\0").update(secret).digest();
}

export function encodeCbtStudentPageCursor(
  tenantId: string, filters: NormalizedCbtStudentPageQuery, row: Row,
) {
  const name = typeof row.name === "string" ? row.name : "";
  if (!isUuid(row.id) || !name || name.length > 180) {
    throw new SupabaseCbtError(503, "Penanda halaman santri tidak dapat dibuat.");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cbtStudentCursorEncryptionKey(), nonce);
  cipher.setAAD(Buffer.from("erp4-cbt-student-page-cursor-v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({
    version: 1,
    order: CBT_STUDENT_PAGE_ORDER,
    tenantId: tenantId.toLowerCase(),
    name,
    id: String(row.id).toLowerCase(),
    filters: cbtStudentCursorFilterKey(tenantId, filters),
  }), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function decodeCbtStudentPageCursor(
  cursor: string, tenantId: string, filters: NormalizedCbtStudentPageQuery,
) {
  let value: Row;
  try {
    const payload = Buffer.from(cursor, "base64url");
    if (payload.toString("base64url") !== cursor || payload.length < 29) {
      throw new Error("Invalid encrypted cursor encoding");
    }
    const nonce = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", cbtStudentCursorEncryptionKey(), nonce);
    decipher.setAAD(Buffer.from("erp4-cbt-student-page-cursor-v1", "utf8"));
    decipher.setAuthTag(tag);
    value = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
  } catch {
    throw new SupabaseCbtError(400, "Penanda halaman santri tidak valid atau telah kedaluwarsa.");
  }
  if (!value || value.version !== 1 || value.order !== CBT_STUDENT_PAGE_ORDER
    || value.tenantId !== tenantId.toLowerCase()
    || value.filters !== cbtStudentCursorFilterKey(tenantId, filters)
    || typeof value.name !== "string" || !value.name || value.name.length > 180
    || !isUuid(value.id)) {
    throw new SupabaseCbtError(400, "Penanda halaman santri tidak cocok dengan tenant atau pencarian saat ini.");
  }
  return { name: value.name, id: String(value.id).toLowerCase() };
}

async function readCbtAdminStudentLabels(tenantId: string, studentIds: string[]) {
  if (!studentIds.length) return [];
  const rows = await request("/rest/v1/rpc/list_cbt_admin_student_labels", {
    method: "POST",
    body: JSON.stringify({ p_tenant_id: tenantId, p_student_ids: studentIds }),
  });
  if (!Array.isArray(rows) || rows.length > studentIds.length) {
    throw new SupabaseCbtError(503, "Nama santri pada hasil CBT belum dapat diverifikasi.");
  }
  return (rows as Row[]).map((row) => {
    if (!isUuid(row?.id) || typeof row?.name !== "string" || row.name.length > 180) {
      throw new SupabaseCbtError(503, "Nama santri pada hasil CBT belum dapat diverifikasi.");
    }
    return {
      id: String(row.id),
      name: row.name,
      grade: typeof row.grade === "string" ? row.grade.slice(0, 100) : "",
      className: typeof row.class_name === "string" ? row.class_name.slice(0, 180) : "",
    };
  });
}

export async function listSupabaseCbtAdminStudentLabels(tenantIdentifier: string, rawStudentIds: unknown) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  if (!Array.isArray(rawStudentIds) || rawStudentIds.length > 5000
    || rawStudentIds.some((id) => !isUuid(id))) {
    throw new SupabaseCbtError(400, "Daftar peserta CBT tidak valid.");
  }
  return readCbtAdminStudentLabels(tenantId, [...new Set(rawStudentIds.map((id) => String(id).toLowerCase()))]);
}

export async function listSupabaseCbtAdminStudentPage(tenantIdentifier: string, input: Record<string, unknown>) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const filters = normalizeCbtStudentPageQuery(input);
  const cursor = filters.cursor ? decodeCbtStudentPageCursor(filters.cursor, tenantId, filters) : null;
  const rows = await request("/rest/v1/rpc/list_cbt_admin_student_page", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_page_size: filters.pageSize + 1,
      p_cursor_name: cursor?.name || null,
      p_cursor_id: cursor?.id || null,
      p_search: filters.search || null,
    }),
  });
  if (!Array.isArray(rows) || rows.length > filters.pageSize + 1) {
    throw new SupabaseCbtError(503, "Halaman daftar santri CBT belum dapat diverifikasi.");
  }
  const hasMore = rows.length > filters.pageSize;
  const pageRows = (rows as Row[]).slice(0, filters.pageSize);
  const lastRow = pageRows[pageRows.length - 1];
  return {
    items: pageRows.map((row) => {
      if (!isUuid(row?.id) || typeof row?.name !== "string" || !row.name || row.name.length > 180) {
        throw new SupabaseCbtError(503, "Halaman daftar santri CBT belum dapat diverifikasi.");
      }
      return {
        id: String(row.id),
        name: row.name,
        grade: typeof row.grade === "string" ? row.grade.slice(0, 100) : "",
        className: typeof row.class_name === "string" ? row.class_name.slice(0, 180) : "",
      };
    }),
    hasMore,
    nextCursor: hasMore && lastRow ? encodeCbtStudentPageCursor(tenantId, filters, lastRow) : null,
  };
}

async function activeReferenceName(tenantId: string, domain: string, referenceId: unknown, label: string) {
  if (!isUuid(referenceId)) throw new SupabaseCbtError(400, `Pilih ${label} dari katalog tenant.`);
  const params = new URLSearchParams({
    select: "id,name", tenant_id: "eq." + tenantId, domain: "eq." + domain,
    id: "eq." + referenceId, status: "eq.active", limit: "2",
  });
  const rows = await request("/rest/v1/tenant_reference_items?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 1) throw new SupabaseCbtError(400, `${label} tidak aktif atau bukan milik tenant ini.`);
  return String(rows[0].name);
}

async function tenantIdFrom(identifier: string) {
  const value = String(identifier || "").trim();
  if (!isUuid(value)) throw new SupabaseCbtError(403, "Tenant aktif tidak valid.");
  const params = new URLSearchParams({ select: "id,status", id: "eq." + value, limit: "2" });
  const rows = await request("/rest/v1/tenants?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].status !== "active") throw new SupabaseCbtError(403, "Tenant aktif tidak ditemukan.");
  return value;
}

export type CbtTenantSettingsWrite = {
  autoGrading: true;
  shuffleQuestions: boolean;
  correctPoints: number;
  wrongPoints: number;
  blankPoints: number;
};

export function normalizeCbtTenantSettingsWrite(value: unknown): CbtTenantSettingsWrite {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseCbtError(400, "Pengaturan CBT tidak valid.");
  const item = value as Row;
  const keys = Object.keys(item).sort();
  const expected = ["autoGrading", "blankPoints", "correctPoints", "shuffleQuestions", "wrongPoints"].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new SupabaseCbtError(400, "Pengaturan CBT tidak sesuai format.");
  }
  if (item.autoGrading !== true || typeof item.shuffleQuestions !== "boolean") {
    throw new SupabaseCbtError(400, "Penilaian otomatis wajib aktif dan pengacakan soal harus berupa pilihan ya atau tidak.");
  }
  const boundedScore = (raw: unknown, label: string, minimum: number, maximum: number) => {
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < minimum || raw > maximum
      || Math.abs(raw * 100 - Math.round(raw * 100)) > 1e-8) {
      throw new SupabaseCbtError(400, `${label} harus berada pada rentang yang didukung dengan paling banyak dua angka desimal.`);
    }
    return raw;
  };
  return {
    autoGrading: true,
    shuffleQuestions: item.shuffleQuestions,
    correctPoints: boundedScore(item.correctPoints, "Poin jawaban benar", 0, 100),
    wrongPoints: boundedScore(item.wrongPoints, "Poin jawaban salah", -100, 100),
    blankPoints: boundedScore(item.blankPoints, "Poin tidak dijawab", -100, 100),
  };
}

export async function saveSupabaseCbtTenantSettings(
  tenantIdentifier: string, actorId: string, expectedUpdatedAt: unknown, value: unknown,
) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  if (!isUuid(actorId)) throw new SupabaseCbtError(403, "Profil Admin tidak dapat diverifikasi.");
  let expectedStamp: string | null = null;
  if (expectedUpdatedAt !== null && expectedUpdatedAt !== undefined && expectedUpdatedAt !== "") {
    if (typeof expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
      throw new SupabaseCbtError(400, "Versi pengaturan CBT tidak valid. Muat ulang sebelum menyimpan.");
    }
    expectedStamp = expectedUpdatedAt;
  }
  const settings = normalizeCbtTenantSettingsWrite(value);
  const result = await request("/rest/v1/rpc/save_cbt_tenant_settings", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorId,
      p_expected_updated_at: expectedStamp,
      p_settings: settings,
    }),
  });
  if (!result || result.saved !== true || typeof result.updatedAt !== "string" || !Number.isFinite(Date.parse(result.updatedAt))) {
    throw new SupabaseCbtError(503, "Pengaturan CBT belum dapat diverifikasi setelah disimpan.");
  }
  return { saved: true, updatedAt: result.updatedAt };
}


export type CbtAdminDashboardSummary = {
  activeQuestions: number;
  totalExams: number;
  ongoingSessions: number;
  upcomingSessions: number;
  totalAssignments: number;
  completedAssignments: number;
  completionRate: number | null;
  assignmentStatusCounts: { assigned: number; in_progress: number; completed: number; missed: number };
  scoredAssignments: number;
  averageScore: number | null;
  passRate: number | null;
  upcomingExams: Array<{
    id: string; title: string; subject: string; grade: string; startsAt: string; endsAt: string;
    durationMinutes: number; status: string; assignedCount: number; completedCount: number;
  }>;
  latestResults: Array<{
    assignmentId: string; examTitle: string; studentName: string; className: string;
    status: string; score: number | null; passed: boolean | null; submittedAt: string;
  }>;
  asOf: string;
};

function summaryCount(value: unknown) {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new SupabaseCbtError(503, "Ringkasan CBT belum dapat diverifikasi.");
  return result;
}

function summaryNumber(value: unknown) {
  if (value == null) return null;
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) throw new SupabaseCbtError(503, "Ringkasan CBT belum dapat diverifikasi.");
  return result;
}

function summaryPercent(value: unknown) {
  const result = summaryNumber(value);
  if (result !== null && (result < 0 || result > 100)) throw new SupabaseCbtError(503, "Ringkasan CBT belum dapat diverifikasi.");
  return result;
}

function summaryText(value: unknown, maxLength: number) {
  if (typeof value !== "string" || value.length > maxLength) throw new SupabaseCbtError(503, "Ringkasan CBT belum dapat diverifikasi.");
  return value;
}

export async function getSupabaseCbtAdminDashboardSummary(tenantIdentifier: string): Promise<CbtAdminDashboardSummary> {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const value = await request("/rest/v1/rpc/get_cbt_admin_dashboard_summary", {
    method: "POST",
    body: JSON.stringify({ p_tenant_id: tenantId }),
  });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseCbtError(503, "Ringkasan CBT belum dapat diverifikasi.");
  const row = value as Row;
  const asOf = summaryText(row.asOf, 80);
  if (!Number.isFinite(Date.parse(asOf))) throw new SupabaseCbtError(503, "Ringkasan CBT belum dapat diverifikasi.");
  const statusCounts = row.assignmentStatusCounts;
  if (!statusCounts || typeof statusCounts !== "object" || Array.isArray(statusCounts)) throw new SupabaseCbtError(503, "Ringkasan CBT belum dapat diverifikasi.");
  if (!Array.isArray(row.upcomingExams) || row.upcomingExams.length > 5
    || !Array.isArray(row.latestResults) || row.latestResults.length > 5) {
    throw new SupabaseCbtError(503, "Ringkasan CBT belum dapat diverifikasi.");
  }
  const upcomingExams = row.upcomingExams.map((item: Row) => {
    const startsAt = summaryText(item?.startsAt, 80);
    const endsAt = summaryText(item?.endsAt, 80);
    if (!isUuid(item?.id) || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt))) {
      throw new SupabaseCbtError(503, "Ringkasan CBT belum dapat diverifikasi.");
    }
    return {
      id: item.id, title: summaryText(item.title, 180), subject: summaryText(item.subject, 150),
      grade: summaryText(item.grade, 40), startsAt, endsAt,
      durationMinutes: summaryCount(item.durationMinutes), status: summaryText(item.status, 40),
      assignedCount: summaryCount(item.assignedCount), completedCount: summaryCount(item.completedCount),
    };
  });
  const latestResults = row.latestResults.map((item: Row) => {
    const submittedAt = summaryText(item?.submittedAt, 80);
    if (!isUuid(item?.assignmentId) || !Number.isFinite(Date.parse(submittedAt))
      || (item.passed !== null && typeof item.passed !== "boolean")) {
      throw new SupabaseCbtError(503, "Ringkasan CBT belum dapat diverifikasi.");
    }
    return {
      assignmentId: item.assignmentId, examTitle: summaryText(item.examTitle, 180),
      studentName: summaryText(item.studentName, 180), className: summaryText(item.className, 180),
      status: summaryText(item.status, 40), score: summaryNumber(item.score),
      passed: item.passed, submittedAt,
    };
  });
  return {
    activeQuestions: summaryCount(row.activeQuestions), totalExams: summaryCount(row.totalExams),
    ongoingSessions: summaryCount(row.ongoingSessions), upcomingSessions: summaryCount(row.upcomingSessions),
    totalAssignments: summaryCount(row.totalAssignments), completedAssignments: summaryCount(row.completedAssignments),
    completionRate: summaryPercent(row.completionRate),
    assignmentStatusCounts: {
      assigned: summaryCount(statusCounts.assigned), in_progress: summaryCount(statusCounts.in_progress),
      completed: summaryCount(statusCounts.completed), missed: summaryCount(statusCounts.missed),
    },
    scoredAssignments: summaryCount(row.scoredAssignments), averageScore: summaryNumber(row.averageScore),
    passRate: summaryPercent(row.passRate), upcomingExams, latestResults, asOf,
  };
}


const CBT_ADMIN_ASSIGNMENT_PAGE_ORDER = "assigned_at.desc,id.asc";
const CBT_ADMIN_ASSIGNMENT_PAGE_SIZE_DEFAULT = 50;
const CBT_ADMIN_ASSIGNMENT_PAGE_SIZE_MAX = 100;
const CBT_ADMIN_ASSIGNMENT_VIEWS = new Set(["monitor", "results"]);

export type NormalizedCbtAdminAssignmentPageQuery = {
  pageSize: number;
  view: "monitor" | "results";
  search: string;
  cursor: string | null;
};

export function normalizeCbtAdminAssignmentPageQuery(input: Record<string, unknown>): NormalizedCbtAdminAssignmentPageQuery {
  const rawView = input.view;
  if (typeof rawView !== "string" || !CBT_ADMIN_ASSIGNMENT_VIEWS.has(rawView)) {
    throw new SupabaseCbtError(400, "Jenis daftar peserta CBT tidak valid.");
  }
  const rawLimit = input.limit;
  let pageSize = CBT_ADMIN_ASSIGNMENT_PAGE_SIZE_DEFAULT;
  if (rawLimit !== undefined && rawLimit !== null && rawLimit !== "") {
    if ((typeof rawLimit !== "string" && typeof rawLimit !== "number") || !/^\d+$/.test(String(rawLimit))) {
      throw new SupabaseCbtError(400, "Ukuran halaman peserta CBT tidak valid.");
    }
    pageSize = Number(rawLimit);
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > CBT_ADMIN_ASSIGNMENT_PAGE_SIZE_MAX) {
    throw new SupabaseCbtError(400, "Ukuran halaman peserta CBT harus antara 1 dan 100.");
  }
  const rawSearch = input.search;
  if (rawSearch !== undefined && rawSearch !== null && typeof rawSearch !== "string") {
    throw new SupabaseCbtError(400, "Pencarian peserta CBT tidak valid.");
  }
  const search = typeof rawSearch === "string" ? rawSearch.normalize("NFKC").trim() : "";
  if (search.length > 100 || (search.length > 0 && Array.from(search).length < 3)) {
    throw new SupabaseCbtError(400, "Pencarian peserta CBT harus 3–100 karakter.");
  }
  const rawCursor = input.cursor;
  if (rawCursor !== undefined && rawCursor !== null && typeof rawCursor !== "string") {
    throw new SupabaseCbtError(400, "Penanda halaman peserta CBT tidak valid.");
  }
  const cursor = typeof rawCursor === "string" ? rawCursor : null;
  if (cursor && (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor))) {
    throw new SupabaseCbtError(400, "Penanda halaman peserta CBT tidak valid.");
  }
  return { pageSize, view: rawView as "monitor" | "results", search, cursor };
}

function cbtAdminAssignmentCursorFilterKey(tenantId: string, filters: NormalizedCbtAdminAssignmentPageQuery) {
  return JSON.stringify({
    tenantId: tenantId.toLowerCase(),
    order: CBT_ADMIN_ASSIGNMENT_PAGE_ORDER,
    pageSize: filters.pageSize,
    view: filters.view,
    search: filters.search,
  });
}

function cbtAdminAssignmentCursorEncryptionKey() {
  const secret = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!secret) throw new SupabaseCbtError(503, "Layanan ini belum tersedia saat ini. Silakan hubungi administrator pesantren.");
  return createHash("sha256").update("erp4-cbt-admin-assignment-page-cursor-v1\\0").update(secret).digest();
}

export function encodeCbtAdminAssignmentPageCursor(
  tenantId: string, filters: NormalizedCbtAdminAssignmentPageQuery, row: Row,
) {
  const assignedAt = typeof row.assigned_at === "string" ? row.assigned_at : "";
  if (!isUuid(row.assignment_id) || !Number.isFinite(Date.parse(assignedAt))) {
    throw new SupabaseCbtError(503, "Penanda halaman peserta CBT tidak dapat dibuat.");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cbtAdminAssignmentCursorEncryptionKey(), nonce);
  cipher.setAAD(Buffer.from("erp4-cbt-admin-assignment-page-cursor-v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({
    version: 1,
    order: CBT_ADMIN_ASSIGNMENT_PAGE_ORDER,
    tenantId: tenantId.toLowerCase(),
    assignedAt,
    assignmentId: String(row.assignment_id).toLowerCase(),
    filters: cbtAdminAssignmentCursorFilterKey(tenantId, filters),
  }), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function decodeCbtAdminAssignmentPageCursor(
  cursor: string, tenantId: string, filters: NormalizedCbtAdminAssignmentPageQuery,
) {
  let value: Row;
  try {
    const payload = Buffer.from(cursor, "base64url");
    if (payload.toString("base64url") !== cursor || payload.length < 29) throw new Error("Invalid cursor encoding");
    const decipher = createDecipheriv("aes-256-gcm", cbtAdminAssignmentCursorEncryptionKey(), payload.subarray(0, 12));
    decipher.setAAD(Buffer.from("erp4-cbt-admin-assignment-page-cursor-v1", "utf8"));
    decipher.setAuthTag(payload.subarray(12, 28));
    value = JSON.parse(Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8"));
  } catch {
    throw new SupabaseCbtError(400, "Penanda halaman peserta CBT tidak valid atau telah kedaluwarsa.");
  }
  if (!value || value.version !== 1 || value.order !== CBT_ADMIN_ASSIGNMENT_PAGE_ORDER
    || value.tenantId !== tenantId.toLowerCase()
    || value.filters !== cbtAdminAssignmentCursorFilterKey(tenantId, filters)
    || typeof value.assignedAt !== "string" || !Number.isFinite(Date.parse(value.assignedAt))
    || !isUuid(value.assignmentId)) {
    throw new SupabaseCbtError(400, "Penanda halaman peserta CBT tidak cocok dengan tenant atau pencarian saat ini.");
  }
  return { assignedAt: value.assignedAt, assignmentId: String(value.assignmentId).toLowerCase() };
}

export async function listSupabaseCbtAdminAssignmentPage(tenantIdentifier: string, input: Record<string, unknown>) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const filters = normalizeCbtAdminAssignmentPageQuery(input);
  const cursor = filters.cursor ? decodeCbtAdminAssignmentPageCursor(filters.cursor, tenantId, filters) : null;
  const rows = await request("/rest/v1/rpc/list_cbt_admin_assignment_page", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_page_size: filters.pageSize + 1,
      p_view: filters.view,
      p_cursor_assigned_at: cursor?.assignedAt || null,
      p_cursor_assignment_id: cursor?.assignmentId || null,
      p_search: filters.search || null,
    }),
  });
  if (!Array.isArray(rows) || rows.length > filters.pageSize + 1) {
    throw new SupabaseCbtError(503, "Halaman penugasan CBT belum dapat diverifikasi.");
  }
  const hasMore = rows.length > filters.pageSize;
  const pageRows = rows.slice(0, filters.pageSize) as Row[];
  const lastRow = pageRows[pageRows.length - 1];
  const items = pageRows.map((row) => {
    const assignedAt = summaryText(row.assigned_at, 80);
    const submittedAt = row.submitted_at == null ? null : summaryText(row.submitted_at, 80);
    const status = summaryText(row.status, 40);
    if (!isUuid(row.assignment_id) || !Number.isFinite(Date.parse(assignedAt))
      || (submittedAt !== null && !Number.isFinite(Date.parse(submittedAt)))
      || !["assigned", "in_progress", "completed", "missed"].includes(status)
      || (row.passed !== null && row.passed !== undefined && typeof row.passed !== "boolean")) {
      throw new SupabaseCbtError(503, "Halaman penugasan CBT belum dapat diverifikasi.");
    }
    return {
      assignmentId: String(row.assignment_id).toLowerCase(),
      examTitle: summaryText(row.exam_title, 180),
      studentName: summaryText(row.student_name, 180),
      className: typeof row.class_name === "string" ? row.class_name.slice(0, 180) : "",
      status,
      score: summaryNumber(row.score),
      passed: row.passed == null ? null : row.passed,
      submittedAt,
      correct: row.correct_count == null ? null : summaryCount(row.correct_count),
      wrong: row.wrong_count == null ? null : summaryCount(row.wrong_count),
      blank: row.blank_count == null ? null : summaryCount(row.blank_count),
    };
  });
  return {
    items,
    hasMore,
    nextCursor: hasMore && lastRow ? encodeCbtAdminAssignmentPageCursor(tenantId, filters, lastRow) : null,
  };
}

const CBT_ADMIN_EXAM_PAGE_ORDER = "starts_at.desc,id.asc";
const CBT_ADMIN_EXAM_PAGE_SIZE_DEFAULT = 50;
const CBT_ADMIN_EXAM_PAGE_SIZE_MAX = 100;

export type NormalizedCbtAdminExamPageQuery = {
  pageSize: number;
  startsAtFrom: string | null;
  startsAtUntil: string | null;
  cursor: string | null;
};

export function normalizeCbtAdminExamPageQuery(input: Record<string, unknown>): NormalizedCbtAdminExamPageQuery {
  const rawLimit = input.limit;
  let pageSize = CBT_ADMIN_EXAM_PAGE_SIZE_DEFAULT;
  if (rawLimit !== undefined && rawLimit !== null && rawLimit !== "") {
    if ((typeof rawLimit !== "string" && typeof rawLimit !== "number") || !/^\d+$/.test(String(rawLimit))) {
      throw new SupabaseCbtError(400, "Ukuran halaman ujian tidak valid.");
    }
    pageSize = Number(rawLimit);
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > CBT_ADMIN_EXAM_PAGE_SIZE_MAX) {
    throw new SupabaseCbtError(400, "Ukuran halaman ujian harus antara 1 dan 100.");
  }
  const cursorValue = input.cursor;
  if (cursorValue !== undefined && cursorValue !== null && typeof cursorValue !== "string") {
    throw new SupabaseCbtError(400, "Penanda halaman ujian tidak valid.");
  }
  const cursor = typeof cursorValue === "string" ? cursorValue : null;
  if (cursor && (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor))) {
    throw new SupabaseCbtError(400, "Penanda halaman ujian tidak valid.");
  }
  const readInstant = (value: unknown, label: string) => {
    if (value === undefined || value === null || value === "") return null;
    const match = typeof value === "string"
      ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value)
      : null;
    if (!match || value.length > 40) {
      throw new SupabaseCbtError(400, `Batas waktu ${label} tidak valid.`);
    }
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) throw new SupabaseCbtError(400, `Batas waktu ${label} tidak valid.`);
    const expectedIso = `${match[1]}.${(match[2] || "").padEnd(3, "0") || "000"}Z`;
    const normalized = new Date(timestamp).toISOString();
    if (normalized !== expectedIso) throw new SupabaseCbtError(400, `Batas waktu ${label} tidak valid.`);
    return normalized;
  };
  const startsAtFrom = readInstant(input.startsAtFrom, "awal");
  const startsAtUntil = readInstant(input.startsAtUntil, "akhir");
  if ((startsAtFrom === null) !== (startsAtUntil === null)
    || (startsAtFrom && startsAtUntil && Date.parse(startsAtUntil) <= Date.parse(startsAtFrom))
    || (startsAtFrom && startsAtUntil && Date.parse(startsAtUntil) - Date.parse(startsAtFrom) > 33 * 86_400_000)) {
    throw new SupabaseCbtError(400, "Rentang kalender ujian tidak valid.");
  }
  return { pageSize, startsAtFrom, startsAtUntil, cursor };
}

function cbtAdminExamCursorFilterKey(tenantId: string, filters: NormalizedCbtAdminExamPageQuery) {
  return JSON.stringify({
    tenantId: tenantId.toLowerCase(), order: CBT_ADMIN_EXAM_PAGE_ORDER,
    pageSize: filters.pageSize, startsAtFrom: filters.startsAtFrom, startsAtUntil: filters.startsAtUntil,
  });
}

function cbtAdminExamCursorEncryptionKey() {
  const secret = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!secret) throw new SupabaseCbtError(503, "Layanan ini belum tersedia saat ini. Silakan hubungi administrator pesantren.");
  return createHash("sha256").update("erp4-cbt-admin-exam-page-cursor-v1\\0").update(secret).digest();
}

export function encodeCbtAdminExamPageCursor(tenantId: string, filters: NormalizedCbtAdminExamPageQuery, row: Row) {
  const startsAt = typeof row.starts_at === "string" ? row.starts_at : "";
  if (!isUuid(row.id) || !Number.isFinite(Date.parse(startsAt))) {
    throw new SupabaseCbtError(503, "Penanda halaman ujian tidak dapat dibuat.");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cbtAdminExamCursorEncryptionKey(), nonce);
  cipher.setAAD(Buffer.from("erp4-cbt-admin-exam-page-cursor-v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({
    version: 1, order: CBT_ADMIN_EXAM_PAGE_ORDER, tenantId: tenantId.toLowerCase(),
    startsAt, examId: String(row.id).toLowerCase(), filters: cbtAdminExamCursorFilterKey(tenantId, filters),
  }), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function decodeCbtAdminExamPageCursor(cursor: string, tenantId: string, filters: NormalizedCbtAdminExamPageQuery) {
  let value: Row;
  try {
    const payload = Buffer.from(cursor, "base64url");
    if (payload.toString("base64url") !== cursor || payload.length < 29) throw new Error("Invalid cursor encoding");
    const decipher = createDecipheriv("aes-256-gcm", cbtAdminExamCursorEncryptionKey(), payload.subarray(0, 12));
    decipher.setAAD(Buffer.from("erp4-cbt-admin-exam-page-cursor-v1", "utf8"));
    decipher.setAuthTag(payload.subarray(12, 28));
    value = JSON.parse(Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8"));
  } catch {
    throw new SupabaseCbtError(400, "Penanda halaman ujian tidak valid atau telah kedaluwarsa.");
  }
  if (!value || value.version !== 1 || value.order !== CBT_ADMIN_EXAM_PAGE_ORDER
    || value.tenantId !== tenantId.toLowerCase() || value.filters !== cbtAdminExamCursorFilterKey(tenantId, filters)
    || typeof value.startsAt !== "string" || !Number.isFinite(Date.parse(value.startsAt)) || !isUuid(value.examId)) {
    throw new SupabaseCbtError(400, "Penanda halaman ujian tidak cocok dengan tenant atau rentang kalender saat ini.");
  }
  return { startsAt: value.startsAt, examId: String(value.examId).toLowerCase() };
}

export async function listSupabaseCbtAdminExamPage(tenantIdentifier: string, input: Record<string, unknown>) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const filters = normalizeCbtAdminExamPageQuery(input);
  const cursor = filters.cursor ? decodeCbtAdminExamPageCursor(filters.cursor, tenantId, filters) : null;
  const rows = await request("/rest/v1/rpc/list_cbt_admin_exam_page", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId, p_page_size: filters.pageSize + 1,
      p_cursor_starts_at: cursor?.startsAt || null, p_cursor_exam_id: cursor?.examId || null,
      p_starts_at_from: filters.startsAtFrom, p_starts_at_until: filters.startsAtUntil,
    }),
  });
  if (!Array.isArray(rows) || rows.length > filters.pageSize + 1) {
    throw new SupabaseCbtError(503, "Halaman daftar ujian belum dapat diverifikasi.");
  }
  const hasMore = rows.length > filters.pageSize;
  const pageRows = rows.slice(0, filters.pageSize) as Row[];
  const items = pageRows.map((row) => {
    const status = summaryText(row.status, 40);
    const startsAt = summaryText(row.starts_at, 80);
    const endsAt = summaryText(row.ends_at, 80);
    if (!isUuid(row.id) || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt))
      || Date.parse(endsAt) <= Date.parse(startsAt) || !["draft", "published", "closed"].includes(status)) {
      throw new SupabaseCbtError(503, "Halaman daftar ujian belum dapat diverifikasi.");
    }
    return {
      id: String(row.id).toLowerCase(), title: summaryText(row.title, 180),
      subject: summaryText(row.subject, 150), grade: summaryText(row.grade, 40),
      subjectReferenceId: row.subject_reference_id == null ? "" : String(row.subject_reference_id),
      gradeLevelReferenceId: row.grade_level_reference_id == null ? "" : String(row.grade_level_reference_id),
      startsAt, endsAt, durationMinutes: summaryCount(row.duration_minutes),
      passingScore: summaryNumber(row.passing_score) ?? 75, status,
      assignedCount: summaryCount(row.assigned_count), completedCount: summaryCount(row.completed_count),
    };
  });
  const lastRow = pageRows[pageRows.length - 1];
  return {
    items, hasMore,
    nextCursor: hasMore && lastRow ? encodeCbtAdminExamPageCursor(tenantId, filters, lastRow) : null,
  };
}

export async function listSupabaseCbtAdminSnapshot(tenantIdentifier: string) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const referenceRows = (domain: string) => request("/rest/v1/tenant_reference_items?" + new URLSearchParams({
    select: "id,name,description", tenant_id: "eq." + tenantId, domain: "eq." + domain,
    status: "eq.active", order: "name.asc,id.asc", limit: "1001",
  }).toString());
  const [settingsRows, subjectReferences, gradeLevelReferences, templateReferences, packageAggregateRows] = await Promise.all([
    request("/rest/v1/cbt_tenant_settings?" + new URLSearchParams({
      // Subject, grade, and question-template choices are sourced from the tenant
      // reference catalog below. Legacy imported text arrays are provenance only.
      select: "auto_grading,shuffle_questions,correct_points,wrong_points,blank_points,source_system,updated_at",
      tenant_id: "eq." + tenantId, limit: "2",
    }).toString()),
    referenceRows("academic_subject"),
    referenceRows("academic_grade_level"),
    referenceRows("cbt_question_template"),
    request("/rest/v1/rpc/get_cbt_question_package_summary", {
      method: "POST",
      body: JSON.stringify({ p_tenant_id: tenantId }),
    }),
  ]);
  if (!Array.isArray(settingsRows) || settingsRows.length > 1) {
    throw new SupabaseCbtError(503, "Pengaturan CBT tenant belum dapat diverifikasi.");
  }
  const storedSettings = settingsRows[0] as Row | undefined;
  const settings = {
    autoGrading: storedSettings?.auto_grading == null ? true : Boolean(storedSettings.auto_grading),
    shuffleQuestions: storedSettings?.shuffle_questions == null ? false : Boolean(storedSettings.shuffle_questions),
    correctPoints: storedSettings?.correct_points == null ? 1 : Number(storedSettings.correct_points),
    wrongPoints: storedSettings?.wrong_points == null ? 0 : Number(storedSettings.wrong_points),
    blankPoints: storedSettings?.blank_points == null ? 0 : Number(storedSettings.blank_points),
    sourceSystem: String(storedSettings?.source_system || "defaults"),
    updatedAt: storedSettings?.updated_at == null ? null : String(storedSettings.updated_at),
  };
  if (!Array.isArray(packageAggregateRows)) {
    throw new SupabaseCbtError(503, "Ringkasan paket soal CBT belum dapat diverifikasi.");
  }
  const packageAggregates = new Map<string, Row>();
  for (const aggregate of packageAggregateRows as Row[]) {
    const templateId = String(aggregate?.templateReferenceId || "");
    if (!isUuid(templateId) || packageAggregates.has(templateId)) {
      throw new SupabaseCbtError(503, "Ringkasan paket soal CBT belum dapat diverifikasi.");
    }
    packageAggregates.set(templateId, aggregate);
  }
  const packageSummaries = (Array.isArray(templateReferences) ? templateReferences as Row[] : []).map((template) => {
    const templateId = String(template?.id || "");
    if (!isUuid(templateId)) throw new SupabaseCbtError(503, "Katalog paket soal CBT belum dapat diverifikasi.");
    const aggregate = packageAggregates.get(templateId);
    const names = (value: unknown) => {
      if (!Array.isArray(value) || value.length > 1000) throw new SupabaseCbtError(503, "Ringkasan paket soal CBT belum dapat diverifikasi.");
      const result = value.map((name) => summaryText(name, 150));
      if (new Set(result).size !== result.length) throw new SupabaseCbtError(503, "Ringkasan paket soal CBT belum dapat diverifikasi.");
      return result;
    };
    return {
      id: templateId,
      name: summaryText(template.name, 150),
      description: typeof template.description === "string" ? template.description.slice(0, 1000) : "",
      totalQuestions: summaryCount(aggregate?.totalQuestions ?? 0),
      activeQuestions: summaryCount(aggregate?.activeQuestions ?? 0),
      subjects: names(aggregate?.subjects ?? []),
      gradeLevels: names(aggregate?.gradeLevels ?? []),
    };
  });
  return {
    questions: [], packageSummaries,
    exams: [], results: [], students: [], settings,
    references: {
      subjects: Array.isArray(subjectReferences) ? subjectReferences : [],
      gradeLevels: Array.isArray(gradeLevelReferences) ? gradeLevelReferences : [],
      templates: Array.isArray(templateReferences) ? templateReferences : [],
    },
    classes: [],
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
  const [subject, grade, template] = await Promise.all([
    activeReferenceName(tenantId, "academic_subject", item.subjectReferenceId, "mata pelajaran"),
    activeReferenceName(tenantId, "academic_grade_level", item.gradeLevelReferenceId, "jenjang pendidikan"),
    activeReferenceName(tenantId, "cbt_question_template", item.templateReferenceId, "paket soal"),
  ]);
  const question = {
    subject,
    grade,
    template,
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
  const [subject, grade] = await Promise.all([
    activeReferenceName(tenantId, "academic_subject", item.subjectReferenceId, "mata pelajaran"),
    activeReferenceName(tenantId, "academic_grade_level", item.gradeLevelReferenceId, "jenjang pendidikan"),
  ]);
  const exam = {
    title: boundedText(item.title, "Judul ujian", 180, true),
    subject,
    grade,
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
