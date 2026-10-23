import { tenantBusinessDate } from "../utils/businessDate";

type Row = Record<string, any>;

export class SupabaseLibraryError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseLibraryError";
    this.status = status;
  }
}

function serviceConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !key) throw new SupabaseLibraryError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { baseUrl, key };
}

async function request(path: string, init: RequestInit = {}) {
  const { baseUrl, key } = serviceConfig();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  if (key.startsWith("sb_secret_")) headers.delete("Authorization");
  else headers.set("Authorization", "Bearer " + key);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(baseUrl + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text();
  let payload: any = null;
  if (raw) { try { payload = JSON.parse(raw); } catch { payload = null; } }
  if (!response.ok) {
    const code = String(payload?.code || "");
    if (["23505", "23503", "23514"].includes(code) || response.status === 409) {
      throw new SupabaseLibraryError(409, payload?.message || "Perubahan bertentangan dengan transaksi perpustakaan tenant.");
    }
    if (code === "22023" || response.status === 400) throw new SupabaseLibraryError(400, payload?.message || "Data perpustakaan tidak valid.");
    if (code === "P0002" || response.status === 404) throw new SupabaseLibraryError(404, payload?.message || "Data tidak ditemukan pada tenant.");
    if (code === "42501" || response.status === 403) throw new SupabaseLibraryError(403, "Operasi perpustakaan ditolak oleh kebijakan tenant.");
    throw new SupabaseLibraryError(503, "Layanan perpustakaan Supabase belum dapat diproses.");
  }
  return payload;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function validDate(value: unknown, label: string) {
  const date = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new SupabaseLibraryError(400, `${label} tidak valid.`);
  const parsed = new Date(date + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new SupabaseLibraryError(400, `${label} tidak valid.`);
  return date;
}

function canonicalIsbn(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value !== "string") throw new SupabaseLibraryError(400, "ISBN harus berupa teks.");
  const raw = value.trim().toUpperCase();
  if (!raw) return "";
  if (raw.length > 32 || !/^[0-9X -]+$/.test(raw)) throw new SupabaseLibraryError(400, "Format ISBN tidak valid.");
  const canonical = raw.replace(/[ -]/g, "");
  if (!/^\d{9}[\dX]$/.test(canonical) && !/^\d{13}$/.test(canonical)) {
    throw new SupabaseLibraryError(400, "ISBN harus terdiri dari 10 atau 13 karakter yang valid.");
  }
  return canonical;
}

async function resolveTenant(identifier: string) {
  const normalized = String(identifier || "").trim();
  if (!normalized) throw new SupabaseLibraryError(403, "Tenant aktif tidak ditemukan.");
  const find = async (column: "id" | "legacy_tenant_key" | "slug", value: string) => {
    const params = new URLSearchParams({ select: "id,status,time_zone", [column]: "eq." + value, limit: "2" });
    return request("/rest/v1/tenants?" + params.toString());
  };
  let rows: Row[] = [];
  if (isUuid(normalized)) {
    const result = await find("id", normalized);
    if (Array.isArray(result)) rows = result;
  } else {
    const result = await find("legacy_tenant_key", normalized);
    if (Array.isArray(result)) rows = result;
    if (!rows.length) {
      const slugResult = await find("slug", normalized.toLowerCase());
      if (Array.isArray(slugResult)) rows = slugResult;
    }
  }
  if (rows.length !== 1 || String(rows[0]?.status || "").toLowerCase() !== "active") {
    throw new SupabaseLibraryError(403, "Tenant aktif tidak ditemukan di Supabase.");
  }
  return {
    id: String(rows[0].id),
    timeZone: String(rows[0].time_zone || "Asia/Jakarta"),
  };
}

async function resolveTenantId(identifier: string) {
  return (await resolveTenant(identifier)).id;
}

async function tenantRows(table: string, tenantId: string, select: string, order: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ select, tenant_id: "eq." + tenantId, order, limit: "5001", ...extra });
  const rows = await request(`/rest/v1/${table}?${params.toString()}`);
  if (!Array.isArray(rows) || rows.length > 5000) throw new SupabaseLibraryError(503, "Data perpustakaan melewati batas aman tampilan.");
  return rows as Row[];
}

export async function listSupabaseLibrarySnapshot(tenantIdentifier: string) {
  const tenant = await resolveTenant(tenantIdentifier);
  const tenantId = tenant.id;
  const businessDate = tenantBusinessDate(new Date(), tenant.timeZone);
  const [books, circulations, students] = await Promise.all([
    tenantRows("library_books", tenantId, "id,title,author,category,isbn,total_copies,shelf,status", "title.asc,id.asc", { status: "eq.active" }),
    tenantRows("library_circulations", tenantId, "id,book_id,student_id,borrowed_on,due_on,returned_on,status", "borrowed_on.desc,id.desc"),
    tenantRows("students", tenantId, "id,name,nis,status", "name.asc,id.asc", { status: "neq.Archived" }),
  ]);
  const inactiveStatuses = new Set(["archived", "archive", "arsip", "alumni", "graduated", "lulus", "inactive", "nonaktif", "tidak aktif", "dikeluarkan"]);
  const activeStudents = students.filter((student) => !inactiveStatuses.has(String(student.status || "").trim().toLowerCase()));
  const booksById = new Map(books.map((book) => [String(book.id), book]));
  const studentsById = new Map(students.map((student) => [String(student.id), student]));
  const counts = new Map<string, number>();
  for (const circulation of circulations) if (circulation.status === "active") {
    counts.set(String(circulation.book_id), (counts.get(String(circulation.book_id)) || 0) + 1);
  }
  return {
    businessDate,
    books: books.map((book) => ({
      id: String(book.id), title: String(book.title), author: String(book.author), category: String(book.category),
      isbn: String(book.isbn || ""), totalCopies: Number(book.total_copies), shelf: String(book.shelf || ""),
      availableCopies: Math.max(0, Number(book.total_copies) - (counts.get(String(book.id)) || 0)),
    })),
    circulations: circulations.map((item) => {
      const book = booksById.get(String(item.book_id));
      const student = studentsById.get(String(item.student_id));
      return {
        id: String(item.id), bookId: String(item.book_id), bookTitle: String(book?.title || "Buku tidak aktif"),
        studentId: String(item.student_id), student: String(student?.name || "Santri tidak aktif"),
        nis: String(student?.nis || ""), borrowDate: String(item.borrowed_on), dueDate: String(item.due_on),
        returnedDate: item.returned_on || null, status: item.status === "returned" ? "Returned" : "Active",
        fine: 0,
      };
    }),
    students: activeStudents.map((student) => ({ id: String(student.id), name: String(student.name || ""), nis: String(student.nis || "") })),
  };
}

export async function upsertSupabaseLibraryBook(tenantIdentifier: string, actorId: string, role: string, value: unknown) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  if (!["Admin", "SuperAdmin", "Ustadz"].includes(role)) throw new SupabaseLibraryError(403, "Role ini tidak dapat mengelola katalog.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseLibraryError(400, "Data buku tidak valid.");
  const item = value as Row;
  const id = item.id == null || item.id === "" ? null : String(item.id).trim();
  const requestId = String(item.clientRequestId || "").trim();
  const title = String(item.title || "").trim();
  const author = String(item.author || "").trim();
  const category = String(item.category || "").trim();
  const isbn = canonicalIsbn(item.isbn);
  const shelf = String(item.shelf || "").trim();
  const totalCopies = Number(item.totalCopies);
  if ((id && !isUuid(id)) || !isUuid(requestId) || !title || title.length > 240 || !author || author.length > 180
    || !category || category.length > 100 || isbn.length > 32 || shelf.length > 80
    || !Number.isInteger(totalCopies) || totalCopies < 0 || totalCopies > 100000) {
    throw new SupabaseLibraryError(400, "Judul, penulis, kategori, eksemplar, atau kunci permintaan buku tidak valid.");
  }
  return request("/rest/v1/rpc/upsert_tenant_library_book", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId, p_book_id: id, p_title: title, p_author: author, p_category: category,
      p_isbn: isbn || null, p_total_copies: totalCopies, p_shelf: shelf || null,
      p_actor_user_id: actorId, p_expected_role: role === "SuperAdmin" ? "super_admin" : role.toLowerCase(),
      p_client_request_id: requestId,
    }),
  });
}

export async function checkoutSupabaseLibraryBook(tenantIdentifier: string, actorId: string, role: string, value: unknown) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  if (!["Admin", "SuperAdmin", "Ustadz"].includes(role)) throw new SupabaseLibraryError(403, "Role ini tidak dapat mencatat peminjaman.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseLibraryError(400, "Data peminjaman tidak valid.");
  const item = value as Row;
  const bookId = String(item.bookId || "").trim();
  const studentId = String(item.studentId || "").trim();
  const requestId = String(item.clientRequestId || "").trim();
  if (!isUuid(bookId) || !isUuid(studentId) || !isUuid(requestId)) throw new SupabaseLibraryError(400, "Buku, santri, dan kunci permintaan wajib valid.");
  const borrowedOn = validDate(item.borrowedOn, "Tanggal pinjam");
  const dueOn = validDate(item.dueOn, "Tanggal jatuh tempo");
  if (Date.parse(dueOn) < Date.parse(borrowedOn) || Date.parse(dueOn) > Date.parse(borrowedOn) + 90 * 86400000) {
    throw new SupabaseLibraryError(400, "Jatuh tempo harus antara tanggal pinjam dan 90 hari sesudahnya.");
  }
  return request("/rest/v1/rpc/checkout_tenant_library_book", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId, p_book_id: bookId, p_student_id: studentId, p_borrowed_on: borrowedOn,
      p_due_on: dueOn, p_actor_user_id: actorId, p_expected_role: role === "SuperAdmin" ? "super_admin" : role.toLowerCase(),
      p_client_request_id: requestId,
    }),
  });
}

export async function returnSupabaseLibraryBook(tenantIdentifier: string, actorId: string, role: string, value: unknown) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  if (!["Admin", "SuperAdmin", "Ustadz"].includes(role)) throw new SupabaseLibraryError(403, "Role ini tidak dapat mencatat pengembalian.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseLibraryError(400, "Data pengembalian tidak valid.");
  const item = value as Row;
  const circulationId = String(item.circulationId || "").trim();
  const requestId = String(item.clientRequestId || "").trim();
  if (!isUuid(circulationId) || !isUuid(requestId)) throw new SupabaseLibraryError(400, "Transaksi dan kunci permintaan tidak valid.");
  const returnedOn = validDate(item.returnedOn, "Tanggal kembali");
  return request("/rest/v1/rpc/return_tenant_library_book", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId, p_circulation_id: circulationId, p_returned_on: returnedOn,
      p_actor_user_id: actorId, p_expected_role: role === "SuperAdmin" ? "super_admin" : role.toLowerCase(),
      p_client_request_id: requestId,
    }),
  });
}

export async function getSupabaseLibraryLegacyImportContext(tenantIdentifier: string) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const tenants = await request("/rest/v1/tenants?" + new URLSearchParams({
    select: "id,legacy_tenant_key", id: "eq." + tenantId, limit: "2",
  }).toString());
  const legacyTenantKey = Array.isArray(tenants) ? String(tenants[0]?.legacy_tenant_key || "").trim() : "";
  if (!legacyTenantKey) throw new SupabaseLibraryError(409, "Tenant belum memiliki pemetaan arsip Firestore lama.");
  const existingRows = await tenantRows(
    "library_books", tenantId,
    "id,title,author,isbn,source_system,source_record_id,source_fingerprint",
    "title.asc,id.asc",
  );
  return { tenantId, legacyTenantKey, existingRows };
}

export async function applySupabaseLegacyLibraryBooks(
  tenantId: string,
  actorId: string,
  snapshotFingerprint: string,
  sourceCount: number,
  items: Row[],
) {
  if (!isUuid(tenantId) || !isUuid(actorId) || !/^[0-9a-f]{64}$/.test(snapshotFingerprint)
    || !Number.isInteger(sourceCount) || sourceCount < 0 || sourceCount > 1000
    || !Array.isArray(items) || items.length > 1000 || items.length !== sourceCount) {
    throw new SupabaseLibraryError(400, "Snapshot impor katalog perpustakaan tidak valid.");
  }
  return request("/rest/v1/rpc/import_legacy_library_books", {
    method: "POST",
    body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_snapshot_fingerprint: snapshotFingerprint, p_source_count: sourceCount, p_rows: items }),
  });
}

