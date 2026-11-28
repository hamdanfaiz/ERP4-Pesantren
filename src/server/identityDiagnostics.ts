type SupabaseFailureLike = {
  code?: unknown;
  name?: unknown;
  status?: unknown;
};

export type IdentityStoreDiagnostic = {
  operation: string;
  errorCode?: string;
  errorType?: string;
  httpStatus?: number;
  missingEnvironmentVariables?: string[];
};

const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.-]{0,47}$/;
const SAFE_SUPABASE_ENV_NAME = /^SUPABASE_[A-Z0-9_]{1,64}$/;

function safeIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string" || !SAFE_IDENTIFIER.test(value)) return undefined;
  return value;
}

export function buildIdentityStoreDiagnostic(
  operation: string,
  cause?: unknown,
  missingEnvironmentVariables: readonly string[] = [],
): IdentityStoreDiagnostic {
  const failure = cause && typeof cause === "object" ? cause as SupabaseFailureLike : undefined;
  const errorCode = safeIdentifier(failure?.code);
  const errorType = safeIdentifier(failure?.name);
  const status = failure?.status;
  const httpStatus = typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : undefined;
  const missing = [...new Set(missingEnvironmentVariables.filter((name) => SAFE_SUPABASE_ENV_NAME.test(name)))];

  return {
    operation: safeIdentifier(operation) || "unknown",
    ...(errorCode ? { errorCode } : {}),
    ...(errorType ? { errorType } : {}),
    ...(httpStatus ? { httpStatus } : {}),
    ...(missing.length ? { missingEnvironmentVariables: missing } : {}),
  };
}

/** Logs only safe error metadata. Never include Supabase error messages, request data, or user identifiers. */
export function logIdentityStoreFailure(
  operation: string,
  cause?: unknown,
  missingEnvironmentVariables: readonly string[] = [],
): void {
  console.error("ERP4 Supabase identity store unavailable", buildIdentityStoreDiagnostic(
    operation,
    cause,
    missingEnvironmentVariables,
  ));
}
