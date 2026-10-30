import { SUPABASE_ONLY_RUNTIME } from "./runtimeBackend";

throw new Error(SUPABASE_ONLY_RUNTIME
  ? "Firebase client runtime is disabled. Use the tenant-scoped Supabase API."
  : "Firebase client support has been retired from this application.");

// Keep the export shape for unreachable legacy imports so TypeScript can compile them.
export const db: never = undefined as never;
