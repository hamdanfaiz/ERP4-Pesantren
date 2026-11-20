export type TahfidzViewScope = {
  tenantId?: string | null;
  userId?: string | null;
  role?: string | null;
  modulePermission?: unknown;
};

export function buildTahfidzViewScopeKey(scope: TahfidzViewScope): string {
  const tenantId = scope.tenantId?.trim() || "";
  const userId = scope.userId?.trim() || "";
  const role = scope.role?.trim() || "";
  if (!tenantId || !userId || !role) return "";
  return JSON.stringify([tenantId, userId, role, scope.modulePermission ?? null]);
}

export function isTahfidzViewScopeCurrent(dataScope: string, activeScope: string): boolean {
  return dataScope.length > 0 && activeScope.length > 0 && dataScope === activeScope;
}

export function getRowsForTahfidzViewScope<T>(
  rows: T[],
  dataScope: string,
  activeScope: string,
): T[] {
  return isTahfidzViewScopeCurrent(dataScope, activeScope) ? rows : [];
}
