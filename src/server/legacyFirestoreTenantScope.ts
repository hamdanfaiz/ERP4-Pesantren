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
    const rawTenantId = source.record.tenantId;
    const recordTenantId = typeof rawTenantId === "string" ? rawTenantId.trim() : "";

    if (recordTenantId) {
      if (recordTenantId === tenantKey) {
        included.push(source);
        matchedTenantIdCount += 1;
      } else {
        excludedOtherTenantCount += 1;
      }
      continue;
    }

    if (rawTenantId !== undefined && rawTenantId !== null && rawTenantId !== "") {
      invalidTenantIdCount += 1;
      continue;
    }

    if (!singleSourceTenantVerified) {
      unresolvedTenantlessCount += 1;
      continue;
    }

    included.push({
      id: source.id,
      record: { ...source.record, tenantId: tenantKey },
    });
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
