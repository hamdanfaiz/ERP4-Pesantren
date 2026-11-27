import { toERPUserMessage } from "../utils/userMessages";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, GraduationCap, HeartHandshake, Search, Users, UserPlus, X, Loader2, AlertCircle, CalendarDays, MapPin, Plus, Ban, CheckCircle2, RefreshCw } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { getAccessToken } from "../authSession";
import { createAlumniClientRequestId, getStableAlumniRequestIdentity, submitAlumniGraduation, type AlumniRequestIdentity } from "../lib/alumniWorkflow";
import { normalizeTenantTimeZone, tenantDate, tenantLocalDateTimeToIso } from "../lib/tenantTimeZone";
import { ERPTabs } from "../components/ERPDesignSystem";
import { publicRuntimeConfigValue } from "../runtimeConfig";

type Alumni = { id: string; studentId: string; name: string; nis: string; grade: string; graduationYear: number; graduatedAt: string };
type EligibleStudent = { id: string; name: string; nis: string; grade: string; status: string };
type AlumniTab = "directory" | "tracer" | "community" | "donations";
const ALUMNI_EVENTS_RUNTIME_ENABLED = publicRuntimeConfigValue("VITE_SUPABASE_ALUMNI_EVENTS_RUNTIME_ENABLED") === "true";
const ALUMNI_TABS: Array<{ id: AlumniTab; label: string; icon: React.ReactNode }> = [
  { id: "directory", label: "Direktori", icon: <GraduationCap className="h-4 w-4" /> },
  { id: "tracer", label: "Tracer Study", icon: <Search className="h-4 w-4" /> },
  ...(ALUMNI_EVENTS_RUNTIME_ENABLED ? [{ id: "community" as const, label: "Komunitas", icon: <Users className="h-4 w-4" /> }] : []),
  { id: "donations", label: "Donasi Alumni", icon: <HeartHandshake className="h-4 w-4" /> },
];

async function requestAlumni(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Anda telah berakhir. Silakan masuk kembali.");
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
  const timeZone = normalizeTenantTimeZone(user?.tenantTimeZone);
  const [alumni, setAlumni] = useState<Alumni[]>([]);
  const [students, setStudents] = useState<EligibleStudent[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [graduatedAt, setGraduatedAt] = useState(() => tenantDate(new Date(), timeZone));
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<AlumniTab>("directory");
  const requestIdentity = useRef<AlumniRequestIdentity | null>(null);
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
      .catch((loadError: any) => { if (active) setError(toERPUserMessage(loadError, "Data Alumni belum dapat dimuat.")); })
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
    setNotice("");
    try {
      const identity = getStableAlumniRequestIdentity(
        requestIdentity.current,
        JSON.stringify([studentId, graduatedAt]),
        createAlumniClientRequestId,
      );
      requestIdentity.current = identity;
      const outcome = await submitAlumniGraduation(
        () => requestAlumni("/api/alumni/graduations", {
          method: "POST",
          body: JSON.stringify({ studentId, graduationYear: year, graduatedAt, clientRequestId: identity.requestId }),
        }),
        refresh,
      );
      requestIdentity.current = null;
      setModalOpen(false);
      setStudentId("");
      if (!outcome.refreshed) {
        setNotice("Kelulusan tersimpan. Daftar belum diperbarui; muat ulang data untuk melihat hasil terbaru.");
      }
    } catch (saveError: any) {
      setError(toERPUserMessage(saveError, "Kelulusan belum dapat disimpan."));
    } finally { setSaving(false); }
  };

  const thisYear = Number(tenantDate(new Date(), timeZone).slice(0, 4));
  const thisYearGraduates = alumni.filter((item) => item.graduationYear === thisYear).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
        <div>
          <div className="mb-2 inline-flex rounded-lg bg-slate-100 p-2.5 dark:bg-slate-800"><GraduationCap className="h-5 w-5 text-slate-700 dark:text-slate-200" /></div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{ALUMNI_TABS.find((item) => item.id === tab)?.label || "Direktori"} Alumni</h1>
          <p className="mt-1 text-sm text-slate-500">{tab === "directory" ? "Catat kelulusan dan kelola informasi alumni setiap angkatan." : tab === "tracer" ? "Lihat ringkasan alumni berdasarkan tahun kelulusan." : tab === "community" ? "Bangun jejaring lulusan melalui kegiatan bersama." : "Dukung program pesantren melalui kontribusi alumni."}</p>
        </div>
        {canManage && tab === "directory" && <button onClick={() => { setGraduatedAt(tenantDate(new Date(), timeZone)); setModalOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"><UserPlus className="h-4 w-4" /> Catat Kelulusan</button>}
      </header>

      {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      {notice && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">{notice}</div>}

      <ERPTabs tabs={ALUMNI_TABS} value={tab} onChange={(id) => setTab(id as AlumniTab)} ariaLabel="Bagian Alumni" />

      {tab === "directory" ? <>
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total Alumni", value: alumni.length, icon: Users },
          { label: `Lulus tahun ${thisYear}`, value: thisYearGraduates, icon: GraduationCap },
          { label: "Santri tanpa profil Alumni", value: students.length, icon: Briefcase },
        ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{label}</p><Icon className="h-4 w-4 text-slate-400" /></div><p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">{loading ? "—" : value}</p></div>)}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div><h2 className="font-semibold text-slate-900 dark:text-white">Alumni terdaftar</h2><p className="mt-1 text-xs text-slate-500">Temukan alumni berdasarkan nama, NIS, atau angkatan kelulusan.</p></div>
          <label className="relative block w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, NIS, angkatan…" className="w-full rounded-lg border border-slate-200 bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700" /></label>
        </div>
        {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat data Alumni pesantren…</div>
          : filteredAlumni.length ? <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">{filteredAlumni.map((item) => <article key={item.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{item.name.slice(0, 1).toUpperCase()}</div><div className="min-w-0"><h3 className="truncate font-medium text-slate-900 dark:text-white">{item.name}</h3><p className="mt-0.5 text-xs text-slate-500">{item.nis ? `NIS ${item.nis} · ` : ""}Angkatan {item.graduationYear}</p><p className="mt-1 text-xs text-slate-500">Lulus {new Date(item.graduatedAt + "T00:00:00").toLocaleDateString("id-ID")}</p></div></div></article>)}</div>
          : <div className="p-12 text-center"><GraduationCap className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-800 dark:text-slate-200">{query ? "Alumni tidak ditemukan" : "Belum ada data alumni"}</p><p className="mt-1 text-sm text-slate-500">{query ? "Ubah kata kunci pencarian." : "Pilih santri yang telah lulus untuk mencatat profil Alumni pertama."}</p></div>}
      </section>

      {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation"><form onSubmit={handleGraduate} className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">Catat Kelulusan</h2><p className="mt-1 text-xs text-slate-500">Status santri dan data kelulusan akan tersimpan bersamaan.</p></div><button type="button" onClick={() => setModalOpen(false)} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="space-y-4 p-5"><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Santri<select required value={studentId} onChange={(event) => setStudentId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"><option value="">Pilih santri tanpa profil Alumni</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}{student.nis ? ` · ${student.nis}` : ""} · {student.status}</option>)}</select><span className="mt-1.5 block text-xs font-normal text-slate-500">Status lama Alumni tetap dapat dipilih jika profil kelulusannya belum tercatat.</span></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Tanggal kelulusan<input type="date" required value={graduatedAt} onChange={(event) => setGraduatedAt(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><p className="text-xs text-slate-500">Pilih tanggal berdasarkan dokumen kelulusan. Tahun angkatan diambil dari tanggal tersebut; data status lama tidak digunakan untuk menebak tanggal.</p></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Batal</button><button type="submit" disabled={!studentId || saving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Simpan Kelulusan</button></div></form></div>}
      </> : tab === "tracer" ? <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Ringkasan angkatan</h2><p className="mt-1 text-sm text-slate-500">Jumlah alumni dihitung berdasarkan tahun kelulusan yang tercatat.</p></div>
        {loading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</div>
          : alumni.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/15">Belum ada alumni untuk ditelusuri.</p>
          : <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[480px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/50"><tr><th className="px-4 py-3">Angkatan</th><th className="px-4 py-3 text-right">Jumlah alumni</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{Object.entries(alumni.reduce<Record<string, number>>((acc, item) => { const key = String(item.graduationYear); acc[key] = (acc[key] || 0) + 1; return acc; }, {})).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, count]) => <tr key={year}><td className="px-4 py-3 font-medium">{year}</td><td className="px-4 py-3 text-right tabular-nums">{count}</td></tr>)}</tbody></table></div>}
      </section> : tab === "community" && ALUMNI_EVENTS_RUNTIME_ENABLED ? <AlumniCommunityPanel canManage={canManage} timeZone={timeZone} members={filteredAlumni} /> : <AlumniDonationsPanel />}
    </div>
  );
}

type AlumniCommunityEvent = {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
  location: string;
  description: string;
  status: "scheduled" | "cancelled" | "completed";
};

const COMMUNITY_EVENT_TYPES = [
  { value: "reunion", label: "Reuni" },
  { value: "webinar", label: "Webinar" },
  { value: "religious", label: "Pengajian" },
  { value: "community", label: "Kegiatan komunitas" },
  { value: "career", label: "Karier" },
  { value: "other", label: "Lainnya" },
];

function AlumniCommunityPanel({ canManage, timeZone, members }: { canManage: boolean; timeZone: string; members: Alumni[] }) {
  const [events, setEvents] = useState<AlumniCommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyEventId, setBusyEventId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState({ title: "", eventType: "reunion", startsAt: "", location: "", description: "" });
  const requestIdentity = useRef<AlumniRequestIdentity | null>(null);

  const loadEvents = useCallback(async () => {
    const payload = await requestAlumni("/api/alumni/events");
    setEvents(Array.isArray(payload.events) ? payload.events : []);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    requestAlumni("/api/alumni/events")
      .then((payload) => { if (active) setEvents(Array.isArray(payload.events) ? payload.events : []); })
      .catch((cause: unknown) => { if (active) setError(toERPUserMessage(cause, "Kegiatan komunitas belum dapat dimuat.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const submitEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || saving) return;
    setError("");
    setNotice("");
    let startsAt: string;
    try { startsAt = tenantLocalDateTimeToIso(draft.startsAt, timeZone); }
    catch { setError("Masukkan tanggal dan waktu kegiatan yang valid untuk zona waktu pesantren."); return; }
    const payload = {
      title: draft.title.trim(),
      eventType: draft.eventType,
      startsAt,
      location: draft.location.trim(),
      description: draft.description.trim(),
    };
    const identity = getStableAlumniRequestIdentity(
      requestIdentity.current,
      JSON.stringify(payload),
      createAlumniClientRequestId,
    );
    requestIdentity.current = identity;
    setSaving(true);
    let saved = false;
    try {
      await requestAlumni("/api/alumni/events", {
        method: "POST",
        body: JSON.stringify({ ...payload, clientRequestId: identity.requestId }),
      });
      saved = true;
      requestIdentity.current = null;
      setDraft({ title: "", eventType: "reunion", startsAt: "", location: "", description: "" });
      setModalOpen(false);
      await loadEvents();
      setNotice("Kegiatan komunitas berhasil disimpan.");
    } catch (cause: unknown) {
      if (saved) setNotice("Kegiatan tersimpan. Daftar belum diperbarui; muat ulang untuk melihat perubahan.");
      else setError(toERPUserMessage(cause, "Kegiatan komunitas belum dapat disimpan."));
    } finally { setSaving(false); }
  };

  const changeEventStatus = async (item: AlumniCommunityEvent, status: "cancelled" | "completed") => {
    if (!canManage || busyEventId) return;
    setBusyEventId(item.id);
    setError("");
    setNotice("");
    try {
      await requestAlumni(`/api/alumni/events/${encodeURIComponent(item.id)}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await loadEvents();
      setNotice(status === "cancelled" ? "Kegiatan berhasil dibatalkan." : "Kegiatan ditandai selesai.");
    } catch (cause: unknown) {
      setError(toERPUserMessage(cause, "Status kegiatan belum dapat diperbarui."));
    } finally { setBusyEventId(""); }
  };

  const dateFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone });
  const statusLabel: Record<AlumniCommunityEvent["status"], string> = { scheduled: "Terjadwal", cancelled: "Dibatalkan", completed: "Selesai" };
  const eventTypeLabel = (value: string) => COMMUNITY_EVENT_TYPES.find((type) => type.value === value)?.label || "Kegiatan";

  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 className="font-semibold text-slate-900 dark:text-white">Kegiatan komunitas alumni</h2><p className="mt-1 text-sm text-slate-500">Rencanakan reuni, pengajian, webinar, dan kegiatan alumni lainnya.</p></div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" /> Muat ulang</button>
        {canManage && <button type="button" onClick={() => { setError(""); setModalOpen(true); }} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Plus className="h-4 w-4" /> Buat kegiatan</button>}
      </div>
    </div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
    {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div>}
    {loading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat kegiatan alumni…</div>
      : events.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center dark:border-white/15"><CalendarDays className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 font-medium text-slate-800 dark:text-slate-200">Belum ada kegiatan komunitas</p><p className="mt-1 text-sm text-slate-500">Kegiatan yang dibuat akan muncul di sini untuk pesantren ini.</p></div>
      : <div className="grid gap-3 lg:grid-cols-2">{events.map((item) => {
        const startsAt = new Date(item.starts_at);
        const canComplete = item.status === "scheduled" && startsAt.getTime() <= Date.now();
        return <article key={item.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3"><span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{eventTypeLabel(item.event_type)}</span><span className={"rounded-md px-2 py-1 text-xs font-medium " + (item.status === "scheduled" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300" : item.status === "cancelled" ? "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>{statusLabel[item.status] || "Terjadwal"}</span></div>
          <h3 className="mt-3 font-semibold text-slate-900 dark:text-white">{item.title}</h3>
          <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300"><p className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{Number.isFinite(startsAt.getTime()) ? dateFormatter.format(startsAt) : "Waktu belum tersedia"}</p><p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{item.location}</p></div>
          {item.description && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-500">{item.description}</p>}
          {canManage && item.status === "scheduled" && <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800"><button type="button" onClick={() => void changeEventStatus(item, canComplete ? "completed" : "cancelled")} disabled={busyEventId === item.id} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">{busyEventId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : canComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}{canComplete ? "Tandai selesai" : "Batalkan kegiatan"}</button></div>}
        </article>;
      })}</div>}
    <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
      <div><h3 className="font-semibold text-slate-900 dark:text-white">Anggota komunitas alumni</h3><p className="mt-1 text-sm text-slate-500">Anggota mengikuti direktori kelulusan pesantren.</p></div>
      {members.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-white/15">Belum ada anggota komunitas alumni.</p>
        : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{members.map((item) => <article key={item.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"><h4 className="font-medium text-slate-900 dark:text-white">{item.name}</h4><p className="mt-1 text-xs text-slate-500">Angkatan {item.graduationYear}{item.nis ? ` · NIS ${item.nis}` : ""}</p></article>)}</div>}
    </div>
    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation"><form onSubmit={submitEvent} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h3 className="font-semibold text-slate-900 dark:text-white">Buat kegiatan komunitas</h3><p className="mt-1 text-xs text-slate-500">Data kegiatan disimpan untuk pesantren aktif.</p></div><button type="button" onClick={() => setModalOpen(false)} disabled={saving} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div>
      <div className="space-y-4 p-5"><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Nama kegiatan<input autoFocus required maxLength={180} value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Jenis kegiatan<select value={draft.eventType} onChange={(event) => setDraft((value) => ({ ...value, eventType: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700">{COMMUNITY_EVENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Tanggal dan waktu<input type="datetime-local" required value={draft.startsAt} onChange={(event) => setDraft((value) => ({ ...value, startsAt: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label></div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Lokasi<input required maxLength={180} value={draft.location} onChange={(event) => setDraft((value) => ({ ...value, location: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Keterangan<textarea maxLength={2000} rows={3} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label>
      </div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Batal</button><button type="submit" disabled={saving || !draft.title.trim() || !draft.startsAt || !draft.location.trim()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Simpan kegiatan</button></div></form></div>}
  </section>;
}

function AlumniDonationsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [rows, setRows] = useState<Array<{ id: string; donorName: string; amount: number; status: string; receiptNumber: string; receivedAt: string }>>([]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setRows([]);
    requestAlumni("/api/donation/snapshot")
      .then((result) => {
        if (!active) return;
        const donations = Array.isArray(result.donations) ? result.donations : [];
        setRows(donations.slice(0, 50).map((item: any) => ({
          id: String(item.id),
          donorName: String(item.donor_name || item.donorName || "Donatur"),
          amount: Number(item.amount || 0),
          status: String(item.status || ""),
          receiptNumber: String(item.receipt_number || item.receiptNumber || "—"),
          receivedAt: String(item.received_at || item.receivedAt || ""),
        })));
      })
      .catch((cause: any) => { if (active) setError(toERPUserMessage(cause, "Data donasi belum dapat dimuat.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
    <div><h2 className="font-semibold text-slate-900 dark:text-white">Penerimaan Donasi & Wakaf</h2><p className="mt-1 text-sm text-slate-500">Terhubung ke modul Donasi & Wakaf. Pencatatan baru dan void dilakukan di menu Donasi & Wakaf.</p></div>
    {loading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</div>
      : error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><span>{error}</span><button type="button" onClick={() => setReloadKey((value) => value + 1)} className="rounded-md border border-rose-300 px-3 py-1.5 font-medium hover:bg-rose-100 dark:border-rose-800 dark:hover:bg-rose-900/50">Coba lagi</button></div>
      : rows.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/15">Belum ada transaksi donasi pada pesantren ini.</p>
      : <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/50"><tr><th className="px-4 py-3">Kwitansi</th><th className="px-4 py-3">Donatur</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Nominal</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-mono text-xs">{row.receiptNumber}</td><td className="px-4 py-3">{row.donorName}</td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3 text-right tabular-nums">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(row.amount)}</td></tr>)}</tbody></table></div>}
  </section>;
}


