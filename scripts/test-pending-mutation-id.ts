import assert from "node:assert/strict";
import { createPendingMutationIdStore, type PendingMutationStorage } from "../src/utils/pendingMutationId";

class MemoryStorage implements PendingMutationStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  dump() { return [...this.values.entries()]; }
}

async function fakeDigest(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return `test:${(hash >>> 0).toString(16)}`;
}

let sequence = 0;
let now = 1_800_000_000_000;
const storage = new MemoryStorage();
const store = createPendingMutationIdStore({
  storage,
  now: () => now,
  makeId: () => `request-${++sequence}`,
  digest: fakeDigest,
  ttlMs: 60_000,
});

const payload = { tenantId: "tenant-a", actorId: "admin-a", walletId: "wallet-a", items: [{ productId: "book-a", quantity: 2 }] };
const first = await store.acquire("cooperative:sale", payload);
const retry = await store.acquire("cooperative:sale", { items: payload.items, walletId: "wallet-a", actorId: "admin-a", tenantId: "tenant-a" });
assert.equal(retry.requestId, first.requestId, "canonical-equivalent payloads reuse one request ID");
assert.ok(storage.dump().length > 0 && !JSON.stringify(storage.dump()).includes("wallet-a"), "session persistence stores only the payload hash and request ID");

const differentWallet = await store.acquire("cooperative:sale", { ...payload, walletId: "wallet-b" });
assert.notEqual(differentWallet.requestId, first.requestId, "a changed wallet starts a distinct idempotent operation");

const afterChangedPayload = await store.acquire("cooperative:sale", payload);
assert.equal(afterChangedPayload.requestId, first.requestId, "switching back recovers the original pending operation ID");

now += 60_001;
const afterExpiry = await store.acquire("cooperative:sale", payload);
assert.notEqual(afterExpiry.requestId, afterChangedPayload.requestId, "expired requests receive a new ID");

afterExpiry.clear();
const afterSuccess = await store.acquire("cooperative:sale", payload);
assert.notEqual(afterSuccess.requestId, afterExpiry.requestId, "successful operations can release their retry key");

const memoryOnly = createPendingMutationIdStore({ storage: null, makeId: () => `memory-${++sequence}`, digest: async () => null });
const memoryFirst = await memoryOnly.acquire("cooperative:sale", payload);
const memoryRetry = await memoryOnly.acquire("cooperative:sale", payload);
assert.equal(memoryRetry.requestId, memoryFirst.requestId, "in-memory retry still works when session storage is unavailable");
const memoryChangedPayload = await memoryOnly.acquire("cooperative:sale", { ...payload, walletId: "wallet-b" });
assert.notEqual(memoryChangedPayload.requestId, memoryFirst.requestId, "memory-only fallback keeps separate payload attempts isolated");

console.log("PASS: pending mutation ID retry semantics (8 assertions)");
