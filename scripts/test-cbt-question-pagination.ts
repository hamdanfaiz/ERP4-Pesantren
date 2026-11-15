import assert from "node:assert/strict";
import {
  decodeCbtQuestionPageCursor,
  encodeCbtQuestionPageCursor,
  normalizeCbtQuestionPageQuery,
  SupabaseCbtError,
} from "../src/server/supabaseCbt";

const tenantId = "e1900000-0000-4000-8000-000000000009";
const questionId = "e1900000-0000-4000-8000-000000000701";
const normalized = normalizeCbtQuestionPageQuery({
  limit: "50", search: "  fiqh  ", status: "active",
  subjectReferenceId: "e1900000-0000-4000-8000-00000000a001",
});
assert.equal(normalized.pageSize, 50, "default page size is explicit");
assert.equal(normalized.search, "fiqh", "search is trimmed before cursor binding");
assert.equal(normalizeCbtQuestionPageQuery({}).pageSize, 50, "default limit is 50");
assert.equal(normalizeCbtQuestionPageQuery({ limit: "100" }).pageSize, 100, "limit accepts the maximum page size");
assert.equal(normalizeCbtQuestionPageQuery({ status: "all" }).status, "all", "all status is supported");

for (const [label, input] of [
  ["zero limit", { limit: "0" }],
  ["oversized limit", { limit: "101" }],
  ["non-numeric limit", { limit: "50x" }],
  ["unsupported status", { status: "draft" }],
  ["invalid subject reference", { subjectReferenceId: "not-a-uuid" }],
  ["invalid template reference", { templateReferenceId: "not-a-uuid" }],
  ["short search", { search: "ab" }],
  ["long search", { search: "x".repeat(101) }],
  ["malformed cursor alphabet", { cursor: "not/valid" }],
] as const) {
  assert.throws(() => normalizeCbtQuestionPageQuery(input), (error: unknown) =>
    error instanceof SupabaseCbtError && error.status === 400,
  `${label} is rejected before querying Postgres`);
}

const cursor = encodeCbtQuestionPageCursor(tenantId, normalized, {
  id: questionId, created_at: "2027-01-10T10:00:00.123456Z",
});
assert.deepEqual(decodeCbtQuestionPageCursor(cursor, tenantId, normalized), {
  createdAt: "2027-01-10T10:00:00.123456Z", id: questionId,
}, "cursor round-trips deterministic keyset fields");

for (const [label, otherTenant, otherFilters] of [
  ["other tenant", "e1900000-0000-4000-8000-000000000019", normalized],
  ["changed status", tenantId, normalizeCbtQuestionPageQuery({ ...normalized, status: "archived" })],
  ["changed page size", tenantId, normalizeCbtQuestionPageQuery({ ...normalized, limit: "25" })],
  ["changed search", tenantId, normalizeCbtQuestionPageQuery({ ...normalized, search: "aqidah" })],
] as const) {
  assert.throws(() => decodeCbtQuestionPageCursor(cursor, otherTenant, otherFilters), (error: unknown) =>
    error instanceof SupabaseCbtError && error.status === 400,
  `${label} cannot reuse a cursor`);
}
assert.throws(() => decodeCbtQuestionPageCursor("e30", tenantId, normalized), (error: unknown) =>
  error instanceof SupabaseCbtError && error.status === 400,
  "a structurally incomplete cursor is rejected");

console.log("CBT question cursor validation: 20 assertions passed");
