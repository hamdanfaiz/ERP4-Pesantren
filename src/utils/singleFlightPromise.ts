type PromiseRef<T> = { current: Promise<T> | null };

/**
 * Reuse one asynchronous callback task across React StrictMode effect replay.
 * Deferring task creation to a microtask lets the replayed effect subscribe
 * before one-time auth callback tokens are exchanged.
 */
export function getOrCreateSingleFlightPromise<T>(
  taskRef: PromiseRef<T>,
  createTask: () => Promise<T>,
): Promise<T> {
  if (!taskRef.current) {
    taskRef.current = Promise.resolve().then(createTask);
  }
  return taskRef.current;
}
