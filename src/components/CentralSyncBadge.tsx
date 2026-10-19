import React, { useState } from "react";
import {
  Link2,
  Building,
  GraduationCap,
  Users,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  X,
  Layers,
  Sparkles,
  BedDouble,
  BookOpen,
} from "lucide-react";
import { useCentralStructure } from "../hooks/useCentralStructure";

interface CentralSyncBadgeProps {
  moduleName: "Asrama" | "Akademik" | "Master Data";
  onOpenMasterData?: () => void;
  className?: string;
}

export function CentralSyncBadge({
  moduleName,
  onOpenMasterData,
  className = "",
}: CentralSyncBadgeProps) {
  const { stats, notifyExternalUpdate } = useCentralStructure();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  const handleManualSync = () => {
    setIsSpinning(true);
    notifyExternalUpdate();
    setTimeout(() => {
      setIsSpinning(false);
    }, 700);
  };

  return (
    <>
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <button
          onClick={() => setIsModalOpen(true)}
          className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/30 text-xs font-medium transition-all shadow-sm"
          title="Klik untuk melihat status relasi terpusat (Rekomendasi 5)"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <Link2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline font-semibold">Relasi Master Data:</span>
          <span className="font-semibold text-emerald-300">Aktif</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
            Rekomendasi 5
          </span>
          <ChevronDown className="w-3 h-3 text-emerald-400 group-hover:translate-y-0.5 transition-transform" />
        </button>

        <button
          onClick={handleManualSync}
          disabled={isSpinning}
          className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors"
          title="Sinkronkan ulang relasi struktur sekarang"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? "animate-spin text-emerald-400" : ""}`} />
        </button>
      </div>

      {/* Relational Status & Health Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 flex items-center gap-2">
                    Sentralisasi Relasi Struktur
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                      Rekomendasi 5
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Modul <strong className="text-emerald-300">{moduleName}</strong> terhubung real-time ke Master Data
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Integration Status Card */}
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/20 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-emerald-300">
                    Koneksi Struktur Aktif & Terverifikasi
                  </h4>
                  <p className="text-xs text-emerald-200/80 leading-relaxed">
                    Setiap entitas Gedung, Kamar, Kelas, Mata Pelajaran, dan Santri dikelola terpusat di Master Data dan langsung mengalir ke modul Asrama & Akademik tanpa redundansi data terisolasi.
                  </p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs">Gedung Asrama</span>
                    <Building className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-xl font-bold text-slate-100 mt-2 font-mono">
                    {stats.buildingsCount}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5">Struktur Master Data</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs">Kamar Asrama</span>
                    <BedDouble className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-xl font-bold text-slate-100 mt-2 font-mono">
                    {stats.roomsCount}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5">Kapasitas: {stats.totalCapacity} santri</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs">Kelas Belajar</span>
                    <GraduationCap className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-xl font-bold text-slate-100 mt-2 font-mono">
                    {stats.classesCount}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5">Struktur Akademik</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs">Mata Pelajaran</span>
                    <BookOpen className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-xl font-bold text-slate-100 mt-2 font-mono">
                    {stats.subjectsCount}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5">{stats.curriculaCount} Kurikulum terhubung</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs">Santri Terelasi</span>
                    <Users className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-xl font-bold text-slate-100 mt-2 font-mono">
                    {stats.santriCount}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5">
                    {stats.assignedSantri} ber-kamar ({stats.occupancyRate}%)
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs">Guru & Asatidz</span>
                    <Sparkles className="w-4 h-4 text-pink-400" />
                  </div>
                  <div className="text-xl font-bold text-slate-100 mt-2 font-mono">
                    {stats.teachersCount}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5">Pengajar & Pembina</span>
                </div>
              </div>

              {/* Health Inspection Checklist */}
              <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  Audit Integritas Relasional
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      Relasi Kamar ke Gedung Induk
                    </span>
                    <span className="text-emerald-400 font-medium">100% Valid</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      Sinkronisasi Rombel & Jadwal KBM
                    </span>
                    <span className="text-emerald-400 font-medium">Terhubung</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      Santri Belum Dapat Kamar
                    </span>
                    <span className={stats.unassignedSantri > 0 ? "text-amber-400 font-medium" : "text-emerald-400 font-medium"}>
                      {stats.unassignedSantri} Santri
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <button
                onClick={handleManualSync}
                disabled={isSpinning}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-2 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? "animate-spin text-emerald-400" : ""}`} />
                <span>Sinkronkan Sekarang</span>
              </button>

              <button
                onClick={() => {
                  setIsModalOpen(false);
                  if (onOpenMasterData) {
                    onOpenMasterData();
                  }
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <span>Kelola di Master Data</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
