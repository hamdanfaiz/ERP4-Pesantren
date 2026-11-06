import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getOrCreateSingleFlightPromise } from "../src/utils/singleFlightPromise";

const component = readFileSync(new URL("../src/pages/GuardianSelfRegistrationView.tsx", import.meta.url), "utf8");
assert.match(component, /getOrCreateSingleFlightPromise\(callbackTask/);
assert.doesNotMatch(component, /callbackStarted/);

let taskCalls = 0;
let resolveTask!: (value: string) => void;
const taskRef: { current: Promise<string> | null } = { current: null };
const firstEffectPromise = getOrCreateSingleFlightPromise(taskRef, () => {
  taskCalls += 1;
  return new Promise<string>((resolve) => { resolveTask = resolve; });
});

let firstEffectActive = true;
let secondEffectActive = true;
let firstEffectUpdated = false;
let secondEffectUpdated = false;
const firstSubscriber = firstEffectPromise.then(() => {
  if (firstEffectActive) firstEffectUpdated = true;
});

// React StrictMode cleans up the first effect, then replays it immediately.
firstEffectActive = false;
const replayedEffectPromise = getOrCreateSingleFlightPromise(taskRef, () => {
  taskCalls += 1;
  return Promise.resolve("unexpected duplicate task");
});
const replayedSubscriber = replayedEffectPromise.then(() => {
  if (secondEffectActive) secondEffectUpdated = true;
});

assert.strictEqual(replayedEffectPromise, firstEffectPromise, "effect replay must reuse the same callback task");
assert.equal(taskCalls, 0, "the task should wait until both effect setups can subscribe");
await Promise.resolve();
assert.equal(taskCalls, 1, "the one-time auth callback must be processed once");
resolveTask("activated");
await Promise.all([firstSubscriber, replayedSubscriber]);

assert.equal(firstEffectUpdated, false, "the cleaned-up effect must not update state");
assert.equal(secondEffectUpdated, true, "the replayed effect must receive the callback result");
secondEffectActive = false;
console.log("Guardian registration callback survives React StrictMode effect replay.");
