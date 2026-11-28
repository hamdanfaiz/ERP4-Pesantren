type LocationParts = Pick<Location, "search" | "hash">;

export function isPasswordRecoveryCallback(location: LocationParts): boolean {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));

  if (query.has("passwordRecovery")) return true;

  const callbackType = query.get("type") || hash.get("type");
  const hasPkceCode = Boolean(query.get("code"));
  const hasImplicitTokens = Boolean(hash.get("access_token") && hash.get("refresh_token"));

  return callbackType === "recovery" && (hasPkceCode || hasImplicitTokens);
}

