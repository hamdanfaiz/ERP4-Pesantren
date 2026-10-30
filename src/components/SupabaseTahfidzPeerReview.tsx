import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, MessageSquareText, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { getAccessToken } from "../authSession";
import { pendingMutationIds } from "../utils/pendingMutationId";

type ReviewableRecord = {
  recordId: string;
  studentName: string;
  halaqahName: string;
  activityType: string;
  surahName: string;
  ayahStart: number;
  ayahEnd: number;
  performedAt: string;
};

type PeerReview = {
  id: string;
  recordId: string;
  halaqahName: string;
  studentName: string;
  reviewerName: string;
  reviewText: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  moderationNote?: string | null;
  surahName: string;
  ayahStart: number;
  ayahEnd: number;
  activityType: string;
};

type Snapshot = {
  canSubmit: boolean;
  canModerate: boolean;
  reviewableRecords: ReviewableRecord[];
  reviews: PeerReview[];
};

const EMPTY: Snapshot = { canSubmit: false, canModerate: false, reviewableRecords: [], reviews: [] };
const FIELD = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 disabled:opacity-60 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";
const PRIMARY = "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5";

async function requestPeerReview(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Penilaian Tahfidz belum dapat diproses.");
  return payload;
}

function statusLabel(status: PeerReview["status"]) {
  return status === "approved" ? "Disetujui" : status === "rejected" ? "Perlu diperbaiki" : "Menunggu tinjauan Ustadz";
}

function localDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Tanggal tidak tersedia" : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function SupabaseTahfidzPeerReview() {
  const { role, user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [moderationNotes, setModerationNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await requestPeerReview("/api/tahfidz/peer-reviews");
      setSnapshot({
        canSubmit: result.canSubmit === true,
        canModerate: result.canModerate === true,
        reviewableRecords: Array.isArray(result.reviewableRecords) ? result.reviewableRecords : [],
        reviews: Array.isArray(result.reviews) ? result.reviews : [],
      });
    } catch (cause: any) {
      setSnapshot(EMPTY);
      setError(cause?.message || "Penilaian Tahfidz belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!["Santri", "Ustadz"].includes(role || "")) {
      setSnapshot(EMPTY);
      setError("");
      setLoading(false);
      return;
    }
    void refresh();
  }, [refresh, reloadVersion, role, user?.tenantId, user?.uid]);

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    const recordId = selectedRecordId;
    const text = reviewText.trim();
    if (!recordId || text.length < 10 || !user?.tenantId || !user?.uid) return;
    setBusyId("submit");
    setError("");
    setNotice("");
    let lease: Awaited<ReturnType<typeof pendingMutationIds.acquire>> | null = null;
    try {
      const payload = { recordId, reviewText: text };
      lease = await pendingMutationIds.acquire(`tahfidz-peer-review:${user.tenantId}:${user.uid}`, payload);
      const result = await requestPeerReview("/api/tahfidz/peer-reviews", {
        method: "POST",
        body: JSON.stringify({ review: { ...payload, clientRequestId: lease.requestId } }),
      });
      lease.clear();
      setReviewText("");
      setSelectedRecordId("");
      setNotice(result.alreadyApplied ? "Penilaian sudah tersimpan dan menunggu tinjauan Ustadz." : "Penilaian tersimpan dan menunggu tinjauan Ustadz.");
      setReloadVersion((value) => value + 1);
    } catch (cause: any) {
      setError(cause?.message || "Penilaian belum terkonfirmasi. Ulangi dengan isi yang sama jika koneksi terputus.");
    } finally {
      setBusyId("");
    }
  };

  const moderate = async (review: PeerReview, decision: "approved" | "rejected") => {
    const moderationNote = (moderationNotes[review.id] || "").trim();
    if (decision === "rejected" && moderationNote.length < 5) {
      setError("Tuliskan alasan minimal 5 karakter agar Santri tahu cara memperbaiki penilaiannya.");
      return;
    }
    setBusyId(review.id);
    setError("");
    setNotice("");
    try {
      await requestPeerReview(`/api/tahfidz/peer-reviews/${encodeURIComponent(review.id)}/moderation`, {
        method: "POST",
        body: JSON.stringify({ decision, moderationNote: moderationNote || null }),
      });
      setNotice(decision === "approved" ? "Penilaian disetujui dan kini terlihat di halaqah." : "Penilaian ditolak. Catatan perbaikan dikirim kepada Santri.");
      setReloadVersion((value) => value + 1);
    } catch (cause: any) {
      setError(cause?.message || "Keputusan moderasi belum terkonfirmasi.");
    } finally {
      setBusyId("");
    }
  };

  const isStudent = role === "Santri";
  const pendingReviews = snapshot.reviews.filter((review) => review.status === "pending");
  const shownReviews = snapshot.canModerate
    ? snapshot.reviews.filter((review) => review.status !== "pending")
    : snapshot.reviews;

  return <section className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white"><MessageSquareText className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />Penilaian Setoran Antar-Santri</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Masukan berbentuk teks untuk setoran di halaqah yang sama. Ustadz pengampu meninjau setiap masukan sebelum dapat dibaca anggota lain.</p></div>
      <button type="button" onClick={() => setReloadVersion((value) => value + 1)} disabled={loading || Boolean(busyId)} className={SECONDARY}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Muat ulang</button>
    </header>

    <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p>Jaga adab dan kerahasiaan. Jangan tuliskan nomor telepon, alamat, atau informasi pribadi. Penilaian ditampilkan dengan nama pengirim setelah disetujui Ustadz; audio dan lampiran tidak diterima.</p></div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}

    {loading ? <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900"><Loader2 className="h-4 w-4 animate-spin" />Memuat penilaian…</div> : <>
      {isStudent && snapshot.canSubmit && <form onSubmit={(event) => void submitReview(event)} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-white">Kirim masukan untuk setoran</h3>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Setoran santri lain<select className={`${FIELD} mt-1.5`} required value={selectedRecordId} onChange={(event) => setSelectedRecordId(event.target.value)}><option value="">Pilih setoran</option>{snapshot.reviewableRecords.map((record) => <option key={record.recordId} value={record.recordId}>{record.studentName} · {record.surahName} {record.ayahStart}–{record.ayahEnd} · {record.halaqahName}</option>)}</select></label>
        {selectedRecordId && (() => { const selected = snapshot.reviewableRecords.find((record) => record.recordId === selectedRecordId); return selected ? <p className="text-xs text-slate-500">{selected.activityType} · {localDate(selected.performedAt)}</p> : null; })()}
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Masukan yang membangun<textarea className={`${FIELD} mt-1.5`} required minLength={10} maxLength={1200} rows={4} value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder="Contoh: Bacaan sudah jelas. Coba perhatikan kembali panjang pendek pada ayat berikutnya." /><span className="mt-1 block text-xs font-normal text-slate-500">10–1.200 karakter. Masukan akan ditinjau Ustadz sebelum dibagikan.</span></label>
        <button type="submit" className={PRIMARY} disabled={!selectedRecordId || reviewText.trim().length < 10 || Boolean(busyId)}>{busyId === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}Kirim untuk ditinjau</button>
        {!snapshot.reviewableRecords.length && <p className="text-sm text-slate-500">Belum ada setoran santri lain yang dapat dinilai di halaqah Anda.</p>}
      </form>}

      {snapshot.canModerate && <section className="space-y-3"><div><h3 className="font-semibold text-slate-900 dark:text-white">Antrean tinjauan Ustadz</h3><p className="mt-1 text-sm text-slate-500">Hanya penilaian pending dari halaqah yang Anda ampu yang dapat dimoderasi.</p></div>{pendingReviews.length ? pendingReviews.map((review) => <article key={review.id} className="space-y-3 rounded-2xl border border-amber-200 bg-white p-5 dark:border-amber-400/20 dark:bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-slate-900 dark:text-white">{review.studentName} · {review.surahName} {review.ayahStart}–{review.ayahEnd}</p><p className="mt-1 text-xs text-slate-500">{review.halaqahName} · dari {review.reviewerName} · {localDate(review.createdAt)}</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">{statusLabel(review.status)}</span></div><p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-white/5 dark:text-slate-200">{review.reviewText}</p><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Catatan jika ditolak<textarea className={`${FIELD} mt-1.5`} rows={2} maxLength={500} value={moderationNotes[review.id] || ""} onChange={(event) => setModerationNotes((old) => ({ ...old, [review.id]: event.target.value }))} placeholder="Jelaskan perubahan yang diperlukan" /></label><div className="flex flex-wrap justify-end gap-2"><button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={Boolean(busyId)} onClick={() => void moderate(review, "rejected")}>{busyId === review.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Tolak dengan catatan</button><button type="button" className={PRIMARY} disabled={Boolean(busyId)} onClick={() => void moderate(review, "approved")}>{busyId === review.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Setujui</button></div></article>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">Tidak ada penilaian yang menunggu tinjauan pada halaqah Anda.</div>}</section>}

      {!isStudent && !snapshot.canModerate && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">Penilaian antar-santri tersedia untuk Santri dalam halaqah aktif dan Ustadz yang ditugaskan pada halaqah tersebut.</div>}
      {isStudent && !snapshot.canSubmit && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">Akun Anda belum terhubung ke halaqah aktif. Hubungi Admin pesantren untuk memeriksa penempatan.</div>}

      {shownReviews.length > 0 && <section className="space-y-3"><h3 className="font-semibold text-slate-900 dark:text-white">{snapshot.canModerate ? "Riwayat penilaian terbaru" : "Penilaian halaqah"}</h3>{shownReviews.map((review) => <article key={review.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-slate-900 dark:text-white">{review.studentName} · {review.surahName} {review.ayahStart}–{review.ayahEnd}</p><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${review.status === "approved" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200" : review.status === "rejected" ? "bg-rose-100 text-rose-800 dark:bg-rose-400/10 dark:text-rose-200" : "bg-amber-100 text-amber-900 dark:bg-amber-400/10 dark:text-amber-100"}`}>{statusLabel(review.status)}</span></div><p className="mt-1 text-xs text-slate-500">{review.halaqahName} · dari {review.reviewerName} · {localDate(review.createdAt)}</p><p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{review.reviewText}</p>{review.moderationNote && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-400/10 dark:text-rose-100">Catatan Ustadz: {review.moderationNote}</p>}</article>)}</section>}
    </>}
  </section>;
}
