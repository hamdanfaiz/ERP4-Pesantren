/** Routes operational screens to Supabase. Server migration/import gates remain independent. */
export const SUPABASE_ONLY_RUNTIME = true;

export function supabaseRuntimeEnabled(featureFlag: unknown): boolean {
  return SUPABASE_ONLY_RUNTIME || featureFlag === "true";
}
