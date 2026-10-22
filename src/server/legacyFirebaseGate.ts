type LegacyFirebaseEnvironment = Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "LEGACY_FIREBASE_ADMIN_ENABLED">>;

/** Legacy Firestore reads are migration tooling and may only run in local development. */
export function isLegacyFirebaseAdminEnabled(environment: LegacyFirebaseEnvironment): boolean {
  return environment.NODE_ENV?.trim().toLowerCase() === "development"
    && environment.LEGACY_FIREBASE_ADMIN_ENABLED?.trim().toLowerCase() === "true";
}
