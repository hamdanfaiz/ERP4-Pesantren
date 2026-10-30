type PostgrestRequest = (path: string) => Promise<unknown>;

type PostgrestPageOptions = {
  request: PostgrestRequest;
  path: string;
  maxRows: number;
  uniqueOrderColumn?: string;
  pageSize?: number;
  verifyStableSnapshot?: boolean;
  onIncomplete: () => Error;
};

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Reads a bounded PostgREST result in pages below the project's configured
 * max_rows. Stable ordering and duplicate checks make inserts that shift offset
 * pages fail closed. Import callers can also verify a multi-page snapshot twice
 * so concurrent deletes or updates cannot silently produce a partial preview.
 */
export async function readPostgrestRowsInPages<T extends Record<string, unknown>>({
  request,
  path,
  maxRows,
  uniqueOrderColumn = "id",
  pageSize = 500,
  verifyStableSnapshot = false,
  onIncomplete,
}: PostgrestPageOptions): Promise<T[]> {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1
    || !Number.isSafeInteger(pageSize) || pageSize < 1
    || !/^[a-z_][a-z0-9_]*$/i.test(uniqueOrderColumn)) {
    throw new RangeError("Parameter pagination PostgREST tidak valid.");
  }

  const separator = path.indexOf("?");
  const resourcePath = separator < 0 ? path : path.slice(0, separator);
  const baseParams = new URLSearchParams(separator < 0 ? "" : path.slice(separator + 1));
  const select = baseParams.get("select");
  if (select && select !== "*" && !select.split(",").some((column) => column.trim().split(":").pop() === uniqueOrderColumn)) {
    baseParams.set("select", `${select},${uniqueOrderColumn}`);
  }
  const orderColumns = (baseParams.get("order") || "").split(",").map((item) => item.trim().split(".")[0]);
  if (!orderColumns.includes(uniqueOrderColumn)) {
    baseParams.set("order", [...orderColumns.filter(Boolean), `${uniqueOrderColumn}.asc`].join(","));
  }

  const readSnapshot = async (): Promise<{ rows: T[]; pageCount: number }> => {
    const result: T[] = [];
    const seen = new Set<string>();
    const maxPages = Math.ceil((maxRows + 1) / pageSize) + 1;
    let pageCount = 0;
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      const requested = Math.min(pageSize, maxRows + 1 - result.length);
      if (requested < 1) break;
      const params = new URLSearchParams(baseParams);
      params.set("limit", String(requested));
      params.set("offset", String(result.length));

      const page = await request(`${resourcePath}?${params.toString()}`);
      pageCount += 1;
      if (!Array.isArray(page) || page.length > requested) throw onIncomplete();
      if (page.length === 0) return { rows: result, pageCount };

      for (const row of page as T[]) {
        const key = row && typeof row[uniqueOrderColumn] === "string" ? String(row[uniqueOrderColumn]) : "";
        if (!key || seen.has(key)) throw onIncomplete();
        seen.add(key);
        result.push(row);
      }
      if (result.length > maxRows) throw onIncomplete();
    }
    throw onIncomplete();
  };

  const first = await readSnapshot();
  if (!verifyStableSnapshot || first.pageCount < 2) return first.rows;

  const confirmation = await readSnapshot();
  if (first.rows.length !== confirmation.rows.length
    || first.rows.some((row, index) => stableSerialize(row) !== stableSerialize(confirmation.rows[index]))) {
    throw onIncomplete();
  }
  return first.rows;
}
