import assert from "node:assert/strict";
import { areCbtAnswerSnapshotsEqual, createCbtAnswerSyncQueue, flushCbtAnswerSnapshot } from "../src/lib/cbtAnswerSync";

const queue = createCbtAnswerSyncQueue({ questionA: 0 });
const order: string[] = [];
let releaseFirst!: () => void;
const firstWriteGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

const firstWrite = queue.enqueue({ questionA: 1 }, async () => {
  order.push("first-start");
  await firstWriteGate;
  order.push("first-finish");
});
const secondWrite = queue.enqueue({ questionA: 2 }, async (snapshot) => {
  assert.deepEqual(snapshot, { questionA: 2 });
  order.push("second");
});

await Promise.resolve();
assert.deepEqual(order, ["first-start"], "A later snapshot must wait for the in-flight save.");
let flushCompleted = false;
const flush = queue.flush().then(() => { flushCompleted = true; });
await Promise.resolve();
assert.equal(flushCompleted, false, "Submission must be able to wait for queued writes.");
releaseFirst();
await Promise.all([firstWrite, secondWrite, flush]);
assert.deepEqual(order, ["first-start", "first-finish", "second"]);
assert.equal(queue.isPersisted({ questionA: 2 }), true, "The latest successful snapshot is the persisted state.");

const failedWrite = queue.enqueue({ questionA: 3 }, async () => {
  throw new Error("simulated network failure");
});
await assert.rejects(failedWrite, /simulated network failure/);
assert.equal(queue.isPersisted({ questionA: 2 }), true, "A failed request must not be reported as persisted.");
assert.equal(queue.isPersisted({ questionA: 3 }), false);

let recovered = false;
await queue.enqueue({ questionA: 4 }, async () => { recovered = true; });
assert.equal(recovered, true, "A failed save must not poison later writes.");
assert.equal(queue.isPersisted({ questionA: 4 }), true);
assert.equal(areCbtAnswerSnapshotsEqual({ questionA: 4, questionB: 0 }, { questionB: 0, questionA: 4 }), true);
assert.equal(areCbtAnswerSnapshotsEqual({ questionA: 4 }, { questionA: 3 }), false);

await queue.reset({ questionA: 0 });
assert.equal(queue.isPersisted({ questionA: 0 }), true);

const deadlineQueue = createCbtAnswerSyncQueue({ questionA: 0 });
let releasePending!: () => void;
const pendingGate = new Promise<void>((resolve) => { releasePending = resolve; });
let finalWriteStarted = false;
const pendingWrite = deadlineQueue.enqueue({ questionA: 1 }, () => pendingGate);
const deadlineSubmission = flushCbtAnswerSnapshot(
  deadlineQueue,
  { questionA: 2 },
  async () => { finalWriteStarted = true; },
  () => false,
);
releasePending();
await pendingWrite;
assert.equal(await deadlineSubmission, false, "An expired deadline skips a stale final write.");
assert.equal(finalWriteStarted, false, "No new answer request starts after the deadline.");

const duplicateQueue = createCbtAnswerSyncQueue({ questionA: 0 });
let duplicateWrites = 0;
await duplicateQueue.enqueue({ questionA: 1 }, async () => { duplicateWrites += 1; });
assert.equal(await flushCbtAnswerSnapshot(duplicateQueue, { questionA: 1 }, async () => { duplicateWrites += 1; }, () => true), true);
assert.equal(duplicateWrites, 1, "Submission does not duplicate an already persisted final snapshot.");

console.log("CBT answer sync: ordered saves, flush-before-submit, failed-save reporting, and recovery passed.");
