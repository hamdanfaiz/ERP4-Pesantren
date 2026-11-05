import { createHash } from "node:crypto";

export type DocumentDirection = "incoming" | "outgoing" | "internal";
export type DocumentStatusGroup = "all" | "approval" | "archive";

export type DocumentListFilters = {
  search: string;
  direction: DocumentDirection | null;
  statusGroup: DocumentStatusGroup;
};

const DIRECTIONS = new Set<DocumentDirection>(["incoming", "outgoing", "internal"]);
const STATUS_GROUPS = new Set<DocumentStatusGroup>(["all", "approval", "archive"]);

function singleQueryValue(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError(`Parameter ${label} tidak valid.`);
  return value;
}

export function parseDocumentListFilters(input: {
  search?: unknown;
  direction?: unknown;
  statusGroup?: unknown;
}): DocumentListFilters {
  const rawSearch = singleQueryValue(input.search, "search") || "";
  if (/[\u0000-\u001f\u007f]/.test(rawSearch)) throw new TypeError("Parameter pencarian tidak valid.");
  const search = rawSearch.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (Array.from(search).length > 120) throw new TypeError("Pencarian maksimal 120 karakter.");

  const rawDirection = singleQueryValue(input.direction, "direction");
  const direction = rawDirection && rawDirection !== "all" ? rawDirection : null;
  if (direction && !DIRECTIONS.has(direction as DocumentDirection)) throw new TypeError("Filter jenis dokumen tidak valid.");

  const rawStatusGroup = singleQueryValue(input.statusGroup, "statusGroup") || "all";
  if (!STATUS_GROUPS.has(rawStatusGroup as DocumentStatusGroup)) throw new TypeError("Filter status dokumen tidak valid.");

  return {
    search,
    direction: direction as DocumentDirection | null,
    statusGroup: rawStatusGroup as DocumentStatusGroup,
  };
}

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

export function buildDocumentSearchFilter(search: string): string | null {
  if (!search) return null;
  const literal = search.replace(/[\\%_]/g, "\\$&");
  const pattern = quotePostgrestValue(`%${literal}%`);
  return ["document_number", "subject", "sender_name", "recipient_name", "summary"]
    .map((column) => `${column}.ilike.${pattern}`)
    .join(",");
}

export function buildDocumentListLogicFilter(search: string, cursorCondition?: string): string | null {
  const searchFilter = buildDocumentSearchFilter(search);
  if (searchFilter && cursorCondition) {
    return `and(or(${searchFilter}),or(${cursorCondition}))`;
  }
  return searchFilter || cursorCondition || null;
}

export function documentListFilterFingerprint(filters: DocumentListFilters, tenantId: string): string {
  return createHash("sha256").update(JSON.stringify({ tenantId, filters })).digest("base64url");
}
