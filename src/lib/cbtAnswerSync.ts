export type CbtAnswerSnapshot = Readonly<Record<string, number>>;

const copySnapshot = (snapshot: CbtAnswerSnapshot): Record<string, number> => ({ ...snapshot });

export function areCbtAnswerSnapshotsEqual(left: CbtAnswerSnapshot, right: CbtAnswerSnapshot) {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => Object.hasOwn(right, key) && left[key] === right[key]);
}

export function createCbtAnswerSyncQueue(initialSnapshot: CbtAnswerSnapshot = {}) {
  let pendingWrites: Promise<void> = Promise.resolve();
  let persistedSnapshot = copySnapshot(initialSnapshot);

  return {
    enqueue<T>(snapshot: CbtAnswerSnapshot, save: (stableSnapshot: CbtAnswerSnapshot) => Promise<T>) {
      const stableSnapshot = copySnapshot(snapshot);
      const operation = pendingWrites.then(() => save(stableSnapshot));
      pendingWrites = operation.then(
        () => { persistedSnapshot = copySnapshot(stableSnapshot); },
        () => undefined,
      );
      return operation;
    },
    flush() {
      return pendingWrites;
    },
    isPersisted(snapshot: CbtAnswerSnapshot) {
      return areCbtAnswerSnapshotsEqual(persistedSnapshot, snapshot);
    },
    async reset(snapshot: CbtAnswerSnapshot = {}) {
      await pendingWrites;
      persistedSnapshot = copySnapshot(snapshot);
    },
  };
}

export async function flushCbtAnswerSnapshot<T>(
  queue: ReturnType<typeof createCbtAnswerSyncQueue>,
  snapshot: CbtAnswerSnapshot,
  save: (stableSnapshot: CbtAnswerSnapshot) => Promise<T>,
  canSave: () => boolean,
) {
  const stableSnapshot = copySnapshot(snapshot);
  await queue.flush();

  if (canSave() && !queue.isPersisted(stableSnapshot)) {
    try {
      await queue.enqueue(stableSnapshot, save);
    } catch (cause) {
      if (canSave()) throw cause;
    }
  }

  await queue.flush();
  return queue.isPersisted(stableSnapshot);
}
