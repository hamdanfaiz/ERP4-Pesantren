export type RuntimeUnavailableDiagnostic = {
  method?: string;
  route?: string;
  code: "FEATURE_UNAVAILABLE";
};

const SAFE_HTTP_METHOD = /^(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/;
const SAFE_ROUTE = /^\/(?:[A-Za-z_:*{][A-Za-z0-9_.*:{}-]*)(?:\/(?:[A-Za-z_:*{][A-Za-z0-9_.*:{}-]*))*$/;
const loggedUnavailableRoutes = new Set<string>();
const MAX_LOGGED_UNAVAILABLE_ROUTES = 256;

export function buildRuntimeUnavailableDiagnostic(
  method: unknown,
  route: unknown,
): RuntimeUnavailableDiagnostic {
  const safeMethod = typeof method === "string" && SAFE_HTTP_METHOD.test(method)
    ? method
    : undefined;
  const safeRoute = typeof route === "string" && SAFE_ROUTE.test(route)
    ? route
    : undefined;

  return {
    code: "FEATURE_UNAVAILABLE",
    ...(safeMethod ? { method: safeMethod } : {}),
    ...(safeRoute ? { route: safeRoute } : {}),
  };
}

/** Logs the first unavailable response for each static route per server process. */
export function logRuntimeFeatureUnavailable(method: unknown, route: unknown): void {
  const diagnostic = buildRuntimeUnavailableDiagnostic(method, route);
  const key = `${diagnostic.method || "UNKNOWN"} ${diagnostic.route || "UNKNOWN"}`;
  if (loggedUnavailableRoutes.has(key) || loggedUnavailableRoutes.size >= MAX_LOGGED_UNAVAILABLE_ROUTES) return;
  loggedUnavailableRoutes.add(key);
  console.warn("ERP4 runtime feature unavailable", diagnostic);
}
