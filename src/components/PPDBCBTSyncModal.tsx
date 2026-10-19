import React, { useState } from "react";
import {
  X,
  BrainCircuit,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  BarChart3,
  Award,
  Sparkles,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import { Candidate } from "../types";
import { ppdbIntegrationService } from "../services/ppdbIntegrationService";
import { cn } from "../lib/utils";

interface PPDBCBTSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: Candidate[];
  onRefresh: () => void;
  showToast: (message: string, type?: "success" | "info" | "error", title?: string) => void;
}

export const PPDBCBTSyncModal: React.FC<PPDBCBTSyncModalProps> = ({
  isOpen,
  onClose,
  candidates,
  onRefresh,
  showToast,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "synced" | "unsynced">("all");

  if (!isOpen) return null;

  const examCandidates = candidates.filter(
    (c) =>
      c.stage === "Entry Exam" ||
      c.stage === "Interview" ||
      c.stage === "Accepted" ||
      !!c.examSlot ||
      !!c.examScores ||
      !!c.score
  );

  const syncedCandidates = candidates.filter((c) => !!c.cbtSync?.syncedAt || (c.score && c.score > 0));
  const passedCandidates = syncedCandidates.filter((c) => (c.score || 0) >= 75);
  const averageTotal =
    syncedCandidates.length > 0
      ? Math.round(
          syncedCandidates.reduce((acc, c) => acc + (c.score || 0), 0) /
            syncedCandidates.length
        )
      : 0;

  const handleSyncScores = async () => {
    setIsSyncing(true);
    try {
      const { syncedCount, passedCount } = await ppdbIntegrationService.syncCBTScoresToPPDB(candidates);
      showToast(
        `Berhasil menyinkronkan nilai CBT untuk ${syncedCount} peserta! (${passedCount} lulus KKM ≥ 75)`,
        "success",
        "Sinkronisasi Nilai CBT"
      );
      onRefresh();
    } catch (err) {
      console.error(err);
      showToast("Gagal menyinkronkan nilai dari modul CBT.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSimulateExams = async () => {
    setIsSimulating(true);
    try {
      const count = await ppdbIntegrationService.simulateCBTExamSessions(candidates);
      if (count > 0) {
        showToast(
          `Berhasil melakukan simulasi ujian CBT untuk ${count} calon santri!`,
          "success",
          "Simulasi Ujian Masuk"
        );
      } else {
        showToast("Semua calon santri yang dijadwalkan sudah memiliki nilai ujian.", "info");
      }
      onRefresh();
    } catch (err) {
      console.error(err);
      showToast("Gagal melakukan simulasi ujian CBT.", "error");
    } finally {
      setIsSimulating(false);
    }
  };

  const displayedCandidates = examCandidates.filter((c) => {
    if (filterMode === "synced") return !!c.cbtSync?.syncedAt || (c.score && c.score > 0);
    if (filterMode === "unsynced") return !c.cbtSync?.syncedAt && (!c.score || c.score === 0);
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-lg flex items-center gap-2">
                Sinkronisasi Nilai Ujian dari Modul CBT ke PPDB
              </h3>
              <p className="text-xs text-slate-400">
                Integrasi real-time penilaian tes masuk: Matematika, B. Inggris, IPA/PAI, TPA & Al-Qur'an
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Overview Stats */}
        <div className="p-6 border-b border-slate-800 bg-slate-800/20">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Peserta Ujian Masuk
              </span>
              <div className="text-xl font-bold font-mono text-slate-100">
                {examCandidates.length}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Total kandidat terjadwal
              </span>
            </div>

            <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Tersinkronisasi CBT
              </span>
              <div className="text-xl font-bold font-mono text-indigo-400">
                {syncedCandidates.length}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                {Math.round((syncedCandidates.length / (examCandidates.length || 1)) * 100)}% kandidat
              </span>
            </div>

            <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Lulus KKM (≥ 75)
              </span>
              <div className="text-xl font-bold font-mono text-emerald-400">
                {passedCandidates.length}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Memenuhi syarat lulus
              </span>
            </div>

            <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Rata-rata Skor
              </span>
              <div className="text-xl font-bold font-mono text-amber-400">
                {averageTotal} / 100
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Seluruh materi tes
              </span>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSyncScores}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} />
                Tarik & Sinkronkan Nilai dari CBT
              </button>

              <button
                onClick={handleSimulateExams}
                disabled={isSimulating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Simulasi Ujian Massal
              </button>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700 text-xs">
              <button
                onClick={() => setFilterMode("all")}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors",
                  filterMode === "all" ? "bg-indigo-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"
                )}
              >
                Semua ({examCandidates.length})
              </button>
              <button
                onClick={() => setFilterMode("synced")}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors",
                  filterMode === "synced" ? "bg-indigo-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"
                )}
              >
                Tersinkron ({syncedCandidates.length})
              </button>
              <button
                onClick={() => setFilterMode("unsynced")}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors",
                  filterMode === "unsynced" ? "bg-indigo-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"
                )}
              >
                Belum Ada Nilai ({examCandidates.length - syncedCandidates.length})
              </button>
            </div>
          </div>
        </div>

        {/* Candidates Score Table */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-800/80 border-b border-slate-700 text-slate-400 uppercase font-semibold">
                  <th className="p-3">Calon Santri</th>
                  <th className="p-3">Sesi / Slot Ujian</th>
                  <th className="p-3 text-center">MTK</th>
                  <th className="p-3 text-center">ING</th>
                  <th className="p-3 text-center">IPA/PAI</th>
                  <th className="p-3 text-center">TPA</th>
                  <th className="p-3 text-center">Tahfidz</th>
                  <th className="p-3 text-right">Rata-rata</th>
                  <th className="p-3 text-center">Status CBT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {displayedCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500">
                      Tidak ada peserta seleksi ujian yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  displayedCandidates.map((c) => {
                    const avg = c.score || 0;
                    const isPassed = avg >= 75;
                    const isSynced = !!c.cbtSync?.syncedAt || avg > 0;

                    return (
                      <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3">
                          <span className="font-semibold text-slate-200 block">{c.name}</span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {c.registrationId} | {c.grade}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="text-[11px] text-slate-300 block">
                            {c.examSlot || "Belum dialokasikan"}
                          </span>
                          <span className="text-[10px] text-slate-500">Tahap: {c.stage}</span>
                        </td>
                        <td className="p-3 text-center font-mono font-medium text-slate-300">
                          {c.examScores?.math ?? "-"}
                        </td>
                        <td className="p-3 text-center font-mono font-medium text-slate-300">
                          {c.examScores?.english ?? "-"}
                        </td>
                        <td className="p-3 text-center font-mono font-medium text-slate-300">
                          {c.examScores?.science ?? "-"}
                        </td>
                        <td className="p-3 text-center font-mono font-medium text-slate-300">
                          {c.examScores?.tpa ?? "-"}
                        </td>
                        <td className="p-3 text-center font-mono font-medium text-slate-300">
                          {c.examScores?.quran ?? "-"}
                        </td>
                        <td className="p-3 text-right">
                          <span
                            className={cn(
                              "font-mono font-bold text-sm",
                              avg === 0
                                ? "text-slate-500"
                                : isPassed
                                ? "text-emerald-400"
                                : "text-rose-400"
                            )}
                          >
                            {avg > 0 ? avg : "-"}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {avg === 0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                              Menunggu Ujian
                            </span>
                          ) : (
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-semibold uppercase",
                                isPassed
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              )}
                            >
                              {isPassed ? "Lulus KKM" : "Tidak Lulus"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
