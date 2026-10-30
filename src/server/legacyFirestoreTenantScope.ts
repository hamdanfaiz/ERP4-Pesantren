export type LegacyTenantSourceRecord = {
  id: string;
  record: Record<string, unknown>;
};

export type LegacyTenantScopeAudit = {
  sourceRecordCount: number;
  includedRecordCount: number;
  matchedTenantIdCount: number;
  assignedBySingleTenantMappingCount: number;
  unresolvedTenantlessCount: number;
  excludedOtherTenantCount: number;
  invalidTenantIdCount: number;
  singleSourceTenantVerified: boolean;
};

export type LegacyTenantScopeResult = {
  records: LegacyTenantSourceRecord[];
  audit: LegacyTenantScopeAudit;
};

export type LegacyTenantRecordNormalization =
  | { valid: true; tenantId: string | null; record: Record<string, unknown> }
  | { valid: false; tenantId: null; record: null };

/** Normalize supported tenant aliases without mutating the Firestore snapshot. */
export function normalizeLegacyTenantRecord(
  source: Record<string, unknown>,
): LegacyTenantRecordNormalization {
  const camelTenantId = source.tenantId;
  const snakeTenantId = source.tenant_id;
  const hasCamelTenantId = camelTenantId !== undefined && camelTenantId !== null && camelTenantId !== "";
  const hasSnakeTenantId = snakeTenantId !== undefined && snakeTenantId !== null && snakeTenantId !== "";
  const normalizedCamelTenantId = typeof camelTenantId === "string" ? camelTenantId.trim() : "";
  const normalizedSnakeTenantId = typeof snakeTenantId === "string" ? snakeTenantId.trim() : "";

  if (
    (hasCamelTenantId && typeof camelTenantId !== "string")
    || (hasSnakeTenantId && typeof snakeTenantId !== "string")
    || (hasCamelTenantId && !normalizedCamelTenantId)
    || (hasSnakeTenantId && !normalizedSnakeTenantId)
    || (hasCamelTenantId && hasSnakeTenantId
      && normalizedCamelTenantId !== normalizedSnakeTenantId)
  ) {
    return { valid: false, tenantId: null, record: null };
  }

  const tenantId = hasCamelTenantId
    ? normalizedCamelTenantId
    : hasSnakeTenantId ? normalizedSnakeTenantId : null;
  const record: Record<string, unknown> = { ...source };
  delete record.tenant_id;
  if (tenantId) record.tenantId = tenantId;
  else delete record.tenantId;
  return { valid: true, tenantId, record };
}

/** A nested Firestore document is owned by its path; reject conflicting owner fields. */
export function legacyTenantPathRecordMatches(
  source: Record<string, unknown>,
  expectedLegacyTenantKey: string,
  targetTenantId: string,
): boolean {
  const normalized = normalizeLegacyTenantRecord(source);
  if (!normalized.valid || !normalized.tenantId) return normalized.valid;
  const legacyKey = expectedLegacyTenantKey.trim();
  const tenantId = targetTenantId.trim();
  return Boolean(legacyKey && tenantId)
    && (normalized.tenantId === legacyKey || normalized.tenantId === tenantId);
}

/**
 * Scope a bounded legacy snapshot to one explicitly configured source tenant.
 * Tenantless records are eligible only when the Firestore tenant registry
 * contains exactly one tenant and its document ID matches the configured key.
 * The assignment is applied to an in-memory copy, never back to Firestore.
 */
export function scopeLegacyTenantRecords(
  records: readonly LegacyTenantSourceRecord[],
  sourceTenantIds: readonly string[],
  expectedTenantKey: string
): LegacyTenantScopeResult {
  const tenantKey = expectedTenantKey.trim();
  if (!tenantKey) throw new Error("Legacy tenant key is required.");

  const normalizedSourceTenantIds = Array.from(new Set(
    sourceTenantIds.map((id) => id.trim()).filter(Boolean)
  ));
  const singleSourceTenantVerified =
    normalizedSourceTenantIds.length === 1 && normalizedSourceTenantIds[0] === tenantKey;

  const included: LegacyTenantSourceRecord[] = [];
  let matchedTenantIdCount = 0;
  let assignedBySingleTenantMappingCount = 0;
  let unresolvedTenantlessCount = 0;
  let excludedOtherTenantCount = 0;
  let invalidTenantIdCount = 0;

  for (const source of records) {
    const normalized = normalizeLegacyTenantRecord(source.record);
    if (!normalized.valid) {
      invalidTenantIdCount += 1;
      continue;
    }
    const recordTenantId = normalized.tenantId || "";

    if (recordTenantId) {
      if (recordTenantId === tenantKey) {
        included.push({ id: source.id, record: normalized.record });
        matchedTenantIdCount += 1;
      } else {
        excludedOtherTenantCount += 1;
      }
      continue;
    }

    if (!singleSourceTenantVerified) {
      unresolvedTenantlessCount += 1;
      continue;
    }

    included.push({ id: source.id, record: { ...normalized.record, tenantId: tenantKey } });
    assignedBySingleTenantMappingCount += 1;
  }

  return {
    records: included,
    audit: {
      sourceRecordCount: records.length,
      includedRecordCount: included.length,
      matchedTenantIdCount,
      assignedBySingleTenantMappingCount,
      unresolvedTenantlessCount,
      excludedOtherTenantCount,
      invalidTenantIdCount,
      singleSourceTenantVerified,
    },
  };
}


import type { Firestore } from "firebase-admin/firestore";

export class LegacyFirestoreTenantScopeError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "LegacyFirestoreTenantScopeError";
    this.status = status;
  }
}

type LegacyFirestoreRow = { id: string; data: Record<string, any> };
type ReadLegacyRowsOptions = {
  collectionName: string;
  tenantKey: string;
  limit: number;
  filters?: Array<{ field: string; value: unknown }>;
};

/**
 * Read a bounded Firestore snapshot for an explicitly mapped source tenant.
 * Rows with tenantless ownership are accepted only when the source tenant
 * registry has exactly one document and its ID equals the configured key.
 * This helper never writes tenant metadata back to Firestore.
 */
export async function readLegacyFirestoreTenantRows(
  db: Firestore,
  options: ReadLegacyRowsOptions,
): Promise<LegacyFirestoreRow[]> {
  const tenantKey = String(options.tenantKey || "").trim();
  const limit = Number(options.limit);
  if (!String(options.collectionName || "").trim() || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000) {
    throw new LegacyFirestoreTenantScopeError(400, "Batas atau nama koleksi sumber legacy tidak valid.");
  }
  if (!tenantKey) throw new LegacyFirestoreTenantScopeError(409, "Kunci tenant sumber belum dapat dipetakan dengan aman.");

  let query: FirebaseFirestore.Query = db.collection(options.collectionName);
  for (const filter of options.filters || []) query = query.where(filter.field, "==", filter.value);
  const [snapshot, registry] = await Promise.all([
    query.limit(limit + 1).get(),
    db.collection("tenants").limit(2).get(),
  ]);
  if (snapshot.size > limit) {
    throw new LegacyFirestoreTenantScopeError(413, `Impor ${options.collectionName} dibatasi maksimal ${limit} record per tenant.`);
  }

  const rows: LegacyTenantSourceRecord[] = snapshot.docs.map((document) => {
    const source = document.data() as Record<string, unknown>;
    const camel = source.tenantId;
    const snake = source.tenant_id;
    const hasCamel = camel !== undefined && camel !== null && camel !== "";
    const hasSnake = snake !== undefined && snake !== null && snake !== "";
    if (hasCamel && hasSnake && (
      typeof camel !== "string" || typeof snake !== "string" || camel.trim() !== snake.trim()
    )) {
      throw new LegacyFirestoreTenantScopeError(409, `Koleksi ${options.collectionName} memiliki tenantId dan tenant_id yang bertentangan.`);
    }
    const normalized = hasCamel || !hasSnake ? source : { ...source, tenantId: snake };
    return { id: document.id, record: normalized };
  });
  const scoped = scopeLegacyTenantRecords(rows, registry.docs.map((document) => document.id), tenantKey);
  if (scoped.audit.invalidTenantIdCount > 0 || scoped.audit.unresolvedTenantlessCount > 0) {
    throw new LegacyFirestoreTenantScopeError(409, "Record legacy tanpa ownership tenant yang dapat diverifikasi tidak dapat diproses.");
  }
  return scoped.records.map(({ id, record }) => ({ id, data: record as Record<string, any> }));
}
