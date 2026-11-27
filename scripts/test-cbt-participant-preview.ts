import assert from "node:assert/strict";
import { getSupabaseCbtAdminParticipantPreview, SupabaseCbtError } from "../src/server/supabaseCbt";

const tenantId = "e1900000-0000-4000-8000-000000000009";
const examId = "e1900000-0000-4000-8000-000000000701";
const questionIds = Array.from({ length: 205 }, (_, index) =>
  `e1900000-0000-4000-8000-${String(index + 702).padStart(12, "0")}`);
const questionId = questionIds[0];
const previousUrl = process.env.SUPABASE_URL;
const previousSecret = process.env.SUPABASE_SECRET_KEY;
const originalFetch = globalThis.fetch;
const requests: URL[] = [];
process.env.SUPABASE_URL = "https://erp4-preview-test.supabase.co";
process.env.SUPABASE_SECRET_KEY = "sb_secret_preview_test_only";

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input));
  requests.push(url);
  const pathname = url.pathname;
  const data = pathname.endsWith("/tenants")
    ? [{ id: tenantId, status: "active" }]
    : pathname.endsWith("/cbt_exams")
      ? [{
        id: examId, title: "Ujian Fikih", subject: "Fikih", grade: "VII",
        starts_at: "2027-02-01T01:00:00.000Z", ends_at: "2027-02-01T02:00:00.000Z",
        duration_minutes: 45, status: "published", shuffle_questions: true,
      }]
      : pathname.endsWith("/cbt_exam_questions")
        ? questionIds.map((id, index) => ({ question_id: id, display_order: index }))
        : pathname.endsWith("/cbt_questions")
          ? (url.searchParams.get("id") || "in.()").slice(4, -1).split(",")
            .filter(Boolean).map((id) => ({ id, question_html: `Teks soal ${id}`, options: ["Niat", "Salam"] }))
          : null;
  assert.notEqual(data, null, `Unexpected read-only preview request: ${pathname}`);
  const rows = data as unknown[];
  const offset = Number(url.searchParams.get("offset") || 0);
  const limit = Number(url.searchParams.get("limit") || rows.length);
  return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

try {
  const preview = await getSupabaseCbtAdminParticipantPreview(tenantId, examId);
  assert.deepEqual(preview, {
    id: examId, title: "Ujian Fikih", subject: "Fikih", grade: "VII",
    startsAt: "2027-02-01T01:00:00.000Z", endsAt: "2027-02-01T02:00:00.000Z",
    durationMinutes: 45, status: "published", shuffleQuestions: true,
    questions: questionIds.map((id) => ({ id, text: `Teks soal ${id}`, options: ["Niat", "Salam"] })),
  });
  assert.equal(Object.hasOwn(preview.questions[0], "correctAnswer"), false);
  assert.equal(Object.hasOwn(preview.questions[0], "explanation"), false);
  const tenantLookup = requests.find((url) => url.pathname.endsWith("/tenants"));
  assert.ok(tenantLookup);
  assert.equal(tenantLookup.searchParams.get("id"), `eq.${tenantId}`,
    "The tenant lookup resolves only the authenticated actor tenant ID.");
  assert.ok(requests.filter((url) => !url.pathname.endsWith("/tenants"))
    .every((url) => url.searchParams.get("tenant_id") === `eq.${tenantId}`),
  "Exam, relation, and question reads are constrained to the actor tenant.");
  const relationRead = requests.find((url) => url.pathname.endsWith("/cbt_exam_questions"));
  assert.ok(relationRead);
  assert.equal(relationRead.searchParams.get("select"), "question_id,display_order",
    "Composite-key relation pagination orders by question_id and never assumes a missing id column.");
  const questionReads = requests.filter((url) => url.pathname.endsWith("/cbt_questions"));
  assert.equal(questionReads.length, 3, "Large question sets are queried in bounded batches.");
  assert.ok(questionReads.every((url) => url.searchParams.get("select") === "id,question_html,options"),
    "Question reads request only participant-visible content.");
  assert.ok(questionReads.every((url) => !url.searchParams.has("correct_answer") && !url.searchParams.has("explanation")),
    "The preview query never requests answer keys or teacher explanations.");
  assert.ok(questionReads.every((url) => url.toString().length < 10_000),
    "Question ID filters stay within a bounded request URL for large exams.");
  assert.ok(requests.every((url) => url.pathname !== "/rest/v1/rpc/start_cbt_attempt"),
    "The preview never creates a timed attempt.");

  await assert.rejects(
    getSupabaseCbtAdminParticipantPreview(tenantId, "not-an-id"),
    (error: unknown) => error instanceof SupabaseCbtError && error.status === 400,
  );
  console.log("CBT participant preview: tenant scope, 205-question batching, answer-key exclusion, no attempt, and validation passed.");
} finally {
  globalThis.fetch = originalFetch;
  if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
  if (previousSecret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = previousSecret;
}
