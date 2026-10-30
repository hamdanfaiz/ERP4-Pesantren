const STORAGE_PREFIX = "erp4.pending-mutation.v1.";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

type StoredMutation = {
  fingerprint: string;
  requestId: string;
  expiresAt: number;
};

export type PendingMutationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type PendingMutationIdStoreOptions = {
  storage?: PendingMutationStorage | null;
  now?: () => number;
  makeId?: () => string;
  digest?: (input: string) => Promise<string | null>;
  ttlMs?: number;
};

export type PendingMutationLease = {
  requestId: string;
  clear: () => void;
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

async function sha256(input: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof TextEncoder === "undefined") return null;
  const bytes = await subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sessionStorageIfAvailable(): PendingMutationStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readStored(storage: PendingMutationStorage | null, key: string): StoredMutation | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredMutation>;
    if (typeof value.fingerprint !== "string" || typeof value.requestId !== "string"
      || !Number.isFinite(value.expiresAt)) return null;
    return value as StoredMutation;
  } catch {
    return null;
  }
}

export function createPendingMutationIdStore(options: PendingMutationIdStoreOptions = {}) {
  const storage = options.storage === undefined ? sessionStorageIfAvailable() : options.storage;
  const now = options.now || Date.now;
  const makeId = options.makeId || (() => globalThis.crypto.randomUUID());
  const digest = options.digest || sha256;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const memory = new Map<string, StoredMutation>();

  return {
    async acquire(scope: string, payload: unknown): Promise<PendingMutationLease> {
      const canonicalPayload = canonicalize(payload);
      let hashedFingerprint: string | null = null;
      try { hashedFingerprint = await digest(canonicalPayload); } catch { /* Fall back to an in-memory key if hashing is unavailable. */ }
      // If Web Crypto is unavailable, keep the potentially identifying payload fingerprint in memory only.
      const fingerprint = hashedFingerprint ?? canonicalPayload;
      const key = STORAGE_PREFIX + encodeURIComponent(scope)
        + (hashedFingerprint ? `.${hashedFingerprint}` : `.memory:${canonicalPayload}`);
      const timestamp = now();
      const stored = memory.get(key) || (hashedFingerprint ? readStored(storage, key) : null);
      const record = stored && stored.expiresAt > timestamp && stored.fingerprint === fingerprint
        ? stored
        : { fingerprint, requestId: makeId(), expiresAt: timestamp + ttlMs };

      memory.set(key, record);
      if (hashedFingerprint) {
        try { storage?.setItem(key, JSON.stringify(record)); } catch { /* Session storage is an optional retry aid. */ }
      }

      return {
        requestId: record.requestId,
        clear: () => {
          if (memory.get(key)?.requestId === record.requestId) memory.delete(key);
          const latest = readStored(storage, key);
          if (latest?.requestId === record.requestId) {
            try { storage?.removeItem(key); } catch { /* The mutation already completed; memory cleanup is best effort. */ }
          }
        },
      };
    },
  };
}

export const pendingMutationIds = createPendingMutationIdStore();
