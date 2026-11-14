import { useAuth } from '../contexts/AuthContext';
import React, { useEffect, useState } from 'react';
import { listSupabaseReferenceItems, upsertSupabaseMasterDataStudent, type SupabaseReferenceItem } from '../services/masterDataApi';
import { Users, Save, X, CheckCircle2, AlertTriangle, Loader2, Link2, UserCheck, Building2, Home, BookOpen, UserPlus, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toERPUserMessage } from '../utils/userMessages';

interface EntityRegistrationFormProps {
  onSuccess?: (savedData?: any) => void;
  onCancel?: () => void;
  initialData?: any;
  isEdit?: boolean;
  availableWali?: any[];
  availableSantri?: any[];
  availableStructure?: Record<string, any[]>;
}

import {
  EntitySchema,
  validateMasterData,
  checkIdentityConflicts,
  IdentityConflict,
  NIK_REGEX,
  NISN_REGEX,
  NUPTK_REGEX,
  INDONESIA_PHONE_REGEX
} from '../schema/masterDataSchema';
import { RegionSelector } from './RegionSelector';

export const EntityRegistrationForm: React.FC<EntityRegistrationFormProps> = ({
  onSuccess,
  onCancel,
  initialData,
  isEdit,
  availableWali = [],
  availableSantri = [],
  availableStructure,
}) => {
  const { user } = useAuth();
  const [gradeLevels, setGradeLevels] = useState<SupabaseReferenceItem[]>([]);
  const [formData, setFormData] = useState({
    id: initialData?.id || '',
    name: initialData?.name || '',
    type: 'Santri',
    status: initialData?.status || 'Active',
    identifier: initialData?.nis || initialData?.identifier || '',
    contact: initialData?.contact || '',
    gradeOrDepartment: initialData?.gradeOrDepartment || '',
    nik: initialData?.nik || '',
    nisn: initialData?.nisn || '',
    pob: initialData?.pob || '',
    dob: initialData?.dob || '',
    gender: initialData?.gender || 'L',
    address: initialData?.address || '',
    province: initialData?.province || '',
    regency: initialData?.regency || '',
    district: initialData?.district || '',
    village: initialData?.village || '',
    phone: initialData?.phone || '',
    email: initialData?.email || '',
    previousSchool: initialData?.previousSchool || '',
    fatherName: initialData?.fatherName || '',
    motherName: initialData?.motherName || '',
    fatherJob: initialData?.fatherJob || '',
    motherJob: initialData?.motherJob || '',
    parentPhone: initialData?.parentPhone || '',
    whatsappPhone: initialData?.whatsappPhone || '',
    familyIncome: initialData?.familyIncome || '',
    // Relational Foreign Key Links (Recommendation 2)
    waliSantriId: initialData?.waliSantriId || '',
    parentName: initialData?.parentName || initialData?.fatherName || '',
    santriIds: initialData?.santriIds || [],
    studentName: initialData?.studentName || '',
    studentGrade: initialData?.studentGrade || '',
    grade: initialData?.grade || '',
    gradeLevelReferenceId: initialData?.gradeLevelReferenceId || '',
    classId: initialData?.classId || '',
    dormitory: initialData?.dormitory || '',
    dormitoryId: initialData?.dormitoryId || '',
    room: initialData?.room || '',
    roomId: initialData?.roomId || '',
    halaqah: initialData?.halaqah || '',
    halaqahId: initialData?.halaqahId || '',
    nuptk: initialData?.nuptk || '',
    educations: initialData?.educations || [],
    certifications: initialData?.certifications || [],
    experiences: initialData?.experiences || [],
    assignments: initialData?.assignments || [],
    joinDate: initialData?.joinDate || '',
    employmentType: initialData?.employmentType || '',
    npwp: initialData?.npwp || '',
    bankAccount: initialData?.bankAccount || '',
    bankName: initialData?.bankName || '',
    graduationYear: initialData?.graduationYear || '',
    currentActivity: initialData?.currentActivity || '',
  });

  useEffect(() => {
    let active = true;
    listSupabaseReferenceItems('academic_grade_level')
      .then((items) => { if (active) setGradeLevels(items.filter((item) => item.status === 'active')); })
      .catch((error) => {
        if (active) setMessage({ type: 'error', text: toERPUserMessage(error, 'Katalog jenjang belum dapat dimuat. Coba kembali.') });
      });
    return () => { active = false; };
  }, [user?.tenantId, user?.uid]);

  const [useCustomParent, setUseCustomParent] = useState(
    !initialData?.waliSantriId && (initialData?.parentName || initialData?.fatherName) ? true : false
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Recommendation 3: Aggregated list of all existing records for conflict checking
  const allRecords = React.useMemo(() => {
    const list: any[] = [...(availableSantri || []), ...(availableWali || [])];
    if (availableStructure) {
      Object.values(availableStructure).forEach((arr) => {
        if (Array.isArray(arr)) {
          list.push(...arr);
        }
      });
    }
    return list;
  }, [availableSantri, availableWali, availableStructure]);

  const activeStructures = (category: string) => {
    const records = availableStructure?.[category];
    return (Array.isArray(records) ? records : []).filter((record) => {
      const status = String(record?.status || "active").trim().toLocaleLowerCase("id-ID");
      return !["inactive", "nonaktif", "tidak aktif", "disabled", "archived", "diarsipkan"].includes(status);
    });
  };
  const classOptions = activeStructures("Kelas");
  const classOptionsForGrade = formData.grade
    ? classOptions.filter((item) => String(item.grade || '') === String(formData.grade))
    : classOptions;
  const buildingOptions = activeStructures("Gedung");
  const roomOptions = activeStructures("Kamar");
  const selectedBuildingId = String(formData.dormitoryId || "");
  const roomOptionsForBuilding = roomOptions.filter((room) =>
    !selectedBuildingId || !room.parentId || String(room.parentId) === selectedBuildingId
  );

  // Recommendation 3: Real-time duplicate identity conflict detection
  const conflicts = React.useMemo(() => {
    return checkIdentityConflicts(
      formData,
      allRecords,
      isEdit ? initialData?.id : undefined
    );
  }, [formData.nik, formData.nisn, formData.nuptk, formData.id, formData.email, formData.type, allRecords, isEdit, initialData?.id]);

  const validateSingleField = (field: string, value: any, currentType = formData.type) => {
    const str = (value || '').toString().trim();
    if (field === 'name') {
      if (!str || str.length < 2) return 'Nama minimal harus 2 karakter';
    }
    if (field === 'nik' && str) {
      if (!NIK_REGEX.test(str)) return 'NIK harus terdiri dari tepat 16 digit angka';
    }
    if (field === 'nisn' && str && currentType === 'Santri') {
      if (!NISN_REGEX.test(str)) return 'NISN harus terdiri dari tepat 10 digit angka';
    }
    if (field === 'nuptk' && str && (currentType === 'Guru' || currentType === 'Asatidz')) {
      if (!NUPTK_REGEX.test(str)) return 'NUPTK harus terdiri dari tepat 16 digit angka';
    }
    if (['phone', 'contact', 'parentPhone', 'whatsappPhone'].includes(field) && str) {
      if (!INDONESIA_PHONE_REGEX.test(str.replace(/\s+/g, ''))) {
        return 'Format nomor telepon tidak valid (contoh: 08123456789 atau +62812...)';
      }
    }
    if (field === 'email' && str) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return 'Format email tidak valid';
    }
    if (field === 'graduationYear' && str && currentType === 'Alumni') {
      if (!/^(19|20)\d{2}$/.test(str)) return 'Tahun kelulusan harus 4 digit angka (contoh: 2024)';
    }
    return '';
  };

  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setTouched(prev => ({ ...prev, [field]: true }));
    const err = validateSingleField(field, value, field === 'type' ? value : formData.type);
    setFieldErrors(prev => {
      const next = { ...prev };
      if (err) next[field] = err;
      else delete next[field];
      return next;
    });
  };

  const handleArrayChange = (field: string, index: number, key: string, value: string) => {
    setFormData(prev => {
      const arr = [...(prev[field] as any[])];
      arr[index] = { ...arr[index], [key]: value };
      return { ...prev, [field]: arr };
    });
  };

  const addArrayItem = (field: string, defaultItem: any) => {
    setFormData(prev => ({ ...prev, [field]: [...(prev[field] as any[]), defaultItem] }));
  };

  const removeArrayItem = (field: string, index: number) => {
    setFormData(prev => {
      const arr = [...(prev[field] as any[])];
      arr.splice(index, 1);
      return { ...prev, [field]: arr };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Recommendation 3: Strict Schema Validation by entity type
    const result = validateMasterData(formData, 'entities', formData.type);

    if (!result.success) {
      const formatted: Record<string, string> = {};
      result.error.issues.forEach(issue => {
        const path = issue.path[0] as string;
        formatted[path] = issue.message;
      });
      setFieldErrors(formatted);
      const firstError = result.error.issues[0]?.message || 'Data formulir tidak valid';
      setMessage({ type: 'error', text: `Validasi data gagal: ${firstError}` });
      return;
    }

    // Recommendation 3: Identity Duplication Conflict Guard
    const detectedConflicts = checkIdentityConflicts(
      formData,
      allRecords,
      isEdit ? initialData?.id : undefined
    );

    if (detectedConflicts.length > 0) {
      const first = detectedConflicts[0];
      setMessage({
        type: 'error',
        text: `Data duplikat terdeteksi: ${first.message}. Mohon periksa kembali nomor identitas.`
      });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      if (formData.type !== 'Santri') {
        throw new Error('Kategori ini belum dapat dipilih.');
      }
      const studentPayload = {
        ...result.data,
        nis: isEdit ? String(initialData?.nis || formData.identifier || '').trim() || null : null,
      };
      const savedData = await upsertSupabaseMasterDataStudent({
        ...studentPayload,
        id: isEdit ? result.data.id || initialData?.id || '' : '',
        supabaseId: initialData?.supabaseId,
        type: 'Santri',
        tenantId: user?.tenantId,
      });
      setMessage({ type: 'success', text: `Data ${formData.type} "${result.data.name}" tersimpan dengan NIS ${savedData.nis || 'otomatis'}.` });
      if (onSuccess) onSuccess(savedData);
    } catch (error) {
      console.error("Error adding document: ", error);
      setMessage({ type: 'error', text: toERPUserMessage(error, 'Data santri belum dapat disimpan. Periksa kembali data lalu coba lagi.') });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Users className="w-5 h-5 text-emerald-500" /> {isEdit ? "Ubah Data Santri" : "Tambah Data Santri"}
        </h3>
        {onCancel && (
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-6">
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
              : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <span className="font-medium text-sm">{message.text}</span>
          </div>
        )}

        {/* Recommendation 3: Identity Conflict Alert Banner */}
        {conflicts.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 font-bold text-sm text-amber-300 mb-1.5">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
              <span>Peringatan Deteksi Duplikasi Identitas (Rekomendasi 3)</span>
            </div>
            <p className="text-xs text-amber-300/80 mb-2">
              Sistem mendeteksi atribut unik yang telah terdaftar pada entitas lain dalam basis data. Mohon periksa kembali agar tidak terjadi benturan integritas data:
            </p>
            <ul className="text-xs space-y-1 list-disc list-inside bg-black/30 p-2.5 rounded-lg border border-amber-500/20 font-mono text-[11px]">
              {conflicts.map((c, i) => (
                <li key={i} className="text-amber-200">
                  {c.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nama Lengkap *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                className={`w-full bg-slate-50 dark:bg-black/20 border ${fieldErrors.name ? 'border-rose-500 ring-1 ring-rose-500/20' : 'border-slate-200 dark:border-white/10'} rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50`}
                placeholder="Contoh: Ahmad Abdullah"
                required
              />
              {fieldErrors.name && (
                <p className="text-xs text-rose-400 mt-1">{fieldErrors.name}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Jenis Data *</label>
              <div className="w-full rounded-lg border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                Santri
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nomor Induk Santri (NIS)</label>
              <input
                type="text"
                value={formData.identifier}
                readOnly
                className="w-full cursor-not-allowed bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm opacity-80"
                placeholder="Dibuat otomatis saat data santri disimpan"
              />
              <p className="mt-1 text-xs text-slate-500">NIS baru dibuat otomatis setelah jenjang dipilih; NIS yang sudah terbit tidak dapat diubah dari formulir ini.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Jenjang pendidikan</label>
              <select
                required
                value={formData.gradeLevelReferenceId || gradeLevels.find((item) => item.name === formData.grade)?.id || ''}
                onChange={(e) => {
                  const selected = gradeLevels.find((item) => item.id === e.target.value);
                  const selectedClass = classOptions.find((item) => String(item.id) === String(formData.classId));
                  const clearClass = Boolean(selectedClass && selectedClass.grade !== selected?.name);
                  setFormData((current) => ({
                    ...current,
                    grade: selected?.name || '',
                    gradeLevelReferenceId: selected?.id || '',
                    gradeOrDepartment: selected?.name || '',
                    ...(clearClass ? { classId: '' } : {}),
                  }));
                }}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="">Pilih jenjang aktif</option>
                {gradeLevels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {!gradeLevels.length && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Atur jenjang pada Pengaturan kategori modul Akademik.</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Kontak / Nomor Telepon</label>
              <input
                type="text"
                value={formData.contact}
                onChange={(e) => handleFieldChange('contact', e.target.value)}
                className={`w-full bg-slate-50 dark:bg-black/20 border ${fieldErrors.contact ? 'border-rose-500 ring-1 ring-rose-500/20' : 'border-slate-200 dark:border-white/10'} rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50`}
                placeholder="Contoh: 08123456789"
              />
              {fieldErrors.contact && (
                <p className="text-xs text-rose-400 mt-1">{fieldErrors.contact}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Status</label>
              <select
                value={formData.status}
                onChange={(e) => handleFieldChange('status', e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="Active">Aktif</option>
                <option value="Inactive">Tidak aktif</option>
                <option value="Suspended">Ditangguhkan</option>
                <option value="Graduated">Lulus</option>
                <option value="Alumni">Alumni</option>
              </select>
            </div>
          </div>

          {(formData.type === 'Santri' || formData.type === 'Wali Santri') && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Profil Santri (Standar PPDB)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">NIK (16 Digit)</label>
                    {formData.nik && NIK_REGEX.test(formData.nik.trim()) && !conflicts.some(c => c.field === 'nik') && (
                      <span className="text-[10px] text-emerald-400 flex items-center gap-0.5 font-medium">
                        <ShieldCheck className="w-3 h-3" /> Valid
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    maxLength={16}
                    value={formData.nik}
                    onChange={(e) => handleFieldChange('nik', e.target.value.replace(/\D/g, ''))}
                    placeholder="16 digit NIK sesuai KTP/KK"
                    className={`w-full bg-slate-50 dark:bg-black/20 border ${
                      fieldErrors.nik
                        ? 'border-rose-500 ring-1 ring-rose-500/20'
                        : conflicts.some(c => c.field === 'nik')
                          ? 'border-amber-500 ring-1 ring-amber-500/20'
                          : 'border-slate-200 dark:border-white/10'
                    } rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/50`}
                  />
                  {fieldErrors.nik && (
                    <p className="text-xs text-rose-400 mt-1">{fieldErrors.nik}</p>
                  )}
                  {conflicts.filter(c => c.field === 'nik').map((c, i) => (
                    <p key={i} className="text-xs text-amber-400 mt-1 flex items-center gap-1 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {c.message}
                    </p>
                  ))}
                </div>
                {formData.type === 'Santri' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">NISN (10 Digit)</label>
                      {formData.nisn && NISN_REGEX.test(formData.nisn.trim()) && !conflicts.some(c => c.field === 'nisn') && (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-0.5 font-medium">
                          <ShieldCheck className="w-3 h-3" /> Valid
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      maxLength={10}
                      value={formData.nisn}
                      onChange={(e) => handleFieldChange('nisn', e.target.value.replace(/\D/g, ''))}
                      placeholder="10 digit NISN Kemendikbud"
                      className={`w-full bg-slate-50 dark:bg-black/20 border ${
                        fieldErrors.nisn
                          ? 'border-rose-500 ring-1 ring-rose-500/20'
                          : conflicts.some(c => c.field === 'nisn')
                            ? 'border-amber-500 ring-1 ring-amber-500/20'
                            : 'border-slate-200 dark:border-white/10'
                      } rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/50`}
                    />
                    {fieldErrors.nisn && (
                      <p className="text-xs text-rose-400 mt-1">{fieldErrors.nisn}</p>
                    )}
                    {conflicts.filter(c => c.field === 'nisn').map((c, i) => (
                      <p key={i} className="text-xs text-amber-400 mt-1 flex items-center gap-1 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        {c.message}
                      </p>
                    ))}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Jenis Kelamin</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => handleFieldChange('gender', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    <option value="L">Laki-laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tempat Lahir</label>
                  <input
                    type="text"
                    value={formData.pob}
                    onChange={(e) => handleFieldChange('pob', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tanggal Lahir</label>
                  <input
                    type="date"
                    value={formData.dob}
                    onChange={(e) => handleFieldChange('dob', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                {formData.type === 'Santri' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Sekolah Sebelumnya</label>
                    <input
                      type="text"
                      value={formData.previousSchool}
                      onChange={(e) => handleFieldChange('previousSchool', e.target.value)}
                      className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                )}
                <div className="md:col-span-2 lg:col-span-3">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4 border-b border-slate-200 dark:border-white/10 pb-2">Informasi Alamat & Wilayah</h3>
                  <RegionSelector
                    province={formData.province}
                    regency={formData.regency}
                    district={formData.district}
                    village={formData.village}
                    addressDetail={formData.address}
                    onChange={(field, value) => {
                      if (field === 'addressDetail') handleFieldChange('address', value);
                      else handleFieldChange(field as any, value);
                    }}
                  />
                </div>
                {formData.type === 'Santri' && (
                  <>
                    {/* Penempatan santri dari struktur tenant Supabase */}
                    <div className="md:col-span-2 lg:col-span-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-4 space-y-4">
                      <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-emerald-400" />
                          <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                            Penempatan Santri
                          </h4>
                        </div>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded">
                          Data Struktur Pesantren
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                            Kelas / Jenjang
                          </label>
                          <select
                            value={formData.classId || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              const selectedClass = classOptions.find((item) => String(item.id) === val);
                              const gradeName = selectedClass ? String(selectedClass.grade || selectedClass.name || "") : "";
                              setFormData(prev => ({
                                ...prev,
                                classId: val,
                                grade: gradeName,
                                gradeLevelReferenceId: selectedClass?.gradeLevelReferenceId || '',
                                gradeOrDepartment: gradeName,
                              }));
                            }}
                            className="w-full bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                          >
                            <option value="">{classOptions.length ? "-- Pilih kelas --" : "Belum ada kelas tersedia"}</option>
                            {classOptionsForGrade.map((item) => (
                              <option key={item.id} value={item.id}>{item.name} ({item.id})</option>
                            ))}
                          </select>
                          {!classOptionsForGrade.length && <p className="mt-1 text-xs text-amber-300">Tambahkan kelas aktif pada jenjang terpilih di tab Struktur terlebih dahulu.</p>}
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                            Gedung / Asrama
                          </label>
                          <select
                            value={formData.dormitoryId || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              const selectedBuilding = buildingOptions.find((item) => String(item.id) === val);
                              const selectedRoom = roomOptions.find((item) => String(item.id) === formData.roomId);
                              const shouldClearRoom = Boolean(selectedRoom?.parentId && String(selectedRoom.parentId) !== val);
                              setFormData(prev => ({
                                ...prev,
                                dormitoryId: val,
                                dormitory: selectedBuilding?.name || "",
                                ...(shouldClearRoom ? { roomId: "", room: "" } : {}),
                              }));
                            }}
                            className="w-full bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                          >
                            <option value="">{buildingOptions.length ? "-- Pilih gedung/asrama --" : "Belum ada gedung tersedia"}</option>
                            {buildingOptions.map((item) => (
                              <option key={item.id} value={item.id}>{item.name} ({item.id})</option>
                            ))}
                          </select>
                          {!buildingOptions.length && <p className="mt-1 text-xs text-amber-300">Tambahkan gedung pada tab Struktur terlebih dahulu.</p>}
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                            Kamar
                          </label>
                          <select
                            value={formData.roomId || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              const selectedRoom = roomOptions.find((item) => String(item.id) === val);
                              const parentBuilding = selectedRoom?.parentId
                                ? buildingOptions.find((item) => String(item.id) === String(selectedRoom.parentId))
                                : undefined;
                              setFormData(prev => ({
                                ...prev,
                                roomId: val,
                                room: selectedRoom?.name || "",
                                ...(parentBuilding ? { dormitoryId: parentBuilding.id, dormitory: parentBuilding.name } : {}),
                              }));
                            }}
                            className="w-full bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                          >
                            <option value="">{roomOptionsForBuilding.length ? "-- Pilih kamar --" : "Belum ada kamar tersedia"}</option>
                            {roomOptionsForBuilding.map((item) => (
                              <option key={item.id} value={item.id}>{item.name} ({item.id})</option>
                            ))}
                          </select>
                          {!roomOptionsForBuilding.length && <p className="mt-1 text-xs text-amber-300">Tambahkan kamar pada tab Struktur, lalu hubungkan ke gedung/asrama.</p>}
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                            Halaqah Tahfidz
                          </label>
                          <div className="min-h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-white/10 dark:bg-black/30 dark:text-slate-300">
                            {formData.halaqah || formData.halaqahId
                              ? `Penempatan saat ini: ${formData.halaqah || formData.halaqahId}`
                              : "Belum ditetapkan"}
                          </div>
                          <p className="mt-1 text-xs text-slate-400">Penempatan halaqah dikelola melalui modul Tahfidz agar relasinya menggunakan data halaqah yang aktif.</p>
                        </div>
                      </div>
                    </div>

                    {/* Relasi Wali Santri Normalisasi */}
                    <div className="md:col-span-2 lg:col-span-3 bg-slate-900/40 border border-slate-200 dark:border-white/10 rounded-xl p-4 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-white/10 pb-2">
                        <div className="flex items-center gap-2">
                          <Link2 className="w-4 h-4 text-blue-400" />
                          <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                            Relasi Wali Santri
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => setUseCustomParent(!useCustomParent)}
                          className="text-xs text-slate-400 hover:text-white underline text-left"
                        >
                          {useCustomParent ? "← Pilih dari Master Wali Santri" : "+ Input Manual Wali Baru"}
                        </button>
                      </div>

                      {!useCustomParent ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                              Pilih Wali Santri Terdaftar *
                            </label>
                            <select
                              value={formData.waliSantriId}
                              onChange={(e) => {
                                const val = e.target.value;
                                const selected = availableWali.find((w) => w.id === val);
                                if (selected) {
                                  setFormData(prev => ({
                                    ...prev,
                                    waliSantriId: selected.id,
                                    parentName: selected.name,
                                    fatherName: selected.name,
                                    parentPhone: selected.phone || selected.contact || prev.parentPhone,
                                  }));
                                } else {
                                  setFormData(prev => ({
                                    ...prev,
                                    waliSantriId: '',
                                  }));
                                }
                              }}
                              className="w-full bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            >
                              <option value="">-- Pilih Wali Santri (ID - Nama) --</option>
                              {availableWali.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name} ({w.id}) - {w.phone || w.email || 'Tanpa Kontak'}
                                </option>
                              ))}
                            </select>
                          </div>

                          {formData.waliSantriId && (
                            <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
                              <UserCheck className="w-4 h-4 text-blue-400 shrink-0" />
                              <div className="flex-1">
                                <span className="font-semibold">{formData.parentName}</span> terhubung dengan ID{' '}
                                <span className="font-mono font-bold text-white bg-blue-900/60 px-1.5 py-0.5 rounded">
                                  {formData.waliSantriId}
                                </span>
                                {formData.parentPhone && <span className="ml-2 opacity-80">• Kontak: {formData.parentPhone}</span>}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nama Ayah / Wali</label>
                            <input
                              type="text"
                              value={formData.parentName || formData.fatherName}
                              onChange={(e) => {
                                handleFieldChange('parentName', e.target.value);
                                handleFieldChange('fatherName', e.target.value);
                              }}
                              placeholder="Contoh: Bapak Rudi"
                              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nama Ibu</label>
                            <input
                              type="text"
                              value={formData.motherName}
                              onChange={(e) => handleFieldChange('motherName', e.target.value)}
                              placeholder="Contoh: Ibu Aminah"
                              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">No. Telp Wali</label>
                            <input
                              type="text"
                              value={formData.parentPhone}
                              onChange={(e) => handleFieldChange('parentPhone', e.target.value)}
                              placeholder="Contoh: +62 812-xxxx-xxxx"
                              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {formData.type === 'Wali Santri' && (
                  <>
                    {/* Normalized Santri Relationship Multi-select */}
                    <div className="md:col-span-2 lg:col-span-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-4 space-y-4">
                      <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-emerald-400" />
                          <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                            Relasi Anak / Santri (Normalized santriIds Foreign Keys)
                          </h4>
                        </div>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded">
                          {formData.santriIds.length} Anak Terkait
                        </span>
                      </div>

                      <div className="space-y-3">
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Tambah / Hubungkan Santri
                        </label>
                        <select
                          value=""
                          onChange={(e) => {
                            const santriId = e.target.value;
                            if (!santriId) return;
                            if (!formData.santriIds.includes(santriId)) {
                              const newIds = [...formData.santriIds, santriId];
                              const matchedStudents = availableSantri.filter(s => newIds.includes(s.id));
                              const studentNames = matchedStudents.map(s => s.name).join(", ");
                              const studentGrades = matchedStudents.map(s => s.grade).filter(Boolean).join(", ");
                              setFormData(prev => ({
                                ...prev,
                                santriIds: newIds,
                                studentName: studentNames,
                                studentGrade: studentGrades,
                              }));
                            }
                          }}
                          className="w-full bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        >
                          <option value="">-- Pilih Santri untuk Dihubungkan --</option>
                          {availableSantri.map((s) => (
                            <option key={s.id} value={s.id} disabled={formData.santriIds.includes(s.id)}>
                              {s.name} ({s.id}) - Kelas: {s.grade || '-'} {formData.santriIds.includes(s.id) ? '(Sudah Terhubung)' : ''}
                            </option>
                          ))}
                        </select>

                        {formData.santriIds.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                            {formData.santriIds.map((sId: string) => {
                              const student = availableSantri.find(s => s.id === sId) || { id: sId, name: sId, grade: '-' };
                              return (
                                <div
                                  key={sId}
                                  className="flex items-center justify-between p-2.5 bg-black/40 border border-emerald-500/30 rounded-lg text-xs"
                                >
                                  <div>
                                    <div className="font-semibold text-slate-800 dark:text-slate-200">{student.name}</div>
                                    <div className="font-mono text-emerald-400 text-[10px]">
                                      ID: {student.id} {student.grade ? `• Kelas: ${student.grade}` : ''}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newIds = formData.santriIds.filter((id: string) => id !== sId);
                                      const matchedStudents = availableSantri.filter(s => newIds.includes(s.id));
                                      setFormData(prev => ({
                                        ...prev,
                                        santriIds: newIds,
                                        studentName: matchedStudents.map(s => s.name).join(", "),
                                        studentGrade: matchedStudents.map(s => s.grade).filter(Boolean).join(", "),
                                      }));
                                    }}
                                    className="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded transition-colors"
                                    title="Hapus Relasi"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 italic p-3 bg-black/20 rounded-lg border border-dashed border-slate-700 text-center">
                            Belum ada santri yang dihubungkan ke wali ini. Pilih santri dari dropdown di atas.
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Pekerjaan / Profesi</label>
                      <input
                        type="text"
                        value={formData.fatherJob || ''}
                        onChange={(e) => handleFieldChange('fatherJob', e.target.value)}
                        placeholder="Contoh: wiraswasta atau PNS"
                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Penghasilan / Bulan</label>
                      <select
                        value={formData.familyIncome || ''}
                        onChange={(e) => handleFieldChange('familyIncome', e.target.value)}
                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="">-- Pilih Penghasilan --</option>
                        <option value="< Rp 3.000.000">&lt; Rp 3.000.000</option>
                        <option value="Rp 3.000.000 - Rp 5.000.000">Rp 3.000.000 - Rp 5.000.000</option>
                        <option value="Rp 5.000.000 - Rp 10.000.000">Rp 5.000.000 - Rp 10.000.000</option>
                        <option value="> Rp 10.000.000">&gt; Rp 10.000.000</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {(formData.type === 'Guru' || formData.type === 'Asatidz' || formData.type === 'Pegawai') && (
             <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 space-y-6">

                {/* Employment Profile */}
                <div>
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Profil Kepegawaian</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(formData.type === 'Guru' || formData.type === 'Asatidz') && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">NUPTK (16 Digit)</label>
                          {formData.nuptk && NUPTK_REGEX.test(formData.nuptk.trim()) && !conflicts.some(c => c.field === 'nuptk') && (
                            <span className="text-[10px] text-emerald-400 flex items-center gap-0.5 font-medium">
                              <ShieldCheck className="w-3 h-3" /> Valid
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          maxLength={16}
                          value={formData.nuptk}
                          onChange={(e) => handleFieldChange('nuptk', e.target.value.replace(/\D/g, ''))}
                          placeholder="16 digit NUPTK Pendidik"
                          className={`w-full bg-slate-50 dark:bg-black/20 border ${
                            fieldErrors.nuptk
                              ? 'border-rose-500 ring-1 ring-rose-500/20'
                              : conflicts.some(c => c.field === 'nuptk')
                                ? 'border-amber-500 ring-1 ring-amber-500/20'
                                : 'border-slate-200 dark:border-white/10'
                          } rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/50`}
                        />
                        {fieldErrors.nuptk && (
                          <p className="text-xs text-rose-400 mt-1">{fieldErrors.nuptk}</p>
                        )}
                        {conflicts.filter(c => c.field === 'nuptk').map((c, i) => (
                          <p key={i} className="text-xs text-amber-400 mt-1 flex items-center gap-1 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            {c.message}
                          </p>
                        ))}
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tanggal Bergabung</label>
                      <input
                        type="date"
                        value={formData.joinDate || ''}
                        onChange={(e) => handleFieldChange('joinDate', e.target.value)}
                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Jenis Kepegawaian</label>
                      <select
                        value={formData.employmentType || 'Full-time'}
                        onChange={(e) => handleFieldChange('employmentType', e.target.value)}
                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="Full-time">Penuh waktu</option>
                        <option value="Part-time">Paruh waktu</option>
                        <option value="Contract">Kontrak</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">NPWP</label>
                      <input
                        type="text"
                        value={formData.npwp || ''}
                        onChange={(e) => handleFieldChange('npwp', e.target.value)}
                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nomor Rekening</label>
                      <input
                        type="text"
                        value={formData.bankAccount || ''}
                        onChange={(e) => handleFieldChange('bankAccount', e.target.value)}
                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nama Bank</label>
                      <input
                        type="text"
                        value={formData.bankName || ''}
                        onChange={(e) => handleFieldChange('bankName', e.target.value)}
                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      />
                    </div>
                  </div>
                </div>

                {/* Education History */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Riwayat Pendidikan</h4>
                    <button type="button" onClick={() => addArrayItem('educations', { level: '', institution: '', major: '', graduationYear: '' })} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">+ Tambah</button>
                  </div>
                  <div className="space-y-3">
                    {(formData.educations || []).map((edu: any, i: number) => (
                      <div key={i} className="flex gap-2 items-start bg-slate-50 dark:bg-black/20 p-3 rounded-lg border border-slate-200 dark:border-white/10">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 flex-1">
                          <input type="text" placeholder="Jenjang (contoh: S1)" value={edu.level} onChange={(e) => handleArrayChange('educations', i, 'level', e.target.value)} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                          <input type="text" placeholder="Nama lembaga" value={edu.institution} onChange={(e) => handleArrayChange('educations', i, 'institution', e.target.value)} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                          <input type="text" placeholder="Jurusan" value={edu.major} onChange={(e) => handleArrayChange('educations', i, 'major', e.target.value)} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                          <input type="text" placeholder="Tahun lulus" value={edu.graduationYear} onChange={(e) => handleArrayChange('educations', i, 'graduationYear', e.target.value)} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                        </div>
                        <button type="button" onClick={() => removeArrayItem('educations', i)} className="text-red-500 p-1 hover:bg-red-50 dark:hover:bg-red-500/10 rounded"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Certifications */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Sertifikasi</h4>
                    <button type="button" onClick={() => addArrayItem('certifications', { name: '', institution: '', year: '' })} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">+ Tambah</button>
                  </div>
                  <div className="space-y-3">
                    {(formData.certifications || []).map((cert: any, i: number) => (
                      <div key={i} className="flex gap-2 items-start bg-slate-50 dark:bg-black/20 p-3 rounded-lg border border-slate-200 dark:border-white/10">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 flex-1">
                          <input type="text" placeholder="Nama Sertifikasi" value={cert.name} onChange={(e) => handleArrayChange('certifications', i, 'name', e.target.value)} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                          <input type="text" placeholder="Penerbit / lembaga" value={cert.institution} onChange={(e) => handleArrayChange('certifications', i, 'institution', e.target.value)} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                          <input type="text" placeholder="Tahun" value={cert.year} onChange={(e) => handleArrayChange('certifications', i, 'year', e.target.value)} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                        </div>
                        <button type="button" onClick={() => removeArrayItem('certifications', i)} className="text-red-500 p-1 hover:bg-red-50 dark:hover:bg-red-500/10 rounded"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Work Experiences */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Riwayat Pengalaman Kerja</h4>
                    <button type="button" onClick={() => addArrayItem('experiences', { company: '', role: '', startDate: '', endDate: '' })} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">+ Tambah</button>
                  </div>
                  <div className="space-y-3">
                    {(formData.experiences || []).map((exp: any, i: number) => (
                      <div key={i} className="flex gap-2 items-start bg-slate-50 dark:bg-black/20 p-3 rounded-lg border border-slate-200 dark:border-white/10">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 flex-1">
                          <input type="text" placeholder="Lembaga/perusahaan" value={exp.company} onChange={(e) => handleArrayChange('experiences', i, 'company', e.target.value)} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                          <input type="text" placeholder="Jabatan/Posisi" value={exp.role} onChange={(e) => handleArrayChange('experiences', i, 'role', e.target.value)} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                          <input type="text" placeholder="Tanggal/Tahun Mulai" value={exp.startDate} onChange={(e) => handleArrayChange('experiences', i, 'startDate', e.target.value)} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                          <input type="text" placeholder="Tanggal/tahun berakhir" value={exp.endDate} onChange={(e) => handleArrayChange('experiences', i, 'endDate', e.target.value)} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                        </div>
                        <button type="button" onClick={() => removeArrayItem('experiences', i)} className="text-red-500 p-1 hover:bg-red-50 dark:hover:bg-red-500/10 rounded"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Assignments (Penempatan Tugas) */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Penempatan Tugas / Peran</h4>
                    <button type="button" onClick={() => addArrayItem('assignments', { role: '', unitId: '', description: '' })} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">+ Tambah</button>
                  </div>
                  <div className="space-y-3">
                    {(formData.assignments || []).map((assignment: any, i: number) => (
                      <div key={i} className="flex gap-2 items-start bg-slate-50 dark:bg-black/20 p-3 rounded-lg border border-slate-200 dark:border-white/10">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 flex-1">
                          <div>
                            <select value={assignment.role} onChange={(e) => handleArrayChange('assignments', i, 'role', e.target.value)} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                              <option value="">Pilih Peran</option>
                              <option value="Guru / Pengajar">Guru / Pengajar</option>
                              <option value="Wali Kelas">Wali Kelas</option>
                              <option value="Musyrif / Musyrifah">Musyrif / Musyrifah (Kamar)</option>
                              <option value="Pengampu Halaqah">Pengampu Halaqah</option>
                              <option value="Kepala Departemen">Kepala Departemen</option>
                              <option value="Staf">Staf</option>
                            </select>
                          </div>
                          <input type="text" placeholder="Unit/Kamar/Kelas (contoh: Kamar A1)" value={assignment.unitId} onChange={(e) => handleArrayChange('assignments', i, 'unitId', e.target.value)} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                          <input type="text" placeholder="Catatan/Keterangan" value={assignment.description} onChange={(e) => handleArrayChange('assignments', i, 'description', e.target.value)} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                        </div>
                        <button type="button" onClick={() => removeArrayItem('assignments', i)} className="text-red-500 p-1 hover:bg-red-50 dark:hover:bg-red-500/10 rounded"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>

             </div>
          )}

          {formData.type === 'Alumni' && (
             <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Profil Alumni</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tahun Kelulusan</label>
                    <input
                      type="number"
                      value={formData.graduationYear || ''}
                      onChange={(e) => handleFieldChange('graduationYear', e.target.value)}
                      className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      placeholder="Contoh: 2024"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Kegiatan Saat Ini</label>
                    <input
                      type="text"
                      value={formData.currentActivity || ''}
                      onChange={(e) => handleFieldChange('currentActivity', e.target.value)}
                      className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      placeholder="Contoh: Kuliah di UI atau bekerja"
                    />
                  </div>
                </div>
             </div>
          )}

          {formData.type === 'Santri' && (
             <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Berkas Santri</h4>
                <p className="rounded-lg border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                  Unggah berkas belum tersedia di formulir ini. Setelah data santri disimpan, daftarkan berkas melalui Dokumen Digital dan cantumkan nama atau NIS santri agar mudah ditelusuri.
                </p>
             </div>
          )}

          <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mr-3"
              >
                Batal
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Simpan Data Santri
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

