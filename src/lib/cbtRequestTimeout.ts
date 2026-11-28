export const CBT_REQUEST_TIMEOUT_MS = 15_000;

export async function withCbtRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  upstreamSignal?: AbortSignal | null,
  timeoutMs = CBT_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal?.aborted) relayAbort();
  else upstreamSignal?.addEventListener("abort", relayAbort, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await request(controller.signal);
  } catch (cause) {
    if (controller.signal.aborted && !upstreamSignal?.aborted) {
      throw new Error("Permintaan ke layanan ujian melewati batas waktu. Periksa koneksi, lalu coba lagi.");
    }
    throw cause;
  } finally {
    clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener("abort", relayAbort);
  }
}
