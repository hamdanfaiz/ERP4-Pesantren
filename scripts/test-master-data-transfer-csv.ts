import assert from "node:assert/strict";
import { encodeTransferCsv, parseTransferCsv } from "../src/utils/dataTransferCsv";

const headers = ["id", "name", "nis", "note"];
const records = [
  { id: "00012", name: "Amin, \"Faiz\"", nis: "001234", note: "baris satu\nbaris dua" },
  { id: "00200", name: "Santri kedua", nis: "000009", note: "" },
  { id: "00300", name: "=HYPERLINK(\"https://example.invalid\")", nis: "000010", note: "'=literal" },
];

const encoded = encodeTransferCsv(headers, records);
assert.ok(encoded.startsWith("\uFEFF"), "CSV export should include a UTF-8 BOM for spreadsheet compatibility.");
assert.ok(encoded.includes("\"'=HYPERLINK"), "Formula-like content must be apostrophe-prefixed before spreadsheet export.");
assert.deepEqual(parseTransferCsv(encoded, headers), records, "Quoted commas, quotes, newlines, leading zeros, and apostrophes must round-trip.");

assert.throws(() => parseTransferCsv("id,ID\n1,2", headers), /berulang/, "Case-insensitive duplicate headers must be rejected.");
assert.throws(() => parseTransferCsv("id,unknown\n1,2", headers), /tidak dikenali/, "Unknown headers must be rejected.");
assert.throws(() => parseTransferCsv("id,name\n1", headers), /Jumlah kolom/, "Rows with mismatched column counts must be rejected.");
assert.throws(() => parseTransferCsv('id,name\n1,"unfinished', headers), /tidak berpasangan/, "Unclosed quoted cells must be rejected.");
assert.throws(() => parseTransferCsv('id,name\n1,"closed"x', headers), /isi setelah tanda kutip/, "Characters after a quoted cell must be rejected.");
assert.throws(() => parseTransferCsv('id,name\n1,un"escaped', headers), /posisi yang tidak valid/, "Stray quotes in unquoted cells must be rejected.");
assert.throws(() => parseTransferCsv("id,name", headers), /header dan sekurangnya satu baris data/, "Header-only templates must not be importable.");
assert.throws(() => parseTransferCsv("id,name\n1," + "x".repeat(2 * 1024 * 1024), headers), /maksimal 2 MB/, "Oversized input must be rejected.");

const tooManyRows = "id,name\n" + Array.from({ length: 251 }, (_, index) => `${index + 1},Santri`).join("\n");
assert.throws(() => parseTransferCsv(tooManyRows, headers), /dibatasi 250 baris/, "Imports above the row limit must be rejected.");

console.log("Master Data CSV safety checks passed: round-trip, formula escaping, header/shape validation, malformed quotes, and size/row limits.");
