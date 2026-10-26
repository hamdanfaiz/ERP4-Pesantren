import { createHmac } from "node:crypto";
import { cbtSupabaseRequest, SupabaseCbtError } from "./supabaseCbt";

type Row = Record<string, any>;
export type LegacyCbtSettingsSourceRow = { id: string; data: Row };

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

function sourceRef(id: string) {
  return fingerprint("cbt_config\u0000" + id).slice(0, 12);
}

function normalizeList(value: unknown, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const items: string[] = [];
  const unique = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") return null;
    const item = candidate.trim();
    const key = item.toLocaleLowerCase("id-ID");
    if (!item || item.length > maxLength || unique.has(key)) return null;
    unique.add(key);
    items.push(item);
  }
  return items;
}

function mapSettings(row: LegacyCbtSettingsSourceRow, expectedSourceId: string) {
  const data = stableValue(row.data || {}) as Row;
  const allowedKeys = new Set([
    "tenantId", "subjects", "grades", "templates", "autoGrading", "shuffleQuestions",
    "correctScore", "wrongScore", "blankScore",
  ]);
  if (!row.id || row.id !== expectedSourceId || String(data.tenantId || "") !== expectedSourceId
    || Object.keys(data).some((key) => !allowedKeys.has(key))) return null;

  const subjects = normalizeList(data.subjects, 150);
  const grades = normalizeList(data.grades, 40);
  const templates = normalizeList(data.templates, 80);
  const correctPoints = Number(data.correctScore);
  const wrongPoints = Number(data.wrongScore);
  const blankPoints = Number(data.blankScore);
  if (!subjects || !grades || !templates || data.autoGrading !== true || typeof data.shuffleQuestions !== "boolean"
    || typeof data.correctScore !== "number" || typeof data.wrongScore !== "number" || typeof data.blankScore !== "number"
    || !Number.isFinite(correctPoints) || correctPoints < 0 || correctPoints > 100 || Math.round(correctPoints * 100) !== correctPoints * 100
    || !Number.isFinite(wrongPoints) || wrongPoints < -100 || wrongPoints > 100 || Math.round(wrongPoints * 100) !== wrongPoints * 100
    || !Number.isFinite(blankPoints) || blankPoints < -100 || blankPoints > 100 || Math.round(blankPoints * 100) !== blankPoints * 100) return null;

  return {
    sourceRecordId: row.id,
    sourceFingerprint: fingerprint(data),
    settings: {
      subjects, grades, templates, autoGrading: true,
      shuffleQuestions: data.shuffleQuestions,
      correctScore: correctPoints, wrongScore: wrongPoints, blankScore: blankPoints,
    },
  };
}

export async function getSupabaseCbtLegacySettingsImportContext(tenantIdentifier: string) {
  const tenantId = String(tenantIdentifier || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new SupabaseCbtError(403, "Tenant aktif tidak valid.");
  }
  const tenants = await cbtSupabaseRequest("/rest/v1/tenants?" + new URLSearchParams({
    select: "id,legacy_tenant_key,status", id: "eq." + tenantId, limit: "2",
  }).toString());
  if (!Array.isArray(tenants) || tenants.length !== 1 || tenants[0].status !== "active") {
    throw new SupabaseCbtError(403, "Tenant CBT tidak ditemukan.");
  }
  const legacyTenantKey = String(tenants[0].legacy_tenant_key || "").trim();
  if (!legacyTenantKey) throw new SupabaseCbtError(409, "Tenant belum memiliki pemetaan arsip Firebase lama.");
  const existingSettingsRows = await cbtSupabaseRequest("/rest/v1/cbt_tenant_settings?" + new URLSearchParams({
    select: "tenant_id,source_system,source_record_id,source_fingerprint",
    tenant_id: "eq." + tenantId, limit: "2",
  }).toString());
  if (!Array.isArray(existingSettingsRows) || existingSettingsRows.length > 1) {
    throw new SupabaseCbtError(503, "Pengaturan CBT tenant belum dapat diverifikasi.");
  }
  return { tenantId, legacyTenantKey, existingSettingsRows };
}

export function previewSupabaseLegacyCbtSettings(
  sourceRows: LegacyCbtSettingsSourceRow[], existingRows: Row[], expectedSourceId: string,
) {
  const sources = sourceRows.map((row) => ({ id: String(row.id || ""), data: stableValue(row.data || {}) as Row }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const snapshotFingerprint = fingerprint(sources);
  const issues: Array<{ code: string; recordRef: string; severity: "blocking" | "warning" }> = [];
  const counts = { source: sources.length, ready: 0, alreadyImported: 0, invalid: 0 };
  const items: Array<{ sourceRecordId: string; sourceFingerprint: string; settings: Row }> = [];

  if (sources.length !== 1) {
    issues.push({ code: sources.length ? "unexpected_cbt_config_scope" : "cbt_config_not_found", recordRef: "", severity: "blocking" });
    counts.invalid = sources.length || 1;
  } else {
    const source = sources[0];
    const ref = sourceRef(source.id);
    if (source.id !== expectedSourceId) {
      issues.push({ code: "cbt_config_tenant_mapping_mismatch", recordRef: ref, severity: "blocking" });
      counts.invalid = 1;
    } else {
      const mapped = mapSettings(source, expectedSourceId);
      if (!mapped) {
        const code = source.data?.autoGrading === false
          ? "manual_grading_policy_not_supported"
          : "invalid_cbt_config";
        issues.push({ code, recordRef: ref, severity: "blocking" });
        counts.invalid = 1;
      } else {
        const existing = existingRows[0];
        if (existing) {
          if (existing.source_system === "legacy_firestore"
            && existing.source_record_id === mapped.sourceRecordId
            && existing.source_fingerprint === mapped.sourceFingerprint) {
            counts.alreadyImported = 1;
          } else {
            issues.push({ code: "cbt_settings_already_configured", recordRef: ref, severity: "blocking" });
          }
        } else items.push(mapped);
      }
    }
  }

  const blockingCount = issues.filter((issue) => issue.severity === "blocking").length;
  counts.ready = items.length;
  return {
    snapshotFingerprint, counts, issues: issues.slice(0, 20), issueCount: issues.length,
    blockingCount, canApply: blockingCount === 0 && items.length === 1, items,
  };
}

export async function applySupabaseLegacyCbtSettingsImport(
  tenantId: string,
  actorId: string,
  sourceRows: LegacyCbtSettingsSourceRow[],
  existingRows: Row[],
  expectedSourceId: string,
  expectedFingerprint: string,
) {
  const checked = previewSupabaseLegacyCbtSettings(sourceRows, existingRows, expectedSourceId);
  if (!/^[0-9a-f]{64}$/.test(String(expectedFingerprint || "")) || checked.snapshotFingerprint !== expectedFingerprint) {
    throw new SupabaseCbtError(409, "Snapshot konfigurasi CBT berubah sejak pratinjau. Buat pratinjau baru sebelum menerapkan impor.");
  }
  if (!checked.canApply) throw new SupabaseCbtError(409, "Pratinjau konfigurasi CBT memiliki konflik atau data tidak valid.");
  const item = checked.items[0];
  const saved = await cbtSupabaseRequest("/rest/v1/rpc/import_legacy_cbt_settings", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId, p_actor_user_id: actorId,
      p_source_record_id: item.sourceRecordId, p_source_fingerprint: item.sourceFingerprint,
      p_settings: item.settings,
    }),
  });
  return {
    snapshotFingerprint: checked.snapshotFingerprint, counts: checked.counts,
    imported: Boolean(saved?.imported), alreadyImported: Boolean(saved?.alreadyImported),
  };
}
