import React, { useState } from "react";
import {
  X,
  BookOpen,
  Award,
  CheckCircle2,
  Sparkles,
  Save,
  Printer,
  HeartHandshake,
  Star,
  Check,
  AlertCircle,
} from "lucide-react";
import { Candidate } from "../types";
import { SystemSettings } from "../services/systemSettingsService";
import { ppdbIntegrationService } from "../services/ppdbIntegrationService";
import { cn } from "../lib/utils";

interface PPDBReligiousAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Candidate;
  settings?: SystemSettings | null;
  showToast: (message: string, type: "success" | "error" | "info", title?: string) => void;
}

export function PPDBReligiousAssessmentModal({
  isOpen,
  onClose,
  candidate,
  settings,
  showToast,
}: PPDBReligiousAssessmentModalProps) {
  if (!isOpen || !candidate) return null;

  const [activeTab, setActiveTab] = useState<"quran" | "tajweed" | "tahfidz" | "ibadah">("quran");

  // Form State initialized with candidate's existing religiousScores if available
  const [quranFluency, setQuranFluency] = useState<number>(
    candidate.religiousScores?.quranFluency ?? 80
  );
  const [tajweedMastery, setTajweedMastery] = useState<number>(
    candidate.religiousScores?.tajweedMastery ?? 78
  );
  const [memorizedJuz, setMemorizedJuz] = useState<string>(
    candidate.religiousScores?.memorizedJuz ?? "Juz 30 (An-Naas s.d An-Naba')"
  );
  const [worshipPractice, setWorshipPractice] = useState<number>(
    candidate.religiousScores?.worshipPractice ?? 85
  );
  const [evaluator, setEvaluator] = useState<string>(
    candidate.religiousScores?.evaluator ?? "Ust. M. Ridwan Al-Hafidz"
  );
  const [notes, setNotes] = useState<string>(
    candidate.religiousScores?.notes ?? "Makhraj huruf jelas, kelancaran tajwid baik, hafalan juz 30 lancar."
  );
  const [isSaving, setIsSaving] = useState(false);

  // Compute overall score
  const totalScore = Math.round((quranFluency + tajweedMastery + worshipPractice) / 3);

  const getRecommendation = (score: number) => {
    if (score >= 88) return { label: "Program Unggulan Takhassus Tahfidz", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
    if (score >= 75) return { label: "Kelas Reguler Pesantren (Lulus KKM)", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" };
    return { label: "Perlu Program Matrikulasi Al-Qur'an", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
  };

  const rec = getRecommendation(totalScore);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await ppdbIntegrationService.saveReligiousEvaluation(candidate.id, {
        quranFluency,
        tajweedMastery,
        memorizedJuz,
        worshipPractice,
        evaluator,
        notes,
      });
      showToast(
        `Hasil Uji Al-Qur'an & Tahfidz untuk ${candidate.name} berhasil disimpan! Rata-rata: ${totalScore}`,
        "success",
        "Penilaian Tersimpan"
      );
      onClose();
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan penilaian keagamaan.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col my-8 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                Formulir Uji Standar Pesantren: Al-Qur'an & Tahfidz
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {candidate.registrationId}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Calon Santri: <strong className="text-slate-200">{candidate.name}</strong> • Jenjang: {candidate.grade} • Asal: {candidate.previousSchool}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Summary Banner with Live Calculation */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex flex-col">
              <span className="text-[11px] text-slate-400 font-medium">Skor Rata-Rata Keagamaan</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-black font-mono text-emerald-400">{totalScore}</span>
                <span className="text-xs text-slate-500">/ 100</span>
              </div>
            </div>
            <div className="flex flex-col sm:col-span-2 justify-center">
              <span className="text-[11px] text-slate-400 font-medium">Rekomendasi Penempatan Program:</span>
              <div className="mt-1">
                <span className={cn("px-2.5 py-1 rounded-lg text-xs font-bold border inline-block", rec.color)}>
                  {rec.label}
                </span>
              </div>
            </div>
          </div>

          {/* Evaluation Tabs */}
          <div className="flex border-b border-slate-800 gap-2">
            {[
              { id: "quran", label: "Kelancaran Baca", icon: BookOpen },
              { id: "tajweed", label: "Penguasaan Tajwid", icon: Award },
              { id: "tahfidz", label: "Hafalan Juz", icon: Star },
              { id: "ibadah", label: "Praktik Ibadah", icon: HeartHandshake },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2.5 border-b-2 font-medium text-xs transition-colors",
                  activeTab === tab.id
                    ? "border-emerald-500 text-emerald-400 bg-emerald-500/5"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Kelancaran Baca Al-Qur'an */}
          {activeTab === "quran" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">1. Kelancaran & Fashahah Baca Al-Qur'an</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Penilaian kelancaran tartil, makhorijul huruf, tempo bacaan (hadar/tadwir).</p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold font-mono text-emerald-400">{quranFluency}</span>
                  <span className="text-xs text-slate-400 block">Nilai (0-100)</span>
                </div>
              </div>

              <div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={quranFluency}
                  onChange={(e) => setQuranFluency(parseInt(e.target.value) || 0)}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                {[
                  { label: "Sangat Tartil (90-100)", val: 95 },
                  { label: "Lancar Baik (80-89)", val: 85 },
                  { label: "Cukup Lancar (70-79)", val: 75 },
                  { label: "Terbata-bata (<70)", val: 60 },
                ].map((rubric) => (
                  <button
                    type="button"
                    key={rubric.val}
                    onClick={() => setQuranFluency(rubric.val)}
                    className={cn(
                      "p-2.5 rounded-lg border text-xs text-left transition-colors",
                      Math.abs(quranFluency - rubric.val) <= 5
                        ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold"
                        : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800"
                    )}
                  >
                    {rubric.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tab 2: Penguasaan Tajwid */}
          {activeTab === "tajweed" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">2. Penguasaan Kaidah Ilmu Tajwid</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Hukum Nun/Mim Mati, Idgham, Iqlab, Ghunnah, Mad Thabi'i & Far'i, Waqaf/Ibtida'.</p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold font-mono text-emerald-400">{tajweedMastery}</span>
                  <span className="text-xs text-slate-400 block">Nilai (0-100)</span>
                </div>
              </div>

              <div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={tajweedMastery}
                  onChange={(e) => setTajweedMastery(parseInt(e.target.value) || 0)}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                {[
                  { label: "Mutqin Tajwid (90-100)", val: 95 },
                  { label: "Kaidah Tepat (80-89)", val: 85 },
                  { label: "Kadang Luput (70-79)", val: 75 },
                  { label: "Belum Paham (<70)", val: 60 },
                ].map((rubric) => (
                  <button
                    type="button"
                    key={rubric.val}
                    onClick={() => setTajweedMastery(rubric.val)}
                    className={cn(
                      "p-2.5 rounded-lg border text-xs text-left transition-colors",
                      Math.abs(tajweedMastery - rubric.val) <= 5
                        ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold"
                        : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800"
                    )}
                  >
                    {rubric.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tab 3: Hafalan Juz */}
          {activeTab === "tahfidz" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h4 className="text-sm font-semibold text-slate-200">3. Capaian Hafalan Al-Qur'an (Tahfidz)</h4>
                <p className="text-xs text-slate-400 mt-0.5">Catat juz yang telah dihafal calon santri dan tingkat kemutqinan hafalan.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  "Juz 30 (An-Naas s.d An-Naba')",
                  "2 Juz (Juz 29 & 30)",
                  "3 Juz (Juz 28, 29, 30)",
                  "5 Juz (Juz 1-5 / 26-30)",
                  "10 Juz",
                  "15 Juz",
                  "30 Juz (Hafidz 30 Juz)",
                  "Belum Hafal Juz Penuh (Surat Pendek Saja)",
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMemorizedJuz(preset)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs border transition-colors",
                      memorizedJuz === preset
                        ? "bg-emerald-950/70 border-emerald-500 text-emerald-300 font-bold"
                        : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800"
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Rincian Surat / Juz Khusus:</label>
                <input
                  type="text"
                  value={memorizedJuz}
                  onChange={(e) => setMemorizedJuz(e.target.value)}
                  placeholder="Contoh: Juz 30 mutqin + Surat Ar-Rahman, Al-Waqiah"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Tab 4: Praktik Ibadah */}
          {activeTab === "ibadah" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">4. Praktik Ibadah & Doa Harian</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Tata cara wudhu, gerakan & bacaan shalat fardhu, doa harian, dan hafalan hadits pendek.</p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold font-mono text-emerald-400">{worshipPractice}</span>
                  <span className="text-xs text-slate-400 block">Nilai (0-100)</span>
                </div>
              </div>

              <div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={worshipPractice}
                  onChange={(e) => setWorshipPractice(parseInt(e.target.value) || 0)}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                {[
                  { label: "Sempurna Sesuai Sunnah (90-100)", val: 95 },
                  { label: "Lancar & Tertib (80-89)", val: 85 },
                  { label: "Ada Lupa Sedikit (70-79)", val: 75 },
                  { label: "Perlu Bimbingan (<70)", val: 60 },
                ].map((rubric) => (
                  <button
                    type="button"
                    key={rubric.val}
                    onClick={() => setWorshipPractice(rubric.val)}
                    className={cn(
                      "p-2.5 rounded-lg border text-xs text-left transition-colors",
                      Math.abs(worshipPractice - rubric.val) <= 5
                        ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold"
                        : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800"
                    )}
                  >
                    {rubric.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Form Evaluator and Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
                Nama Asatidz Penguji:
              </label>
              <input
                type="text"
                value={evaluator}
                onChange={(e) => setEvaluator(e.target.value)}
                placeholder="Nama Penguji..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
                Catatan Kualitatif / Rekomendasi:
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Catatan penguji untuk tim penerimaan..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            Batal
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Menyimpan..." : "Simpan Hasil Uji Keagamaan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
