import assert from "node:assert/strict";
import { assertPublicPpdbTotalDocumentSize } from "../src/server/supabasePublicPpdb";

const threeMiB = [
  { bytes: new Uint8Array(2 * 1024 * 1024) },
  { bytes: new Uint8Array(1024 * 1024) },
];
assert.doesNotThrow(() => assertPublicPpdbTotalDocumentSize(threeMiB));

assert.throws(
  () => assertPublicPpdbTotalDocumentSize([...threeMiB, { bytes: new Uint8Array(1) }]),
  (error: any) => error?.status === 400 && /maksimal 3 MB/.test(error.message),
  "server rejects direct API uploads that bypass the browser's 3 MB total",
);
assert.doesNotThrow(() => assertPublicPpdbTotalDocumentSize([]));

console.log("Public PPDB server-side total document size checks passed.");
