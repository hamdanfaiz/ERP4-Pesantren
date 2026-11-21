export const TAHFIDZ_REPORT_EXPORT_PAGE_SIZE = 500;
export const TAHFIDZ_REPORT_EXPORT_MAX_RECORDS = 10_000;

export type TahfidzReportPage<T> = {
  records: T[];
  hasMore: boolean;
  nextCursor?: string | null;
};

/** Load a complete report or fail; never return a silently truncated export. */
export async function loadTahfidzReportPages<T>(
  fetchPage: (cursor: string | null) => Promise<TahfidzReportPage<T>>,
): Promise<T[]> {
  const records: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  const maxPages = Math.ceil(TAHFIDZ_REPORT_EXPORT_MAX_RECORDS / TAHFIDZ_REPORT_EXPORT_PAGE_SIZE) + 1;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await fetchPage(cursor);
    if (!page || !Array.isArray(page.records) || typeof page.hasMore !== "boolean"
      || page.records.length > TAHFIDZ_REPORT_EXPORT_PAGE_SIZE) {
      throw new Error("Halaman laporan Tahfidz tidak valid. Laporan tidak diunduh.");
    }

    records.push(...page.records);
    if (records.length > TAHFIDZ_REPORT_EXPORT_MAX_RECORDS) {
      throw new Error("Laporan melebihi batas 10.000 catatan. Persempit rentang tanggal lalu coba kembali.");
    }
    if (!page.hasMore) return records;
    if (records.length >= TAHFIDZ_REPORT_EXPORT_MAX_RECORDS) {
      throw new Error("Laporan melebihi batas 10.000 catatan. Persempit rentang tanggal lalu coba kembali.");
    }

    const nextCursor = typeof page.nextCursor === "string" ? page.nextCursor : "";
    if (!nextCursor || seenCursors.has(nextCursor) || page.records.length === 0) {
      throw new Error("Halaman laporan Tahfidz tidak berurutan. Laporan tidak diunduh.");
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  throw new Error("Laporan Tahfidz belum dapat dimuat secara lengkap. Persempit rentang tanggal lalu coba kembali.");
}

export function nextCalendarDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Tanggal laporan tidak valid.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Tanggal laporan tidak valid.");
  }
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
