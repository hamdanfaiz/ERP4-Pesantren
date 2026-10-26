import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Search, ShieldAlert, UserCheck, X } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { listSupabaseMasterDataStructures, type SupabaseStructureRecord } from "../services/masterDataApi";

type Stage = "Registered" | "Document Review" | "Entry Exam" | "Interview" | "Accepted" | "Rejected";
type CandidateBill = { id: string; feeType: string; period: string; amount: number; paidAmount: number; status: string };
type CandidateDocumentKey = "kk" | "birthCertificate" | "reportCards" | "ijazah" | "skhun" | "pasPhoto";
type Candidate = {
  id: string; registrationId: string; name: string; previousSchool: string; grade: string; phone: string;
  email: string; gender: "L" | "P"; stage: Stage; score?: number; dateApplied: string; notes: string;
  onboardingStatus?: string; syncToMasterData?: boolean; nis?: string;
  examScores: Record<string, number>; interviewScores: Record<string, number>;
  religiousScores: {
    quranFluency?: number; tajweedMastery?: number; worshipPractice?: number;
    memorizedJuz?: string; notes?: string; totalScore?: number; evaluatedAt?: string; evaluator?: string;
  };
  bills?: { registration?: CandidateBill | null; tuition?: CandidateBill | null };
  documents: {
    kk: boolean; birthCertificate: boolean; reportCards: boolean; ijazah: boolean; skhun: boolean; pasPhoto: boolean;
    downloadable: Record<CandidateDocumentKey, boolean>;
  };
};
type CandidateDraft = {
  stage: Stage;
  notes: string;
  examScores: Record<string, string>;
  interviewScores: Record<string, string>;
  religiousScores: Record<string, string>;
};
type OnboardingDraft = { nis: string; classId: string; roomId: string; guardianName: string; guardianPhone: string };

const PPDB_ONBOARDING_ENABLED = import.meta.env.VITE_SUPABASE_PPDB_ONBOARDING_RUNTIME_ENABLED === "true";
const PPDB_DOCUMENTS_ENABLED = import.meta.env.VITE_SUPABASE_PPDB_RUNTIME_ENABLED === "true"
  && import.meta.env.VITE_SUPABASE_PPDB_DOCUMENTS_RUNTIME_ENABLED === "true";
const PPDB_FINANCE_BILLS_ENABLED = import.meta.env.VITE_SUPABASE_PPDB_FINANCE_BILLS_ENABLED === "true";
const FORM_CONTROL = "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-slate-950 dark:text-white";

const STAGES: Stage[] = ["Registered", "Document Review", "Entry Exam", "Interview", "Accepted", "Rejected"];
const EXAM_FIELDS = ["math", "science", "english", "tpa", "quran"] as const;
const INTERVIEW_FIELDS = [
  { key: "academicPotential", label: "Potensi akademik" },
  { key: "personality", label: "Kepribadian" },
  { key: "communication", label: "Komunikasi" },
] as const;
const RELIGIOUS_FIELDS = [
  { key: "quranFluency", label: "Kelancaran & fashahah" },
  { key: "tajweedMastery", label: "Tajwid" },
  { key: "worshipPractice", label: "Praktik ibadah" },
] as const;

async function requestPpdb(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Data PPDB belum dapat diproses.");
  return payload;
}

async function downloadPpdbDocument(candidate: Candidate, key: CandidateDocumentKey, label: string) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const response = await fetch(`/api/ppdb/candidates/${encodeURIComponent(candidate.id)}/documents/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Berkas PPDB belum dapat diunduh.");
  }
  const blob = await response.blob();
  const mime = response.headers.get("content-type") || "";
  const extension = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "bin";
  const safeId = candidate.registrationId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${safeId}-${label.replace(/[^a-zA-Z0-9_-]/g, "_")}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function SupabasePpdbManager() {
  const { user, role } = useAuth();
  const isAdmin = ["Admin", "SuperAdmin"].includes(role);
  const canManageCandidateBills = isAdmin && user?.modulePermissions?.finance !== false;
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CandidateDraft>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<"All" | Stage>("All");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [onboardingCandidate, setOnboardingCandidate] = useState<Candidate | null>(null);
  const [onboardingStructures, setOnboardingStructures] = useState<SupabaseStructureRecord[]>([]);
  const [onboardingDraft, setOnboardingDraft] = useState<OnboardingDraft>({ nis: "", classId: "", roomId: "", guardianName: "", guardianPhone: "" });
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");

  const refresh = useCallback(async () => {
    if (!isAdmin || !user?.tenantId) {
      setCandidates([]); setHasMore(false); setNextOffset(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload = await requestPpdb("/api/ppdb/candidates?limit=250&offset=0");
      setCandidates(Array.isArray(payload.candidates) ? payload.candidates : []);
      setHasMore(Boolean(payload.hasMore));
      setNextOffset(Number.isInteger(payload.nextOffset) ? payload.nextOffset : null);
      setDrafts({});
    } catch (loadError: any) {
      setCandidates([]);
      setHasMore(false); setNextOffset(null);
      setError(loadError?.message || "Daftar calon santri Supabase belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.tenantId, user?.uid]);

  const loadMore = async () => {
    if (!hasMore || nextOffset == null || loadingMore) return;
    setLoadingMore(true); setError("");
    try {
      const payload = await requestPpdb(`/api/ppdb/candidates?limit=250&offset=${nextOffset}`);
      const incoming = Array.isArray(payload.candidates) ? payload.candidates as Candidate[] : [];
      setCandidates((current) => {
        const existingIds = new Set(current.map((candidate) => candidate.id));
        return [...current, ...incoming.filter((candidate) => !existingIds.has(candidate.id))];
      });
      setHasMore(Boolean(payload.hasMore));
      setNextOffset(Number.isInteger(payload.nextOffset) ? payload.nextOffset : null);
    } catch (loadError: any) { setError(loadError?.message || "Data berikutnya belum dapat dimuat."); }
    finally { setLoadingMore(false); }
  };

  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    return candidates.filter((candidate) => {
      const matchesStage = stageFilter === "All" || candidate.stage === stageFilter;
      const matchesSearch = !query || [candidate.name, candidate.registrationId, candidate.previousSchool, candidate.phone]
        .some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(query));
      return matchesStage && matchesSearch;
    });
  }, [candidates, search, stageFilter]);

  const draftFor = (candidate: Candidate): CandidateDraft => drafts[candidate.id] || {
    stage: candidate.stage,
    notes: candidate.notes || "",
    examScores: Object.fromEntries(EXAM_FIELDS.map((field) => [field, candidate.examScores?.[field] == null ? "" : String(candidate.examScores[field])])),
    interviewScores: Object.fromEntries(INTERVIEW_FIELDS.map(({ key }) => [key, candidate.interviewScores?.[key] == null ? "" : String(candidate.interviewScores[key])])),
    religiousScores: Object.fromEntries([
      ...RELIGIOUS_FIELDS.map(({ key }) => [key, candidate.religiousScores?.[key] == null ? "" : String(candidate.religiousScores[key])] as const),
      ["memorizedJuz", candidate.religiousScores?.memorizedJuz || ""] as const,
      ["notes", candidate.religiousScores?.notes || ""] as const,
    ]),
  };

  const updateDraft = (candidate: Candidate, patch: Partial<CandidateDraft>) => {
    setDrafts((current) => ({ ...current, [candidate.id]: { ...draftFor(candidate), ...patch } }));
  };

  const saveCandidate = async (candidate: Candidate) => {
    const draft = draftFor(candidate);
    const examScores: Record<string, number> = {};
    for (const field of EXAM_FIELDS) {
      const value = draft.examScores[field];
      if (value !== undefined && value !== "") {
        const score = Number(value);
        if (!Number.isInteger(score) || score < 0 || score > 100) { setError("Nilai ujian masuk harus berupa bilangan bulat 0–100."); return; }
        examScores[field] = score;
      }
    }
    const interviewScores: Record<string, number> = {};
    for (const { key } of INTERVIEW_FIELDS) {
      const value = draft.interviewScores[key];
      if (value !== undefined && value !== "") {
        const score = Number(value);
        if (!Number.isInteger(score) || score < 1 || score > 5) { setError("Nilai wawancara harus berupa bilangan bulat 1–5."); return; }
        interviewScores[key] = score;
      }
    }
    const religiousScoresChanged = [
      ...RELIGIOUS_FIELDS.map(({ key }) => key), "memorizedJuz", "notes",
    ].some((field) => (draft.religiousScores[field] || "") !== String(candidate.religiousScores?.[field as keyof Candidate["religiousScores"]] ?? ""));
    const religiousScores: Record<string, number | string> = {};
    if (religiousScoresChanged) {
      for (const { key } of RELIGIOUS_FIELDS) {
        const value = draft.religiousScores[key];
        const score = Number(value);
        if (value === "" || !Number.isInteger(score) || score < 0 || score > 100) {
          setError("Penilaian Al-Qur’an dan Tahfidz harus mengisi tiga nilai bilangan bulat 0–100."); return;
        }
        religiousScores[key] = score;
      }
      const memorizedJuz = draft.religiousScores.memorizedJuz || "";
      const religiousNotes = draft.religiousScores.notes || "";
      if (memorizedJuz.length > 500 || religiousNotes.length > 4000) { setError("Keterangan hafalan maksimal 500 karakter dan catatan maksimal 4.000 karakter."); return; }
      religiousScores.memorizedJuz = memorizedJuz;
      religiousScores.notes = religiousNotes;
    }
    setSavingId(candidate.id); setError(""); setNotice("");
    try {
      await requestPpdb(`/api/ppdb/candidates/${encodeURIComponent(candidate.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          core: { stage: draft.stage, notes: draft.notes },
          workflow: { examScores, interviewScores, ...(religiousScoresChanged ? { religiousScores } : {}) },
        }),
      });
      setNotice(`Perubahan ${candidate.registrationId} tersimpan.`);
      await refresh();
    } catch (saveError: any) {
      setError(saveError?.message || "Perubahan PPDB belum dapat disimpan.");
    } finally { setSavingId(""); }
  };

  const openOnboarding = async (candidate: Candidate) => {
    setOnboardingCandidate(candidate);
    setOnboardingDraft({ nis: candidate.nis || "", classId: "", roomId: "", guardianName: "", guardianPhone: candidate.phone || "" });
    setOnboardingStructures([]);
    setOnboardingError("");
    setOnboardingLoading(true);
    try {
      const [structures, allocation] = await Promise.all([
        listSupabaseMasterDataStructures(),
        requestPpdb("/api/ppdb/onboarding/next-nis", {
          method: "POST",
          body: JSON.stringify({ candidateId: candidate.id, grade: candidate.grade }),
        }),
      ]);
      setOnboardingStructures(structures);
      setOnboardingDraft((current) => ({ ...current, nis: current.nis || String(allocation.nis || "") }));
    } catch (loadError: any) {
      setOnboardingError(loadError?.message || "Data kelas, kamar, atau NIS belum dapat dimuat.");
    } finally { setOnboardingLoading(false); }
  };

  const submitOnboarding = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onboardingCandidate) return;
    setOnboardingSaving(true); setOnboardingError("");
    try {
      const room = onboardingStructures.find((item) => item.category === "Kamar" && item.id === onboardingDraft.roomId);
      if (!room || !onboardingStructures.some((item) => item.category === "Kelas" && item.id === onboardingDraft.classId)) {
        throw new Error("Pilih kelas dan kamar aktif dari Master Data tenant.");
      }
      const result = await requestPpdb(`/api/ppdb/candidates/${encodeURIComponent(onboardingCandidate.id)}/onboard`, {
        method: "POST",
        body: JSON.stringify({ clientRequestId: crypto.randomUUID(), assignment: {
          nis: onboardingDraft.nis,
          classId: onboardingDraft.classId,
          roomId: onboardingDraft.roomId,
          buildingId: room.parentId || room.parentCode || null,
          waliName: onboardingDraft.guardianName,
          waliPhone: onboardingDraft.guardianPhone,
        } }),
      });
      setNotice(`${onboardingCandidate.name} berhasil di-onboard dengan NIS ${result.nis}. Data santri, wali, dan reservasi NIS tersimpan melalui transaksi Supabase.`);
      setOnboardingCandidate(null);
      await refresh();
    } catch (saveError: any) {
      setOnboardingError(saveError?.message || "Onboarding santri belum dapat disimpan.");
    } finally { setOnboardingSaving(false); }
  };

  if (!isAdmin) return <div className="mx-auto max-w-3xl p-6"><div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><ShieldAlert className="mb-2 h-5 w-5" />Akses PPDB hanya tersedia untuk Admin tenant.</div></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Penerimaan Santri Baru</h1><p className="mt-1 text-sm text-slate-500">Data calon santri tenant dibaca dari Supabase. Perubahan status, nilai, dan catatan divalidasi di database.</p></div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Muat ulang</button>
      </header>

      <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">Mode Supabase: layar ini mengelola daftar, tahap, nilai, penilaian Al-Qur’an dan Tahfidz, serta onboarding santri transaksional. Pendaftaran publik yang diaktifkan menyimpan berkas pada Storage privat; unduh berkas oleh Admin melalui server masih menunggu flag runtime tersendiri. Admin dapat menerbitkan tagihan kandidat setelah migration Finance dan flag PPDB–Keuangan diaktifkan.</div>
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{notice}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, nomor pendaftaran, sekolah, telepon" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
          <select aria-label="Filter tahap PPDB" value={stageFilter} onChange={(event) => setStageFilter(event.target.value as "All" | Stage)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-white/10 dark:bg-slate-950 dark:text-white"><option value="All">Semua tahap</option>{STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select>
        </div>
        {loading ? <div role="status" className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat daftar PPDB tenant…</div>
          : filtered.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500 dark:border-white/10">{candidates.length ? "Tidak ada calon santri yang cocok dengan filter." : "Belum ada calon santri di Supabase untuk tenant ini."}</div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-white/10"><th className="px-3 py-3">Pendaftar</th><th className="px-3 py-3">Sekolah / jenjang</th><th className="px-3 py-3">Tanggal</th><th className="px-3 py-3">Tahap</th><th className="px-3 py-3"></th></tr></thead><tbody>{filtered.map((candidate) => {
            const draft = draftFor(candidate);
            const expanded = expandedId === candidate.id;
            return <React.Fragment key={candidate.id}><tr className="border-b border-slate-100 dark:border-white/5"><td className="px-3 py-3"><div className="font-semibold text-slate-900 dark:text-white">{candidate.name}</div><div className="text-xs text-slate-500">{candidate.registrationId} · {candidate.phone || "Tanpa telepon"}</div></td><td className="px-3 py-3 text-slate-700 dark:text-slate-300">{candidate.previousSchool || "—"}<div className="text-xs text-slate-500">{candidate.grade || "—"}</div></td><td className="px-3 py-3 text-slate-600 dark:text-slate-400">{candidate.dateApplied || "—"}</td><td className="px-3 py-3"><select aria-label={`Tahap untuk ${candidate.name}`} value={draft.stage} onChange={(event) => updateDraft(candidate, { stage: event.target.value as Stage })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-slate-950 dark:text-white">{STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select>{candidate.onboardingStatus === "Completed" && <span className="mt-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Sudah menjadi santri · NIS {candidate.nis || "tersimpan"}</span>}</td><td className="px-3 py-3 text-right"><div className="flex flex-wrap justify-end gap-1"><button type="button" onClick={() => { setError(""); setExpandedId(expanded ? null : candidate.id); }} className="rounded-lg px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30">{expanded ? "Tutup" : "Detail & nilai"}</button>{PPDB_ONBOARDING_ENABLED && candidate.stage === "Accepted" && candidate.onboardingStatus !== "Completed" && <button type="button" onClick={() => void openOnboarding(candidate)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"><UserCheck className="h-3.5 w-3.5" />Onboard</button>}</div></td></tr>
              {expanded && <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-slate-950/40"><td colSpan={5} className="p-4"><div className="grid gap-5 lg:grid-cols-2"><div className="space-y-3"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nilai ujian masuk (0–100)</div><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{EXAM_FIELDS.map((field) => <label key={field} className="text-xs capitalize text-slate-500">{field}<input type="number" min="0" max="100" value={draft.examScores[field] || ""} onChange={(event) => updateDraft(candidate, { examScores: { ...draft.examScores, [field]: event.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white" /></label>)}</div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dokumen tercatat</div><div className="flex flex-wrap gap-2">{[["KK", candidate.documents.kk], ["Akta", candidate.documents.birthCertificate], ["Rapor", candidate.documents.reportCards], ["Ijazah", candidate.documents.ijazah], ["SKHUN", candidate.documents.skhun], ["Pas foto", candidate.documents.pasPhoto]].map(([label, complete]) => <span key={String(label)} className={`rounded-full px-2.5 py-1 text-xs ${complete ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400"}`}>{String(label)} · {complete ? "lengkap" : "belum"}</span>)}</div><CandidateBilling candidate={candidate} enabled={PPDB_FINANCE_BILLS_ENABLED} canManage={canManageCandidateBills} onCreated={() => { void refresh(); }} /></div><div className="space-y-3"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Penilaian Al-Qur’an & Tahfidz (0–100)</div><div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-white/10"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rincian penilaian</div><div className="grid gap-3 sm:grid-cols-3">{RELIGIOUS_FIELDS.map(({ key, label }) => <label key={key} className="text-xs text-slate-500">{label}<input type="number" min="0" max="100" step="1" value={draft.religiousScores[key] || ""} onChange={(event) => updateDraft(candidate, { religiousScores: { ...draft.religiousScores, [key]: event.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white" /></label>)}</div><label className="block text-xs text-slate-500">Hafalan yang sudah dikuasai<input maxLength={500} value={draft.religiousScores.memorizedJuz || ""} onChange={(event) => updateDraft(candidate, { religiousScores: { ...draft.religiousScores, memorizedJuz: event.target.value } })} placeholder="Contoh: Juz 30" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white" /></label><label className="block text-xs text-slate-500">Catatan penilaian<textarea rows={2} maxLength={4000} value={draft.religiousScores.notes || ""} onChange={(event) => updateDraft(candidate, { religiousScores: { ...draft.religiousScores, notes: event.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white" /></label>{candidate.religiousScores?.totalScore != null && <div role="note" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">Rata-rata {candidate.religiousScores.totalScore}/100 · {candidate.religiousScores.evaluatedAt || "tanggal tidak tersedia"}{candidate.religiousScores.evaluator ? ` · Dinilai oleh ${candidate.religiousScores.evaluator}` : ""}</div>}</div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Penilaian wawancara (1–5)</div><div className="grid gap-3 sm:grid-cols-3">{INTERVIEW_FIELDS.map(({ key, label }) => <label key={key} className="text-xs text-slate-500">{label}<select value={draft.interviewScores[key] || ""} onChange={(event) => updateDraft(candidate, { interviewScores: { ...draft.interviewScores, [key]: event.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white"><option value="">Pilih nilai</option>{[1,2,3,4,5].map((score) => <option key={score} value={score}>{score}</option>)}</select></label>)}</div><label className="block text-xs text-slate-500">Catatan panitia<textarea rows={4} maxLength={4000} value={draft.notes} onChange={(event) => updateDraft(candidate, { notes: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white" /></label><button type="button" onClick={() => void saveCandidate(candidate)} disabled={savingId === candidate.id} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{savingId === candidate.id && <Loader2 className="h-4 w-4 animate-spin" />}Simpan perubahan</button></div></div></td></tr>}</React.Fragment>;
          })}</tbody></table></div>}
        {hasMore && <div className="mt-4 flex justify-center border-t border-slate-100 pt-4 dark:border-white/5"><button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">{loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}Muat 250 pendaftar berikutnya</button></div>}
      </section>
      {expandedId && candidates.some((candidate) => candidate.id === expandedId) && <CandidateDocumentDownloads candidate={candidates.find((candidate) => candidate.id === expandedId)!} enabled={PPDB_DOCUMENTS_ENABLED} />}
      {onboardingCandidate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><form onSubmit={(event) => void submitOnboarding(event)} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"><header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-white/10"><div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white"><UserCheck className="h-5 w-5 text-emerald-600" />Onboarding santri diterima</h2><p className="mt-1 text-sm text-slate-500">{onboardingCandidate.name} · {onboardingCandidate.registrationId} · {onboardingCandidate.grade}</p></div><button type="button" aria-label="Tutup" onClick={() => setOnboardingCandidate(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"><X className="h-5 w-5" /></button></header>
        <div className="space-y-4 p-5"><p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-500/20 dark:bg-sky-950/30 dark:text-sky-200">Pembuatan data santri, wali, klaim identitas, reservasi NIS, dan kapasitas kamar dijalankan dalam satu transaksi Supabase. Jika ada data yang berbenturan, seluruh transaksi ditolak.</p>
          {onboardingLoading && <div role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat struktur tenant dan nomor NIS…</div>}
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">NIS (10 digit)<input required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={onboardingDraft.nis} onChange={(event) => setOnboardingDraft({ ...onboardingDraft, nis: event.target.value.replace(/\D/g, "") })} className={FORM_CONTROL} /><span className="mt-1 block text-xs font-normal text-slate-500">Nomor hasil generator diperiksa ulang terhadap reservasi tenant saat transaksi.</span></label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Kelas awal<select required value={onboardingDraft.classId} onChange={(event) => setOnboardingDraft({ ...onboardingDraft, classId: event.target.value })} className={FORM_CONTROL}><option value="">Pilih kelas</option>{onboardingStructures.filter((item) => item.category === "Kelas" && !["inactive", "nonaktif", "disabled"].includes(String(item.status || "").toLowerCase())).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Kamar asrama<select required value={onboardingDraft.roomId} onChange={(event) => setOnboardingDraft({ ...onboardingDraft, roomId: event.target.value })} className={FORM_CONTROL}><option value="">Pilih kamar</option>{onboardingStructures.filter((item) => item.category === "Kamar" && !["inactive", "nonaktif", "disabled"].includes(String(item.status || "").toLowerCase())).map((item) => <option key={item.id} value={item.id}>{item.name}{item.building ? ` · ${item.building}` : ""}{item.capacity != null ? ` · kapasitas ${item.capacity}` : ""}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Nama wali santri<input required minLength={2} maxLength={180} value={onboardingDraft.guardianName} onChange={(event) => setOnboardingDraft({ ...onboardingDraft, guardianName: event.target.value })} className={FORM_CONTROL} /></label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Nomor telepon wali<input required minLength={5} maxLength={24} value={onboardingDraft.guardianPhone} onChange={(event) => setOnboardingDraft({ ...onboardingDraft, guardianPhone: event.target.value })} className={FORM_CONTROL} /></label></div>
          {onboardingError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">{onboardingError}</div>}
        </div><footer className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-white/10"><button type="button" onClick={() => setOnboardingCandidate(null)} disabled={onboardingSaving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">Batal</button><button type="submit" disabled={onboardingLoading || onboardingSaving || !onboardingStructures.length} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{onboardingSaving && <Loader2 className="h-4 w-4 animate-spin" />}{onboardingSaving ? "Memproses transaksi…" : "Simpan onboarding"}</button></footer></form></div>}
    </div>
  );
}

function CandidateBilling({
  candidate,
  enabled,
  canManage,
  onCreated,
}: {
  candidate: Candidate;
  enabled: boolean;
  canManage: boolean;
  onCreated: () => void;
}) {
  const [amounts, setAmounts] = useState<Record<"registration" | "tuition", string>>({ registration: "", tuition: "" });
  const [savingType, setSavingType] = useState<"registration" | "tuition" | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const issueBill = async (paymentType: "registration" | "tuition") => {
    const amount = Number(amounts[paymentType]);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError("Nominal tagihan harus berupa bilangan bulat positif.");
      return;
    }
    const label = paymentType === "registration" ? "biaya pendaftaran" : "uang pangkal";
    if (!window.confirm(`Terbitkan ${label} ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)} untuk ${candidate.name}?`)) return;
    setSavingType(paymentType);
    setError("");
    setNotice("");
    try {
      const result = await requestPpdb(`/api/ppdb/candidates/${encodeURIComponent(candidate.id)}/bills`, {
        method: "POST",
        body: JSON.stringify({ bill: { paymentType, amount, clientRequestId: crypto.randomUUID() } }),
      });
      setNotice(result.alreadyExists ? "Tagihan jenis ini sudah ada; tidak dibuat ulang." : "Tagihan diterbitkan dan masuk ke modul Keuangan.");
      setAmounts((current) => ({ ...current, [paymentType]: "" }));
      onCreated();
    } catch (issueError: any) {
      setError(issueError?.message || "Tagihan PPDB belum dapat diterbitkan.");
    } finally {
      setSavingType("");
    }
  };

  const renderBill = (paymentType: "registration" | "tuition", label: string, bill: CandidateBill | null | undefined) => {
    const eligible = paymentType === "registration" ? candidate.stage !== "Rejected" : candidate.stage === "Accepted";
    const status = bill?.status === "paid" ? "Lunas" : bill?.status === "verification" ? "Menunggu verifikasi" : bill?.status === "partial" ? "Dibayar sebagian" : "Belum dibayar";
    return <div key={paymentType} className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</div>{bill && <div className="mt-1 text-xs text-slate-500">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(bill.amount)} · {status}</div>}</div>
        {!bill && enabled && canManage && eligible && <div className="flex flex-wrap items-end gap-2"><label className="text-xs text-slate-500">Nominal (Rp)<input aria-label={`Nominal ${label} ${candidate.name}`} type="number" min="1" step="1" inputMode="numeric" value={amounts[paymentType]} onChange={(event) => setAmounts((current) => ({ ...current, [paymentType]: event.target.value }))} className="mt-1 w-36 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white" /></label><button type="button" onClick={() => void issueBill(paymentType)} disabled={savingType !== ""} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{savingType === paymentType ? "Menerbitkan…" : "Terbitkan"}</button></div>}
        {!bill && paymentType === "tuition" && !eligible && <span className="text-xs text-slate-500">Tersedia setelah status diterima</span>}
      </div>
    </div>;
  };

  return <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900">
    <div><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tagihan PPDB</h3><p className="mt-1 text-xs text-slate-500">Tagihan masuk ke Finance dan tertaut ke santri saat onboarding. Wali melihatnya setelah akun wali dan santri terhubung.</p></div>
    {renderBill("registration", "Biaya pendaftaran", candidate.bills?.registration)}
    {candidate.stage === "Accepted" && renderBill("tuition", "Uang pangkal", candidate.bills?.tuition)}
    {!enabled && <p className="text-xs text-amber-700 dark:text-amber-300">Belum aktif: migration Finance dan flag runtime PPDB–Keuangan harus disiapkan terlebih dahulu.</p>}
    {enabled && !canManage && <p className="text-xs text-amber-700 dark:text-amber-300">Akses modul Keuangan diperlukan untuk menerbitkan tagihan.</p>}
    {error && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{error}</p>}
    {notice && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{notice}</p>}
  </section>;
}

const PPDB_DOCUMENT_LABELS: Array<{ key: CandidateDocumentKey; label: string }> = [
  { key: "kk", label: "Kartu keluarga" },
  { key: "birthCertificate", label: "Akta kelahiran" },
  { key: "reportCards", label: "Rapor" },
  { key: "ijazah", label: "Ijazah" },
  { key: "skhun", label: "SKHUN" },
  { key: "pasPhoto", label: "Pas foto" },
];

function CandidateDocumentDownloads({ candidate, enabled }: { candidate: Candidate; enabled: boolean }) {
  const [downloading, setDownloading] = useState<CandidateDocumentKey | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const available = PPDB_DOCUMENT_LABELS.filter(({ key }) => candidate.documents.downloadable[key]);
  if (available.length === 0) return null;

  const download = async (key: CandidateDocumentKey, label: string) => {
    setDownloading(key);
    setError("");
    setNotice("");
    try {
      await downloadPpdbDocument(candidate, key, label);
      setNotice(`${label} berhasil diunduh. Akses tercatat untuk audit.`);
    } catch (issue: any) {
      setError(issue?.message || "Berkas PPDB belum dapat diunduh.");
    } finally {
      setDownloading("");
    }
  };

  return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
    <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Berkas privat · {candidate.name}</h3><p className="mt-1 text-xs text-slate-500">Diunduh melalui server setelah izin Admin dan tenant diverifikasi. Setiap unduhan berhasil tercatat.</p></div>
    <div className="flex flex-wrap gap-2">{available.map(({ key, label }) => <button key={key} type="button" onClick={() => void download(key, label)} disabled={!enabled || downloading !== ""} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">{downloading === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{downloading === key ? "Mengunduh…" : label}</button>)}</div>
    {!enabled && <p className="text-xs text-amber-700 dark:text-amber-300">Unduh belum diaktifkan. Aktifkan hanya setelah migration dan uji akses Storage selesai.</p>}
    {error && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{error}</p>}
    {notice && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{notice}</p>}
  </section>;
}
