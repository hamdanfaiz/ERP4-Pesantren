import React, { useState, useEffect } from "react";
import {
  X,
  UserCheck,
  GraduationCap,
  Home,
  Users,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Printer,
  Building,
  Key,
} from "lucide-react";
import { Candidate } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { SystemSettings } from "../services/systemSettingsService";
import {
  onboardingService,
  getNextAvailableNIS,
} from "../services/onboardingService";
import { useCentralStructure } from "../hooks/useCentralStructure";
import { cn } from "../lib/utils";

interface PPDBOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Candidate;
  candidates?: Candidate[];
  settings?: SystemSettings | null;
  onSuccess: (updatedCandidate: Candidate) => void;
  showToast: (message: string, type: "success" | "error" | "info", title?: string) => void;
}

export function PPDBOnboardingModal({
  isOpen,
  onClose,
  candidate,
  candidates = [],
  settings,
  onSuccess,
  showToast,
}: PPDBOnboardingModalProps) {
  const { classes, rooms, buildings } = useCentralStructure();
  const { user } = useAuth();
  // Active Wizard Tab
  const [activeStep, setActiveStep] = useState<"nis" | "class" | "room" | "wali" | "success">("nis");

  // Form State
  const [nis, setNis] = useState<string>(candidate.nis || "");
  const [isGeneratingNis, setIsGeneratingNis] = useState(false);

  // Class / Rombel State
  const [selectedClassId, setSelectedClassId] = useState<string>(candidate.classId || "");
  const [selectedClassName, setSelectedClassName] = useState<string>(candidate.className || "");

  // Boarding Room State
  const [selectedRoomId, setSelectedRoomId] = useState<string>(candidate.roomId || "");
  const [selectedRoomName, setSelectedRoomName] = useState<string>(candidate.room || "");
  const [selectedBuildingName, setSelectedBuildingName] = useState<string>(candidate.dormitory || "");
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(candidate.dormitoryId || "");

  // Wali Santri Portal Account State
  const [waliName, setWaliName] = useState<string>(
    candidate.fatherName || candidate.motherName || `Wali Santri ${candidate.name}`
  );
  const [waliPhone, setWaliPhone] = useState<string>(
    candidate.whatsappPhone || candidate.phone || ""
  );

  // Loading state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [onboardedResult, setOnboardedResult] = useState<any>(null);

  const isMale = candidate.gender === "L";
  const schoolName = settings?.orgInfo?.schoolName || "Pesantren Modern Al-Hikmah";

  // Filter classes by candidate grade
  const isSMA = (candidate.grade || "").toUpperCase().includes("SMA") ||
                (candidate.grade || "").toUpperCase().includes("MA");
  const filteredClasses = classes.filter((c) => {
    if (isSMA) return c.name.includes("X") || c.name.includes("SMA");
    return c.name.includes("VII") || c.name.includes("SMP") || c.name.includes("A") || c.name.includes("B");
  });

  // Filter rooms by candidate gender strictly
  const filteredRooms = rooms.filter((r) => {
    const bld = buildings.find((b) => b.id === r.parentId || b.name === r.building);
    const bldName = (bld?.name || r.building || "").toLowerCase();
    const location = (r.location || "").toLowerCase();
    if (isMale) {
      return !bldName.includes("khadijah") && !bldName.includes("putri") && !location.includes("putri");
    } else {
      return bldName.includes("khadijah") || bldName.includes("putri") || location.includes("putri");
    }
  });

  // Auto-generate NIS on modal mount if not yet assigned
  useEffect(() => {
    if (!candidate.nis) {
      generateNis();
    } else {
      setNis(candidate.nis);
    }

    // Set default initial class if not selected
    if (!selectedClassId && filteredClasses.length > 0) {
      setSelectedClassId(filteredClasses[0].id);
      setSelectedClassName(filteredClasses[0].name);
    }

    // Set default room if not selected
    if (!selectedRoomId && filteredRooms.length > 0) {
      const room = filteredRooms[0];
      setSelectedRoomId(room.id);
      setSelectedRoomName(room.name);
      setSelectedBuildingName(room.building || (isMale ? "Asrama Umar (Putra)" : "Asrama Khadijah (Putri)"));
      setSelectedBuildingId(room.parentId || "");
    }
  }, [candidate.id]);

  const generateNis = async () => {
    setIsGeneratingNis(true);
    try {
      const generated = await getNextAvailableNIS(candidate.grade, user?.tenantId || "", candidates);
      setNis(generated);
    } catch (err) {
      console.error(err);
      setNis("");
      showToast("NIS belum dapat dibuat. Pastikan sesi, koneksi, dan tenant aktif.", "error");
    } finally {
      setIsGeneratingNis(false);
    }
  };

  const handleSelectRoom = (room: any) => {
    setSelectedRoomId(room.id);
    setSelectedRoomName(room.name);
    const bld = buildings.find((b) => b.id === room.parentId || b.name === room.building);
    setSelectedBuildingName(room.building || bld?.name || (isMale ? "Asrama Umar (Putra)" : "Asrama Khadijah (Putri)"));
    setSelectedBuildingId(room.parentId || bld?.id || "");
  };

  const handleSelectClass = (cls: any) => {
    setSelectedClassId(cls.id);
    setSelectedClassName(cls.name);
  };

  const handleExecuteOnboarding = async () => {
    if (!nis.trim()) {
      showToast("Nomor Induk Santri (NIS) wajib diisi atau di-generate.", "error");
      return;
    }
    if (!selectedClassName) {
      showToast("Pilih Rombel / Kelas Awal untuk calon santri.", "error");
      return;
    }
    if (!selectedRoomName) {
      showToast("Pilih Kamar Asrama santri.", "error");
      return;
    }

    if (!user?.tenantId) {
      showToast("Akun Anda belum terhubung ke tenant pesantren.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onboardingService.onboardCandidate(candidate, {
        candidateId: candidate.id,
        tenantId: user.tenantId,
        nis,
        classId: selectedClassId,
        className: selectedClassName,
        buildingId: selectedBuildingId,
        buildingName: selectedBuildingName,
        roomId: selectedRoomId,
        roomName: selectedRoomName,
        waliName,
        waliPhone,
      });

      setOnboardedResult(res);
      setActiveStep("success");
      showToast(
        `Alhamdulillah! ${candidate.name} resmi di-onboard dengan NIS: ${nis}, Kelas: ${selectedClassName}, Asrama: ${selectedRoomName}.`,
        "success",
        "Onboarding Berhasil"
      );

      onSuccess({
        ...candidate,
        nis,
        classId: selectedClassId,
        className: selectedClassName,
        dormitory: selectedBuildingName,
        dormitoryId: selectedBuildingId,
        room: selectedRoomName,
        roomId: selectedRoomId,
        syncToMasterData: true,
        onboardingStatus: "Completed",
        waliAccountCreated: false,
        waliAccountStatus: "PendingProvisioning",
      });
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Gagal memproses onboarding santri.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !candidate) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-6 animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                Konfirmasi Daftar Ulang &amp; Onboarding Santri Baru
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {candidate.registrationId}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Alokasi NIS Pesantren, Rombel Akademik, Penempatan Kamar Asrama &amp; Akun Wali Santri
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

        {/* Candidate Profile Bar */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs">
              {candidate.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-200">{candidate.name}</h4>
              <p className="text-xs text-slate-400">
                Jenjang: <strong className="text-slate-300">{candidate.grade}</strong> • Gender:{" "}
                <span className={cn("font-semibold", isMale ? "text-sky-400" : "text-pink-400")}>
                  {isMale ? "Putra (Ikhwan)" : "Putri (Akhwat)"}
                </span>{" "}
                • Asal: {candidate.previousSchool || "-"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-semibold border flex items-center gap-1",
                candidate.payment?.registrationFee?.status === "Paid"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              )}
            >
              Reg: {candidate.payment?.registrationFee?.status || "Unpaid"}
            </span>
            <span
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-semibold border flex items-center gap-1",
                candidate.payment?.tuitionFee?.status === "Paid"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              )}
            >
              SPP: {candidate.payment?.tuitionFee?.status || "Unpaid"}
            </span>
          </div>
        </div>

        {activeStep !== "success" ? (
          <>
            {/* Step Navigation Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/40">
              {[
                { id: "nis", label: "1. Auto-NIS Pesantren", icon: Key },
                { id: "class", label: "2. Rombel Akademik", icon: GraduationCap },
                { id: "room", label: "3. Kamar Asrama", icon: Home },
                { id: "wali", label: "4. Akun Portal Wali", icon: Users },
              ].map((step) => (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(step.id as any)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer",
                    activeStep === step.id
                      ? "border-emerald-500 text-emerald-400 bg-emerald-500/5 font-bold"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  )}
                >
                  <step.icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
              ))}
            </div>

            {/* Step Content */}
            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
              {/* STEP 1: NIS Pesantren */}
              {activeStep === "nis" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                        <Key className="w-4 h-4 text-emerald-400" />
                        Nomor Induk Santri (NIS) Pesantren
                      </label>
                      <button
                        type="button"
                        onClick={generateNis}
                        disabled={isGeneratingNis}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/20 transition-colors cursor-pointer"
                      >
                        <RefreshCw className={cn("w-3 h-3", isGeneratingNis && "animate-spin")} />
                        Generate Ulang Format Standar
                      </button>
                    </div>

                    <div className="flex items-center gap-3 mt-3">
                      <input
                        type="text"
                        value={nis}
                        onChange={(e) => setNis(e.target.value)}
                        placeholder="Contoh: 2026020001"
                        className="flex-1 bg-black/60 border border-emerald-500/40 rounded-xl px-4 py-3 text-lg font-mono font-bold text-emerald-300 focus:outline-none focus:border-emerald-400"
                      />
                    </div>

                    <div className="mt-3 p-3 bg-emerald-950/30 rounded-lg border border-emerald-500/20 text-xs text-slate-300 space-y-1">
                      <p className="font-semibold text-emerald-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" /> Format Baku Standar Pesantren:
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        [TahunMasuk: {new Date().getFullYear()}][KodeJenjang:{" "}
                        {candidate.grade?.includes("SD") ? "01" : candidate.grade?.includes("SMA") ? "03" : "02"}
                        ][NoUrut: 4 digit sequential]
                      </p>
                      <p className="text-[11px] text-slate-400">
                        NIS ini akan menjadi identitas primer santri di Modul Akademik, Tahfidz, Keuangan (SPP), dan
                        Asrama.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-400">
                    <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800">
                      <span className="text-[10px] uppercase block text-slate-500">NISN Kemendikbud:</span>
                      <strong className="text-slate-200 font-mono">{candidate.nisn || "Belum ada NISN"}</strong>
                    </div>
                    <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800">
                      <span className="text-[10px] uppercase block text-slate-500">NIK Calon Santri:</span>
                      <strong className="text-slate-200 font-mono">{candidate.nik || "Belum ada NIK"}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Rombel Akademik */}
              {activeStep === "class" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-emerald-400" />
                      Pilih Kelas / Rombel Awal (AcademicManager)
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Tentukan rombongan belajar awal untuk jadwal KBM, e-presensi, dan wali kelas santri.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {filteredClasses.map((cls) => {
                      const isSelected = selectedClassId === cls.id || selectedClassName === cls.name;
                      return (
                        <div
                          key={cls.id}
                          onClick={() => handleSelectClass(cls)}
                          className={cn(
                            "p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between",
                            isSelected
                              ? "bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-500/10 text-emerald-200"
                              : "bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-300"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-sm text-slate-100">{cls.name}</span>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Lokasi: {cls.location || "Gedung Akademik"}
                          </p>
                          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                            <span>Kapasitas: {cls.capacity || "30 Siswa"}</span>
                            <span className="text-emerald-400 font-semibold">Tersedia</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {filteredClasses.length === 0 && (
                    <div className="p-4 bg-slate-950 rounded-lg border border-dashed border-slate-800 text-center text-xs text-slate-500">
                      Tidak ada kelas spesifik yang ditemukan. Menggunakan kelas standar: VII - A.
                    </div>
                  )}

                  <div className="p-3 bg-black/40 rounded-xl border border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Rombel Terpilih:</span>
                    <strong className="text-sm font-bold text-emerald-400">{selectedClassName || "Belum dipilih"}</strong>
                  </div>
                </div>
              )}

              {/* STEP 3: Kamar Asrama */}
              {activeStep === "room" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                        <Home className="w-4 h-4 text-emerald-400" />
                        Penempatan Kamar Asrama (BoardingManager)
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Filter otomatis sesuai gender:{" "}
                        <strong className={isMale ? "text-sky-400" : "text-pink-400"}>
                          {isMale ? "Asrama Putra (Umar, Utsman, Ali)" : "Asrama Putri (Khadijah, Fatimah)"}
                        </strong>
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
                      {filteredRooms.length} Kamar Tersedia
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredRooms.map((room) => {
                      const isSelected = selectedRoomId === room.id || selectedRoomName === room.name;
                      const cap = typeof room.capacity === "number" ? room.capacity : parseInt(room.capacity || "6") || 6;
                      const occ = room.occupied || 0;
                      const remaining = Math.max(0, cap - occ);

                      return (
                        <div
                          key={room.id}
                          onClick={() => handleSelectRoom(room)}
                          className={cn(
                            "p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between",
                            isSelected
                              ? "bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-500/10 text-emerald-200"
                              : "bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-300"
                          )}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <span className="font-bold text-sm text-slate-100 block">{room.name}</span>
                              <span className="text-[11px] text-slate-400 block mt-0.5">
                                {room.building || room.location || "Asrama"}
                              </span>
                            </div>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                          </div>

                          <div className="mt-2 space-y-1">
                            <div className="flex justify-between text-[11px] text-slate-400">
                              <span>Kasur Tersedia:</span>
                              <span className="font-semibold text-emerald-400">Sisa {remaining} dari {cap}</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-emerald-500 h-full rounded-full transition-all"
                                style={{ width: `${Math.min(100, (occ / cap) * 100)}%` }}
                              />
                            </div>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                            <span>Musyrif: {room.musyrif || "Ust. Musyrif Asrama"}</span>
                            <span className="px-1.5 py-0.5 rounded bg-black/40 border border-slate-800">
                              {room.location || "Lt. 1"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-3 bg-black/40 rounded-xl border border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Kamar &amp; Gedung Terpilih:</span>
                    <strong className="text-sm font-bold text-emerald-400">
                      {selectedRoomName ? `${selectedRoomName} (${selectedBuildingName})` : "Belum dipilih"}
                    </strong>
                  </div>
                </div>
              )}

              {/* STEP 4: Akun Portal Wali Santri */}
              {activeStep === "wali" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-400" />
                        Pembuatan Akun Portal Wali Santri
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Entitas akun login untuk orang tua/wali santri agar dapat langsung masuk ke portal untuk memantau
                        kehadiran &amp; tagihan SPP.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">
                          Nama Wali Santri:
                        </label>
                        <input
                          type="text"
                          value={waliName}
                          onChange={(e) => setWaliName(e.target.value)}
                          className="w-full bg-black/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">
                          No. HP / WhatsApp Wali:
                        </label>
                        <input
                          type="text"
                          value={waliPhone}
                          onChange={(e) => setWaliPhone(e.target.value)}
                          placeholder="08123456789"
                          className="w-full bg-black/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="sm:col-span-2 p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 text-[11px] text-amber-200">
                        Akun portal wali belum dibuat. Aktivasi harus dilakukan melalui provisioning Firebase Auth yang aman; tidak ada password default yang disimpan atau dikirim.
                      </div>
                    </div>

                    <div className="p-3 bg-emerald-950/20 rounded-xl border border-emerald-500/20 text-xs text-slate-300 space-y-1">
                      <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" /> Akses Fitur Portal Wali Santri:
                      </div>
                      <ul className="list-disc pl-5 text-[11px] text-slate-400 space-y-0.5">
                        <li>Memantau rekap absensi KBM dan kegiatan malam asrama secara live.</li>
                        <li>Melihat rincian tagihan SPP bulanan, riwayat pembayaran, &amp; kwitansi resmi digital.</li>
                        <li>Memantau mutaba'ah hafalan Juz Al-Qur'an dan catatan asatidz penguji.</li>
                        <li>Mengajukan perizinan kepulangan santri secara mandiri (Parental Leave).</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                Batal
              </button>

              <div className="flex items-center gap-2">
                {activeStep !== "nis" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeStep === "class") setActiveStep("nis");
                      else if (activeStep === "room") setActiveStep("class");
                      else if (activeStep === "wali") setActiveStep("room");
                    }}
                    className="px-3.5 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    Kembali
                  </button>
                )}

                {activeStep !== "wali" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeStep === "nis") setActiveStep("class");
                      else if (activeStep === "class") setActiveStep("room");
                      else if (activeStep === "room") setActiveStep("wali");
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    Lanjut &rarr;
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleExecuteOnboarding}
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4" />
                    {isSubmitting ? "Memproses Onboarding..." : "Konfirmasi Daftar Ulang & Alokasi"}
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          /* STEP 5: SUCCESS CONFIRMATION & CREDENTIAL DELIVERY */
          <div className="p-6 space-y-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-bold text-slate-100">Alhamdulillah! Onboarding Berhasil</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Calon santri <strong className="text-slate-200">{candidate.name}</strong> telah resmi terdaftar di Master Data Pesantren
                dan siap mengikuti kegiatan belajar mengajar.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto text-left">
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Nomor Induk Santri</span>
                <span className="text-base font-mono font-bold text-emerald-400">{nis}</span>
              </div>
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Rombel / Kelas Awal</span>
                <span className="text-base font-bold text-slate-200">{selectedClassName}</span>
              </div>
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Kamar Asrama</span>
                <span className="text-base font-bold text-slate-200">{selectedRoomName}</span>
              </div>
            </div>

            <div className="p-4 bg-slate-950/90 rounded-xl border border-amber-500/30 max-w-xl mx-auto text-left">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" /> Akun Portal Wali Menunggu Aktivasi
              </div>
              <p className="mt-2 text-xs text-slate-400">Data wali telah ditautkan ke santri di {schoolName}. Kredensial login baru dapat diberikan setelah akun Firebase Auth dan profil tenant diprovisikan oleh administrator.</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                            <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Tutup &amp; Selesai
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
