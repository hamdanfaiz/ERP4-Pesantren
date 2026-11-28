import assert from "node:assert/strict";
import { withCbtRequestTimeout } from "../src/lib/cbtRequestTimeout";

const result = await withCbtRequestTimeout(async (signal) => {
  assert.equal(signal.aborted, false);
  return "response parsed";
}, undefined, 50);
assert.equal(result, "response parsed", "A successful request returns its result.");

await assert.rejects(
  withCbtRequestTimeout((signal) => new Promise<never>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("request aborted")), { once: true });
  }), undefined, 5),
  /Permintaan ke layanan ujian melewati batas waktu/,
  "A stalled request is converted to a clear Indonesian timeout message.",
);

const upstream = new AbortController();
const upstreamAbort = new Error("Caller cancelled request.");
const pendingRequest = withCbtRequestTimeout((signal) => new Promise<never>((_resolve, reject) => {
  signal.addEventListener("abort", () => reject(signal.reason), { once: true });
}), upstream.signal, 1_000);
upstream.abort(upstreamAbort);
await assert.rejects(pendingRequest, (cause) => cause === upstreamAbort,
  "An upstream cancellation keeps its original reason instead of being mislabeled as a timeout.");

console.log("CBT request timeout: success, stalled request timeout, and upstream cancellation passed.");
