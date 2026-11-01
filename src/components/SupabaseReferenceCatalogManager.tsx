import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Archive, Check, Loader2, Plus, RefreshCw, Save, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { ERPTabs } from "./ERPDesignSystem";
import {
  listSupabaseReferenceItems,
  saveSupabaseReferenceItem,
  type SupabaseReferenceDomain,
  type SupabaseReferenceItem,
} from "../services/masterDataApi";

const DOMAINS: Array<{ id: SupabaseReferenceDomain; label: string; help: string }> = [
  { id: "academic_subject", label: "Mata Pelajaran", help: "Dipakai pada jadwal, jurnal KBM, dan penilaian." },
  { id: "academic_curriculum", label: "Kurikulum", help: "Dipakai pada jadwal akademik." },
  { id: "academic_assessment_type", label: "Jenis Penilaian", help: "Dipakai pada pencatatan nilai santri." },
  { id: "facility_resource", label: "Fasilitas", help: "Ruang atau fasilitas yang dapat dipilih pada jadwal dan pemesanan." },
  { id: "finance_fee_type", label: "Jenis Tagihan", help: "Dipakai pada tagihan santri serta pendaftaran PPDB." },
  { id: "finance_expense_category", label: "Kategori Pengeluaran", help: "Dipakai pada pengajuan dan laporan pengeluaran." },
  { id: "marketplace_product_category", label: "Kategori Produk Marketplace", help: "Dipakai pada katalog dan penyaringan produk marketplace." },
  { id: "cooperative_product_category", label: "Kategori Produk Koperasi", help: "Dipakai pada inventaris dan penjualan koperasi." },
  { id: "cooperative_supplier_category", label: "Kategori Pemasok Koperasi", help: "Dipakai pada direktori pemasok koperasi." },
  { id: "library_book_category", label: "Kategori Buku Perpustakaan", help: "Dipakai pada katalog dan pencarian buku perpustakaan." },
  { id: "healthcare_medicine_category", label: "Kategori Obat UKS", help: "Jenis obat atau perlengkapan kesehatan yang tersedia di UKS." },
  { id: "healthcare_medicine_unit", label: "Satuan Obat UKS", help: "Satuan stok obat, seperti tablet, botol, atau dosis." },
  { id: "ga_asset_category", label: "Kategori Aset GA", help: "Klasifikasi aset tetap dan fasilitas operasional." },
  { id: "ga_inventory_category", label: "Kategori Inventaris GA", help: "Klasifikasi barang habis pakai dan persediaan operasional." },
  { id: "ga_inventory_unit", label: "Satuan Inventaris GA", help: "Satuan jumlah barang inventaris, seperti pcs, box, atau kilogram." },
];
const FIELD = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";
const SECONDARY = "inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5";
const PRIMARY = "inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";

function normalizedCode(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

export function SupabaseReferenceCatalogManager() {
  const { user } = useAuth();
  const isAdmin = ["Admin", "SuperAdmin"].includes(String(user?.role || ""));
  const [domain, setDomain] = useState<SupabaseReferenceDomain>(DOMAINS[0].id);
  const [rows, setRows] = useState<SupabaseReferenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<SupabaseReferenceItem | null>(null);
  const [form, setForm] = useState({ code: "", name: "", description: "", status: "active" as "active" | "inactive" });
  const selectedDomain = useMemo(() => DOMAINS.find((item) => item.id === domain) || DOMAINS[0], [domain]);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await listSupabaseReferenceItems(domain, true)); }
    catch (cause: any) { setRows([]); setError(cause?.message || "Katalog referensi belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [domain]);
  useEffect(() => { void refresh(); }, [refresh, user?.tenantId, user?.uid]);

  const startCreate = () => { setEditing(null); setForm({ code: "", name: "", description: "", status: "active" }); setError(""); setNotice(""); };
  const startEdit = (row: SupabaseReferenceItem) => { setEditing(row); setForm({ code: row.code, name: row.name, description: row.description, status: row.status }); setError(""); setNotice(""); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const saved = await saveSupabaseReferenceItem(domain, { ...form, code: normalizedCode(form.code || form.name), organizationUnitId: null }, editing?.id);
      setRows((current) => editing ? current.map((row) => row.id === saved.id ? saved : row) : [...current, saved].sort((a, b) => a.name.localeCompare(b.name, "id")));
      setEditing(null); setForm({ code: "", name: "", description: "", status: "active" });
      setNotice(editing ? "Referensi diperbarui." : "Referensi ditambahkan.");
    } catch (cause: any) { setError(cause?.message || "Referensi belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  if (!isAdmin) return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Pengelolaan kategori referensi hanya tersedia untuk Admin tenant.</section>;

  const tabs = DOMAINS.map((item) => ({ id: item.id, label: item.label }));
  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-lg font-semibold text-slate-900 dark:text-white">Kategori dan referensi tenant</h2><p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Nama menjadi pilihan baku antar-modul. Deskripsi menjelaskan arti atau aturan penggunaannya. Referensi yang sudah dipakai dinonaktifkan, bukan dihapus.</p></div><button type="button" className={SECONDARY} onClick={() => void refresh()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Muat ulang</button></header>
    <ERPTabs tabs={tabs} value={domain} onChange={(value) => { setDomain(value as SupabaseReferenceDomain); setEditing(null); setError(""); setNotice(""); }} ariaLabel="Kategori referensi tenant" />
    <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">{selectedDomain.help}</div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"><Check className="h-4 w-4" />{notice}</div>}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.75fr)]">
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10"><h3 className="font-semibold text-slate-900 dark:text-white">Daftar {selectedDomain.label}</h3><button type="button" className={PRIMARY} onClick={startCreate}><Plus className="h-4 w-4" />Tambah</button></div>
        {loading ? <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat referensi tenant…</div>
          : rows.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">Belum ada {selectedDomain.label.toLocaleLowerCase("id-ID")} pada tenant ini. Tambahkan pilihan agar modul terkait tidak memakai teks bebas.</div>
            : <div className="divide-y divide-slate-100 dark:divide-white/5">{rows.map((row) => <article key={row.id} className="flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="font-medium text-slate-900 dark:text-white">{row.name}</h4><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.status === "active" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{row.status === "active" ? "Aktif" : "Nonaktif"}</span></div><p className="mt-1 font-mono text-xs text-slate-500">{row.code}</p>{row.description && <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">{row.description}</p>}</div><button type="button" onClick={() => startEdit(row)} className={SECONDARY}>Ubah</button></article>)}</div>}
      </div>
      <form onSubmit={save} className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-900 dark:text-white">{editing ? "Ubah referensi" : "Referensi baru"}</h3>{editing && <button type="button" onClick={startCreate} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5" aria-label="Batal mengubah"><X className="h-4 w-4" /></button>}</div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Kode sistem (otomatis)<input required maxLength={80} pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,79}" readOnly disabled={saving} className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 opacity-75 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100" placeholder="Terbentuk otomatis dari nama pilihan" value={form.code} /></label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Nama pilihan<input required maxLength={180} className={FIELD} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value, code: editing || current.code ? current.code : normalizedCode(event.target.value) }))} /></label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Deskripsi<textarea required minLength={8} maxLength={2000} rows={3} className={FIELD} placeholder="Jelaskan arti, cakupan, atau aturan pemakaian; harus berbeda dari nama." value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /><span className="mt-1 block text-xs font-normal text-slate-500">Minimal 8 karakter. Nama menjadi pilihan; deskripsi menjelaskan maknanya.</span></label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Status<select className={FIELD} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>
        {editing?.status === "active" && form.status === "inactive" && <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-400/10 dark:text-amber-100"><Archive className="mt-0.5 h-4 w-4 shrink-0" />Referensi tidak akan muncul pada transaksi baru. Histori yang sudah memakai referensi tetap tersimpan.</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/10"><button type="button" className={SECONDARY} onClick={startCreate} disabled={saving}>Kosongkan</button><button type="submit" className={PRIMARY} disabled={saving || !form.name.trim() || form.description.trim().length < 8 || form.description.trim().toLocaleLowerCase("id-ID") === form.name.trim().toLocaleLowerCase("id-ID")}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "Menyimpan…" : "Simpan"}</button></div>
      </form>
    </div>
  </section>;
}
