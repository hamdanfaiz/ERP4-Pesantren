import { createHmac } from "node:crypto";
import { cbtSupabaseRequest, SupabaseCbtError } from "./supabaseCbt";

type Row = Record<string, any>;
export type LegacyCbtSourceRow = { id: string; data: Row };

export async function getSupabaseCbtLegacyImportContext(tenantIdentifier: string) {
  const tenantId = String(tenantIdentifier || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new SupabaseCbtError(403, "Tenant aktif tidak valid.");
  }
  const tenants = await cbtSupabaseRequest("/rest/v1/tenants?" + new URLSearchParams({ select: "id,legacy_tenant_key,status", id: "eq." + tenantId, limit: "2" }).toString());
  if (!Array.isArray(tenants) || tenants.length !== 1 || tenants[0].status !== "active") throw new SupabaseCbtError(403, "Tenant CBT tidak ditemukan.");
  const legacyTenantKey = String(tenants[0].legacy_tenant_key || "").trim();
  if (!legacyTenantKey) throw new SupabaseCbtError(409, "Tenant belum memiliki pemetaan arsip Firebase lama.");
  const query = new URLSearchParams({
    select: "source_record_id,source_fingerprint", tenant_id: "eq." + tenantId,
    source_system: "eq.legacy_firestore", limit: "3001",
  });
  const existing = await cbtSupabaseRequest("/rest/v1/cbt_questions?" + query.toString());
  if (!Array.isArray(existing) || existing.length > 3000) throw new SupabaseCbtError(503, "Bank soal lama tenant melewati batas aman pratinjau.");
  return { tenantId, legacyTenantKey, existingRows: existing as Row[] };
}

function stableValue(value: any): any {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    const result: Row = {};
    for (const key of Object.keys(value).sort()) result[key] = stableValue(value[key]);
    return result;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value === undefined ? null : value;
}

function fingerprint(value: unknown) {
  const key = String(process.env.SUPABASE_LEGACY_FINGERPRINT_KEY || "").trim();
  if (key.length < 32) throw new SupabaseCbtError(503, "Kunci fingerprint migrasi server belum dikonfigurasi.");
  return createHmac("sha256", key).update(JSON.stringify(stableValue(value))).digest("hex");
}

function sourceRef(row: LegacyCbtSourceRow) {
  return fingerprint("cbt_questions\u0000" + row.id).slice(0, 12);
}

function normalizedOptions(value: unknown) {
  if (!Array.isArray(value)) return null;
  const options = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (options.length < 2 || options.length > 8 || options.some((item) => !item || item.length > 1000)) return null;
  return options;
}

function mapLegacyQuestion(row: LegacyCbtSourceRow) {
  const data = stableValue(row.data || {}) as Row;
  const options = normalizedOptions(data.options);
  const rawAnswer = data.correctAnswer;
  const answer = typeof rawAnswer === "number" ? rawAnswer
    : /^[A-H]$/i.test(String(rawAnswer || "").trim()) ? String(rawAnswer).trim().toUpperCase().charCodeAt(0) - 65
      : /^\d+$/.test(String(rawAnswer ?? "")) ? Number(rawAnswer) : Number.NaN;
  const text = String(data.text ?? data.questionHtml ?? "").trim();
  const subject = String(data.subject || "").trim();
  const grade = String(data.grade || "").trim();
  const template = String(data.template || "Paket A").trim();
  const explanation = String(data.explanation || "");
  const difficulty = ["Easy", "Medium", "Hard"].includes(String(data.difficulty)) ? String(data.difficulty) : "Medium";
  const status = ["archived", "inactive", "nonaktif", "disabled"].includes(String(data.status || "").trim().toLowerCase()) ? "archived" : "active";
  const tags = Array.isArray(data.tags) ? data.tags.map(String).map((tag: string) => tag.trim()).filter(Boolean)
    : typeof data.tags === "string" ? data.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean) : [];
  if (!row.id || row.id.length > 300 || !subject || subject.length > 150 || !grade || grade.length > 40
    || !template || template.length > 80 || !text || text.length > 12000 || !options
    || !Number.isInteger(answer) || answer < 0 || answer >= options.length
    || explanation.length > 4000 || tags.length > 30 || tags.some((tag: string) => tag.length > 50)) return null;
  return {
    sourceRecordId: row.id,
    sourceFingerprint: fingerprint(data),
    question: { subject, grade, template, questionHtml: text, options, correctAnswer: answer, explanation, difficulty, tags, status },
  };
}

export async function previewSupabaseLegacyCbt(
  sourceRows: LegacyCbtSourceRow[], existingRows: Row[],
) {
  const sources = sourceRows.map((row) => ({ id: String(row.id || ""), data: stableValue(row.data || {}) as Row }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const snapshotFingerprint = fingerprint(sources);
  const issues: Array<{ code: string; recordRef: string; severity: "blocking" | "warning" }> = [];
  const counts = { source: sources.length, ready: 0, alreadyImported: 0, invalid: 0 };
  if (sources.length > 3000) {
    return { snapshotFingerprint, counts, issues: [{ code: "record_limit_exceeded", recordRef: "", severity: "blocking" as const }], issueCount: 1, blockingCount: 1, canApply: false, items: [] as Row[] };
  }
  const existingById = new Map<string, Row>(existingRows.map((row): [string, Row] => [String(row.source_record_id), row]));
  const seen = new Set<string>();
  const items: Row[] = [];
  for (const source of sources) {
    const ref = sourceRef(source);
    if (!source.id || seen.has(source.id)) {
      issues.push({ code: source.id ? "duplicate_source_id" : "invalid_source_id", recordRef: ref, severity: "blocking" });
      counts.invalid += 1;
      continue;
    }
    seen.add(source.id);
    const item = mapLegacyQuestion(source);
    if (!item) {
      issues.push({ code: "invalid_question_record", recordRef: ref, severity: "blocking" });
      counts.invalid += 1;
      continue;
    }
    const prior = existingById.get(source.id);
    if (prior) {
      if (prior.source_fingerprint !== item.sourceFingerprint) {
        issues.push({ code: "source_changed_after_import", recordRef: ref, severity: "blocking" });
      } else counts.alreadyImported += 1;
      continue;
    }
    items.push(item);
  }
  const blockingCount = issues.filter((issue) => issue.severity === "blocking").length;
  counts.ready = items.length;
  return {
    snapshotFingerprint, counts, issues: issues.slice(0, 50), issueCount: issues.length,
    blockingCount, canApply: blockingCount === 0 && items.length > 0, items,
  };
}

export async function applySupabaseLegacyCbtImport(
  tenantId: string,
  actorId: string,
  sourceRows: LegacyCbtSourceRow[],
  existingRows: Row[],
  expectedFingerprint: string,
) {
  const checked = await previewSupabaseLegacyCbt(sourceRows, existingRows);
  if (!/^[0-9a-f]{64}$/.test(String(expectedFingerprint || "")) || checked.snapshotFingerprint !== expectedFingerprint) {
    throw new SupabaseCbtError(409, "Snapshot sumber berubah sejak pratinjau. Buat pratinjau baru sebelum menerapkan impor.");
  }
  if (!checked.canApply) throw new SupabaseCbtError(409, "Pratinjau memiliki data tidak valid atau konflik. Selesaikan semua masalah sebelum menerapkan impor.");
  const saved = await cbtSupabaseRequest("/rest/v1/rpc/import_legacy_cbt_questions", {
    method: "POST",
    body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_snapshot_fingerprint: checked.snapshotFingerprint, p_items: checked.items }),
  });
  return {
    snapshotFingerprint: checked.snapshotFingerprint, counts: checked.counts,
    imported: Number(saved?.imported || 0), skipped: Number(saved?.skipped || 0), alreadyApplied: Boolean(saved?.alreadyApplied),
  };
}
