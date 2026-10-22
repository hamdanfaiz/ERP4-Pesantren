import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, Plus, RotateCcw, UserRoundCog } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { listSupabaseBoardingAssignments, saveSupabaseBoardingAssignment, type BoardingAssignmentSnapshot } from "../services/boardingAssignmentsApi";

export function SupabaseBoardingAssignmentsManager() {
  const { role } = useAuth();
  const [snapshot, setSnapshot] = useState<BoardingAssignmentSnapshot>({ staff: [], locations: [], assignments: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [locationType, setLocationType] = useState("Gedung");
  const [form, setForm] = useState({ userId: "", locationId: "" });

  const refresh = useCallback(async () => {
    const result = await listSupabaseBoardingAssignments();
    setSnapshot(result);
    setForm((current) => ({
      userId: result.staff.some((item) => item.id === current.userId) ? current.userId : result.staff[0]?.id || "",
      locationId: result.locations.some((item) => item.id === current.locationId && item.category === locationType)
        ? current.locationId : result.locations.find((item) => item.category === locationType)?.id || "",
    }));
  }, [locationType]);

  useEffect(() => {
    let active = true;
    listSupabaseBoardingAssignments().then((result) => {
      if (!active) return;
      setSnapshot(result);
      setForm({ userId: result.staff[0]?.id || "", locationId: result.locations.find((item) => item.category === locationType)?.id || "" });
    }).catch((e: any) => { if (active) setError(e?.message || "Data penugasan belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const locations = useMemo(() => snapshot.locations.filter((item) => item.category === locationType), [snapshot.locations, locationType]);

  const save = async () => {
    setSaving("new"); setError(""); setNotice("");
    try {
      await saveSupabaseBoardingAssignment({
        userId: form.userId,
        buildingId: locationType === "Gedung" ? form.locationId : null,
        roomId: locationType === "Kamar" ? form.locationId : null,
        status: "active", clientRequestId: crypto.randomUUID(),
      });
      setNotice("Penugasan lokasi Ustadz tersimpan pada tenant.");
      try { await refresh(); } catch { setError("Penugasan sudah tersimpan, tetapi daftar belum dapat dimuat ulang."); }
    } catch (e: any) { setError(e?.message || "Penugasan belum dapat disimpan."); }
    finally { setSaving(""); }
  };

  const revoke = async (assignmentId: string, userId: string) => {
    setSaving(assignmentId); setError(""); setNotice("");
    try {
      await saveSupabaseBoardingAssignment({ assignmentId, userId, status: "inactive", clientRequestId: crypto.randomUUID() });
      setNotice("Penugasan dinonaktifkan dan tercatat pada audit.");
      try { await refresh(); } catch { setError("Penugasan sudah dinonaktifkan, tetapi daftar belum dapat dimuat ulang."); }
    } catch (e: any) { setError(e?.message || "Penugasan belum dapat dinonaktifkan."); }
    finally { setSaving(""); }
  };

  const activeCount = snapshot.assignments.filter((item) => item.status === "active").length;
  return <section className="space-y-6">
    <header><div className="flex items-center gap-2 text-sm font-semibold text-indigo-700"><UserRoundCog className="h-4 w-4" />Asrama · Penugasan · Supabase</div><h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Penugasan Petugas Asrama</h1><p className="mt-1 max-w-2xl text-sm text-slate-600">Admin menetapkan Ustadz ke gedung atau kamar. Akses operasional Ustadz akan dibatasi ke santri pada lokasi aktif yang ditugaskan.</p></header>
    <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Ustadz aktif</div><div className="mt-2 text-2xl font-bold text-slate-900">{snapshot.staff.length}</div></div><div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4"><div className="text-xs font-medium uppercase tracking-wide text-indigo-800">Penugasan aktif</div><div className="mt-2 text-2xl font-bold text-indigo-900">{activeCount}</div></div></div>
    {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
    {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
    {role !== "Admin" && role !== "SuperAdmin" && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Pengelolaan penugasan hanya tersedia bagi Admin tenant.</div>}
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-semibold text-slate-900">Tambah lokasi tugas</h2><p className="mt-1 text-sm text-slate-500">Penugasan gedung mencakup semua kamar dan santri yang terdaftar pada gedung tersebut.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end"><label className="text-sm font-medium text-slate-700">Akun Ustadz<select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{snapshot.staff.map((person) => <option key={person.id} value={person.id}>{person.name}{person.email ? ` · ${person.email}` : ""}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Jenis lokasi<select value={locationType} onChange={(e) => { const nextType = e.target.value; setLocationType(nextType); setForm((current) => ({ ...current, locationId: snapshot.locations.find((item) => item.category === nextType)?.id || "" })); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option>Gedung</option><option>Kamar</option></select></label>
        <label className="text-sm font-medium text-slate-700">Lokasi<select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <button type="button" onClick={() => void save()} disabled={saving === "new" || !form.userId || !form.locationId} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Plus className="h-4 w-4" />{saving === "new" ? "Menyimpan…" : "Tetapkan"}</button></div>
      {!snapshot.staff.length && <p className="mt-3 text-sm text-amber-700">Belum ada akun Ustadz aktif pada tenant.</p>}
      {!locations.length && <p className="mt-3 text-sm text-amber-700">Belum ada {locationType.toLowerCase()} aktif di Master Data.</p>}
    </section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 p-4"><div><h2 className="font-semibold text-slate-900">Daftar penugasan</h2><p className="mt-1 text-xs text-slate-500">Histori penugasan tersimpan; menonaktifkan tidak menghapus audit.</p></div><button type="button" onClick={() => { setLoading(true); void refresh().catch((e: any) => setError(e?.message || "Data belum dapat dimuat.")).finally(() => setLoading(false)); }} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"><RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Muat ulang</button></div>
      {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Memuat penugasan tenant…</div>
        : !snapshot.assignments.length ? <div className="p-10 text-center text-sm text-slate-500">Belum ada lokasi tugas untuk Ustadz.</div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Ustadz</th><th className="px-4 py-3">Lokasi</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Tindakan</th></tr></thead><tbody className="divide-y divide-slate-100">{snapshot.assignments.map((item) => <tr key={item.id}><td className="px-4 py-4 font-medium text-slate-900">{item.staffName}</td><td className="px-4 py-4 text-slate-700">{item.locationType}: {item.locationName}</td><td className="px-4 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${item.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>{item.status === "active" ? "Aktif" : "Nonaktif"}</span></td><td className="px-4 py-4 text-right">{item.status === "active" ? <button type="button" onClick={() => void revoke(item.id, item.userId)} disabled={saving === item.id} className="rounded-md px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">{saving === item.id ? "Menyimpan…" : "Nonaktifkan"}</button> : <span className="text-xs text-slate-400">Tersimpan</span>}</td></tr>)}</tbody></table></div>}
    </section>
  </section>;
}
