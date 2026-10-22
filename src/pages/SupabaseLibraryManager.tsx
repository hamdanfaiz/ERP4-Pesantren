import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, Check, Clock3, Loader2, Plus, RefreshCw, Search, Users, X } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";

type Book = { id: string; title: string; author: string; category: string; isbn: string; totalCopies: number; shelf: string; availableCopies: number };
type Student = { id: string; name: string; nis: string };
type Circulation = { id: string; bookId: string; bookTitle: string; studentId: string; student: string; nis: string; borrowDate: string; dueDate: string; returnedDate: string | null; status: string; fine: number };
type Snapshot = { books: Book[]; students: Student[]; circulations: Circulation[] };

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

function localDate(daysFromToday = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function markOverdue(circulations: Circulation[]) {
  const today = localDate();
  return circulations.map((item) => item.status === "Active" && item.dueDate < today ? { ...item, status: "Overdue" } : item);
}

const emptySnapshot: Snapshot = { books: [], students: [], circulations: [] };

export function SupabaseLibraryManager() {
  const { role, user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"catalog" | "circulation">("catalog");
  const [search, setSearch] = useState("");
  const [bookModal, setBookModal] = useState(false);
  const [checkoutModal, setCheckoutModal] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [bookForm, setBookForm] = useState({ title: "", author: "", category: "Kajian Islam", isbn: "", totalCopies: 1, shelf: "" });
  const [checkoutForm, setCheckoutForm] = useState({ studentId: "", bookId: "", borrowedOn: localDate(), dueOn: localDate(14) });
  const canManage = ["Admin", "SuperAdmin", "Ustadz"].includes(role) && user?.modulePermissions?.library !== false;

  const refresh = useCallback(async () => {
    const payload = await requestLibrary("/api/library/snapshot");
    setSnapshot({
      books: Array.isArray(payload.books) ? payload.books : [],
      students: Array.isArray(payload.students) ? payload.students : [],
      circulations: markOverdue(Array.isArray(payload.circulations) ? payload.circulations : []),
    });
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    requestLibrary("/api/library/snapshot")
      .then((payload) => {
        if (active) setSnapshot({ books: Array.isArray(payload.books) ? payload.books : [], students: Array.isArray(payload.students) ? payload.students : [], circulations: markOverdue(Array.isArray(payload.circulations) ? payload.circulations : []) });
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
  const isOverdue = (item: Circulation) => item.status !== "Returned" && item.dueDate < localDate();
  const activeLoans = snapshot.circulations.filter((item) => item.status !== "Returned").length;
  const overdueLoans = snapshot.circulations.filter(isOverdue).length;
  const availableCopies = snapshot.books.reduce((sum, book) => sum + book.availableCopies, 0);

  const openBookForm = (book?: Book) => {
    setError(""); setEditingBook(book || null);
    setBookForm(book ? { title: book.title, author: book.author, category: book.category, isbn: book.isbn, totalCopies: book.totalCopies, shelf: book.shelf } : { title: "", author: "", category: "Kajian Islam", isbn: "", totalCopies: 1, shelf: "" });
    setBookModal(true);
  };

  const submitBook = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await requestLibrary("/api/library/books", { method: "POST", body: JSON.stringify({ book: { ...bookForm, id: editingBook?.id || null, clientRequestId: crypto.randomUUID() } }) });
      setBookModal(false); await refresh();
    } catch (saveError: any) { setError(saveError?.message || "Buku belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  const submitCheckout = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await requestLibrary("/api/library/checkout", { method: "POST", body: JSON.stringify({ checkout: { ...checkoutForm, clientRequestId: crypto.randomUUID() } }) });
      setCheckoutModal(false); setCheckoutForm({ studentId: "", bookId: "", borrowedOn: localDate(), dueOn: localDate(14) }); await refresh();
    } catch (checkoutError: any) { setError(checkoutError?.message || "Peminjaman belum dapat dicatat."); }
    finally { setSaving(false); }
  };

  const returnBook = async (circulation: Circulation) => {
    if (!window.confirm(`Catat pengembalian ${circulation.bookTitle} dari ${circulation.student}?`)) return;
    setSaving(true); setError("");
    try {
      await requestLibrary("/api/library/returns", { method: "POST", body: JSON.stringify({ return: { circulationId: circulation.id, returnedOn: localDate(), clientRequestId: crypto.randomUUID() } }) });
      await refresh();
    } catch (returnError: any) { setError(returnError?.message || "Pengembalian belum dapat dicatat."); }
    finally { setSaving(false); }
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
        <div><div className="mb-2 inline-flex rounded-lg bg-slate-100 p-2.5 dark:bg-slate-800"><BookOpen className="h-5 w-5 text-slate-700 dark:text-slate-200" /></div><h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Perpustakaan</h1><p className="mt-1 text-sm text-slate-500">Katalog dan peminjaman tenant dikelola melalui Supabase.</p></div>
        <div className="flex flex-wrap gap-2">{canManage && activeTab === "catalog" && <button onClick={() => openBookForm()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Plus className="h-4 w-4" /> Tambah buku</button>}{canManage && activeTab === "circulation" && <button onClick={() => setCheckoutModal(true)} disabled={!snapshot.students.length || !snapshot.books.some((book) => book.availableCopies > 0)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"><Plus className="h-4 w-4" /> Catat peminjaman</button>}<button onClick={() => { setLoading(true); setError(""); void refresh().catch((refreshError: any) => setError(refreshError?.message || "Data belum dapat dimuat.")).finally(() => setLoading(false)); }} aria-label="Muat ulang perpustakaan" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" /></button></div>
      </header>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">Mode Supabase berisi katalog dan peminjaman. Aset digital dan pembayaran denda belum diaktifkan karena file belum memakai penyimpanan privat dan transaksi Finance belum bermigrasi.</div>
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: "Judul aktif", value: snapshot.books.length, icon: BookOpen },
        { label: "Eksemplar tersedia", value: availableCopies, icon: Check },
        { label: "Sedang dipinjam", value: activeLoans, icon: Users },
        { label: "Terlambat", value: overdueLoans, icon: Clock3 },
      ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{label}</p><Icon className="h-4 w-4 text-slate-400" /></div><p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">{loading ? "—" : value}</p></div>)}</section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"><div className="flex gap-2"><button onClick={() => { setActiveTab("catalog"); setSearch(""); }} aria-pressed={activeTab === "catalog"} className={`rounded-lg px-3 py-2 text-sm font-medium ${activeTab === "catalog" ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>Katalog</button><button onClick={() => { setActiveTab("circulation"); setSearch(""); }} aria-pressed={activeTab === "circulation"} className={`rounded-lg px-3 py-2 text-sm font-medium ${activeTab === "circulation" ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>Peminjaman</button></div><label className="relative block w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeTab === "catalog" ? "Cari buku, penulis, ISBN…" : "Cari santri atau buku…"} className="w-full rounded-lg border border-slate-200 bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700" /></label></div>
        {loading ? <div role="status" className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat data perpustakaan tenant…</div>
          : activeTab === "catalog" ? (filteredBooks.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40"><tr><th className="p-4">Judul / Penulis</th><th className="p-4">Kategori</th><th className="p-4">ISBN</th><th className="p-4">Rak</th><th className="p-4 text-right">Tersedia</th>{canManage && <th className="p-4 text-right">Aksi</th>}</tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{filteredBooks.map((book) => <tr key={book.id}><td className="p-4"><div className="font-medium text-slate-900 dark:text-white">{book.title}</div><div className="mt-1 text-xs text-slate-500">{book.author}</div></td><td className="p-4 text-slate-600 dark:text-slate-300">{book.category}</td><td className="p-4 text-slate-500">{book.isbn || "—"}</td><td className="p-4 text-slate-500">{book.shelf || "—"}</td><td className="p-4 text-right font-medium text-slate-800 dark:text-slate-200">{book.availableCopies}/{book.totalCopies}</td>{canManage && <td className="p-4 text-right"><button onClick={() => openBookForm(book)} className="rounded-md px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40">Ubah</button></td>}</tr>)}</tbody></table></div> : <div className="p-12 text-center"><BookOpen className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-800 dark:text-slate-200">{search ? "Buku tidak ditemukan" : "Katalog Supabase masih kosong"}</p><p className="mt-1 text-sm text-slate-500">Data contoh lama tidak disalin otomatis. Rekonsiliasi dan impor tenant dilakukan sebelum mengaktifkan runtime.</p></div>)
          : (filteredCirculations.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40"><tr><th className="p-4">Buku</th><th className="p-4">Santri</th><th className="p-4">Tanggal pinjam</th><th className="p-4">Jatuh tempo</th><th className="p-4">Status</th>{canManage && <th className="p-4 text-right">Aksi</th>}</tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{filteredCirculations.map((item) => <tr key={item.id}><td className="p-4 font-medium text-slate-900 dark:text-white">{item.bookTitle}</td><td className="p-4 text-slate-600 dark:text-slate-300">{item.student}<div className="text-xs text-slate-500">{item.nis}</div></td><td className="p-4 text-slate-500">{item.borrowDate}</td><td className="p-4 text-slate-500">{item.dueDate}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs ${item.status === "Returned" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : item.status === "Overdue" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}>{item.status === "Returned" ? `Kembali ${item.returnedDate}` : item.status === "Overdue" ? "Terlambat" : "Dipinjam"}</span></td>{canManage && <td className="p-4 text-right">{item.status !== "Returned" && <button disabled={saving} onClick={() => void returnBook(item)} className="rounded-md px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40">Catat kembali</button>}</td>}</tr>)}</tbody></table></div> : <div className="p-12 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-800 dark:text-slate-200">Belum ada transaksi peminjaman Supabase</p><p className="mt-1 text-sm text-slate-500">Transaksi lama tidak disalin otomatis sebelum pemeriksaan pemetaan Buku dan Santri.</p></div>)}
      </section>

      {bookModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitBook} className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">{editingBook ? "Ubah data buku" : "Tambah buku"}</h2><p className="mt-1 text-xs text-slate-500">Jumlah eksemplar tidak bisa di bawah peminjaman aktif.</p></div><button type="button" onClick={() => setBookModal(false)} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="grid gap-4 p-5 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Judul<input required maxLength={240} value={bookForm.title} onChange={(event) => setBookForm({ ...bookForm, title: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Penulis<input required maxLength={180} value={bookForm.author} onChange={(event) => setBookForm({ ...bookForm, author: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Kategori<input required maxLength={100} value={bookForm.category} onChange={(event) => setBookForm({ ...bookForm, category: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">ISBN<input maxLength={32} value={bookForm.isbn} onChange={(event) => setBookForm({ ...bookForm, isbn: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Jumlah eksemplar<input required type="number" min={0} max={100000} value={bookForm.totalCopies} onChange={(event) => setBookForm({ ...bookForm, totalCopies: Number(event.target.value) })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Lokasi rak<input maxLength={80} value={bookForm.shelf} onChange={(event) => setBookForm({ ...bookForm, shelf: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={() => setBookModal(false)} disabled={saving} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Batal</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Simpan</button></div></form></div>}

      {checkoutModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitCheckout} className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">Catat peminjaman</h2><p className="mt-1 text-xs text-slate-500">Ketersediaan dan eksemplar diverifikasi ulang dalam transaksi database.</p></div><button type="button" onClick={() => setCheckoutModal(false)} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="space-y-4 p-5"><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Santri<select required value={checkoutForm.studentId} onChange={(event) => setCheckoutForm({ ...checkoutForm, studentId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"><option value="">Pilih santri</option>{snapshot.students.map((student) => <option key={student.id} value={student.id}>{student.name}{student.nis ? ` · ${student.nis}` : ""}</option>)}</select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Buku<select required value={checkoutForm.bookId} onChange={(event) => setCheckoutForm({ ...checkoutForm, bookId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"><option value="">Pilih buku tersedia</option>{snapshot.books.filter((book) => book.availableCopies > 0).map((book) => <option key={book.id} value={book.id}>{book.title} · tersedia {book.availableCopies}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Tanggal pinjam<input required type="date" value={checkoutForm.borrowedOn} onChange={(event) => setCheckoutForm({ ...checkoutForm, borrowedOn: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Jatuh tempo<input required type="date" value={checkoutForm.dueOn} onChange={(event) => setCheckoutForm({ ...checkoutForm, dueOn: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label></div></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={() => setCheckoutModal(false)} disabled={saving} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Batal</button><button type="submit" disabled={saving || !checkoutForm.studentId || !checkoutForm.bookId} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Simpan peminjaman</button></div></form></div>}
    </main>
  );
}
