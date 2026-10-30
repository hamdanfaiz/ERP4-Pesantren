import { useEffect, useRef, useState } from "react";

export type TahfidzStudentSearchPage = {
  students: any[];
  hasMore: boolean;
  nextCursor: string | null;
};

type TahfidzStudentSearchSelectProps = {
  initialStudents: any[];
  selectedStudentId: string;
  selectedStudent?: any | null;
  scopeKey: string;
  onSelect: (student: any | null) => void;
  searchStudents: (search: string, cursor?: string) => Promise<TahfidzStudentSearchPage>;
  filterStudent?: (student: any) => boolean;
  disabled?: boolean;
};

export function TahfidzStudentSearchSelect({
  initialStudents,
  selectedStudentId,
  selectedStudent = null,
  scopeKey,
  onSelect,
  searchStudents,
  filterStudent = () => true,
  disabled = false,
}: TahfidzStudentSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [resultsQuery, setResultsQuery] = useState("");
  const [nextCursor, setNextCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedOption, setSelectedOption] = useState<any | null>(selectedStudent);
  const requestSequence = useRef(0);
  const searchStudentsRef = useRef(searchStudents);
  searchStudentsRef.current = searchStudents;

  useEffect(() => {
    setQuery("");
    setResults([]);
    setResultsQuery("");
    setNextCursor("");
    setHasMore(false);
    setError("");
    setSelectedOption(selectedStudent || null);
  }, [scopeKey]);

  useEffect(() => {
    if (!selectedStudentId) {
      setSelectedOption(null);
      return;
    }
    setSelectedOption((current) => {
      if (current && String(current.id) === selectedStudentId) return current;
      return initialStudents.find((student) => String(student.id) === selectedStudentId)
        || (selectedStudent && String(selectedStudent.id) === selectedStudentId ? selectedStudent : current);
    });
  }, [selectedStudentId, selectedStudent?.id, initialStudents]);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    const search = query.trim();
    if (search.length < 2) {
      setResults([]);
      setResultsQuery("");
      setNextCursor("");
      setHasMore(false);
      setLoading(false);
      setError("");
      return;
    }

    let active = true;
    setResults([]);
    setResultsQuery("");
    setNextCursor("");
    setHasMore(false);
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      searchStudentsRef.current(search)
        .then((page) => {
          if (!active || sequence !== requestSequence.current || search !== query.trim()) return;
          setResults(Array.isArray(page.students) ? page.students : []);
          setResultsQuery(search);
          setHasMore(page.hasMore === true);
          setNextCursor(typeof page.nextCursor === "string" ? page.nextCursor : "");
        })
        .catch((requestError: any) => {
          if (active && sequence === requestSequence.current) {
            setError(requestError?.message || "Pencarian santri belum dapat dimuat.");
          }
        })
        .finally(() => {
          if (active && sequence === requestSequence.current) setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, scopeKey]);

  const loadMore = async () => {
    const search = query.trim();
    const sequence = requestSequence.current;
    if (!hasMore || !nextCursor || loading || search !== resultsQuery) return;
    setLoading(true);
    setError("");
    try {
      const page = await searchStudentsRef.current(search, nextCursor);
      if (sequence !== requestSequence.current || search !== query.trim()) return;
      const incoming = Array.isArray(page.students) ? page.students : [];
      setResults((current) => {
        const knownIds = new Set(current.map((student) => String(student.id)));
        return [...current, ...incoming.filter((student: any) => !knownIds.has(String(student.id)))];
      });
      setHasMore(page.hasMore === true);
      setNextCursor(typeof page.nextCursor === "string" ? page.nextCursor : "");
    } catch (requestError: any) {
      if (sequence === requestSequence.current) {
        setError(requestError?.message || "Hasil pencarian berikutnya belum dapat dimuat.");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  };

  const search = query.trim();
  const sourceStudents = search.length >= 2
    ? (resultsQuery === search ? results : [])
    : initialStudents;
  const matchingStudents = sourceStudents.filter(filterStudent);
  const options = [selectedOption, ...matchingStudents]
    .filter((student): student is any => Boolean(student) && filterStudent(student))
    .filter((student, index, all) => all.findIndex((item) => String(item.id) === String(student.id)) === index);

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Cari nama atau NIS (minimal 2 karakter)"
        aria-label="Cari santri berdasarkan nama atau NIS"
        disabled={disabled}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-white/10 dark:bg-black/40 dark:text-slate-200"
      />
      <select
        required
        value={selectedStudentId}
        onChange={(event) => {
          const student = options.find((item) => String(item.id) === event.target.value) || null;
          setSelectedOption(student);
          onSelect(student);
        }}
        disabled={disabled}
        aria-label="Santri"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-white/10 dark:bg-black/40 dark:text-slate-200"
      >
        <option value="">Pilih santri…</option>
        {options.map((student) => (
          <option key={student.id} value={student.id}>{student.name} · {student.nis || "tanpa NIS"}</option>
        ))}
      </select>
      {loading && <p role="status" className="text-xs text-slate-500">Mencari santri…</p>}
      {error && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{error}</p>}
      {!loading && search.length >= 2 && resultsQuery === search && matchingStudents.length === 0 && (
        <p className="text-xs text-slate-500">Tidak ada santri yang cocok atau memenuhi kriteria.</p>
      )}
      {hasMore && resultsQuery === search && <button
        type="button"
        onClick={() => void loadMore()}
        disabled={loading}
        className="text-xs font-semibold text-emerald-700 underline underline-offset-2 disabled:opacity-50 dark:text-emerald-300"
      >{loading ? "Memuat hasil…" : "Muat hasil pencarian berikutnya"}</button>}
    </div>
  );
}
