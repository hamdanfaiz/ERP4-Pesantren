import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Building2, Check, CircleOff, Loader2, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { pendingMutationIds } from "../utils/pendingMutationId";

type UnitType = "pesantren" | "sekolah" | "klinik" | "usaha" | "yayasan" | "lainnya";
type UnitStatus = "active" | "inactive";
type Unit = {
  id: string;
  code: string;
  name: string;
  unitType: UnitType;
  location: string;
  status: UnitStatus;
  createdAt: string;
  updatedAt: string;
};
type UnitEvent = {
  id: string;
  unitId: string;
  actorUserId: string;
  action: "create" | "update" | "set_status";
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  createdAt: string;
};
type Snapshot = { units: Unit[]; events: UnitEvent[] };
type UnmappedCandidate = { id: string; name: string; registrationId: string; stage: string | null; createdAt: string | null; hasLinkedStudent: boolean };
type UnmappedStudent = { id: string; name: string; nis: string; grade: string | null };
type UnmappedSnapshot = { candidates: UnmappedCandidate[]; candidateCount: number; students: UnmappedStudent[]; studentCount: number; limit: number; offset: number };
type Draft = { code: string; name: string; unitType: UnitType; location: string };

const EMPTY: Snapshot = { units: [], events: [] };
const EMPTY_UNMAPPED: UnmappedSnapshot = { candidates: [], candidateCount: 0, students: [], studentCount: 0, limit: 100, offset: 0 };
const EMPTY_DRAFT: Draft = { code: "", name: "", unitType: "pesantren", location: "" };
const FIELD = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const PRIMARY = "inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
const OUTLINE = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5";

const UNIT_TYPES: Array<{ value: UnitType; label: string }> = [
  { value: "pesantren", label: "Pesantren" }, { value: "sekolah", label: "Sekolah" },
  { value: "klinik", label: "Klinik" }, { value: "usaha", label: "Unit usaha" },
  { value: "yayasan", label: "Yayasan" }, { value: "lainnya", label: "Lainnya" },
];

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

async function requestUnits(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Layanan Manajemen Multi-Unit belum dapat diproses.");
  return body;
}

function typeLabel(value: UnitType) {
  return UNIT_TYPES.find((item) => item.value === value)?.label || "Lainnya";
}

function actionLabel(value: UnitEvent["action"]) {
  return value === "create" ? "Unit dibuat" : value === "update" ? "Data unit diperbarui" : "Status unit diubah";
}

export function SupabaseEnterpriseUnitsManager() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [unmapped, setUnmapped] = useState<UnmappedSnapshot>(EMPTY_UNMAPPED);
  const [loading, setLoading] = useState(true);
  const [mappingLoading, setMappingLoading] = useState(true);
  const [backendReady, setBackendReady] = useState(false);
  const [mappingReady, setMappingReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mappingRequest, setMappingRequest] = useState("");
  const [mappingSelections, setMappingSelections] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [mappingError, setMappingError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const refresh = useCallback(async () => {
    try {
      const result = await requestUnits("/api/enterprise/units/snapshot");
      setSnapshot({ units: Array.isArray(result.units) ? result.units : [], events: Array.isArray(result.events) ? result.events : [] });
      setBackendReady(true);
    } catch (error) {
      setBackendReady(false);
      throw error;
    }
  }, []);

  const refreshUnmapped = useCallback(async (offset = 0) => {
    setMappingLoading(true);
    setMappingError("");
    try {
      const result = await requestUnits(`/api/enterprise/master-data/unit-assignment/unmapped?offset=${offset}`);
      setUnmapped({
        candidates: Array.isArray(result.candidates) ? result.candidates : [],
        candidateCount: Number(result.candidateCount || 0),
        students: Array.isArray(result.students) ? result.students : [],
        studentCount: Number(result.studentCount || 0),
        limit: Number(result.limit || 100),
        offset: Number(result.offset || 0),
      });
      setMappingReady(true);
    } catch (loadError: unknown) {
      setMappingReady(false);
      setMappingError(loadError instanceof Error ? loadError.message : "Daftar data yang belum memiliki unit tidak dapat dimuat.");
    } finally { setMappingLoading(false); }
  }, []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setBackendReady(false);
    setError("");
    requestUnits("/api/enterprise/units/snapshot")
      .then((result) => {
        if (current) {
          setSnapshot({ units: Array.isArray(result.units) ? result.units : [], events: Array.isArray(result.events) ? result.events : [] });
          setBackendReady(true);
        }
      })
      .catch((loadError: unknown) => { if (current) { setBackendReady(false); setError(loadError instanceof Error ? loadError.message : "Data unit belum dapat dimuat."); } })
      .finally(() => { if (current) setLoading(false); });
    void refreshUnmapped();
    return () => { current = false; };
  }, [refresh, refreshUnmapped, user?.tenantId, user?.uid]);

  const filteredUnits = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("id-ID");
    if (!needle) return snapshot.units;
    return snapshot.units.filter((unit) => [unit.code, unit.name, unit.location, typeLabel(unit.unitType), unit.status]
      .some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(needle)));
  }, [query, snapshot.units]);

  const resetForm = () => { setFormOpen(false); setEditingId(null); setDraft(EMPTY_DRAFT); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!backendReady) { setError("Layanan unit belum siap. Muat ulang data sebelum menyimpan."); return; }
    if (!user?.tenantId || !user.uid) { setError("Profil tenant tidak tersedia. Muat ulang sesi Anda."); return; }
    const payload = { action: editingId ? "update" : "create", ...(editingId ? { unitId: editingId } : {}), unit: draft };
    setSaving(true); setError(""); setNotice("");
    try {
      const lease = await pendingMutationIds.acquire(`erp:enterprise-unit:${payload.action}`, {
        tenantId: user.tenantId, actorId: user.uid, unitId: editingId, unit: draft,
      });
      await requestUnits("/api/enterprise/units/mutations", {
        method: "POST", body: JSON.stringify({ ...payload, clientRequestId: lease.requestId }),
      });
      lease.clear();
      resetForm();
      setNotice(editingId ? "Perubahan unit tersimpan." : "Unit baru berhasil ditambahkan.");
      try { await refresh(); }
      catch { setError("Perubahan tersimpan, tetapi daftar belum dapat dimuat ulang. Gunakan tombol muat ulang."); }
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Perubahan unit belum berhasil disimpan.");
    } finally { setSaving(false); }
  };

  const toggleStatus = async (unit: Unit) => {
    if (!backendReady || !user?.tenantId || !user.uid) return;
    const status = unit.status === "active" ? "inactive" : "active";
    setSaving(true); setError(""); setNotice("");
    try {
      const lease = await pendingMutationIds.acquire("erp:enterprise-unit:set_status", {
        tenantId: user.tenantId, actorId: user.uid, unitId: unit.id, status,
      });
      await requestUnits("/api/enterprise/units/mutations", {
        method: "POST", body: JSON.stringify({ action: "set_status", unitId: unit.id, status, clientRequestId: lease.requestId }),
      });
      lease.clear();
      setNotice(status === "active" ? "Unit diaktifkan kembali." : "Unit dinonaktifkan.");
      try { await refresh(); }
      catch { setError("Status tersimpan, tetapi daftar belum dapat dimuat ulang. Gunakan tombol muat ulang."); }
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Status unit belum berhasil diubah.");
    } finally { setSaving(false); }
  };

  const assignUnit = async (entityType: "candidate" | "student", entityId: string, unitId: string) => {
    if (!mappingReady || !user?.tenantId || !user.uid || !unitId) return;
    const record = entityType === "candidate"
      ? unmapped.candidates.find((item) => item.id === entityId)
      : unmapped.students.find((item) => item.id === entityId);
    const label = record?.name || "data ini";
    const selectedUnit = snapshot.units.find((item) => item.id === unitId);
    if (!selectedUnit || !window.confirm(`Tetapkan ${label} ke unit ${selectedUnit.name}? Pemetaan data operasional ini tidak dapat dibatalkan.`)) return;
    const key = `${entityType}:${entityId}`;
    setMappingRequest(key); setMappingError(""); setNotice("");
    try {
      const lease = await pendingMutationIds.acquire("erp:master-data-unit-assignment", {
        tenantId: user.tenantId, actorId: user.uid, entityType, entityId, unitId,
      });
      await requestUnits("/api/enterprise/master-data/unit-assignment", {
        method: "POST",
        body: JSON.stringify({ entityType, entityId, unitId, clientRequestId: lease.requestId }),
      });
      lease.clear();
      setNotice(`${label} berhasil dipetakan ke unit ${selectedUnit.name}.`);
      await refreshUnmapped(unmapped.offset);
    } catch (mappingSaveError: unknown) {
      setMappingError(mappingSaveError instanceof Error ? mappingSaveError.message : "Pemetaan unit belum berhasil disimpan.");
    } finally { setMappingRequest(""); }
  };

  const changeMappingPage = (offset: number) => { void refreshUnmapped(offset); };

  const startEdit = (unit: Unit) => {
    setEditingId(unit.id);
    setDraft({ code: unit.code, name: unit.name, unitType: unit.unitType, location: unit.location });
    setFormOpen(true);
    setError(""); setNotice("");
  };

  const activeCount = snapshot.units.filter((unit) => unit.status === "active").length;
  const canMapMasterData = user?.role === "SuperAdmin"
    || (user?.role === "Admin" && user.modulePermissions?.["master-data"] !== false);

  return (
    <section className="mx-auto max-w-7xl space-y-6" aria-labelledby="enterprise-units-title">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">Organisasi pesantren</p>
          <h1 id="enterprise-units-title" className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Manajemen Multi-Unit</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">Kelola daftar unit di dalam tenant pesantren. Perubahan dicatat pada riwayat audit dan aman untuk dicoba ulang saat koneksi terputus.</p>
        </div>
        <button type="button" className={PRIMARY} disabled={loading || saving || !backendReady} onClick={() => { setEditingId(null); setDraft(EMPTY_DRAFT); setFormOpen(true); setError(""); setNotice(""); }}>
          <Plus className="h-4 w-4" /> Tambah unit
        </button>
      </header>

      {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      {notice && <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"><Check className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span></div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><p className="text-sm text-slate-500 dark:text-slate-400">Total unit</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{loading ? "—" : snapshot.units.length}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><p className="text-sm text-slate-500 dark:text-slate-400">Unit aktif</p><p className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{loading ? "—" : activeCount}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><p className="text-sm text-slate-500 dark:text-slate-400">Peristiwa audit</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{loading ? "—" : snapshot.events.length}</p></div>
      </div>

      <aside className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
        Data tagihan, Akademik, Asrama, dan data operasional lain masih memerlukan pemetaan unit dan penyelesaian isolasi per modul. Record lama tidak ditebak unitnya; Admin harus menetapkan unit yang benar secara eksplisit.
      </aside>

      {canMapMasterData && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" aria-labelledby="unit-assignment-title">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 id="unit-assignment-title" className="font-semibold text-slate-900 dark:text-white">Pemetaan calon santri dan santri</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pemetaan tersimpan sekali. Jika calon santri sudah menjadi santri, keduanya dipetakan dalam satu transaksi.</p></div>
          <div className="flex items-center gap-2"><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{unmapped.candidateCount + unmapped.studentCount} belum dipetakan</span><button type="button" className={OUTLINE} onClick={() => changeMappingPage(unmapped.offset)} disabled={mappingLoading || Boolean(mappingRequest)} aria-label="Muat ulang data yang belum memiliki unit"><RefreshCw className={`h-4 w-4 ${mappingLoading ? "animate-spin" : ""}`} /></button></div>
        </div>
        {mappingError && <div role="alert" className="m-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{mappingError}</span></div>}
        {mappingLoading ? <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat data yang belum dipetakan…</div>
          : !mappingReady ? <div className="p-8 text-center text-sm text-slate-500">Pemetaan belum tersedia pada konfigurasi runtime ini.</div>
          : unmapped.candidateCount + unmapped.studentCount === 0 ? <div className="p-8 text-center text-sm text-slate-500">Semua calon santri dan santri telah memiliki unit.</div>
          : <>
            {unmapped.candidates.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><caption className="px-4 pb-2 pt-4 text-left font-semibold text-slate-800 dark:text-slate-200">Calon santri tanpa unit ({unmapped.candidateCount})</caption><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/50 dark:text-slate-400"><tr><th className="px-4 py-3">Calon santri</th><th className="px-4 py-3">Pendaftaran</th><th className="px-4 py-3">Tahap</th><th className="px-4 py-3">Unit yang benar</th><th className="px-4 py-3 text-right">Tindakan</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{unmapped.candidates.map((candidate) => { const selectionKey = `candidate:${candidate.id}`; const selected = mappingRequest === selectionKey; const chosenUnitId = mappingSelections[selectionKey] || ""; return <tr key={selectionKey}><td className="px-4 py-3"><p className="font-medium text-slate-900 dark:text-white">{candidate.name}</p>{candidate.hasLinkedStudent && <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Sudah menjadi santri; unit akan tersinkron</p>}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{candidate.registrationId}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{candidate.stage || "—"}</td><td className="px-4 py-3"><select aria-label={`Unit untuk calon santri ${candidate.name}`} className={FIELD} disabled={Boolean(mappingRequest)} value={chosenUnitId} onChange={(event) => setMappingSelections((current) => ({ ...current, [selectionKey]: event.target.value }))}><option value="">Pilih unit</option>{snapshot.units.filter((unit) => unit.status === "active").map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></td><td className="px-4 py-3 text-right"><button type="button" className={PRIMARY} disabled={!chosenUnitId || Boolean(mappingRequest)} onClick={() => void assignUnit("candidate", candidate.id, chosenUnitId)}>{selected ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Tetapkan</button></td></tr>; })}</tbody></table></div>}
            {unmapped.students.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><caption className="px-4 pb-2 pt-5 text-left font-semibold text-slate-800 dark:text-slate-200">Santri tanpa calon pendaftaran tertaut ({unmapped.studentCount})</caption><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/50 dark:text-slate-400"><tr><th className="px-4 py-3">Santri</th><th className="px-4 py-3">NIS</th><th className="px-4 py-3">Kelas</th><th className="px-4 py-3">Unit yang benar</th><th className="px-4 py-3 text-right">Tindakan</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{unmapped.students.map((student) => { const selectionKey = `student:${student.id}`; const selected = mappingRequest === selectionKey; const chosenUnitId = mappingSelections[selectionKey] || ""; return <tr key={selectionKey}><td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{student.name}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{student.nis}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{student.grade || "—"}</td><td className="px-4 py-3"><select aria-label={`Unit untuk santri ${student.name}`} className={FIELD} disabled={Boolean(mappingRequest)} value={chosenUnitId} onChange={(event) => setMappingSelections((current) => ({ ...current, [selectionKey]: event.target.value }))}><option value="">Pilih unit</option>{snapshot.units.filter((unit) => unit.status === "active").map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></td><td className="px-4 py-3 text-right"><button type="button" className={PRIMARY} disabled={!chosenUnitId || Boolean(mappingRequest)} onClick={() => void assignUnit("student", student.id, chosenUnitId)}>{selected ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Tetapkan</button></td></tr>; })}</tbody></table></div>}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-800"><span>Menampilkan baris {unmapped.offset + 1}–{Math.min(unmapped.offset + unmapped.limit, Math.max(unmapped.candidateCount, unmapped.studentCount))} dari {Math.max(unmapped.candidateCount, unmapped.studentCount)} per jenis data.</span><div className="flex gap-2"><button type="button" className={OUTLINE} disabled={unmapped.offset === 0 || mappingLoading || Boolean(mappingRequest)} onClick={() => changeMappingPage(Math.max(0, unmapped.offset - unmapped.limit))}>Sebelumnya</button><button type="button" className={OUTLINE} disabled={unmapped.offset + unmapped.limit >= Math.max(unmapped.candidateCount, unmapped.studentCount) || mappingLoading || Boolean(mappingRequest)} onClick={() => changeMappingPage(unmapped.offset + unmapped.limit)}>Berikutnya</button></div></div>
          </>}
      </section>}

      {formOpen && <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-900 dark:text-white">{editingId ? "Ubah data unit" : "Tambah unit"}</h2><button type="button" className={OUTLINE} onClick={resetForm} disabled={saving} aria-label="Tutup formulir"><X className="h-4 w-4" /></button></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Kode unit<input className={FIELD} required minLength={2} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,31}" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} placeholder="CONTOH: PUSAT" /></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Nama unit<input className={FIELD} required minLength={2} maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nama unit organisasi" /></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Jenis unit<select className={FIELD} value={draft.unitType} onChange={(event) => setDraft({ ...draft, unitType: event.target.value as UnitType })}>{UNIT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Lokasi<input className={FIELD} maxLength={240} value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Lokasi atau alamat ringkas" /></label>
        </div>
        <div className="mt-5 flex flex-wrap gap-2"><button className={PRIMARY} type="submit" disabled={saving || !backendReady}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{editingId ? "Simpan perubahan" : "Simpan unit"}</button><button className={OUTLINE} type="button" onClick={resetForm} disabled={saving}>Batal</button></div>
      </form>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold text-slate-900 dark:text-white">Daftar unit</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Kode unit unik untuk setiap tenant.</p></div>
          <div className="flex gap-2"><label className="relative block"><span className="sr-only">Cari unit</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${FIELD} pl-9 sm:w-64`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari unit…" /></label><button type="button" className={OUTLINE} onClick={() => { setLoading(true); setError(""); refresh().catch((refreshError: unknown) => setError(refreshError instanceof Error ? refreshError.message : "Data unit belum dapat dimuat.")).finally(() => setLoading(false)); }} disabled={loading || saving} aria-label="Muat ulang daftar"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div>
        </div>
        {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Memuat data unit…</div>
          : filteredUnits.length === 0 ? <div className="p-12 text-center"><Building2 className="mx-auto h-9 w-9 text-slate-400" /><h3 className="mt-3 font-semibold text-slate-800 dark:text-slate-200">{snapshot.units.length ? "Unit tidak ditemukan" : "Belum ada unit"}</h3><p className="mt-1 text-sm text-slate-500">{snapshot.units.length ? "Ubah kata pencarian atau bersihkan pencarian." : "Tambahkan unit organisasi pertama untuk tenant ini."}</p></div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/50 dark:text-slate-400"><tr><th className="px-4 py-3">Unit</th><th className="px-4 py-3">Jenis</th><th className="px-4 py-3">Lokasi</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Tindakan</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filteredUnits.map((unit) => <tr key={unit.id}><td className="px-4 py-4"><p className="font-semibold text-slate-900 dark:text-white">{unit.name}</p><p className="mt-1 font-mono text-xs text-slate-500">{unit.code}</p></td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{typeLabel(unit.unitType)}</td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{unit.location || "—"}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${unit.status === "active" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{unit.status === "active" ? "Aktif" : "Nonaktif"}</span></td><td className="px-4 py-4"><div className="flex justify-end gap-2"><button className={OUTLINE} type="button" onClick={() => startEdit(unit)} disabled={saving || !backendReady} aria-label={`Ubah ${unit.name}`}><Pencil className="h-4 w-4" /><span className="sr-only">Ubah</span></button><button className={OUTLINE} type="button" onClick={() => toggleStatus(unit)} disabled={saving || !backendReady} aria-label={unit.status === "active" ? `Nonaktifkan ${unit.name}` : `Aktifkan ${unit.name}`}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : unit.status === "active" ? <CircleOff className="h-4 w-4" /> : <Check className="h-4 w-4" />}<span className="sr-only">{unit.status === "active" ? "Nonaktifkan" : "Aktifkan"}</span></button></div></td></tr>)}</tbody></table></div>}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" aria-labelledby="enterprise-units-audit-title">
        <div className="border-b border-slate-200 p-4 dark:border-slate-800"><h2 id="enterprise-units-audit-title" className="font-semibold text-slate-900 dark:text-white">Riwayat perubahan</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Menampilkan hingga 100 perubahan unit terbaru.</p></div>
        {loading ? <div className="p-6 text-sm text-slate-500">Memuat riwayat…</div> : snapshot.events.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Belum ada perubahan yang tercatat.</div> : <ol className="divide-y divide-slate-100 dark:divide-slate-800">{snapshot.events.map((item) => <li key={item.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-slate-800 dark:text-slate-200">{actionLabel(item.action)} <span className="font-semibold">{String(item.after.name || item.after.code || "unit")}</span></p><p className="mt-1 text-xs text-slate-500">ID aktor: {item.actorUserId.slice(0, 8)}…</p></div><time className="text-xs text-slate-500" dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></li>)}</ol>}
      </section>
    </section>
  );
}
