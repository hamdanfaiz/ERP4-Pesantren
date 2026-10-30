import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import { useAuth } from '../contexts/AuthContext';
import React, { useState } from 'react';
import {
  X,
  Trash2,
  AlertTriangle,
  ArrowRight,
  Building,
  Users,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ArrowRightLeft
} from 'lucide-react';
import { db } from '../firebase';
import { doc, writeBatch } from 'firebase/firestore';

export interface BulkOperationRecord {
  id: string;
  name: string;
  type?: string;
  grade?: string;
  dormitory?: string;
  room?: string;
  halaqah?: string;
  department?: string;
  status?: string;
}

interface BulkOperationsModalProps {
  isOpen: boolean;
  mode: 'delete' | 'reassign';
  onClose: () => void;
  activeTab: string;
  activeSubTab: string;
  selectedRecords: BulkOperationRecord[];
  allClasses: any[];
  allDormitories: any[];
  allRooms: any[];
  allHalaqahs: any[];
  onSuccess: (updatedRecords: any[], message: string) => void;
  onAuditLog: (action: "UPDATE" | "DELETE", id: string, name: string) => void;
}

export function BulkOperationsModal({
  isOpen,
  mode,
  onClose,
  activeTab,
  activeSubTab,
  selectedRecords,
  allClasses,
  allDormitories,
  allRooms,
  allHalaqahs,
  onSuccess,
  onAuditLog,
}: BulkOperationsModalProps) {
  const { user } = useAuth();
  const [deleteType, setDeleteType] = useState<'soft' | 'hard'>('soft');
  const [reassignCategory, setReassignCategory] = useState<'class' | 'dormitory' | 'halaqah'>('class');
  const [targetClass, setTargetClass] = useState<string>('');
  const [targetDormitory, setTargetDormitory] = useState<string>('');
  const [targetRoom, setTargetRoom] = useState<string>('');
  const [targetHalaqah, setTargetHalaqah] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || selectedRecords.length === 0) return null;

  const collectionName =
    activeTab === "entities"
      ? activeSubTab.toLowerCase().replace(/\s+/g, "_")
      : "master_data";

  const getDocId = (recId: string) => {
    return activeTab === "entities"
      ? recId
      : `${activeSubTab.replace(/\s+/g, "_")}_${recId}`;
  };

  const handleExecuteDelete = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const batch = writeBatch(db);

      if (deleteType === 'soft') {
        // Soft Delete: Set status = Inactive / Archived
        selectedRecords.forEach((rec) => {
          const docRef = doc(db, collectionName, getDocId(rec.id));
          batch.update(docRef, {
            status: 'Inactive',
            archivedAt: new Date().toISOString(),
          });
          onAuditLog('UPDATE', rec.id, `${rec.name} (Diarsipkan)`);
        });

        await batch.commit();

        const updated = selectedRecords.map((r) => ({
          ...r,
          status: 'Inactive',
        }));

        onSuccess(
          updated,
          `Berhasil mengarsipkan ${selectedRecords.length} data ${activeSubTab}.`
        );
      } else {
        // Hard Delete: Permanent delete from Firestore
        selectedRecords.forEach((rec) => {
          const docRef = doc(db, collectionName, getDocId(rec.id));
          batch.delete(docRef);
          onAuditLog('DELETE', rec.id, `${rec.name} (Dihapus Permanen)`);
        });

        await batch.commit();

        onSuccess(
          [],
          `Berhasil menghapus permanen ${selectedRecords.length} data ${activeSubTab} dari sistem.`
        );
      }

      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Gagal memproses bulk delete: ${err.message || 'Error basis data'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecuteReassign = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const batch = writeBatch(db);
      const updatedList: any[] = [];

      selectedRecords.forEach((rec) => {
        const patch: Record<string, any> = {};

        if (reassignCategory === 'class' && targetClass) {
          const clObj = allClasses.find((c) => c.name === targetClass || c.id === targetClass);
          patch.grade = targetClass;
          patch.classId = clObj?.id || targetClass;
        } else if (reassignCategory === 'dormitory') {
          if (targetDormitory) {
            const dormObj = allDormitories.find((d) => d.name === targetDormitory || d.id === targetDormitory);
            patch.dormitory = targetDormitory;
            patch.dormitoryId = dormObj?.id || targetDormitory;
          }
          if (targetRoom) {
            const rmObj = allRooms.find((r) => r.name === targetRoom || r.id === targetRoom);
            patch.room = targetRoom;
            patch.roomId = rmObj?.id || targetRoom;
          }
        } else if (reassignCategory === 'halaqah' && targetHalaqah) {
          const hqObj = allHalaqahs.find((h) => h.name === targetHalaqah || h.id === targetHalaqah);
          patch.halaqah = targetHalaqah;
          patch.halaqahId = hqObj?.id || targetHalaqah;
        }

        const docRef = doc(db, collectionName, getDocId(rec.id));
        batch.update(docRef, patch);
        onAuditLog('UPDATE', rec.id, `${rec.name} (Bulk Reassigned)`);

        updatedList.push({
          ...rec,
          ...patch,
        });
      });

      await batch.commit();

      onSuccess(
        updatedList,
        `Berhasil memindahkan ${selectedRecords.length} data ke alokasi baru.`
      );
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Gagal memproses re-assignment massal: ${err.message || 'Error basis data'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            {mode === 'delete' ? (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
            )}
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                {mode === 'delete'
                  ? `Hapus Massal (Bulk Delete) ${selectedRecords.length} Data`
                  : `Mutasi / Relokasi Massal (${selectedRecords.length} Santri)`}
              </h3>
              <p className="text-xs text-slate-400">
                {mode === 'delete'
                  ? 'Konfirmasi tindakan penghapusan dengan evaluasi integritas relasi.'
                  : 'Pindahkan santri terpilih ke kelas, kamar asrama, atau halaqah baru secara serentak.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
              {errorMessage}
            </div>
          )}

          {/* List of entities being operated on */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Daftar {selectedRecords.length} Item Terpilih:</span>
              <span className="font-mono text-emerald-400">{activeSubTab}</span>
            </div>
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl max-h-36 overflow-y-auto space-y-1.5 text-xs">
              {selectedRecords.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800/80"
                >
                  <div className="font-medium text-slate-200 truncate pr-2">
                    {item.name}
                  </div>
                  <div className="font-mono text-[10px] text-slate-400 shrink-0">
                    ID: {item.id}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {mode === 'delete' ? (
            <div className="space-y-4">
              {/* Relational Impact Warning */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-2 text-xs">
                <div className="font-bold flex items-center gap-1.5 text-amber-300">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  Peringatan Integritas Relasi Basis Data:
                </div>
                <p className="leading-relaxed text-amber-200/90">
                  Menghapus entitas master dapat mempengaruhi riwayat akademik, koneksi wali santri, penempatan kamar asrama, dan absensi halaqah. Disarankan memilih opsi <b>Arsipkan (hapus nonpermanen)</b> agar histori audit tetap terjaga.
                </p>
              </div>

              {/* Delete Type Selection */}
              <div className="space-y-2">
                <label className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Metode Penghapusan
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <label
                    className={`p-3.5 rounded-xl border flex flex-col gap-1 cursor-pointer transition-colors ${
                      deleteType === 'soft'
                        ? 'bg-amber-950/20 border-amber-500/50 text-amber-200 ring-1 ring-amber-500/40'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-amber-300">
                      <input
                        type="radio"
                        name="deleteType"
                        checked={deleteType === 'soft'}
                        onChange={() => setDeleteType('soft')}
                        className="accent-amber-500"
                      />
                      <span>Arsipkan (Direkomendasikan)</span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1">
                      Ubah status menjadi <b>Inactive</b>. Data disembunyikan dari operasional aktif tanpa menghapus riwayat dokumen.
                    </span>
                  </label>

                  <label
                    className={`p-3.5 rounded-xl border flex flex-col gap-1 cursor-pointer transition-colors ${
                      deleteType === 'hard'
                        ? 'bg-rose-950/20 border-rose-500/50 text-rose-200 ring-1 ring-rose-500/40'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-rose-400">
                      <input
                        type="radio"
                        name="deleteType"
                        checked={deleteType === 'hard'}
                        onChange={() => setDeleteType('hard')}
                        className="accent-rose-500"
                      />
                      <span>Hapus Permanen</span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1">
                      Hapus dokumen secara permanen dari Cloud Firestore. Tindakan ini tidak dapat dibatalkan.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Reassignment Target Type */}
              <div className="space-y-2">
                <label className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Target Mutasi / Pindah
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setReassignCategory('class')}
                    className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 transition-colors ${
                      reassignCategory === 'class'
                        ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-300 font-semibold ring-1 ring-indigo-500/40'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                    }`}
                  >
                    <GraduationCap className="w-4 h-4" />
                    <span>Pindah Kelas</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReassignCategory('dormitory')}
                    className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 transition-colors ${
                      reassignCategory === 'dormitory'
                        ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-300 font-semibold ring-1 ring-indigo-500/40'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                    }`}
                  >
                    <Building className="w-4 h-4" />
                    <span>Pindah Kamar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReassignCategory('halaqah')}
                    className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 transition-colors ${
                      reassignCategory === 'halaqah'
                        ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-300 font-semibold ring-1 ring-indigo-500/40'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>Pindah Halaqah</span>
                  </button>
                </div>
              </div>

              {/* Selector according to Category */}
              {reassignCategory === 'class' && (
                <div className="space-y-1.5 text-xs">
                  <label className="text-slate-300 font-medium">Pilih Kelas Tujuan:</label>
                  <select
                    value={targetClass}
                    onChange={(e) => setTargetClass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Pilih Kelas --</option>
                    {allClasses.map((cls) => (
                      <option key={cls.id} value={cls.name}>
                        {cls.name} ({cls.capacity || 'Kapasitas Standar'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {reassignCategory === 'dormitory' && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-medium">Gedung Asrama:</label>
                    <select
                      value={targetDormitory}
                      onChange={(e) => setTargetDormitory(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Pilih Asrama --</option>
                      {allDormitories.map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-medium">Kamar Tujuan:</label>
                    <select
                      value={targetRoom}
                      onChange={(e) => setTargetRoom(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Pilih Kamar --</option>
                      {allRooms.map((r) => (
                        <option key={r.id} value={r.name}>
                          {r.name} ({r.capacity || '6 Orang'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {reassignCategory === 'halaqah' && (
                <div className="space-y-1.5 text-xs">
                  <label className="text-slate-300 font-medium">Pilih Halaqah Tahfidz Tujuan:</label>
                  <select
                    value={targetHalaqah}
                    onChange={(e) => setTargetHalaqah(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Pilih Halaqah --</option>
                    {allHalaqahs.map((h) => (
                      <option key={h.id} value={h.name}>
                        Halaqah {h.name} ({h.location || 'Masjid'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-xl transition-colors"
          >
            Batal
          </button>
          {mode === 'delete' ? (
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleExecuteDelete}
              className={`px-5 py-2 text-xs font-semibold text-white rounded-xl shadow-lg transition-all flex items-center gap-2 ${
                deleteType === 'hard'
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-950/50'
                  : 'bg-amber-600 hover:bg-amber-500 shadow-amber-950/50'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>
                    Konfirmasi {deleteType === 'hard' ? 'Hapus Permanen' : 'Arsipkan'} ({selectedRecords.length})
                  </span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={
                isProcessing ||
                (reassignCategory === 'class' && !targetClass) ||
                (reassignCategory === 'dormitory' && !targetDormitory && !targetRoom) ||
                (reassignCategory === 'halaqah' && !targetHalaqah)
              }
              onClick={handleExecuteReassign}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 rounded-xl shadow-lg shadow-indigo-950/50 transition-all flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memperbarui Penempatan...</span>
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4" />
                  <span>Terapkan Relokasi Massal</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
