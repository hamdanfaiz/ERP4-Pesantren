import React, { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Download, RefreshCw, ShieldCheck } from "lucide-react";
import { listSupabaseMasterDataAuditPage, type SupabaseMasterDataAuditEntry } from "../services/masterDataApi";

const actionLabels: Record<SupabaseMasterDataAuditEntry["action"], string> = {
  created: "Ditambahkan",
  updated: "Diperbarui",
  archived: "Diarsipkan",
  deleted: "Dihapus",
};

const entityLabels: Record<SupabaseMasterDataAuditEntry["entityType"], string> = {
  student: "Santri",
  structure: "Struktur",
};

const fieldLabels: Record<string, string> = {
  name: "nama",
  identity: "identitas",
  gender: "jenis kelamin",
  grade: "jenjang",
  class_id: "kelas",
  room_id: "kamar",
  building_id: "gedung",
  details: "rincian",
  status: "status",
  parent_id: "induk struktur",
  capacity: "kapasitas",
  occupied: "jumlah penghuni",
  gender_code: "ketentuan gender",
  location: "lokasi",
  attributes: "atribut tambahan",
  record: "record",
};

const sourceLabels: Record<SupabaseMasterDataAuditEntry["changeSource"], string> = {
  master_data: "Data Induk",
  master_data_import: "Impor Data Induk",
  ppdb_onboarding: "PPDB",
  boarding_runtime: "Operasional Asrama",
  legacy_import: "Migrasi lama",
  system: "Sistem",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Waktu tidak valid"
    : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(date);
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^\s*[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadPageCsv(records: SupabaseMasterDataAuditEntry[]) {
  const headers = ["id", "waktu_wib", "jenis_data", "kategori", "id_record", "aksi", "kolom_berubah", "aktor_uid", "sumber"];
  const rows = records.map((record) => [
    record.id,
    formatDate(record.occurredAt),
    entityLabels[record.entityType],
    record.entityCategory || "",
    record.entityId,
    actionLabels[record.action],
    record.changedFields.map((field) => fieldLabels[field] || field).join("; "),
    record.actorUserId || "Sistem",
    sourceLabels[record.changeSource],
  ]);
  const content = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `jejak-audit-data-induk-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function SupabaseMasterDataAuditPanel() {
  const [page, setPage] = useState<{ records: SupabaseMasterDataAuditEntry[]; hasMore: boolean; nextCursor: string | null }>({ records: [], hasMore: false, nextCursor: null });
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [action, setAction] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const notifyReloadRef = useRef(false);
  const cursor = cursors[cursors.length - 1] ?? null;

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    void listSupabaseMasterDataAuditPage({ cursor, pageSize: 50, action, entityType })
      .then((result) => {
        if (!current) return;
        setPage({ records: result.records, hasMore: result.hasMore, nextCursor: result.nextCursor });
        if (notifyReloadRef.current) {
          setNotice("Jejak audit berhasil dimuat ulang.");
          notifyReloadRef.current = false;
        }
      })
      .catch((cause: unknown) => {
        if (!current) return;
        notifyReloadRef.current = false;
        setNotice("");
        setError(cause instanceof Error ? cause.message : "Jejak audit belum dapat dimuat.");
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [cursor, action, entityType, reloadKey]);

  const visibleRecords = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("id-ID");
    if (!normalized) return page.records;
    return page.records.filter((record) => [
      record.id,
      record.actorUserId || "",
      record.entityId,
      entityLabels[record.entityType],
      record.entityCategory || "",
      actionLabels[record.action],
      record.changedFields.join(" "),
    ].join(" ").toLocaleLowerCase("id-ID").includes(normalized));
  }, [page.records, search]);

  const resetPaging = (update: () => void) => {
    setCursors([null]);
    update();
  };

  return (
    <section className="flex-1 min-h-full bg-slate-50 dark:bg-[#0a0a0a]/50">
      <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-950/60 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> Jejak Audit Data Induk
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Riwayat perubahan lintas sesi untuk tenant ini. Nilai data pribadi tidak disimpan di log.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { notifyReloadRef.current = true; setNotice(""); setReloadKey((value) => value + 1); }} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Muat ulang
          </button>
          <button type="button" onClick={() => {
            if (!visibleRecords.length) {
              setError("Tidak ada jejak audit untuk diekspor pada halaman ini.");
              setNotice("");
              return;
            }
            downloadPageCsv(visibleRecords);
            setError("");
            setNotice("Halaman jejak audit berhasil diekspor ke CSV.");
          }} disabled={!visibleRecords.length || loading} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">
            <Download className="h-4 w-4" /> Ekspor halaman
          </button>
        </div>
      </header>

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-400/20 dark:bg-sky-400/5 dark:text-sky-100">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Log memuat jenis aksi, ID internal, UID aktor, dan nama kolom yang berubah. Nilai nama, NIK, NIS, alamat, atau isi record tidak dimasukkan ke log.</p>
        </div>
        {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
        {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_12rem_12rem_auto]">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Cari pada halaman ini
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ID record atau aktor" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-white/15 dark:bg-slate-950 dark:text-white" />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Aksi
            <select value={action} onChange={(event) => resetPaging(() => setAction(event.target.value))} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 dark:border-white/15 dark:bg-slate-950 dark:text-white">
              <option value="all">Semua aksi</option><option value="created">Ditambahkan</option><option value="updated">Diperbarui</option><option value="archived">Diarsipkan</option><option value="deleted">Dihapus</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Jenis data
            <select value={entityType} onChange={(event) => resetPaging(() => setEntityType(event.target.value))} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 dark:border-white/15 dark:bg-slate-950 dark:text-white">
              <option value="all">Semua jenis</option><option value="student">Santri</option><option value="structure">Struktur</option>
            </select>
          </label>
          <div className="flex items-end text-sm text-slate-500 dark:text-slate-400">{page.records.length} catatan pada halaman ini</div>
        </div>

        {error ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/5 dark:text-rose-200">
            <p>{error}</p>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-2 font-semibold underline">Coba lagi</button>
          </div>
        ) : loading ? (
          <div role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-950/50 dark:text-slate-400">Memuat jejak audit tenant…</div>
        ) : page.records.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-white/15 dark:bg-slate-950/40">
            <Activity className="mx-auto h-8 w-8 text-slate-400" />
            <h3 className="mt-3 font-semibold text-slate-800 dark:text-slate-100">Belum ada jejak audit</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Perubahan Data Induk berikutnya akan tercatat di sini.</p>
          </div>
        ) : visibleRecords.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-400">Tidak ada catatan pada halaman ini yang cocok dengan pencarian.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950/50">
            <div className="overflow-x-auto">
              <table className="min-w-[920px] w-full text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600 dark:bg-white/5 dark:text-slate-400">
                  <tr><th className="px-4 py-3">Waktu (WIB)</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Aksi</th><th className="px-4 py-3">ID internal</th><th className="px-4 py-3">Kolom berubah</th><th className="px-4 py-3">Aktor / sumber</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                  {visibleRecords.map((record) => (
                    <tr key={record.id} className="align-top hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(record.occurredAt)}</td>
                      <td className="px-4 py-3"><div className="font-medium text-slate-900 dark:text-slate-100">{entityLabels[record.entityType]}</div><div className="text-xs text-slate-500">{record.entityCategory || ""}</div></td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{actionLabels[record.action]}</td>
                      <td className="max-w-52 break-all px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300" title={record.entityId}>{record.entityId}</td>
                      <td className="max-w-64 px-4 py-3 text-slate-600 dark:text-slate-300">{record.changedFields.map((field) => fieldLabels[field] || field).join(", ") || "—"}</td>
                      <td className="px-4 py-3"><div className="break-all font-mono text-xs text-slate-600 dark:text-slate-300" title={record.actorUserId || "Sistem"}>{record.actorUserId ? record.actorUserId.slice(0, 8) + "…" : "Sistem"}</div><div className="mt-1 text-xs text-slate-500">{sourceLabels[record.changeSource]}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-white/10">
              <span className="text-xs text-slate-500 dark:text-slate-400">Halaman {cursors.length}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCursors((items) => items.length > 1 ? items.slice(0, -1) : items)} disabled={loading || cursors.length <= 1} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"><ChevronLeft className="h-4 w-4" /> Sebelumnya</button>
                <button type="button" onClick={() => page.nextCursor && setCursors((items) => [...items, page.nextCursor])} disabled={loading || !page.hasMore || !page.nextCursor} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5">Berikutnya <ChevronRight className="h-4 w-4" /></button>
              </div>
            </footer>
          </div>
        )}
      </div>
    </section>
  );
}
