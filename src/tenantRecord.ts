/** Add the active tenant to a record and reject cross-tenant writes. */
export function tenantRecord<T extends Record<string, any>>(tenantId: string | null | undefined, data: T): T & { tenantId: string } {
  const activeTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
  if (!activeTenantId) throw new Error("Tenant aktif wajib tersedia untuk menyimpan data.");
  if (typeof data?.tenantId === "string" && data.tenantId !== activeTenantId) {
    throw new Error("Record berasal dari tenant lain dan tidak dapat disimpan.");
  }
  return { ...data, tenantId: activeTenantId };
}
