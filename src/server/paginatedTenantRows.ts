export type TenantRowsPageResult<T> = {
  rows: T[];
  expectedCount: number;
  complete: boolean;
};

type TenantRowsPageOptions<T> = {
  getExactCount: () => Promise<number | null>;
  readPage: (afterId: string | null, limit: number) => Promise<T[]>;
  pageSize?: number;
  maxRows?: number;
};

/**
 * Reads a tenant-scoped result set using a stable unique id cursor.
 * Exact counts before and after the scan make API row caps and concurrent
 * cardinality changes fail closed instead of presenting a truncated scan as complete.
 */
export async function readTenantRowsInPages<T extends { id?: unknown }>({
  getExactCount,
  readPage,
  pageSize = 1000,
  maxRows = 5000,
}: TenantRowsPageOptions<T>): Promise<TenantRowsPageResult<T>> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || !Number.isSafeInteger(maxRows) || maxRows < 1) {
    throw new RangeError("Ukuran pemindaian tenant tidak valid.");
  }

  const expectedCount = await getExactCount();
  if (!Number.isSafeInteger(expectedCount) || (expectedCount as number) < 0) {
    return { rows: [], expectedCount: 0, complete: false };
  }

  const count = expectedCount as number;
  const rows: T[] = [];
  let afterId: string | null = null;
  let pageSequenceValid = true;
  const scanLimit = Math.min(count, maxRows);

  while (rows.length < scanLimit) {
    const requested = Math.min(pageSize, scanLimit - rows.length);
    const page = await readPage(afterId, requested);
    if (!Array.isArray(page) || page.length === 0 || page.length > requested) {
      pageSequenceValid = false;
      break;
    }

    let previousId = afterId;
    for (const row of page) {
      const id = typeof row?.id === "string" ? row.id : "";
      if (!id || (previousId !== null && id <= previousId)) {
        pageSequenceValid = false;
        break;
      }
      previousId = id;
      rows.push(row);
    }
    if (!pageSequenceValid) break;
    afterId = previousId;
  }

  const finalCount = await getExactCount();
  const complete = pageSequenceValid
    && count <= maxRows
    && rows.length === count
    && finalCount === count;

  return { rows, expectedCount: count, complete };
}
