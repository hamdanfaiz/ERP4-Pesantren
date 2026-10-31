export type CsvTransferRow = Record<string, string>;

const MAX_CSV_CHARACTERS = 2 * 1024 * 1024;
const MAX_CSV_ROWS = 250;

export function parseTransferCsv(text: string, allowedHeaders: string[]): CsvTransferRow[] {
  if (text.length > MAX_CSV_CHARACTERS) throw new Error("Ukuran CSV maksimal 2 MB.");
  const source = text.replace(/^\uFEFF/, "");
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) table.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV memiliki tanda kutip yang tidak berpasangan.");
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) table.push(row);
  if (table.length < 2) throw new Error("CSV harus memiliki header dan sekurangnya satu baris data.");
  if (table.length - 1 > MAX_CSV_ROWS) throw new Error("Impor dibatasi 250 baris per berkas.");

  const headers = table[0].map((header) => header.trim());
  const lowerHeaders = headers.map((header) => header.toLocaleLowerCase("id-ID"));
  if (headers.some((header) => !header)) throw new Error("Nama kolom tidak boleh kosong.");
  if (new Set(lowerHeaders).size !== lowerHeaders.length) throw new Error("CSV memiliki nama kolom yang berulang.");

  const allowed = new Map(allowedHeaders.map((header) => [header.toLocaleLowerCase("id-ID"), header]));
  const canonicalHeaders = lowerHeaders.map((header) => {
    const canonical = allowed.get(header);
    if (!canonical) throw new Error("Kolom \"" + header + "\" tidak dikenali dalam templat ini.");
    return canonical;
  });

  return table.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error("Jumlah kolom pada baris " + (index + 2) + " tidak sama dengan header.");
    }
    const record: CsvTransferRow = {};
    canonicalHeaders.forEach((header, column) => {
      let value = values[column].trim();
      // Ekspor CSV menambahkan apostrof untuk melindungi sel dari formula spreadsheet.
      if (/^''(?=[\s\u0000-\u001f]*[=+\-@])/.test(value)) value = value.slice(1);
      else if (/^'[\s\u0000-\u001f]*[=+\-@]/.test(value)) value = value.slice(1);
      record[header] = value;
    });
    return record;
  });
}

function safeSpreadsheetText(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/^'[\s\u0000-\u001f]*[=+\-@]/.test(text)) return "'" + text;
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? "'" + text : text;
}

export function encodeTransferCsv(headers: string[], records: Array<Record<string, unknown>>) {
  const escape = (value: unknown) => "\"" + safeSpreadsheetText(value).replace(/"/g, "\"\"") + "\"";
  return "\uFEFF" + [
    headers.map(escape).join(","),
    ...records.map((record) => headers.map((header) => escape(record[header])).join(",")),
  ].join("\r\n");
}

export function downloadTransferCsv(filename: string, headers: string[], records: Array<Record<string, unknown>>) {
  const blob = new Blob([encodeTransferCsv(headers, records)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
