import assert from "node:assert/strict";
import { parsePpdbCsv } from "../src/utils/ppdbCsvImport";

const headers = [
  "Nomor pendaftaran", "Nama lengkap", "Jenis kelamin", "Jenjang/kelas", "Asal sekolah", "Telepon",
  "WhatsApp", "Email", "NIK", "NISN", "Tempat lahir", "Tanggal lahir", "Alamat", "Nama ayah",
  "Pekerjaan ayah", "Pendidikan ayah", "Nama ibu", "Pekerjaan ibu", "Pendidikan ibu", "Penghasilan keluarga",
];
const values = [
  "PPDB-2026-0001", "Nama, Dengan Koma", "perempuan", "VII", "Sekolah Contoh", "081234567890",
  "081234567890", "CONTOH@EMAIL.ID", "0012345678901234", "0012345678", "Kota Baru", "2012-01-02",
  "Jalan \"Aman\", Nomor 2", "Nama Ayah", "Guru", "SMA", "Nama Ibu", "Wiraswasta", "SMA", "Menengah",
];
const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
const csv = (rows: string[][]) => rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
const makeFile = (content: string, name = "ppdb.csv") => new File([content], name, { type: "text/csv" });

const parsed = await parsePpdbCsv(makeFile(csv([headers, values])));
assert.equal(parsed.length, 1);
assert.equal(parsed[0].registrationId, "PPDB-2026-0001");
assert.equal(parsed[0].name, "Nama, Dengan Koma");
assert.equal(parsed[0].gender, "P");
assert.equal(parsed[0].nik, "0012345678901234", "CSV parsing must preserve leading zeroes in identity numbers.");
assert.equal(parsed[0].nisn, "0012345678", "CSV parsing must preserve leading zeroes in NISN.");
assert.equal(parsed[0].address, 'Jalan "Aman", Nomor 2', "CSV escaped quotes and commas must be preserved.");
assert.equal(parsed[0].email, "contoh@email.id");
assert.equal(parsed[0].fatherJob, "Guru");
assert.equal(parsed[0].motherEducation, "SMA");

await assert.rejects(() => parsePpdbCsv(makeFile(csv([["Nama lengkap"], ["Nama"]]))), /Kolom wajib belum tersedia/);
await assert.rejects(() => parsePpdbCsv(makeFile(csv([[...headers, "registrationid"], [...values, "Lain"]]))), /muncul lebih dari sekali/);
await assert.rejects(() => parsePpdbCsv(makeFile(csv([headers, ...Array.from({ length: 101 }, (_, index) => [...values.slice(0, 1), `Nama ${index}`, ...values.slice(2)])]))), /maksimal 100/);
await assert.rejects(() => parsePpdbCsv(makeFile(csv([headers, values]), "ppdb.xlsx")), /berkas CSV/);

console.log("PPDB CSV parsing and privacy-safe input checks passed.");
