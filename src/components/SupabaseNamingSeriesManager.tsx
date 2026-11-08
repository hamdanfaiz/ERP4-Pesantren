import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Hash, Loader2, RefreshCw, Save } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  listSupabaseTenantNamingSeries,
  saveSupabaseTenantNamingSeries,
  type TenantNamingSeries,
  type TenantNamingSeriesKey,
} from "../services/masterDataApi";

const FIELD = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";
const PRIMARY = "inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY = "inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5";

const SERIES_HELP: Record<TenantNamingSeriesKey, string> = {
  nis: "NIS dibuat saat pendaftaran PPDB diterima atau santri baru dicatat di Data Induk. Polanya tetap 10 digit: tahun masuk, kode jenjang, lalu nomor urut 4 digit.",
  ppdb_registration: "Nomor pendaftaran dibuat ketika calon santri baru dicatat atau mengirim pendaftaran publik.",
  employee_number: "Nomor pegawai dibuat otomatis saat data pegawai baru disimpan. Nomor yang sudah terbit tidak berubah saat data pegawai diperbarui.",
  building_code: "Kode gedung dibuat otomatis saat data gedung disimpan. Kode yang sudah terbit tetap dipertahankan.",
  room_code: "Kode kamar dibuat otomatis saat data kamar disimpan dan mengikuti gedungnya.",
  class_code: "Kode kelas dibuat otomatis saat data kelas disimpan dan mengikuti jenjangnya.",
  document_number: "Nomor dokumen dibuat otomatis saat surat atau dokumen dicatat.",
  finance_receipt: "Nomor kuitansi dibuat otomatis saat pembayaran dinyatakan lunas.",
  asset_code: "Kode aset dibuat otomatis saat aset didaftarkan. Kode yang sudah terbit tidak diubah.",
  inventory_item_code: "Kode inventaris dibuat otomatis saat barang didaftarkan. Kode yang sudah terbit tidak diubah.",
  donation_receipt: "Nomor kuitansi donasi dibuat otomatis dan konsisten dengan transaksi serta audit donasi.",
  waqf_asset_code: "Kode aset wakaf dibuat otomatis saat aset dicatat dan tidak dapat diubah setelah terbit.",
  laundry_order_number: "Nomor pesanan laundry dibuat otomatis saat transaksi diterima dan tetap sama saat dicoba ulang.",
  cooperative_product_sku: "Kode internal produk koperasi dibuat otomatis saat produk baru disimpan dan tidak dapat diubah.",
  marketplace_product_sku: "Kode internal produk marketplace dibuat otomatis saat produk baru disimpan dan tidak dapat diubah.",
};

function moduleLabel(moduleId: TenantNamingSeries["moduleId"]) {
  return ({
    "master-data": "Data Induk",
    ppdb: "Penerimaan Santri Baru",
    hris: "Sumber Daya Manusia",
    document: "Dokumen Digital",
    finance: "Keuangan",
    ga: "Sarana dan Inventaris",
    donation: "Donasi dan Wakaf",
    laundry: "Laundry",
    cooperative: "Koperasi",
    marketplace: "Marketplace",
  } as const)[moduleId];
}

function preview(series: TenantNamingSeries) {
  const date = new Date();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return series.formatTemplate
    .replaceAll("{{YEAR}}", year)
    .replaceAll("{{MONTH}}", month)
    .replaceAll("{{GRADE}}", "02")
    .replaceAll("{{SEQ}}", String(series.startNumber).padStart(series.sequenceWidth, "0"));
}

function validTemplate(series: TenantNamingSeries) {
  const template = series.formatTemplate.trim();
  if (!template || template.length > 120 || (template.match(/\{\{SEQ\}\}/g) || []).length !== 1) return false;
  const yearCount = (template.match(/\{\{YEAR\}\}/g) || []).length;
  const monthCount = (template.match(/\{\{MONTH\}\}/g) || []).length;
  if (yearCount > 1 || monthCount > 1) return false;
  const unknown = template.replaceAll("{{YEAR}}", "").replaceAll("{{MONTH}}", "").replaceAll("{{GRADE}}", "").replaceAll("{{SEQ}}", "");
  if (/[{}]/.test(unknown) || /[\u0000-\u001f\u007f]/.test(template)) return false;
  if (series.seriesKey === "nis") {
    return series.sequenceWidth === 4 && series.resetPeriod === "yearly"
      && (template.match(/\{\{YEAR\}\}/g) || []).length === 1
      && (template.match(/\{\{GRADE\}\}/g) || []).length === 1
      && !template.includes("{{MONTH}}") && /^[0-9]{10}$/.test(preview(series));
  }
  if (series.seriesKey === "ppdb_registration") {
    return yearCount === 1
      && !template.includes("{{GRADE}}") && !template.includes("{{MONTH}}")
      && ["never", "yearly"].includes(series.resetPeriod)
      && /^[A-Za-z0-9][A-Za-z0-9./-]{0,49}$/.test(preview(series));
  }
  if (template.includes("{{GRADE}}")
    || (series.resetPeriod === "yearly" && yearCount !== 1)
    || (series.resetPeriod === "monthly" && (yearCount !== 1 || monthCount !== 1))) return false;
  const maxLength = series.seriesKey === "document_number" ? 80
    : series.seriesKey === "cooperative_product_sku" ? 48
      : series.seriesKey === "marketplace_product_sku" ? 40 : 50;
  return preview(series).length <= maxLength
    && new RegExp(`^[A-Za-z0-9][A-Za-z0-9./_-]{0,${maxLength - 1}}$`).test(preview(series));
}

export function SupabaseNamingSeriesManager() {
  const { user } = useAuth();
  const isAdmin = ["Admin", "SuperAdmin"].includes(String(user?.role || ""));
  const [series, setSeries] = useState<TenantNamingSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<TenantNamingSeriesKey | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSeries(await listSupabaseTenantNamingSeries());
    } catch (cause: any) {
      setSeries([]);
      setError("Aturan penomoran belum dapat dimuat. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, user?.tenantId, user?.uid]);

  const update = (key: TenantNamingSeriesKey, changes: Partial<TenantNamingSeries>) => {
    setSeries((current) => current.map((item) => item.seriesKey === key ? { ...item, ...changes } : item));
    setError("");
    setNotice("");
  };

  const save = async (item: TenantNamingSeries) => {
    if (!isAdmin) return;
    if (!Number.isInteger(item.sequenceWidth) || item.sequenceWidth < 1 || item.sequenceWidth > 12
      || !Number.isSafeInteger(item.startNumber) || item.startNumber < 1
      || item.startNumber > Math.pow(10, item.sequenceWidth) - 1 || !validTemplate(item)) {
      setError("Periksa kembali pola, lebar nomor, dan angka awal. Pola harus memakai satu token {{SEQ}}.");
      return;
    }
    if (!item.isActive && !window.confirm("Seri ini akan berhenti menerbitkan nomor baru. Modul terkait akan menolak transaksi baru sampai seri diaktifkan kembali. Lanjutkan?")) return;
    setSavingKey(item.seriesKey);
    setError("");
    setNotice("");
    try {
      const saved = await saveSupabaseTenantNamingSeries({
        seriesKey: item.seriesKey,
        formatTemplate: item.formatTemplate.trim(),
        sequenceWidth: item.sequenceWidth,
        resetPeriod: item.resetPeriod,
        startNumber: item.startNumber,
        isActive: item.isActive,
      });
      setSeries((current) => current.map((row) => row.seriesKey === saved.seriesKey ? saved : row));
      setNotice("Aturan " + saved.displayName + " berhasil disimpan.");
    } catch (cause: any) {
      setError("Aturan penomoran belum dapat disimpan. Silakan coba lagi.");
    } finally {
      setSavingKey(null);
    }
  };

  const sortedSeries = useMemo(() => [...series].sort((a, b) => a.moduleId.localeCompare(b.moduleId)), [series]);

  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 md:p-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"><Hash className="h-5 w-5" /></span>
      <div><h2 className="text-xl font-bold text-slate-900 dark:text-white">Aturan Penomoran</h2><p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Atur pola nomor untuk data di berbagai modul. Nomor dibuat otomatis dan tetap unik; nomor yang sudah terbit tidak akan digunakan kembali.</p></div>
      </div>
      <button type="button" className={SECONDARY} onClick={() => void refresh()} disabled={loading || savingKey !== null}><RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />Muat ulang</button>
    </header>

    <div role="note" className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
      Perubahan pola hanya memengaruhi nomor yang akan dibuat berikutnya. Nomor yang sudah diterbitkan dan nomor historis hasil impor tidak diubah. Nomor impor tetap dipertahankan agar dokumen lama dan rekonsiliasi tetap cocok.
    </div>
    <div role="note" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-950/50 dark:text-slate-300">
      NIS mempertahankan format 10 digit. Nomor dokumen, kuitansi, kode aset, pesanan, dan produk dibuat otomatis; seri yang sudah terbit tidak digunakan ulang.
    </div>
    {!isAdmin && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Hanya Admin yang dapat mengubah aturan penomoran.</div>}
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"><Check className="h-4 w-4" />{notice}</div>}
    {loading ? <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 p-12 text-sm text-slate-500 dark:border-white/10"><Loader2 className="h-4 w-4 animate-spin" />Memuat aturan penomoran…</div>
      : sortedSeries.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500 dark:border-white/10">Aturan penomoran belum tersedia untuk pesantren ini.</div>
        : <div className="grid gap-4 xl:grid-cols-3">{sortedSeries.map((item) => <article key={item.seriesKey} className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900 dark:text-white">{item.displayName}</h3><p className="mt-1 text-xs text-slate-500">{moduleLabel(item.moduleId)}</p></div><label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300"><input type="checkbox" checked={item.isActive} disabled={!isAdmin || savingKey !== null} onChange={(event) => update(item.seriesKey, { isActive: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />Aktif</label></div>
          <p className="min-h-10 text-sm text-slate-600 dark:text-slate-300">{SERIES_HELP[item.seriesKey]}</p>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Pola nomor
            <input value={item.formatTemplate} readOnly={item.seriesKey === "nis"} disabled={!isAdmin || savingKey !== null} onChange={(event) => update(item.seriesKey, { formatTemplate: event.target.value })} maxLength={120} className={FIELD + (item.seriesKey === "nis" ? " cursor-not-allowed opacity-75" : "")} />
          </label>
          <p className="text-[11px] leading-relaxed text-slate-500">Token: <code>{"{{YEAR}}"}</code> tahun, <code>{"{{MONTH}}"}</code> bulan, <code>{"{{GRADE}}"}</code> jenjang NIS, <code>{"{{SEQ}}"}</code> nomor urut wajib.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Lebar nomor<input type="number" min={item.seriesKey === "nis" ? 4 : 1} max={item.seriesKey === "nis" ? 4 : 12} value={item.sequenceWidth} readOnly={item.seriesKey === "nis"} disabled={!isAdmin || savingKey !== null} onChange={(event) => update(item.seriesKey, { sequenceWidth: Number(event.target.value) })} className={FIELD + (item.seriesKey === "nis" ? " cursor-not-allowed opacity-75" : "")} /></label>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Angka awal<input type="number" min={1} max={Math.pow(10, item.sequenceWidth) - 1} value={item.startNumber} disabled={!isAdmin || savingKey !== null} onChange={(event) => update(item.seriesKey, { startNumber: Number(event.target.value) })} className={FIELD} /><span className="mt-1 block font-normal">Jika dinaikkan, nomor yang belum terpakai dilewati agar nomor terbit tidak dipakai ulang.</span></label>
          </div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Pengulangan nomor urut<select value={item.resetPeriod} disabled={!isAdmin || savingKey !== null || item.seriesKey === "nis"} onChange={(event) => update(item.seriesKey, { resetPeriod: event.target.value as TenantNamingSeries["resetPeriod"] })} className={FIELD}><option value="never">Tidak pernah</option><option value="yearly">Setiap tahun</option><option value="monthly">Setiap bulan</option></select></label>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60"><span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Contoh format nomor</span><code className="mt-1 block break-all text-sm font-semibold text-emerald-700 dark:text-emerald-300">{preview(item)}</code><span className="mt-1 block text-[11px] text-slate-500">Contoh pola. Nomor diterbitkan setelah data berhasil disimpan. NIS mengikuti kode jenjang yang dipilih.</span></div>
          <button type="button" className={PRIMARY + " w-full"} onClick={() => void save(item)} disabled={!isAdmin || savingKey !== null || !validTemplate(item)}>{savingKey === item.seriesKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Simpan aturan</button>
        </article>)}</div>}
  </section>;
}
