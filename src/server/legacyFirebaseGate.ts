type LegacyFirebaseEnvironment = Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "LEGACY_FIREBASE_ADMIN_ENABLED">>;

/**
 * Firestore is no longer an operational or migration source for ERP4.
 * Operational records are created directly in Supabase, so no environment
 * variable may re-enable a connection to the retired Firebase project.
 */
export function isLegacyFirebaseAdminEnabled(_environment: LegacyFirebaseEnvironment): false {
  return false;
}
