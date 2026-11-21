import assert from "node:assert/strict";
import {
  normalizeCrmBroadcastContactIds,
  SupabaseCrmError,
} from "../src/server/supabaseCrm";

const ids = [
  "70000000-0000-4000-8000-000000000001",
  "70000000-0000-4000-8000-000000000002",
];

assert.deepEqual(normalizeCrmBroadcastContactIds(ids), ids, "valid explicit recipients are retained");
assert.deepEqual(
  normalizeCrmBroadcastContactIds([ids[0], ids[0]]),
  [ids[0]],
  "duplicate recipient IDs are deduplicated",
);

for (const input of [undefined, null, "not-an-array", [], ["invalid-id"]]) {
  assert.throws(
    () => normalizeCrmBroadcastContactIds(input),
    (error) => error instanceof SupabaseCrmError && error.status === 400,
    `invalid or empty recipient lists are rejected: ${String(input)}`,
  );
}

const tooMany = Array.from({ length: 51 }, (_, index) =>
  `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
assert.throws(
  () => normalizeCrmBroadcastContactIds(tooMany),
  (error) => error instanceof SupabaseCrmError && error.status === 400,
  "more than 50 recipients are rejected",
);

console.log("CRM broadcast audience validation: 8 assertions passed.");
