import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, ClipboardCheck, Loader2, Plus, RefreshCw, Search, Users, X } from "lucide-react";
import { getAccessToken } from "../authSession";

type Employee = {
  id: string; employeeNumber: string; fullName: string; jobTitle: string; department: string;
  email: string; phone: string; hireDate: string | null;
  employmentStatus: "active" | "on_leave" | "inactive" | "terminated";
};
type Attendance = {
  id: string; employeeId: string; workDate: string; status: "present" | "late" | "absent" | "leave" | "remote";
  checkInAt: string | null; checkOutAt: string | null;
};
type LeaveRequest = {
  id: string; employeeId: string; leaveType: "annual" | "sick" | "personal" | "maternity" | "other";
  startsOn: string; endsOn: string; reason: string; status: "pending" | "approved" | "rejected";
  requestedByUserId: string; reviewedByUserId: string | null; reviewNote: string; reviewedAt: string | null; createdAt: string;
};
type Snapshot = { employees: Employee[]; attendance: Attendance[]; leaveRequests: LeaveRequest[] };
type EmployeeDraft = Omit<Employee, "id"> & { id?: string };
type LeaveDraft = { employeeId: string; leaveType: LeaveRequest["leaveType"]; startsOn: string; endsOn: string; reason: string };
const EMPTY_DRAFT: EmployeeDraft = {
  employeeNumber: "", fullName: "", jobTitle: "", department: "", email: "", phone: "", hireDate: "", employmentStatus: "active",
};
const EMPTY_LEAVE_DRAFT: LeaveDraft = { employeeId: "", leaveType: "annual", startsOn: today(), endsOn: today(), reason: "" };

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function shortTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function attendanceText(status: Attendance["status"]) {
  return ({ present: "Hadir", late: "Terlambat", absent: "Tidak hadir", leave: "Cuti", remote: "Jarak jauh" })[status];
}
function employmentText(status: Employee["employmentStatus"]) {
  return ({ active: "Aktif", on_leave: "Cuti", inactive: "Nonaktif", terminated: "Berakhir" })[status];
}
function leaveTypeText(type: LeaveRequest["leaveType"]) {
  return ({ annual: "Tahunan", sick: "Sakit", personal: "Keperluan pribadi", maternity: "Melahirkan", other: "Lainnya" })[type];
}
function leaveStatusText(status: LeaveRequest["status"]) {
  return ({ pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak" })[status];
}
function leaveDayCount(item: Pick<LeaveRequest, "startsOn" | "endsOn">) {
  return Math.round((Date.parse(item.endsOn + "T00:00:00Z") - Date.parse(item.startsOn + "T00:00:00Z")) / 86_400_000) + 1;
}

async function hrisRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Data HRIS belum dapat diproses.");
  return body as T;
}

export function SupabaseHrisManager() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ employees: [], attendance: [], leaveRequests: [] });
  const [tab, setTab] = useState<"employees" | "attendance" | "leave">("employees");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [employeeDraft, setEmployeeDraft] = useState<EmployeeDraft | null>(null);
  const [workDate, setWorkDate] = useState(today());
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState<Attendance["status"]>("present");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [leaveDraft, setLeaveDraft] = useState<LeaveDraft | null>(null);
  const [reviewingLeave, setReviewingLeave] = useState<LeaveRequest | null>(null);
  const [leaveDecision, setLeaveDecision] = useState<"approved" | "rejected">("approved");
  const [reviewNote, setReviewNote] = useState("");

  const refresh = useCallback(async () => {
    const result = await hrisRequest<Snapshot>("/api/hris/snapshot");
    setSnapshot({ employees: Array.isArray(result.employees) ? result.employees : [], attendance: Array.isArray(result.attendance) ? result.attendance : [], leaveRequests: Array.isArray(result.leaveRequests) ? result.leaveRequests : [] });
    setEmployeeId((current) => current || result.employees?.find((item) => item.employmentStatus === "active")?.id || "");
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true); setError("");
    void hrisRequest<Snapshot>("/api/hris/snapshot")
      .then((result) => {
        if (!mounted) return;
        setSnapshot({ employees: Array.isArray(result.employees) ? result.employees : [], attendance: Array.isArray(result.attendance) ? result.attendance : [], leaveRequests: Array.isArray(result.leaveRequests) ? result.leaveRequests : [] });
        setEmployeeId(result.employees?.find((item) => item.employmentStatus === "active")?.id || "");
      })
      .catch((loadError: any) => { if (mounted) setError(loadError?.message || "Data HRIS belum dapat dimuat."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const filteredEmployees = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("id-ID");
    return snapshot.employees.filter((employee) => !text || [employee.employeeNumber, employee.fullName, employee.jobTitle, employee.department, employee.email]
      .some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(text)));
  }, [snapshot.employees, query]);
  const employeeById = useMemo(() => new Map(snapshot.employees.map((item) => [item.id, item])), [snapshot.employees]);
  const selectedDayAttendance = useMemo(() => snapshot.attendance.filter((item) => item.workDate === workDate), [snapshot.attendance, workDate]);

  const saveEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!employeeDraft) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await hrisRequest("/api/hris/employees", {
        method: "POST",
        body: JSON.stringify({ employee: { ...employeeDraft, id: employeeDraft.id || crypto.randomUUID(), clientRequestId: crypto.randomUUID() } }),
      });
      setEmployeeDraft(null); setNotice("Data pegawai tersimpan pada tenant Supabase."); await refresh();
    } catch (saveError: any) { setError(saveError?.message || "Data pegawai belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  const saveAttendance = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!employeeId) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const checkInAt = checkIn ? new Date(`${workDate}T${checkIn}`).toISOString() : null;
      const checkOutAt = checkOut ? new Date(`${workDate}T${checkOut}`).toISOString() : null;
      await hrisRequest("/api/hris/attendance", {
        method: "POST",
        body: JSON.stringify({ clientRequestId: crypto.randomUUID(), employeeId, workDate, status, checkInAt, checkOutAt }),
      });
      setNotice("Kehadiran tersimpan; perubahan tercatat dalam transaksi tenant Supabase."); await refresh();
    } catch (saveError: any) { setError(saveError?.message || "Kehadiran belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  const saveLeave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!leaveDraft) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await hrisRequest("/api/hris/leave-requests", {
        method: "POST",
        body: JSON.stringify({ leaveRequest: { ...leaveDraft, clientRequestId: crypto.randomUUID() } }),
      });
      setLeaveDraft(null); setNotice("Catatan cuti tersimpan pada tenant Supabase."); await refresh();
    } catch (saveError: any) { setError(saveError?.message || "Catatan cuti belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  const submitLeaveReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reviewingLeave) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await hrisRequest(`/api/hris/leave-requests/${encodeURIComponent(reviewingLeave.id)}/review`, {
        method: "POST",
        body: JSON.stringify({ status: leaveDecision, reviewNote, clientRequestId: crypto.randomUUID() }),
      });
      setReviewingLeave(null); setReviewNote(""); setNotice(`Pengajuan cuti ${leaveStatusText(leaveDecision).toLocaleLowerCase("id-ID")} dan tercatat.`); await refresh();
    } catch (reviewError: any) { setError(reviewError?.message || "Keputusan cuti belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">SDM Pesantren</h1><p className="mt-1 text-sm text-slate-500">Direktori pegawai dan kehadiran tersimpan pada tenant Supabase.</p></div>
        <button type="button" onClick={() => { setLoading(true); void refresh().catch((e: any) => setError(e?.message || "Gagal memuat ulang." )).finally(() => setLoading(false)); }} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Muat ulang</button>
      </header>

      <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">Fase Supabase ini mencakup direktori pegawai, kehadiran manual, serta pencatatan dan persetujuan cuti oleh Admin. Fitur cuti belum menghitung saldo atau mengubah kehadiran/payroll; payroll, rekrutmen, biometrik, pelacakan lokasi, dan analitik belum tersambung. Gunakan alasan umum dan hindari memasukkan rincian diagnosis kesehatan.</div>
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{notice}</div>}

      <nav aria-label="Modul SDM" className="flex gap-2 border-b border-slate-200 dark:border-white/10">
        <button type="button" aria-pressed={tab === "employees"} onClick={() => setTab("employees")} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${tab === "employees" ? "border-emerald-600 text-emerald-700 dark:text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white"}`}><Users className="h-4 w-4" />Direktori Pegawai</button>
        <button type="button" aria-pressed={tab === "attendance"} onClick={() => setTab("attendance")} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${tab === "attendance" ? "border-emerald-600 text-emerald-700 dark:text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white"}`}><CalendarClock className="h-4 w-4" />Kehadiran</button>
        <button type="button" aria-pressed={tab === "leave"} onClick={() => setTab("leave")} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${tab === "leave" ? "border-emerald-600 text-emerald-700 dark:text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white"}`}><ClipboardCheck className="h-4 w-4" />Cuti</button>
      </nav>

      {loading ? <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 p-12 text-sm text-slate-500 dark:border-white/10"><Loader2 className="h-4 w-4 animate-spin" />Memuat data tenant…</div> : <>
        {tab === "employees" && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama, nomor, jabatan, atau unit" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-white/10 dark:bg-slate-950" /></div>
            <button type="button" onClick={() => { setError(""); setEmployeeDraft({ ...EMPTY_DRAFT }); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Plus className="h-4 w-4" />Tambah pegawai</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3"><Metric label="Jumlah pegawai" value={snapshot.employees.length} /><Metric label="Aktif" value={snapshot.employees.filter((item) => item.employmentStatus === "active").length} /><Metric label="Tidak aktif / cuti" value={snapshot.employees.filter((item) => item.employmentStatus !== "active").length} /></div>
          {filteredEmployees.length === 0 ? <EmptyState text={snapshot.employees.length ? "Tidak ada data yang cocok dengan pencarian." : "Belum ada pegawai pada tenant ini. Tambahkan data pegawai untuk memulai."} /> : <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-white/5"><tr><th className="px-4 py-3">Pegawai</th><th className="px-4 py-3">Nomor</th><th className="px-4 py-3">Jabatan / unit</th><th className="px-4 py-3">Kontak</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{filteredEmployees.map((employee) => <tr key={employee.id}><td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{employee.fullName}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{employee.employeeNumber}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{employee.jobTitle}<div className="text-xs text-slate-400">{employee.department}</div></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{employee.email || "—"}<div className="text-xs text-slate-400">{employee.phone || "—"}</div></td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${employee.employmentStatus === "active" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>{employmentText(employee.employmentStatus)}</span></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => { setError(""); setEmployeeDraft({ ...employee }); }} className="rounded-md px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30">Ubah</button></td></tr>)}</tbody></table></div>}
        </section>}

        {tab === "attendance" && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 md:p-5">
          <form onSubmit={(event) => void saveAttendance(event)} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/50 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Tanggal<input required type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900" /></label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">Pegawai<select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900"><option value="">Pilih pegawai…</option>{snapshot.employees.filter((item) => item.employmentStatus === "active").map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.employeeNumber}</option>)}</select></label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Status<select value={status} onChange={(e) => { const next = e.target.value as Attendance["status"]; setStatus(next); if (next === "absent" || next === "leave") { setCheckIn(""); setCheckOut(""); } }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900"><option value="present">Hadir</option><option value="late">Terlambat</option><option value="remote">Jarak jauh</option><option value="absent">Tidak hadir</option><option value="leave">Cuti</option></select></label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Jam masuk<input type="time" required={status === "present" || status === "late" || status === "remote"} disabled={status === "absent" || status === "leave"} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-white/10 dark:bg-slate-900" /></label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Jam pulang<input type="time" disabled={status === "absent" || status === "leave"} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-white/10 dark:bg-slate-900" /></label>
            <button type="submit" disabled={saving || loading || !employeeId} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:col-span-2 lg:col-span-6">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Simpan kehadiran</button>
          </form>
          {selectedDayAttendance.length === 0 ? <EmptyState text={`Belum ada catatan kehadiran untuk ${workDate}.`} /> : <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-white/5"><tr><th className="px-4 py-3">Pegawai</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Masuk</th><th className="px-4 py-3">Pulang</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{selectedDayAttendance.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{employeeById.get(item.employeeId)?.fullName || "Pegawai tidak tersedia"}<div className="text-xs text-slate-400">{employeeById.get(item.employeeId)?.employeeNumber || ""}</div></td><td className="px-4 py-3">{attendanceText(item.status)}</td><td className="px-4 py-3">{shortTime(item.checkInAt)}</td><td className="px-4 py-3">{shortTime(item.checkOutAt)}</td></tr>)}</tbody></table></div>}
        </section>}

        {tab === "leave" && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-lg font-semibold text-slate-900 dark:text-white">Catatan dan persetujuan cuti</h2><p className="mt-1 text-sm text-slate-500">Admin mencatat pengajuan atas nama pegawai dan memutus pengajuan yang masih menunggu.</p></div>
            <button type="button" disabled={!snapshot.employees.some((item) => item.employmentStatus === "active")} onClick={() => { setError(""); setLeaveDraft({ ...EMPTY_LEAVE_DRAFT, employeeId: snapshot.employees.find((item) => item.employmentStatus === "active")?.id || "" }); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Plus className="h-4 w-4" />Catat cuti</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3"><Metric label="Total catatan" value={snapshot.leaveRequests.length} /><Metric label="Menunggu keputusan" value={snapshot.leaveRequests.filter((item) => item.status === "pending").length} /><Metric label="Disetujui" value={snapshot.leaveRequests.filter((item) => item.status === "approved").length} /></div>
          {snapshot.leaveRequests.length === 0 ? <EmptyState text="Belum ada catatan cuti pada tenant ini." /> : <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-white/5"><tr><th className="px-4 py-3">Pegawai</th><th className="px-4 py-3">Jenis</th><th className="px-4 py-3">Periode</th><th className="px-4 py-3">Alasan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{snapshot.leaveRequests.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{employeeById.get(item.employeeId)?.fullName || "Pegawai tidak tersedia"}<div className="text-xs text-slate-400">{employeeById.get(item.employeeId)?.employeeNumber || ""}</div></td><td className="px-4 py-3">{leaveTypeText(item.leaveType)}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.startsOn} – {item.endsOn}<div className="text-xs text-slate-400">{leaveDayCount(item)} hari kalender</div></td><td className="max-w-xs whitespace-normal px-4 py-3 text-slate-600 dark:text-slate-300">{item.reason}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.status === "approved" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : item.status === "rejected" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}>{leaveStatusText(item.status)}</span>{item.reviewNote && <div className="mt-1 max-w-[180px] whitespace-normal text-xs text-slate-400">{item.reviewNote}</div>}</td><td className="px-4 py-3 text-right">{item.status === "pending" && <button type="button" onClick={() => { setError(""); setReviewingLeave(item); setLeaveDecision("approved"); setReviewNote(""); }} className="rounded-md px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30">Tinjau</button>}</td></tr>)}</tbody></table></div>}
        </section>}
      </>}

      {employeeDraft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><form onSubmit={(event) => void saveEmployee(event)} className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div><h2 className="text-lg font-bold text-slate-900 dark:text-white">{employeeDraft.id ? "Ubah data pegawai" : "Tambah pegawai"}</h2><p className="mt-1 text-sm text-slate-500">Perubahan dicatat dengan akun Admin tenant.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">{(["employeeNumber", "fullName", "jobTitle", "department", "email", "phone"] as const).map((field) => <label key={field} className="text-xs font-medium text-slate-600 dark:text-slate-300">{{ employeeNumber: "Nomor pegawai", fullName: "Nama lengkap", jobTitle: "Jabatan", department: "Unit kerja", email: "Email", phone: "Telepon" }[field]}<input required={field !== "email" && field !== "phone"} type={field === "email" ? "email" : "text"} maxLength={field === "employeeNumber" ? 40 : field === "fullName" ? 180 : 120} value={employeeDraft[field] || ""} onChange={(e) => setEmployeeDraft({ ...employeeDraft, [field]: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950" /></label>)}
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Tanggal mulai<input type="date" value={employeeDraft.hireDate || ""} onChange={(e) => setEmployeeDraft({ ...employeeDraft, hireDate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950" /></label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Status kerja<select value={employeeDraft.employmentStatus} onChange={(e) => setEmployeeDraft({ ...employeeDraft, employmentStatus: e.target.value as Employee["employmentStatus"] })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950"><option value="active">Aktif</option><option value="on_leave">Cuti</option><option value="inactive">Nonaktif</option><option value="terminated">Berakhir</option></select></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10"><button type="button" onClick={() => setEmployeeDraft(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10">Batal</button><button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Menyimpan…" : "Simpan"}</button></div>
      </form></div>}
      {leaveDraft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><form onSubmit={(event) => void saveLeave(event)} className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div><h2 className="text-lg font-bold text-slate-900 dark:text-white">Catat cuti pegawai</h2><p className="mt-1 text-sm text-slate-500">Pengajuan dicatat Admin atas nama pegawai aktif; periode maksimal 120 hari kalender.</p></div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Pegawai<select required value={leaveDraft.employeeId} onChange={(e) => setLeaveDraft({ ...leaveDraft, employeeId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950"><option value="">Pilih pegawai…</option>{snapshot.employees.filter((item) => item.employmentStatus === "active").map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.employeeNumber}</option>)}</select></label>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Jenis cuti<select value={leaveDraft.leaveType} onChange={(e) => setLeaveDraft({ ...leaveDraft, leaveType: e.target.value as LeaveRequest["leaveType"] })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950"><option value="annual">Tahunan</option><option value="sick">Sakit</option><option value="personal">Keperluan pribadi</option><option value="maternity">Melahirkan</option><option value="other">Lainnya</option></select></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-slate-600 dark:text-slate-300">Mulai<input required type="date" value={leaveDraft.startsOn} onChange={(e) => setLeaveDraft({ ...leaveDraft, startsOn: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950" /></label><label className="text-xs font-medium text-slate-600 dark:text-slate-300">Sampai<input required type="date" min={leaveDraft.startsOn} value={leaveDraft.endsOn} onChange={(e) => setLeaveDraft({ ...leaveDraft, endsOn: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950" /></label></div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Alasan umum<textarea required minLength={3} maxLength={1000} value={leaveDraft.reason} onChange={(e) => setLeaveDraft({ ...leaveDraft, reason: e.target.value })} rows={3} placeholder="Hindari memasukkan diagnosis atau rincian kesehatan sensitif." className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950" /></label>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10"><button type="button" disabled={saving} onClick={() => setLeaveDraft(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10">Batal</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Simpan catatan</button></div>
      </form></div>}
      {reviewingLeave && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><form onSubmit={(event) => void submitLeaveReview(event)} className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div><h2 className="text-lg font-bold text-slate-900 dark:text-white">Tinjau catatan cuti</h2><p className="mt-1 text-sm text-slate-500">{employeeById.get(reviewingLeave.employeeId)?.fullName || "Pegawai"} · {reviewingLeave.startsOn} – {reviewingLeave.endsOn}</p></div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Keputusan<select value={leaveDecision} onChange={(e) => setLeaveDecision(e.target.value as "approved" | "rejected")} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950"><option value="approved">Setujui</option><option value="rejected">Tolak</option></select></label>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Catatan review{leaveDecision === "rejected" && <span className="text-rose-600"> · wajib diisi</span>}<textarea required={leaveDecision === "rejected"} minLength={leaveDecision === "rejected" ? 3 : undefined} maxLength={1000} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950" /></label>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10"><button type="button" disabled={saving} onClick={() => setReviewingLeave(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10">Batal</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Simpan keputusan</button></div>
      </form></div>}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/50"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div><div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</div></div>;
}
function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-white/15"><Users className="mx-auto mb-3 h-7 w-7 text-slate-300" />{text}</div>;
}
