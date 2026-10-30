import { legacyArchiveImportEnabled } from "../runtimeBackend";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Archive, BookOpen, Check, Clock3, Download, FileText, Loader2, Music, Plus, RefreshCw, Search, UploadCloud, Users, X } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../utils/supabase";
import { addCalendarDays, isCalendarDate, tenantBusinessDate } from "../utils/businessDate";
import { pendingMutationIds } from "../utils/pendingMutationId";

type Book = { id: string; title: string; author: string; category: string; isbn: string; totalCopies: number; shelf: string; availableCopies: number };
type Student = { id: string; name: string; nis: string };
type Circulation = { id: string; bookId: string; bookTitle: string; studentId: string; student: string; nis: string; borrowDate: string; dueDate: string; returnedDate: string | null; status: string; fine: number };
type DigitalAsset = { id: string; title: string; description: string | null; fileName: string; contentType: string; fileSize: number; uploadedAt: string };
type Snapshot = { businessDate: string; books: Book[]; students: Student[]; circulations: Circulation[]; digitalAssets: DigitalAsset[] };
type CirculationImportRecord = { recordRef: string; borrower: string; sourceBookTitle: string; targetBookTitle: string; borrowedOn: string | null; dueOn: string | null; returnedOn: string | null; status: "active" | "returned" | null; studentId: string; studentName: string; alreadyImported: boolean; issues: string[]; warnings: string[] };
type CirculationImportPreview = { snapshotFingerprint: string; counts: { source: number; ready: number; alreadyImported: number; active: number; returned: number; invalid: number }; issueCount: number; blockingCount: number; canApply: boolean; issues: Array<{ code: string; recordRef: string }>; records: CirculationImportRecord[]; studentOptions: Array<{ id: string; name: string; nis: string; status: string }> };

async function requestLibrary(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Layanan perpustakaan Supabase belum dapat diproses.");
  return payload;
}

async function runIdempotentLibraryMutation<T>(operation: string, tenantId: string, actorId: string, payload: unknown, send: (clientRequestId: string) => Promise<T>): Promise<T> {
  const lease = await pendingMutationIds.acquire(`library:${operation}`, { tenantId, actorId, payload });
  const result = await send(lease.requestId);
  lease.clear();
  return result;
}

function markOverdue(circulations: Circulation[], today: string) {
  return circulations.map((item) => item.status === "Active" && item.dueDate < today ? { ...item, status: "Overdue" } : item);
}

function circulationImportIssueLabel(code: string) {
  const labels: Record<string, string> = {
    borrower_name_missing: "Nama peminjam sumber tidak tersedia",
    book_title_missing: "Judul buku sumber tidak tersedia",
    book_not_imported_by_source_id: "Buku belum dipetakan melalui ID sumber",
    invalid_borrow_date: "Tanggal pinjam sumber tidak valid",
    invalid_due_date: "Tanggal jatuh tempo sumber tidak valid",
    due_date_out_of_range: "Rentang pinjam melebihi batas 90 hari",
    unsupported_status: "Status sumber tidak dikenali",
    returned_date_missing_or_invalid: "Tanggal kembali wajib untuk transaksi selesai",
    active_record_has_returned_date: "Status aktif bertentangan dengan tanggal kembali",
    fine_requires_finance_reconciliation: "Denda harus direkonsiliasi dengan Finance",
    student_mapping_required: "Santri tujuan belum dipilih",
    student_not_found_in_tenant: "Santri tidak ditemukan pada tenant ini",
    student_name_mismatch_review_identity: "Nama berbeda; identitas perlu direkonsiliasi",
    imported_record_changed_or_mapping_conflict: "Data berubah dari impor sebelumnya",
    duplicate_source_record: "ID transaksi sumber duplikat",
  };
  return labels[code] || code.replaceAll("_", " ");
}

const emptySnapshot: Snapshot = { businessDate: tenantBusinessDate(), books: [], students: [], circulations: [], digitalAssets: [] };

export function SupabaseLibraryManager() {
  const { role, user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<"catalog" | "circulation" | "digital">("catalog");
  const [digitalAssetsEnabled, setDigitalAssetsEnabled] = useState(false);
  const [search, setSearch] = useState("");
  const [bookModal, setBookModal] = useState(false);
  const [checkoutModal, setCheckoutModal] = useState(false);
  const [digitalAssetModal, setDigitalAssetModal] = useState(false);
  const [digitalAssetForm, setDigitalAssetForm] = useState({ title: "", description: "" });
  const [digitalAssetFile, setDigitalAssetFile] = useState<File | null>(null);
  const [circulationImportOpen, setCirculationImportOpen] = useState(false);
  const [circulationImportBusy, setCirculationImportBusy] = useState(false);
  const [circulationImportError, setCirculationImportError] = useState("");
  const [circulationImportPreview, setCirculationImportPreview] = useState<CirculationImportPreview | null>(null);
  const [circulationStudentMappings, setCirculationStudentMappings] = useState<Record<string, string>>({});
  const [previewedMappingKey, setPreviewedMappingKey] = useState("");
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [bookForm, setBookForm] = useState({ title: "", author: "", category: "Kajian Islam", isbn: "", totalCopies: 1, shelf: "" });
  const [checkoutForm, setCheckoutForm] = useState({ studentId: "", bookId: "", borrowedOn: emptySnapshot.businessDate, dueOn: addCalendarDays(emptySnapshot.businessDate, 14) });
  const canManage = ["Admin", "SuperAdmin", "Ustadz"].includes(role) && user?.modulePermissions?.library !== false;
  const canImportLegacy = legacyArchiveImportEnabled && ["Admin", "SuperAdmin"].includes(role) && user?.modulePermissions?.library !== false;
  const mappingKey = JSON.stringify(Object.entries(circulationStudentMappings).sort(([left], [right]) => left.localeCompare(right)));

  const refresh = useCallback(async (): Promise<Snapshot> => {
    const [payload, assetPayload] = await Promise.all([
      requestLibrary("/api/library/snapshot"),
      requestLibrary("/api/library/assets"),
    ]);
    const businessDate = isCalendarDate(payload.businessDate) ? payload.businessDate : tenantBusinessDate();
    const nextSnapshot: Snapshot = {
      businessDate,
      books: Array.isArray(payload.books) ? payload.books : [],
      students: Array.isArray(payload.students) ? payload.students : [],
      circulations: markOverdue(Array.isArray(payload.circulations) ? payload.circulations : [], businessDate),
      digitalAssets: Array.isArray(assetPayload.assets) ? assetPayload.assets : [],
    };
    setDigitalAssetsEnabled(assetPayload.enabled === true);
    if (assetPayload.enabled !== true) setActiveTab("catalog");
    setSnapshot(nextSnapshot);
    return nextSnapshot;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    setDigitalAssetsEnabled(false);
    Promise.all([requestLibrary("/api/library/snapshot"), requestLibrary("/api/library/assets")])
      .then(([payload, assetPayload]) => {
        if (active) {
          const businessDate = isCalendarDate(payload.businessDate) ? payload.businessDate : tenantBusinessDate();
          setDigitalAssetsEnabled(assetPayload.enabled === true);
          if (assetPayload.enabled !== true) setActiveTab("catalog");
          setSnapshot({ businessDate, books: Array.isArray(payload.books) ? payload.books : [], students: Array.isArray(payload.students) ? payload.students : [], circulations: markOverdue(Array.isArray(payload.circulations) ? payload.circulations : [], businessDate), digitalAssets: Array.isArray(assetPayload.assets) ? assetPayload.assets : [] });
        }
      })
      .catch((loadError: any) => { if (active) setError(loadError?.message || "Data perpustakaan belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.tenantId, user?.uid]);

  const filteredBooks = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("id-ID");
    if (!needle) return snapshot.books;
    return snapshot.books.filter((book) => [book.title, book.author, book.category, book.isbn, book.shelf]
      .some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(needle)));
  }, [search, snapshot.books]);
  const filteredCirculations = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("id-ID");
    return snapshot.circulations.filter((item) => !needle || [item.bookTitle, item.student, item.nis]
      .some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(needle)));
  }, [search, snapshot.circulations]);
  const filteredDigitalAssets = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("id-ID");
    return snapshot.digitalAssets.filter((asset) => !needle || [asset.title, asset.fileName, asset.description || ""]
      .some((value) => String(value).toLocaleLowerCase("id-ID").includes(needle)));
  }, [search, snapshot.digitalAssets]);
  const isOverdue = (item: Circulation) => item.status !== "Returned" && item.dueDate < snapshot.businessDate;
  const activeLoans = snapshot.circulations.filter((item) => item.status !== "Returned").length;
  const overdueLoans = snapshot.circulations.filter(isOverdue).length;
  const availableCopies = snapshot.books.reduce((sum, book) => sum + book.availableCopies, 0);

  const openBookForm = (book?: Book) => {
    setError(""); setNotice(""); setEditingBook(book || null);
    setBookForm(book ? { title: book.title, author: book.author, category: book.category, isbn: book.isbn, totalCopies: book.totalCopies, shelf: book.shelf } : { title: "", author: "", category: "Kajian Islam", isbn: "", totalCopies: 1, shelf: "" });
    setBookModal(true);
  };

  const openCheckoutForm = async () => {
    setError(""); setNotice("");
    try {
      const latest = await refresh();
      if (!latest.students.length || !latest.books.some((book) => book.availableCopies > 0)) {
        setError("Tidak ada santri atau eksemplar buku yang tersedia saat ini.");
        return;
      }
      setCheckoutForm({ studentId: "", bookId: "", borrowedOn: latest.businessDate, dueOn: addCalendarDays(latest.businessDate, 14) });
      setCheckoutModal(true);
    } catch (loadError: any) {
      setError(loadError?.message || "Data terbaru belum dapat dimuat.");
    }
  };

  const submitBook = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const book = { ...bookForm, id: editingBook?.id || null };
    try {
      await runIdempotentLibraryMutation(editingBook ? "update-book" : "create-book", user?.tenantId || "", user?.uid || "", book, (clientRequestId) =>
        requestLibrary("/api/library/books", { method: "POST", body: JSON.stringify({ book: { ...book, clientRequestId } }) }));
      setBookModal(false);
      setNotice(editingBook ? "Data buku berhasil diperbarui." : "Buku berhasil ditambahkan.");
      try { await refresh(); } catch { setNotice("Buku berhasil disimpan, tetapi daftar belum berhasil dimuat ulang. Gunakan tombol Muat ulang."); }
    } catch (saveError: any) { setError(saveError?.message || "Buku belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  const submitCheckout = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const checkout = { ...checkoutForm };
    try {
      await runIdempotentLibraryMutation("checkout", user?.tenantId || "", user?.uid || "", checkout, (clientRequestId) =>
        requestLibrary("/api/library/checkout", { method: "POST", body: JSON.stringify({ checkout: { ...checkout, clientRequestId } }) }));
      setCheckoutModal(false);
      setCheckoutForm({ studentId: "", bookId: "", borrowedOn: snapshot.businessDate, dueOn: addCalendarDays(snapshot.businessDate, 14) });
      setNotice("Peminjaman berhasil dicatat.");
      try { await refresh(); } catch { setNotice("Peminjaman berhasil dicatat, tetapi daftar belum berhasil dimuat ulang. Gunakan tombol Muat ulang."); }
    } catch (checkoutError: any) { setError(checkoutError?.message || "Peminjaman belum dapat dicatat."); }
    finally { setSaving(false); }
  };

  const submitDigitalAsset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!digitalAssetFile) { setError("Pilih berkas yang akan diunggah."); return; }
    setSaving(true); setError(""); setNotice("");
    let committed = false;
    try {
      const extension = digitalAssetFile.name.split(".").pop()?.toLowerCase() || "";
      const contentType = ({ pdf: "application/pdf", epub: "application/epub+zip", mp3: "audio/mpeg", m4a: "audio/mp4" } as Record<string, string>)[extension] || digitalAssetFile.type;
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await digitalAssetFile.arrayBuffer()));
      const contentSha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const payload = { title: digitalAssetForm.title.trim(), description: digitalAssetForm.description.trim(), fileName: digitalAssetFile.name, contentType, fileSize: digitalAssetFile.size, contentSha256 };
      const lease = await pendingMutationIds.acquire("library:upload-digital-asset", {
        tenantId: user?.tenantId || "", actorId: user?.uid || "", payload,
      });
      const reservation = await requestLibrary("/api/library/assets/upload-url", {
        method: "POST",
        body: JSON.stringify({ asset: { ...payload, clientRequestId: lease.requestId } }),
      });
      if (!reservation.alreadyCompleted && !reservation.objectAlreadyUploaded) {
        const { error: uploadError } = await supabase.storage.from("erp4-private-library-assets")
          .uploadToSignedUrl(reservation.storagePath, reservation.uploadToken, digitalAssetFile, { contentType, upsert: false });
        if (uploadError) throw new Error("Unggahan berkas gagal. Periksa koneksi lalu coba lagi.");
      }
      const result = reservation.alreadyCompleted
        ? reservation
        : await requestLibrary("/api/library/assets/finalize", { method: "POST", body: JSON.stringify({ clientRequestId: lease.requestId }) });
      lease.clear();
      committed = true;
      setDigitalAssetModal(false); setDigitalAssetFile(null); setDigitalAssetForm({ title: "", description: "" });
      setNotice("Berkas berhasil disimpan secara privat untuk tenant ini.");
      try { await refresh(); } catch { setNotice("Berkas tersimpan, tetapi daftar belum berhasil dimuat ulang. Gunakan tombol Muat ulang."); }
      return result;
    } catch (uploadError: any) {
      setError(uploadError?.message || "Berkas belum dapat disimpan. Anda dapat mencoba kembali dengan berkas yang sama.");
    } finally {
      setSaving(false);
      if (committed) setDigitalAssetFile(null);
    }
  };

  const openDigitalAsset = async (asset: DigitalAsset) => {
    setError(""); setNotice("");
    try {
      const result = await requestLibrary(`/api/library/assets/${encodeURIComponent(asset.id)}/download-url`);
      window.location.assign(result.signedUrl);
    } catch (downloadError: any) {
      setError(downloadError?.message || "Berkas belum dapat dibuka.");
    }
  };

  const returnBook = async (circulation: Circulation) => {
    if (!window.confirm(`Catat pengembalian ${circulation.bookTitle} dari ${circulation.student}?`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const latest = await refresh();
      const current = latest.circulations.find((item) => item.id === circulation.id);
      if (!current) throw new Error("Transaksi peminjaman tidak ditemukan pada data terbaru.");
      if (current.status === "Returned") {
        setNotice("Pengembalian ini sudah tercatat. Data terbaru sudah diperiksa.");
        return;
      }
      const payload = { circulationId: circulation.id, returnedOn: latest.businessDate };
      await runIdempotentLibraryMutation("return", user?.tenantId || "", user?.uid || "", payload, (clientRequestId) =>
        requestLibrary("/api/library/returns", { method: "POST", body: JSON.stringify({ return: { ...payload, clientRequestId } }) }));
      setNotice("Pengembalian berhasil dicatat.");
      try { await refresh(); } catch { setNotice("Pengembalian berhasil dicatat, tetapi daftar belum berhasil dimuat ulang. Gunakan tombol Muat ulang."); }
    } catch (returnError: any) { setError(returnError?.message || "Pengembalian belum dapat dicatat."); }
    finally { setSaving(false); }
  };

  const previewLegacyCirculations = async (mappings = circulationStudentMappings, mappingsKey = mappingKey) => {
    setCirculationImportBusy(true); setCirculationImportError("");
    try {
      const payload = await requestLibrary("/api/library/circulations/legacy/import", {
        method: "POST", body: JSON.stringify({ action: "preview", studentMappings: mappings }),
      });
      setCirculationImportPreview(payload as CirculationImportPreview);
      setPreviewedMappingKey(mappingsKey);
    } catch (previewError: any) {
      setCirculationImportError(previewError?.message || "Pratinjau riwayat peminjaman belum dapat dimuat.");
      setCirculationImportPreview(null);
    } finally { setCirculationImportBusy(false); }
  };

  const openLegacyCirculationImport = () => {
    setCirculationImportOpen(true); setCirculationImportError("");
    setCirculationImportPreview(null); setCirculationStudentMappings({}); setPreviewedMappingKey("");
    window.setTimeout(() => { void previewLegacyCirculations({}, "[]"); }, 0);
  };

  const applyLegacyCirculations = async () => {
    if (!circulationImportPreview?.canApply || previewedMappingKey !== mappingKey) return;
    setCirculationImportBusy(true); setCirculationImportError("");
    try {
      await requestLibrary("/api/library/circulations/legacy/import", {
        method: "POST",
        body: JSON.stringify({ action: "apply", expectedFingerprint: circulationImportPreview.snapshotFingerprint, studentMappings: circulationStudentMappings }),
      });
      await refresh();
      setCirculationImportOpen(false); setCirculationImportPreview(null);
    } catch (applyError: any) {
      setCirculationImportError(applyError?.message || "Riwayat peminjaman belum dapat diimpor. Buat pratinjau ulang.");
    } finally { setCirculationImportBusy(false); }
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
        <div><div className="mb-2 inline-flex rounded-lg bg-slate-100 p-2.5 dark:bg-slate-800"><BookOpen className="h-5 w-5 text-slate-700 dark:text-slate-200" /></div><h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Perpustakaan</h1><p className="mt-1 text-sm text-slate-500">Katalog dan peminjaman tenant dikelola melalui Supabase.</p></div>
        <div className="flex flex-wrap gap-2">{canManage && activeTab === "catalog" && <button onClick={() => openBookForm()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Plus className="h-4 w-4" /> Tambah buku</button>}{canManage && activeTab === "circulation" && <button onClick={openCheckoutForm} disabled={!snapshot.students.length || !snapshot.books.some((book) => book.availableCopies > 0)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"><Plus className="h-4 w-4" /> Catat peminjaman</button>}{canManage && digitalAssetsEnabled && activeTab === "digital" && <button onClick={() => { setError(""); setDigitalAssetForm({ title: "", description: "" }); setDigitalAssetFile(null); setDigitalAssetModal(true); }} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"><UploadCloud className="h-4 w-4" /> Unggah berkas</button>}<button onClick={() => { setLoading(true); setError(""); void refresh().catch((refreshError: any) => setError(refreshError?.message || "Data belum dapat dimuat.")).finally(() => setLoading(false)); }} aria-label="Muat ulang perpustakaan" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" /></button></div>
      </header>

      {canImportLegacy && activeTab === "circulation" && <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900"><div><p className="text-sm font-semibold text-slate-900 dark:text-white">Riwayat arsip</p><p className="mt-1 text-xs text-slate-500">Pemetaan santri dilakukan manual; data yang tidak dapat direkonsiliasi akan ditahan.</p></div><button type="button" onClick={openLegacyCirculationImport} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Archive className="h-4 w-4" /> Pratinjau impor arsip</button></div>}

      {circulationImportOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="legacy-circulation-title" className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"><header className="flex items-center justify-between border-b border-slate-200 p-4 sm:p-5 dark:border-slate-800"><div><h2 id="legacy-circulation-title" className="font-semibold text-slate-900 dark:text-white">Pratinjau impor riwayat peminjaman</h2><p className="mt-1 text-xs text-slate-500">Hanya Admin tenant. Tidak ada data ditulis sampai Anda memilih Terapkan.</p></div><button type="button" onClick={() => setCirculationImportOpen(false)} disabled={circulationImportBusy} aria-label="Tutup pratinjau" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></header><div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5"><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">Katalog buku harus sudah diimpor. Santri dipilih manual per transaksi; judul dan nama tidak dipakai sebagai relasi otomatis. Denda dan tanggal kembali yang tidak tersedia akan memblokir penerapan.</div>{circulationImportError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{circulationImportError}</div>}{circulationImportBusy && !circulationImportPreview ? <div role="status" className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Membaca dan memvalidasi arsip tenant…</div> : circulationImportPreview ? <><div className="grid gap-3 sm:grid-cols-4">{[{label:"Sumber",value:circulationImportPreview.counts.source},{label:"Siap",value:circulationImportPreview.counts.ready},{label:"Sudah diimpor",value:circulationImportPreview.counts.alreadyImported},{label:"Perlu koreksi",value:circulationImportPreview.counts.invalid}].map(({label,value})=><div key={label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{value}</p></div>)}</div>{circulationImportPreview.records.length ? <div className="space-y-3">{circulationImportPreview.records.map((record)=><article key={record.recordRef} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium text-slate-900 dark:text-white">{record.borrower || "Nama tidak tersedia"}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{record.sourceBookTitle || "Judul buku tidak tersedia"}{record.targetBookTitle && record.targetBookTitle !== record.sourceBookTitle ? ` → ${record.targetBookTitle}` : ""}</p><p className="mt-1 text-xs text-slate-500">{record.borrowedOn || "Tanggal pinjam tidak valid"} · Jatuh tempo {record.dueOn || "tidak valid"} · {record.status === "returned" ? `Kembali ${record.returnedOn || "tanggal tidak ada"}` : record.status === "active" ? "Belum kembali" : "Status tidak dikenal"}</p></div>{record.alreadyImported && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Sudah diimpor</span>}</div><label className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-200">Pilih santri tujuan<select value={circulationStudentMappings[record.recordRef] || (record.alreadyImported ? record.studentId : "")} onChange={(event)=>setCirculationStudentMappings((current)=>({...current,[record.recordRef]:event.target.value}))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700 dark:text-slate-200"><option value="">Pilih berdasarkan rekonsiliasi identitas</option>{circulationImportPreview.studentOptions.map((student)=><option key={student.id} value={student.id}>{student.name}{student.nis ? ` · ${student.nis}` : ""}{student.status && student.status.toLowerCase() !== "active" ? ` · ${student.status}` : ""}</option>)}</select></label>{record.issues.length>0 && <ul className="mt-3 space-y-1 text-xs text-rose-700 dark:text-rose-300">{record.issues.map((code,index)=><li key={`${code}-${index}`}>• {circulationImportIssueLabel(code)}</li>)}</ul>}</article>)}</div> : <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800">Tidak ada data sirkulasi pada arsip pesantren ini.</div>}{previewedMappingKey !== mappingKey && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">Pemetaan berubah. Jalankan pratinjau ulang sebelum menerapkan.</p>}{circulationImportPreview.canApply && <p className="text-sm text-emerald-700 dark:text-emerald-300">Semua data memiliki pemetaan yang valid. Tinjau setiap baris sebelum menerapkan.</p>}</> : null}</div><footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={()=>setCirculationImportOpen(false)} disabled={circulationImportBusy} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Tutup</button><button type="button" onClick={()=>void previewLegacyCirculations()} disabled={circulationImportBusy} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">{circulationImportBusy && <Loader2 className="h-4 w-4 animate-spin" />}Pratinjau ulang</button><button type="button" onClick={()=>{if(circulationImportPreview?.canApply && previewedMappingKey===mappingKey && window.confirm(`Terapkan ${circulationImportPreview.counts.source} riwayat peminjaman yang sudah dipetakan? Data sumber tidak akan diubah.`)) void applyLegacyCirculations();}} disabled={circulationImportBusy || !circulationImportPreview?.canApply || previewedMappingKey!==mappingKey} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Archive className="h-4 w-4" />Terapkan impor</button></footer></section></div>}

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">Katalog, peminjaman, dan berkas digital memakai Supabase tenant. Berkas arsip lama belum tersedia untuk diunduh karena salinan byte sumbernya tidak ditemukan; pembayaran denda masih menunggu integrasi transaksi Finance.</div>
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">{notice}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: "Judul aktif", value: snapshot.books.length, icon: BookOpen },
        { label: "Eksemplar tersedia", value: availableCopies, icon: Check },
        { label: "Sedang dipinjam", value: activeLoans, icon: Users },
        { label: "Terlambat", value: overdueLoans, icon: Clock3 },
      ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{label}</p><Icon className="h-4 w-4 text-slate-400" /></div><p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">{loading ? "—" : value}</p></div>)}</section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"><div className="flex flex-wrap gap-2"><button onClick={() => { setActiveTab("catalog"); setSearch(""); }} aria-pressed={activeTab === "catalog"} className={`rounded-lg px-3 py-2 text-sm font-medium ${activeTab === "catalog" ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>Katalog</button><button onClick={() => { setActiveTab("circulation"); setSearch(""); }} aria-pressed={activeTab === "circulation"} className={`rounded-lg px-3 py-2 text-sm font-medium ${activeTab === "circulation" ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>Peminjaman</button>{digitalAssetsEnabled && <button onClick={() => { setActiveTab("digital"); setSearch(""); }} aria-pressed={activeTab === "digital"} className={`rounded-lg px-3 py-2 text-sm font-medium ${activeTab === "digital" ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>Bahan digital</button>}</div><label className="relative block w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeTab === "catalog" ? "Cari buku, penulis, ISBN…" : activeTab === "circulation" ? "Cari santri atau buku…" : "Cari judul atau nama berkas…"} className="w-full rounded-lg border border-slate-200 bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700" /></label></div>
        {loading ? <div role="status" className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat data perpustakaan tenant…</div>
          : activeTab === "catalog" ? (filteredBooks.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40"><tr><th className="p-4">Judul / Penulis</th><th className="p-4">Kategori</th><th className="p-4">ISBN</th><th className="p-4">Rak</th><th className="p-4 text-right">Tersedia</th>{canManage && <th className="p-4 text-right">Aksi</th>}</tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{filteredBooks.map((book) => <tr key={book.id}><td className="p-4"><div className="font-medium text-slate-900 dark:text-white">{book.title}</div><div className="mt-1 text-xs text-slate-500">{book.author}</div></td><td className="p-4 text-slate-600 dark:text-slate-300">{book.category}</td><td className="p-4 text-slate-500">{book.isbn || "—"}</td><td className="p-4 text-slate-500">{book.shelf || "—"}</td><td className="p-4 text-right font-medium text-slate-800 dark:text-slate-200">{book.availableCopies}/{book.totalCopies}</td>{canManage && <td className="p-4 text-right"><button onClick={() => openBookForm(book)} className="rounded-md px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40">Ubah</button></td>}</tr>)}</tbody></table></div> : <div className="p-12 text-center"><BookOpen className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-800 dark:text-slate-200">{search ? "Buku tidak ditemukan" : "Katalog Supabase masih kosong"}</p><p className="mt-1 text-sm text-slate-500">Data contoh lama tidak disalin otomatis. Rekonsiliasi dan impor tenant dilakukan sebelum mengaktifkan runtime.</p></div>)
          : activeTab === "circulation" ? (filteredCirculations.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40"><tr><th className="p-4">Buku</th><th className="p-4">Santri</th><th className="p-4">Tanggal pinjam</th><th className="p-4">Jatuh tempo</th><th className="p-4">Status</th>{canManage && <th className="p-4 text-right">Aksi</th>}</tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{filteredCirculations.map((item) => <tr key={item.id}><td className="p-4 font-medium text-slate-900 dark:text-white">{item.bookTitle}</td><td className="p-4 text-slate-600 dark:text-slate-300">{item.student}<div className="text-xs text-slate-500">{item.nis}</div></td><td className="p-4 text-slate-500">{item.borrowDate}</td><td className="p-4 text-slate-500">{item.dueDate}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs ${item.status === "Returned" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : item.status === "Overdue" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}>{item.status === "Returned" ? `Kembali ${item.returnedDate}` : item.status === "Overdue" ? "Terlambat" : "Dipinjam"}</span></td>{canManage && <td className="p-4 text-right">{item.status !== "Returned" && <button disabled={saving} onClick={() => void returnBook(item)} className="rounded-md px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40">Catat kembali</button>}</td>}</tr>)}</tbody></table></div> : <div className="p-12 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-800 dark:text-slate-200">Belum ada transaksi peminjaman Supabase</p><p className="mt-1 text-sm text-slate-500">Transaksi lama tidak disalin otomatis sebelum pemeriksaan pemetaan Buku dan Santri.</p></div>) : null}
        {activeTab === "digital" && (filteredDigitalAssets.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40"><tr><th className="p-4">Judul / Berkas</th><th className="p-4">Jenis</th><th className="p-4">Ukuran</th><th className="p-4">Diunggah</th><th className="p-4 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{filteredDigitalAssets.map((asset) => <tr key={asset.id}><td className="p-4"><div className="font-medium text-slate-900 dark:text-white">{asset.title}</div><div className="mt-1 text-xs text-slate-500">{asset.fileName}{asset.description ? ` · ${asset.description}` : ""}</div></td><td className="p-4 text-slate-600 dark:text-slate-300">{asset.contentType === "audio/mpeg" || asset.contentType === "audio/mp4" ? <span className="inline-flex items-center gap-1"><Music className="h-4 w-4" /> Audio</span> : <span className="inline-flex items-center gap-1"><FileText className="h-4 w-4" /> {asset.contentType === "application/epub+zip" ? "EPUB" : "PDF"}</span>}</td><td className="p-4 text-slate-500">{(asset.fileSize / (1024 * 1024)).toFixed(2)} MB</td><td className="p-4 text-slate-500">{asset.uploadedAt ? new Date(asset.uploadedAt).toLocaleDateString("id-ID") : "—"}</td><td className="p-4 text-right"><button onClick={() => void openDigitalAsset(asset)} className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"><Download className="h-4 w-4" /> Buka privat</button></td></tr>)}</tbody></table></div> : <div className="p-12 text-center"><FileText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-800 dark:text-slate-200">{search ? "Berkas tidak ditemukan" : "Belum ada bahan digital"}</p><p className="mt-1 text-sm text-slate-500">Unggah bahan PDF, EPUB, MP3, atau M4A. Berkas disimpan privat dan tautan hanya berlaku singkat.</p></div>)}
      </section>

      {digitalAssetModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitDigitalAsset} className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">Unggah bahan digital</h2><p className="mt-1 text-xs text-slate-500">PDF, EPUB, MP3, atau M4A · maksimal 25 MB · penyimpanan privat.</p></div><button type="button" onClick={() => setDigitalAssetModal(false)} disabled={saving} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="space-y-4 p-5"><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Judul bahan<input required maxLength={240} value={digitalAssetForm.title} onChange={(event) => setDigitalAssetForm({ ...digitalAssetForm, title: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Keterangan <span className="font-normal text-slate-400">(opsional)</span><textarea maxLength={1200} rows={3} value={digitalAssetForm.description} onChange={(event) => setDigitalAssetForm({ ...digitalAssetForm, description: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Berkas<input required type="file" accept=".pdf,.epub,.mp3,.m4a,application/pdf,application/epub+zip,audio/mpeg,audio/mp4" onChange={(event) => setDigitalAssetFile(event.target.files?.[0] || null)} className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 dark:border-slate-700 dark:file:bg-indigo-950/40 dark:file:text-indigo-300" /></label>{digitalAssetFile && <p className="text-xs text-slate-500">{digitalAssetFile.name} · {(digitalAssetFile.size / (1024 * 1024)).toFixed(2)} MB</p>}</div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={() => setDigitalAssetModal(false)} disabled={saving} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Batal</button><button type="submit" disabled={saving || !digitalAssetFile} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}{saving ? "Mengunggah…" : "Simpan berkas"}</button></div></form></div>}

      {bookModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitBook} className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">{editingBook ? "Ubah data buku" : "Tambah buku"}</h2><p className="mt-1 text-xs text-slate-500">Jumlah eksemplar tidak bisa di bawah peminjaman aktif.</p></div><button type="button" onClick={() => setBookModal(false)} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="grid gap-4 p-5 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Judul<input required maxLength={240} value={bookForm.title} onChange={(event) => setBookForm({ ...bookForm, title: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Penulis<input required maxLength={180} value={bookForm.author} onChange={(event) => setBookForm({ ...bookForm, author: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Kategori<input required maxLength={100} value={bookForm.category} onChange={(event) => setBookForm({ ...bookForm, category: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">ISBN<input maxLength={32} value={bookForm.isbn} onChange={(event) => setBookForm({ ...bookForm, isbn: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Jumlah eksemplar<input required type="number" min={0} max={100000} value={bookForm.totalCopies} onChange={(event) => setBookForm({ ...bookForm, totalCopies: Number(event.target.value) })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Lokasi rak<input maxLength={80} value={bookForm.shelf} onChange={(event) => setBookForm({ ...bookForm, shelf: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={() => setBookModal(false)} disabled={saving} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Batal</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Simpan</button></div></form></div>}

      {checkoutModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitCheckout} className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">Catat peminjaman</h2><p className="mt-1 text-xs text-slate-500">Ketersediaan dan jumlah eksemplar diverifikasi ulang dalam transaksi di basis data.</p></div><button type="button" onClick={() => setCheckoutModal(false)} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="space-y-4 p-5"><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Santri<select required value={checkoutForm.studentId} onChange={(event) => setCheckoutForm({ ...checkoutForm, studentId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"><option value="">Pilih santri</option>{snapshot.students.map((student) => <option key={student.id} value={student.id}>{student.name}{student.nis ? ` · ${student.nis}` : ""}</option>)}</select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Buku<select required value={checkoutForm.bookId} onChange={(event) => setCheckoutForm({ ...checkoutForm, bookId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"><option value="">Pilih buku tersedia</option>{snapshot.books.filter((book) => book.availableCopies > 0).map((book) => <option key={book.id} value={book.id}>{book.title} · tersedia {book.availableCopies}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Tanggal pinjam<input required type="date" value={checkoutForm.borrowedOn} onChange={(event) => setCheckoutForm({ ...checkoutForm, borrowedOn: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Jatuh tempo<input required type="date" value={checkoutForm.dueOn} onChange={(event) => setCheckoutForm({ ...checkoutForm, dueOn: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label></div></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={() => setCheckoutModal(false)} disabled={saving} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Batal</button><button type="submit" disabled={saving || !checkoutForm.studentId || !checkoutForm.bookId} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Simpan peminjaman</button></div></form></div>}
    </main>
  );
}

