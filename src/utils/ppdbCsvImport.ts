import * as XLSX from "xlsx";

export type PpdbCsvCandidate = {
  registrationId: string; name: string; gender: "L" | "P"; grade: string; previousSchool: string;
  phone: string; whatsappPhone: string; email: string; nik: string; nisn: string; pob: string; dob: string;
  address: string; fatherName: string; motherName: string; fatherJob: string; motherJob: string;
  fatherEducation: string; motherEducation: string; familyIncome: string;
};

const MAX_CSV_BYTES = 1024 * 1024;
const REQUIRED_FIELDS: Array<keyof PpdbCsvCandidate> = [
  "registrationId", "name", "gender", "grade", "previousSchool", "phone", "whatsappPhone", "nik",
  "pob", "dob", "address", "fatherName", "motherName",
];

const HEADER_ALIASES: Record<keyof PpdbCsvCandidate, string[]> = {
  registrationId: ["registrationid", "nomorpendaftaran", "nopendaftaran", "nomorregistrasi"],
  name: ["name", "namalengkap", "namacalon", "namacalon-santri"],
  gender: ["gender", "jeniskelamin"],
  grade: ["grade", "jenjang", "jenjangkelas", "kelastujuan"],
  previousSchool: ["previousschool", "asalsekolah", "sekolahasal"],
  phone: ["phone", "telepon", "nomortelepon", "nohpcalon"],
  whatsappPhone: ["whatsapp", "whatsappphone", "nomorwhatsapp", "nowa"],
  email: ["email", "alamatemail"],
  nik: ["nik"],
  nisn: ["nisn"],
  pob: ["pob", "tempatlahir"],
  dob: ["dob", "tanggallahir"],
  address: ["address", "alamat"],
  fatherName: ["fathername", "namaayah"],
  motherName: ["mothername", "namaibu"],
  fatherJob: ["fatherjob", "pekerjaanayah"],
  motherJob: ["motherjob", "pekerjaanibu"],
  fatherEducation: ["fathereducation", "pendidikanayah"],
  motherEducation: ["mothereducation", "pendidikanibu"],
  familyIncome: ["familyincome", "penghasilankeluarga"],
};

function normalizeHeader(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("id-ID").replace(/[\s._/-]+/g, "");
}

function cellText(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

export async function parsePpdbCsv(file: File): Promise<PpdbCsvCandidate[]> {
  if (!file.name.toLocaleLowerCase("id-ID").endsWith(".csv")) {
    throw new Error("Pilih berkas CSV. Berkas Excel belum didukung untuk impor ini.");
  }
  if (file.size < 1 || file.size > MAX_CSV_BYTES) {
    throw new Error("Ukuran berkas CSV harus lebih kecil dari 1 MB.");
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array", codepage: 65001, raw: true });
  } catch {
    throw new Error("Berkas CSV tidak dapat dibaca. Simpan sebagai CSV UTF-8 lalu coba kembali.");
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error("Berkas CSV tidak memiliki data.");

  const records = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false });
  const headerRow = records[0];
  if (!Array.isArray(headerRow) || headerRow.length === 0) throw new Error("Baris judul kolom CSV tidak ditemukan.");

  const columnByField = new Map<keyof PpdbCsvCandidate, number>();
  for (let column = 0; column < headerRow.length; column += 1) {
    const header = normalizeHeader(headerRow[column]);
    if (!header) continue;
    const field = (Object.keys(HEADER_ALIASES) as Array<keyof PpdbCsvCandidate>)
      .find((key) => HEADER_ALIASES[key].some((alias) => normalizeHeader(alias) === header));
    if (!field) continue;
    if (columnByField.has(field)) throw new Error(`Kolom “${field}” muncul lebih dari sekali. Sisakan satu kolom saja.`);
    columnByField.set(field, column);
  }

  const missing = REQUIRED_FIELDS.filter((field) => !columnByField.has(field));
  if (missing.length) {
    const labels: Record<string, string> = {
      registrationId: "Nomor pendaftaran", name: "Nama lengkap", gender: "Jenis kelamin", grade: "Jenjang/kelas",
      previousSchool: "Asal sekolah", phone: "Telepon", whatsappPhone: "WhatsApp", nik: "NIK", pob: "Tempat lahir",
      dob: "Tanggal lahir", address: "Alamat", fatherName: "Nama ayah", motherName: "Nama ibu",
    };
    throw new Error(`Kolom wajib belum tersedia: ${missing.map((field) => labels[field]).join(", ")}.`);
  }

  const candidates: PpdbCsvCandidate[] = [];
  for (const cells of records.slice(1)) {
    if (!Array.isArray(cells) || cells.every((cell) => !cellText(cell))) continue;
    const candidate = Object.fromEntries((Object.keys(HEADER_ALIASES) as Array<keyof PpdbCsvCandidate>)
      .map((field) => [field, columnByField.has(field) ? cellText(cells[columnByField.get(field)!]) : ""])) as PpdbCsvCandidate;
    const gender = candidate.gender.trim().toLocaleLowerCase("id-ID");
    candidate.gender = gender === "p" || gender === "perempuan" || gender === "wanita" ? "P" : gender === "l" || gender === "laki-laki" || gender === "laki laki" || gender === "pria" ? "L" : candidate.gender as "L" | "P";
    candidate.email = candidate.email.toLocaleLowerCase("id-ID");
    candidates.push(candidate);
    if (candidates.length > 100) throw new Error("Impor dibatasi maksimal 100 pendaftar per berkas. Pisahkan CSV menjadi beberapa bagian.");
  }
  if (!candidates.length) throw new Error("Tidak ada baris pendaftar untuk dipratinjau.");
  return candidates;
}
