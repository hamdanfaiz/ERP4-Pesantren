import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BedDouble, CheckCircle2, RefreshCw } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { ERPLoadingSkeleton } from "../components/ERPDesignSystem";
import {
  assignSupabaseStudentRoom,
  listSupabaseBoardingSnapshot,
  type SupabaseBoardingStudent,
  type SupabaseStructureRecord,
} from "../services/masterDataApi";

function isActive(status?: string) {
  return String(status || "").trim().toLocaleLowerCase("id-ID") === "active" || String(status || "").trim().toLocaleLowerCase("id-ID") === "aktif";
}

export function SupabaseBoardingRoomsManager() {
  const { role } = useAuth();
  const canManage = role === "Admin" || role === "SuperAdmin";
  const [students, setStudents] = useState<SupabaseBoardingStudent[]>([]);
  const [structures, setStructures] = useState<SupabaseStructureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const snapshot = await listSupabaseBoardingSnapshot();
    setStudents(snapshot.students);
    setStructures(snapshot.structures);
    setDrafts(Object.fromEntries(snapshot.students.map((student) => [student.id, student.roomId || ""])));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh()
      .catch((cause: any) => { if (active) setError(cause?.message || "Data penempatan kamar belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const rooms = useMemo(() => structures.filter((item) => item.category === "Kamar" && isActive(item.status)), [structures]);
  const roomsForStudent = useCallback((student: SupabaseBoardingStudent) => {
    const gender = String(student.gender || "").trim().toUpperCase();
    const currentRoomId = String(drafts[student.id] || student.roomId || "");
    const eligible = (!gender || (gender !== "L" && gender !== "P"))
      ? rooms
      : rooms.filter((room) => {
        const restriction = String(room.genderRestriction || "").trim().toUpperCase();
        return !restriction || restriction === "ALL" || restriction === gender || String(room.id) === currentRoomId;
      });
    return eligible;
  }, [rooms, drafts]);
  const buildings = useMemo(() => {
    const map = new Map(structures.filter((item) => item.category === "Gedung").map((item) => [String(item.id), item]));
    return map;
  }, [structures]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("id-ID");
    if (!term) return students;
    return students.filter((student) => [student.name, student.nis, student.room, student.grade]
      .some((field) => String(field || "").toLocaleLowerCase("id-ID").includes(term)));
  }, [students, query]);

  const save = async (student: SupabaseBoardingStudent) => {
    if (!canManage) return;
    const studentKey = student.supabaseId || student.id;
    const roomId = drafts[student.id] || null;
    const room = roomId ? rooms.find((item) => String(item.id) === roomId) : null;
    const buildingId = room?.parentId ? String(room.parentId) : null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentKey)) {
      setError(`ID santri ${student.name} belum siap untuk penempatan kamar.`);
      return;
    }
    setSaving(student.id); setError(""); setNotice("");
    try {
      const result = await assignSupabaseStudentRoom(studentKey, roomId, buildingId);
      if (result.alreadyAssigned) setNotice(`${student.name} sudah berada di kamar yang dipilih.`);
      else if (result.alreadyUnassigned) setNotice(`Penempatan kamar ${student.name} sudah kosong.`);
      else setNotice(roomId ? `Penempatan kamar ${student.name} disimpan.` : `Penempatan kamar ${student.name} dilepas.`);
      await refresh();
    } catch (cause: any) {
      setError(cause?.message || "Penempatan kamar belum dapat disimpan.");
    } finally {
      setSaving("");
    }
  };

  return <section className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700"><BedDouble className="h-4 w-4" />Asrama · Penempatan kamar ·</div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Penempatan Kamar Santri</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">Tetapkan atau lepaskan kamar aktif dari Data Induk. Kapasitas kamar diperbarui secara transaksional di pesantren.</p>
      </div>
      <button type="button" onClick={() => { setLoading(true); setError(""); void refresh().catch((cause: any) => setError(cause?.message || "Data belum dapat dimuat.")).finally(() => setLoading(false)); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
        <RefreshCw className="h-4 w-4" />Muat ulang
      </button>
    </header>

    {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
    {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {!canManage && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Pengubahan penempatan kamar hanya tersedia bagi Admin pesantren. Anda tetap dapat melihat daftar santri.</div>}

    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">Daftar penempatan</h2>
          <p className="mt-1 text-xs text-slate-500">{students.length} santri · {rooms.length} kamar aktif</p>
        </div>
        <input aria-label="Cari santri" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, NIS, kamar, kelas…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 sm:max-w-xs" />
      </div>
      {loading ? <div className="p-4"><ERPLoadingSkeleton variant="list" label="Memuat penempatan kamar…" rows={5} /></div>
        : !visible.length ? <div className="p-10 text-center text-sm text-slate-500">Belum ada santri pada data saat ini asrama.</div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Santri</th>
                <th className="px-4 py-3">Kamar saat ini</th>
                <th className="px-4 py-3">Penempatan baru</th>
                {canManage && <th className="px-4 py-3 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((student) => {
                const selected = drafts[student.id] || "";
                const dirty = selected !== (student.roomId || "");
                const eligibleRooms = roomsForStudent(student);
                return <tr key={student.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{student.name}</div>
                    <div className="mt-1 text-xs text-slate-500">NIS {student.nis || "—"} · {student.gender || "—"} · {student.grade || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{student.room || "Belum ditempatkan"}{student.dormitory ? <div className="text-xs text-slate-500">{student.dormitory}</div> : null}</td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Kamar untuk ${student.name}`}
                      disabled={!canManage || Boolean(saving)}
                      value={selected}
                      onChange={(event) => setDrafts((current) => ({ ...current, [student.id]: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-60"
                    >
                      <option value="">Lepas penempatan</option>
                      {eligibleRooms.map((room) => {
                        const building = room.parentId ? buildings.get(String(room.parentId)) : undefined;
                        const capacity = Number(room.capacity || 0);
                        const occupied = Number(room.occupied || 0);
                        return <option key={String(room.id)} value={String(room.id)}>
                          {room.name}{building ? ` · ${building.name}` : ""}{capacity ? ` · ${occupied}/${capacity}` : ""}
                        </option>;
                      })}
                    </select>
                  </td>
                  {canManage && <td className="px-4 py-3 text-right">
                    <button type="button" disabled={!dirty || saving === student.id} onClick={() => void save(student)} className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">
                      {saving === student.id ? "Menyimpan…" : "Simpan"}
                    </button>
                  </td>}
                </tr>;
              })}
            </tbody>
          </table></div>}
    </div>
  </section>;
}
