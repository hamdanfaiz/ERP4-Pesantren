import React, { useState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2, ShieldAlert, Upload, X } from "lucide-react";
import {
  applySupabaseMasterDataImport,
  exportSupabaseMasterDataStudents,
  listSupabaseMasterDataStructures,
  previewSupabaseMasterDataImport,
  type MasterDataTransferKind,
  type MasterDataTransferPreview,
  type MasterDataTransferResult,
  type SupabaseStructureCategory,
} from "../services/masterDataApi";
import { downloadTransferCsv, parseTransferCsv } from "../utils/dataTransferCsv";

const STUDENT_HEADERS = [
  "id", "name", "nis", "gender", "grade", "nik", "nisn", "phone", "email",
  "parentName", "parentPhone", "address", "dormitory", "room", "status",
];
const STRUCTURE_HEADERS = [
  "id", "name", "category", "status", "parentId", "grade", "capacity", "genderRestriction", "location",
];

type Props = {
  isOpen: boolean;
  mode: "export" | "import";
  kind: MasterDataTransferKind;
  structureCategory?: SupabaseStructureCategory;
  onClose: () => void;
  onComplete?: () => void;
};

function safeFilePart(value: string) {
  return value.toLocaleLowerCase("id-ID").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "data";
}

export function MasterDataTransferModal({ isOpen, mode, kind, structureCategory, onClose, onComplete }: Props) {
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [preview, setPreview] = useState<MasterDataTransferPreview | null>(null);
  const [result, setResult] = useState<MasterDataTransferResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | "export" | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  if (!isOpen) return null;

  const headers = kind === "students" ? STUDENT_HEADERS : STRUCTURE_HEADERS;
  const label = kind === "students" ? "Santri" : String(structureCategory || "Struktur");

  const handleExport = async () => {
    if (includeSensitive && !window.confirm("Ekspor ini memuat NIK/NISN dan data kontak. Simpan berkas dengan aman dan batasi aksesnya. Lanjutkan?")) return;
    setBusy("export");
    setError("");
    try {
      const records = kind === "students"
        ? await exportSupabaseMasterDataStudents(includeSensitive)
        : (await listSupabaseMasterDataStructures()).filter((record) => record.category === structureCategory);
      const exportHeaders = kind === "students"
        ? includeSensitive ? STUDENT_HEADERS : ["id", "name", "nis", "gender", "grade", "room", "dormitory", "status"]
        : STRUCTURE_HEADERS;
      const filename = "erp4-" + safeFilePart(label) + "-" + new Date().toISOString().slice(0, 10) + ".csv";
      downloadTransferCsv(filename, exportHeaders, records);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ekspor belum dapat diselesaikan.");
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setPreview(null);
    setResult(null);
    setRows([]);
    setFileName(file.name);
    setBusy("preview");
    try {
      if (!file.name.toLocaleLowerCase("id-ID").endsWith(".csv")) throw new Error("Gunakan berkas CSV dari templat Data Induk.");
      const parsed = parseTransferCsv(await file.text(), headers);
      setRows(parsed);
      const checked = await previewSupabaseMasterDataImport(kind, parsed, structureCategory);
      setPreview(checked);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Berkas belum dapat diperiksa.");
    } finally {
      setBusy(null);
    }
  };

  const handleApply = async () => {
    if (!preview || preview.readyCount < 1 || preview.errorCount > 0) return;
    if (!window.confirm("Impor " + preview.readyCount + " record " + label + " ke tenant aktif? Record yang sudah ada akan dilewati dan tidak ditimpa.")) return;
    setBusy("apply");
    setError("");
    setResult(null);
    try {
      const applied = await applySupabaseMasterDataImport(kind, rows, structureCategory);
      setResult(applied);
      onComplete?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impor belum dapat diterapkan.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="master-data-transfer-title">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-950">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div>
            <h2 id="master-data-transfer-title" className="text-base font-semibold text-slate-900 dark:text-white">
              {mode === "export" ? "Ekspor data " : "Impor data "}{label}
            </h2>
            <p className="mt-1 text-xs text-slate-500">Sumber data tenant aktif · CSV UTF-8 · maksimal 250 baris per impor</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"><X className="h-4 w-4" /></button>
        </header>

        <div className="overflow-y-auto p-5">
          {mode === "export" ? (
            <div className="space-y-4">
              {kind === "students" && (
                <label className="flex cursor-pointer gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-500/20 dark:bg-amber-500/5">
                  <input type="checkbox" checked={includeSensitive} onChange={(event) => setIncludeSensitive(event.target.checked)} className="mt-1 accent-emerald-600" />
                  <span>
                    <span className="block font-semibold text-slate-800 dark:text-slate-100">Sertakan identitas pribadi dan kontak</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600 dark:text-slate-300">Menambahkan NIK, NISN, nomor telepon, surel, alamat, dan kontak wali. Data NIK/NISN tetap terenkripsi di backend dan hanya dibuka untuk berkas unduhan Admin.</span>
                  </span>
                </label>
              )}
              <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600 dark:border-white/10 dark:text-slate-300">
                Ekspor mengambil seluruh data pada tenant yang dapat diakses akun ini, bukan hanya halaman yang sedang tampil. Batasnya {kind === "students" ? "20.000 santri" : "10.000 struktur"} per berkas.
              </div>
              <button type="button" disabled={busy !== null} onClick={() => void handleExport()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">
                {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Unduh CSV
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-500/20 dark:bg-blue-500/5 dark:text-blue-100">
                Berkas harus menggunakan kolom templat untuk {label}. ID sumber yang sudah ada akan dilewati agar tidak menimpa data. Kesalahan harus dibereskan sebelum impor diterapkan.
              </div>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5">
                {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {fileName || "Pilih berkas CSV"}
                <input type="file" accept=".csv,text/csv" onChange={(event) => void handleFile(event)} className="sr-only" disabled={busy !== null} />
              </label>
              <p className="text-xs text-slate-500">Nomor identitas seperti NIS, NIK, NISN, dan nomor telepon harus berupa teks agar angka nol di depan tetap utuh. Impor tidak menghapus data dan tiap baris diproses terpisah.</p>

              {preview && (
                <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-white/10">
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    <span>{preview.rowCount} baris</span>
                    <span className="text-emerald-700 dark:text-emerald-300">{preview.readyCount} siap</span>
                    <span className="text-amber-700 dark:text-amber-300">{preview.skippedCount} dilewati</span>
                    <span className={preview.errorCount ? "text-rose-700 dark:text-rose-300" : "text-slate-500"}>{preview.errorCount} kesalahan</span>
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {preview.items.map((item) => (
                      <div key={item.row} className="flex gap-2 rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-white/[0.03]">
                        {item.status === "ready" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : item.status === "skip" ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />}
                        <div><span className="font-semibold">Baris {item.row} · {item.name || item.id || "tanpa identitas"}</span>{item.messages.map((message) => <p key={message} className="mt-1 text-slate-500">{message}</p>)}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {result && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-500/5 dark:text-emerald-100">
                  Impor selesai: {result.imported} ditambahkan, {result.skipped} dilewati, {result.errorCount} gagal. Setiap baris disimpan terpisah; tinjau rincian kegagalan di bawah.
                  {result.errors.slice(0, 10).map((item) => <p key={item.row} className="mt-1 text-xs">Baris {item.row} ({item.id}): {item.message}</p>)}
                </div>
              )}
            </div>
          )}
          {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-white/10">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5">Tutup</button>
          {mode === "import" && (
            <button type="button" disabled={busy !== null || !preview || preview.readyCount < 1 || preview.errorCount > 0 || Boolean(result)} onClick={() => void handleApply()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">
              {busy === "apply" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Terapkan impor
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
