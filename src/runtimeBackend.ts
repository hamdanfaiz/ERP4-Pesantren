/** Routes operational screens to Supabase. Server migration/import gates remain independent. */
export const SUPABASE_ONLY_RUNTIME = true;

export function supabaseRuntimeEnabled(featureFlag: unknown): boolean {
  return SUPABASE_ONLY_RUNTIME || featureFlag === "true";
}

/** Firestore archive data is intentionally not imported; tenants create initial examples in ERP screens. */
export const legacyArchiveImportEnabled = false;
