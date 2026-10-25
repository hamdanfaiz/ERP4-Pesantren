type PostgrestRequest = (path: string) => Promise<unknown>;

type PostgrestPageOptions = {
  request: PostgrestRequest;
  path: string;
  maxRows: number;
  uniqueOrderColumn?: string;
  pageSize?: number;
  onIncomplete: () => Error;
};

/**
 * Reads a bounded PostgREST result in pages below the project's configured
 * max_rows. Stable ordering and duplicate checks make concurrent inserts that
 * shift offset pages fail closed instead of returning a misleading snapshot.
 */
export async function readPostgrestRowsInPages<T extends Record<string, unknown>>({
  request,
  path,
  maxRows,
  uniqueOrderColumn = "id",
  pageSize = 500,
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

  const result: T[] = [];
  const seen = new Set<string>();
  const maxPages = Math.ceil((maxRows + 1) / pageSize) + 1;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const requested = Math.min(pageSize, maxRows + 1 - result.length);
    if (requested < 1) break;
    const params = new URLSearchParams(baseParams);
    params.set("limit", String(requested));
    params.set("offset", String(result.length));

    const page = await request(`${resourcePath}?${params.toString()}`);
    if (!Array.isArray(page) || page.length > requested) throw onIncomplete();
    if (page.length === 0) return result;

    for (const row of page as T[]) {
      const key = row && typeof row[uniqueOrderColumn] === "string" ? String(row[uniqueOrderColumn]) : "";
      if (!key || seen.has(key)) throw onIncomplete();
      seen.add(key);
      result.push(row);
    }
    if (result.length > maxRows) throw onIncomplete();
  }
  throw onIncomplete();
}
