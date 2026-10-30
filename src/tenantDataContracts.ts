export { tenantRecord } from "./tenantRecord";

/** Scope a legacy Firestore query without importing the Firebase SDK into consumers. */
export function tenantScopedQuery(firestore: any, source: any, tenantId: string | null | undefined, ...constraints: any[]) {
  const activeTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
  return firestore.query(
    source,
    firestore.where("tenantId", "==", activeTenantId || "__tenant_scope_unavailable__"),
    ...constraints,
  );
}
