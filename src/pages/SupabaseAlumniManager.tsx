import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, GraduationCap, Search, Users, UserPlus, X, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { getAccessToken } from "../authSession";

type Alumni = { id: string; studentId: string; name: string; nis: string; grade: string; graduationYear: number; graduatedAt: string };
type EligibleStudent = { id: string; name: string; nis: string; grade: string };

async function requestAlumni(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Layanan Alumni belum dapat diproses.");
  return payload;
}

export function SupabaseAlumniManager() {
  const { role, user } = useAuth();
  const [alumni, setAlumni] = useState<Alumni[]>([]);
  const [students, setStudents] = useState<EligibleStudent[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [graduatedAt, setGraduatedAt] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const canManage = role === "Admin" || role === "SuperAdmin";

  const refresh = useCallback(async () => {
    const payload = await requestAlumni("/api/alumni");
    setAlumni(Array.isArray(payload.alumni) ? payload.alumni : []);
    setStudents(Array.isArray(payload.eligibleStudents) ? payload.eligibleStudents : []);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    requestAlumni("/api/alumni")
      .then((payload) => {
        if (!active) return;
        setAlumni(Array.isArray(payload.alumni) ? payload.alumni : []);
        setStudents(Array.isArray(payload.eligibleStudents) ? payload.eligibleStudents : []);
      })
      .catch((loadError: any) => { if (active) setError(loadError?.message || "Data Alumni belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.tenantId, user?.uid]);

  const filteredAlumni = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("id-ID");
    if (!needle) return alumni;
    return alumni.filter((item) => [item.name, item.nis, item.grade, String(item.graduationYear)]
      .some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(needle)));
  }, [alumni, query]);

  const handleGraduate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!studentId || !canManage) return;
    const year = Number(graduatedAt.slice(0, 4));
    setSaving(true);
    setError("");
    try {
      await requestAlumni("/api/alumni/graduations", {
        method: "POST",
        body: JSON.stringify({ studentId, graduationYear: year, graduatedAt, clientRequestId: crypto.randomUUID() }),
      });
      setModalOpen(false);
      setStudentId("");
      await refresh();
    } catch (saveError: any) {
      setError(saveError?.message || "Kelulusan belum dapat disimpan.");
    } finally { setSaving(false); }
  };

  const thisYear = new Date().getFullYear();
  const thisYearGraduates = alumni.filter((item) => item.graduationYear === thisYear).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
        <div>
          <div className="mb-2 inline-flex rounded-lg bg-slate-100 p-2.5 dark:bg-slate-800"><GraduationCap className="h-5 w-5 text-slate-700 dark:text-slate-200" /></div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Direktori Alumni</h1>
          <p className="mt-1 text-sm text-slate-500">Data kelulusan dari backend Supabase untuk tenant aktif.</p>
        </div>
        {canManage && <button onClick={() => setModalOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"><UserPlus className="h-4 w-4" /> Catat Kelulusan</button>}
      </header>

      {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total Alumni", value: alumni.length, icon: Users },
          { label: `Lulus tahun ${thisYear}`, value: thisYearGraduates, icon: GraduationCap },
          { label: "Santri aktif", value: students.length, icon: Briefcase },
        ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{label}</p><Icon className="h-4 w-4 text-slate-400" /></div><p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">{loading ? "—" : value}</p></div>)}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div><h2 className="font-semibold text-slate-900 dark:text-white">Alumni terdaftar</h2><p className="mt-1 text-xs text-slate-500">Tracer study, kegiatan komunitas, dan donasi belum ditampilkan sebagai data operasional Supabase.</p></div>
          <label className="relative block w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, NIS, angkatan…" className="w-full rounded-lg border border-slate-200 bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700" /></label>
        </div>
        {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat data Alumni tenant…</div>
          : filteredAlumni.length ? <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">{filteredAlumni.map((item) => <article key={item.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{item.name.slice(0, 1).toUpperCase()}</div><div className="min-w-0"><h3 className="truncate font-medium text-slate-900 dark:text-white">{item.name}</h3><p className="mt-0.5 text-xs text-slate-500">{item.nis ? `NIS ${item.nis} · ` : ""}Angkatan {item.graduationYear}</p><p className="mt-1 text-xs text-slate-500">Lulus {new Date(item.graduatedAt + "T00:00:00").toLocaleDateString("id-ID")}</p></div></div></article>)}</div>
          : <div className="p-12 text-center"><GraduationCap className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-800 dark:text-slate-200">{query ? "Alumni tidak ditemukan" : "Belum ada data Alumni di Supabase"}</p><p className="mt-1 text-sm text-slate-500">{query ? "Ubah kata kunci pencarian." : "Data historis belum dimigrasikan. Proses ini tidak mengimpor data contoh."}</p></div>}
      </section>

      {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation"><form onSubmit={handleGraduate} className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">Catat Kelulusan</h2><p className="mt-1 text-xs text-slate-500">Perubahan status Santri dan pencatatan Alumni diproses atomik.</p></div><button type="button" onClick={() => setModalOpen(false)} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="space-y-4 p-5"><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Santri<select required value={studentId} onChange={(event) => setStudentId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"><option value="">Pilih santri aktif</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}{student.nis ? ` · ${student.nis}` : ""}</option>)}</select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Tanggal kelulusan<input type="date" required value={graduatedAt} onChange={(event) => setGraduatedAt(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><p className="text-xs text-slate-500">Tahun angkatan diambil dari tanggal yang dipilih. Santri akan diarsipkan dan tetap tercatat sebagai Alumni.</p></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Batal</button><button type="submit" disabled={!studentId || saving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Simpan Kelulusan</button></div></form></div>}
    </div>
  );
}
