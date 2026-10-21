import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Upload,
  FileText,
  CheckCircle2,
  User,
  Phone,
  GraduationCap,
  X,
  Building,
  Download,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  CreditCard,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Candidate } from "../types";
import { RegionSelector } from "./RegionSelector";
import { systemSettingsService, SystemSettings } from "../services/systemSettingsService";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { CandidatePDFDocument } from "./CandidatePDFCard";

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function ppdbFileMimeType(file: File) {
  if (file.type === "application/pdf" || file.type === "image/jpeg" || file.type === "image/png") return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  return "";
}

interface PublicRegistrationFormProps {
  onClose: () => void;
  onSubmit?: (data: Candidate) => void;
}

export function PublicRegistrationForm({
  onClose,
  onSubmit,
}: PublicRegistrationFormProps) {
  const [step, setStep] = useState(1);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(
    systemSettingsService.getSettings()
  );
  const [formData, setFormData] = useState<Partial<Candidate>>({
    gender: "L",
    grade: "SMP",
    documents: {
      kk: false,
      birthCertificate: false,
      reportCards: false,
      ijazah: false,
      skhun: false,
      pasPhoto: false,
    },
  });

  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>({});
  const [selectedDocumentFiles, setSelectedDocumentFiles] = useState<Record<string, File>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPublicRegistrationAvailable, setIsPublicRegistrationAvailable] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedCandidate, setSubmittedCandidate] = useState<Candidate | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/public/ppdb/config", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Pendaftaran PPDB belum dibuka.");
        return payload;
      })
      .then((config) => {
        if (!active) return;
        setSystemSettings((current) => ({
          ...current,
          generalSettings: { ...current.generalSettings, academicYear: config.academicYear || current.generalSettings.academicYear },
          orgInfo: { ...current.orgInfo, ...(config.orgInfo || {}) },
        }));
        setIsPublicRegistrationAvailable(true);
      })
      .catch((error) => {
        if (active) {
          setIsPublicRegistrationAvailable(false);
          setSubmitError(error.message || "Pendaftaran online sedang tidak tersedia.");
        }
      });
    return () => { active = false; };
  }, []);

  const handleFileUpload = (
    key: keyof NonNullable<Candidate["documents"]>,
    file: File | null
  ) => {
    if (!file) return;
    const mimeType = ppdbFileMimeType(file);
    if (!mimeType) {
      setSubmitError("Dokumen harus berupa PDF, JPG, atau PNG.");
      return;
    }
    if (file.size <= 0 || file.size > 2 * 1024 * 1024) {
      setSubmitError("Ukuran setiap dokumen maksimal 2 MB.");
      return;
    }
    setSubmitError(null);
    setUploadedFiles((prev) => ({ ...prev, [key]: file.name }));
    setSelectedDocumentFiles((prev) => ({ ...prev, [String(key)]: file }));
    setFormData((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        [key]: true,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPublicRegistrationAvailable) {
      setSubmitError("Pendaftaran online belum dibuka atau layanan server belum dikonfigurasi. Silakan hubungi panitia pesantren.");
      return;
    }
    const requiredDocuments = ["kk", "birthCertificate", "pasPhoto"];
    if (requiredDocuments.some((key) => !selectedDocumentFiles[key])) {
      setSubmitError("Unggah Kartu Keluarga, Akta Kelahiran, dan Pas Foto sebelum mengirim pendaftaran.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    const candidate = {
      name: formData.name?.trim() || "", gender: formData.gender || "L", grade: formData.grade || "SMP",
      previousSchool: formData.previousSchool?.trim() || "", phone: formData.phone?.trim() || "",
      whatsappPhone: formData.whatsappPhone?.trim() || formData.phone?.trim() || "", email: formData.email?.trim() || "",
      nik: formData.nik?.trim() || "", nisn: formData.nisn?.trim() || "", pob: formData.pob?.trim() || "",
      dob: formData.dob || "", address: formData.address?.trim() || "", province: formData.province || "",
      regency: formData.regency || "", district: formData.district || "", village: formData.village || "",
      fatherName: formData.fatherName?.trim() || "", motherName: formData.motherName?.trim() || "",
      fatherJob: formData.fatherJob?.trim() || "", motherJob: formData.motherJob?.trim() || "",
      fatherEducation: formData.fatherEducation?.trim() || "", motherEducation: formData.motherEducation?.trim() || "",
      familyIncome: formData.familyIncome?.trim() || "", documents: formData.documents || {},
    };

    try {
      const documents: Record<string, { base64: string; mimeType: string; fileName: string }> = {};
      for (const [key, file] of Object.entries(selectedDocumentFiles)) {
        documents[key] = {
          base64: await fileToBase64(file),
          mimeType: ppdbFileMimeType(file),
          fileName: file.name,
        };
      }
      const response = await fetch("/api/public/ppdb/registrations", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ candidate, documents }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Gagal menyimpan data pendaftaran. Silakan coba kembali.");
      if (!payload.candidate?.id || !payload.candidate?.registrationId) throw new Error("Server tidak mengembalikan nomor pendaftaran yang valid.");
      const fullCandidate = payload.candidate as Candidate;
      setSubmittedCandidate(fullCandidate);
      setStep(5);
      onSubmit?.(fullCandidate);
    } catch (error: any) {
      console.error("Error creating candidate:", error);
      setSubmitError(error?.message || "Gagal menyimpan data pendaftaran ke server. Silakan coba beberapa saat lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyRegistrationId = () => {
    if (!submittedCandidate) return;
    navigator.clipboard.writeText(submittedCandidate.registrationId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm overflow-y-auto font-sans text-slate-800">
      <div className="min-h-screen py-8 px-4 flex items-center justify-center">
        <div className="max-w-4xl w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 shadow-2xl p-6 md:p-10 relative">
          {/* Header */}
          <div className="flex justify-between items-center mb-8 border-b border-slate-100 dark:border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Portal PPDB Online
                </h1>
                <p className="text-slate-500 text-xs">
                  {systemSettings?.orgInfo?.schoolName} • Tahun Ajaran {systemSettings?.generalSettings?.academicYear}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
              title="Tutup Form"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Progress Timeline (Hanya ditampilkan step 1-4) */}
          {step <= 4 && (
            <div className="flex items-center justify-center mb-8">
              <div className="flex items-center w-full max-w-2xl">
                {[
                  { num: 1, label: "Biodata Diri" },
                  { num: 2, label: "Asal Sekolah" },
                  { num: 3, label: "Data Orang Tua" },
                  { num: 4, label: "Upload Berkas" },
                ].map((s, idx) => (
                  <React.Fragment key={s.num}>
                    <div className="flex flex-col items-center relative z-10 w-24">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center font-bold mb-2 transition-all shadow-sm",
                          step >= s.num
                            ? "bg-emerald-600 text-white shadow-emerald-500/20"
                            : "bg-slate-100 dark:bg-white/5 text-slate-400"
                        )}
                      >
                        {step > s.num ? <Check className="w-5 h-5" /> : s.num}
                      </div>
                      <span
                        className={cn(
                          "text-xs font-medium text-center",
                          step >= s.num
                            ? "text-emerald-700 dark:text-emerald-400 font-semibold"
                            : "text-slate-400"
                        )}
                      >
                        {s.label}
                      </span>
                    </div>
                    {idx < 3 && (
                      <div
                        className={cn(
                          "flex-1 h-1 -mt-6 transition-colors",
                          step > s.num ? "bg-emerald-600" : "bg-slate-200 dark:bg-white/10"
                        )}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {submitError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 flex items-center gap-3 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Form Container */}
          {step <= 4 ? (
            <form
              onSubmit={
                step === 4
                  ? handleSubmit
                  : (e) => {
                      e.preventDefault();
                      setStep((s) => s + 1);
                    }
              }
            >
              {/* STEP 1: Biodata Diri */}
              {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <h3 className="text-xl font-bold flex items-center gap-2 mb-6 text-slate-800 dark:text-white">
                    <User className="text-emerald-600 w-5 h-5" /> Identitas Santri / Calon Siswa
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Nama Lengkap Sesuai Akta <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="Contoh: Muhammad Faiz Al-Farisi"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        NIK (Nomor Induk Kependudukan) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={16}
                        value={formData.nik || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, nik: e.target.value })
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono"
                        placeholder="16 Digit NIK"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        NISN (Nomor Induk Siswa Nasional)
                      </label>
                      <input
                        type="text"
                        maxLength={10}
                        value={formData.nisn || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, nisn: e.target.value })
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono"
                        placeholder="10 Digit NISN (jika ada)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Tempat Lahir <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.pob || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, pob: e.target.value })
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="Kota / Kabupaten Lahir"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Tanggal Lahir <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.dob || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, dob: e.target.value })
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Jenis Kelamin <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.gender || "L"}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            gender: e.target.value as "L" | "P",
                          })
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      >
                        <option value="L">Laki-Laki (Santri Putra)</option>
                        <option value="P">Perempuan (Santri Putri)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Nomor Telepon / HP Pribadi
                      </label>
                      <input
                        type="tel"
                        value={formData.phone || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="08xxxxxxxxxx"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Asal Sekolah & Jenjang Pendaftaran */}
              {step === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <h3 className="text-xl font-bold flex items-center gap-2 mb-6 text-slate-800 dark:text-white">
                    <GraduationCap className="text-emerald-600 w-5 h-5" /> Data Asal Sekolah & Jenjang
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Jenjang Pilihan di Pesantren <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formData.grade || "SMP"}
                        onChange={(e) =>
                          setFormData({ ...formData, grade: e.target.value })
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      >
                        <option value="SD">SD IT / Madrasah Ibtidaiyah (MI)</option>
                        <option value="SMP">SMP IT / Madrasah Tsanawiyah (MTs Boarding)</option>
                        <option value="SMA">SMA IT / Madrasah Aliyah (MA Boarding)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Nama Asal Sekolah / Madrasah <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.previousSchool || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            previousSchool: e.target.value,
                          })
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="Contoh: SDN 01 Pagi / MI Al-Hikmah"
                      />
                    </div>
                    <div className="col-span-1 md:col-span-2">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 border-b border-slate-200 dark:border-white/10 pb-2 flex items-center gap-2">
                        <Building className="w-4 h-4 text-emerald-600" />
                        Alamat Domisili Calon Santri
                      </h3>
                      <RegionSelector
                        province={formData.province}
                        regency={formData.regency}
                        district={formData.district}
                        village={formData.village}
                        addressDetail={formData.address}
                        onChange={(field, value) => {
                          if (field === "addressDetail")
                            setFormData({ ...formData, address: value });
                          else setFormData({ ...formData, [field]: value });
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Data Orang Tua */}
              {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <h3 className="text-xl font-bold flex items-center gap-2 mb-6 text-slate-800 dark:text-white">
                    <Phone className="text-emerald-600 w-5 h-5" /> Data Orang Tua / Wali Santri
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Nama Ayah Kandung <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.fatherName || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, fatherName: e.target.value })
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="Nama Ayah"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Pekerjaan Ayah
                      </label>
                      <input
                        type="text"
                        value={formData.fatherJob || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, fatherJob: e.target.value })
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="Pekerjaan Ayah"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Nama Ibu Kandung <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.motherName || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, motherName: e.target.value })
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="Nama Ibu"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Pekerjaan Ibu
                      </label>
                      <input
                        type="text"
                        value={formData.motherJob || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, motherJob: e.target.value })
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="Pekerjaan Ibu"
                      />
                    </div>
                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Nomor WhatsApp Aktif Wali Santri <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.whatsappPhone || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            whatsappPhone: e.target.value,
                          })
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono"
                        placeholder="08xxxxxxxxxx (Krusial: Digunakan untuk notifikasi jadwal ujian & kelulusan)"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: Upload Berkas */}
              {step === 4 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2 mb-2 text-slate-800 dark:text-white">
                      <FileText className="text-emerald-600 w-5 h-5" /> Upload Dokumen Persyaratan
                    </h3>
                    <p className="text-sm text-slate-500">
                      Unggah dokumen soft-file di bawah ini. Dokumen akan langsung terverifikasi oleh panitia seleksi.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { id: "kk", label: "Kartu Keluarga (KK)", req: true },
                      { id: "birthCertificate", label: "Akta Kelahiran", req: true },
                      { id: "pasPhoto", label: "Pas Foto 3x4 Background Merah", req: true },
                      { id: "reportCards", label: "Rapor Terakhir", req: true },
                      { id: "ijazah", label: "Ijazah Terakhir", req: false },
                      { id: "skhun", label: "SKHUN / Nilai Ujian", req: false },
                    ].map((doc) => {
                      const key = doc.id as keyof NonNullable<Candidate["documents"]>;
                      const isUploaded = !!uploadedFiles[key];

                      return (
                        <div
                          key={doc.id}
                          className={cn(
                            "border rounded-2xl p-4 transition-all",
                            isUploaded
                              ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800"
                              : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10"
                          )}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                                {doc.label} {doc.req && <span className="text-red-500">*</span>}
                              </h4>
                              <p className="text-xs text-slate-500 mt-1">
                                Format: PDF, JPG, PNG (Maks 2MB)
                              </p>
                            </div>
                            {isUploaded && (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                            )}
                          </div>

                          <div className="relative">
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                              onChange={(e) =>
                                handleFileUpload(key, e.target.files?.[0] || null)
                              }
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div
                              className={cn(
                                "flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-dashed text-sm font-medium transition-colors",
                                isUploaded
                                  ? "border-emerald-300 bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                                  : "border-slate-300 dark:border-white/20 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
                              )}
                            >
                              <Upload className="w-4 h-4" />
                              <span>{isUploaded ? "Ganti File Dokumen" : "Pilih File"}</span>
                            </div>
                            {isUploaded && (
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-2 truncate w-full">
                                File terpilih: {uploadedFiles[key]}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Form Navigation Footer */}
              <div className="mt-10 pt-6 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
                {step > 1 ? (
                  <button
                    type="button"
                    onClick={() => setStep((s) => s - 1)}
                    disabled={isSubmitting}
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                  >
                    Kembali
                  </button>
                ) : (
                  <div />
                )}

                {step < 4 ? (
                  <button
                    type="submit"
                    className="px-8 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
                  >
                    Selanjutnya
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmitting || !isPublicRegistrationAvailable}
                    className="px-8 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/30 flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menyimpan Pendaftaran...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Kirim Formulir Pendaftaran</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          ) : (
            /* STEP 5: Konfirmasi Sukses & Download Kartu */
            <div className="text-center py-6 space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">
                  Pendaftaran Berhasil Dikirim!
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 max-w-lg mx-auto">
                  Selamat, data pendaftaran calon santri telah berhasil tersimpan ke sistem PPDB Digital {systemSettings?.orgInfo?.schoolName}.
                </p>
              </div>

              {submittedCandidate && (
                <div className="max-w-md mx-auto bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 text-left space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Nomor Registrasi:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {submittedCandidate.registrationId}
                      </span>
                      <button
                        onClick={copyRegistrationId}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded text-slate-500"
                        title="Salin Nomor Registrasi"
                      >
                        {copiedId ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block">Nama Calon Santri</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{submittedCandidate.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Jenjang Tujuan</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{submittedCandidate.grade}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Jenis Kelamin</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {submittedCandidate.gender === "P" ? "Santri Putri" : "Santri Putra"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Status Tahap</span>
                      <span className="inline-block bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-medium px-2 py-0.5 rounded text-[11px]">
                        Terdaftar (Registered)
                      </span>
                    </div>
                  </div>

                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-700 dark:text-emerald-300 space-y-1">
                    <div className="font-semibold">Petunjuk Tahap Seleksi:</div>
                    <p>1. Simpan dan unduh Kartu Bukti Pendaftaran di bawah ini.</p>
                    <p>2. Bawa kartu dan berkas fotokopi saat pelaksanaan ujian seleksi di kampus.</p>
                    <p>3. Panitia akan mengirimkan konfirmasi sesi tes melalui WhatsApp: <strong>{submittedCandidate.whatsappPhone}</strong>.</p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                {submittedCandidate && (
                  <PDFDownloadLink
                    document={
                      <CandidatePDFDocument
                        candidate={submittedCandidate}
                        settings={systemSettings}
                      />
                    }
                    fileName={`Kartu_PPDB_${submittedCandidate.registrationId}.pdf`}
                    className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
                  >
                    {({ loading }) => (
                      <>
                        <Download className="w-4 h-4" />
                        <span>{loading ? "Menyiapkan Berkas PDF..." : "Unduh Kartu Pendaftaran (PDF)"}</span>
                      </>
                    )}
                  </PDFDownloadLink>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-6 py-3 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 rounded-xl font-semibold text-sm transition-colors"
                >
                  Selesai & Tutup
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
