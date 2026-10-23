export type AlumniRequestIdentity = {
  payloadKey: string;
  requestId: string;
};

export function createAlumniClientRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) throw new Error("Browser tidak menyediakan generator ID yang aman.");
  if (typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Keep legacy Alumni-status students available until an Alumni profile is recorded. */
export function isAlumniGraduationCandidate(status: unknown, hasAlumniProfile: boolean): boolean {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  return !hasAlumniProfile && normalizedStatus !== "archived";
}

/** Reuse an idempotency key after an uncertain response for the same payload. */
export function getStableAlumniRequestIdentity(
  previous: AlumniRequestIdentity | null,
  payloadKeyValue: unknown,
  createRequestId: () => string,
): AlumniRequestIdentity {
  const payloadKey = String(payloadKeyValue || "").trim();
  if (!payloadKey) throw new Error("Payload kelulusan tidak valid.");
  if (previous?.payloadKey === payloadKey && previous.requestId.trim()) return previous;
  const requestId = String(createRequestId() || "").trim();
  if (!requestId) throw new Error("ID permintaan kelulusan tidak dapat dibuat.");
  return { payloadKey, requestId };
}
