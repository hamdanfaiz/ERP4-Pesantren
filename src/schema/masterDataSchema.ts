import { z } from 'zod';

// Regex validation standards for Indonesia & School System
export const NIK_REGEX = /^\d{16}$/;
export const NISN_REGEX = /^\d{10}$/;
export const NUPTK_REGEX = /^\d{16}$/;
export const INDONESIA_PHONE_REGEX = /^(\+62|62|08|0)[0-9\s\-]{8,15}$/;
export const YEAR_REGEX = /^(19|20)\d{2}$/;

// Reusable phone validator
const phoneValidator = z.string()
  .optional()
  .refine(
    (val) => !val || val.trim() === '' || INDONESIA_PHONE_REGEX.test(val.replace(/\s+/g, '')),
    { message: "Nomor telepon harus valid (contoh: 08123456789 atau +62812...)" }
  );

// Reusable NIK validator (optional, but if filled must be 16 numeric digits)
const nikValidator = z.string()
  .optional()
  .refine(
    (val) => !val || val.trim() === '' || NIK_REGEX.test(val.trim()),
    { message: "NIK harus terdiri dari tepat 16 digit angka" }
  );

// Reusable NISN validator (optional, but if filled must be 10 numeric digits)
const nisnValidator = z.string()
  .optional()
  .refine(
    (val) => !val || val.trim() === '' || NISN_REGEX.test(val.trim()),
    { message: "NISN harus terdiri dari tepat 10 digit angka" }
  );

// Reusable NUPTK validator (optional, but if filled must be 16 numeric digits)
const nuptkValidator = z.string()
  .optional()
  .refine(
    (val) => !val || val.trim() === '' || NUPTK_REGEX.test(val.trim()),
    { message: "NUPTK harus terdiri dari tepat 16 digit angka" }
  );

// Base Entity Schema containing common core properties
export const BaseEntitySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nama minimal harus 2 karakter"),
  type: z.enum(["Santri", "Wali Santri", "Guru", "Asatidz", "Pegawai", "Alumni"]).optional(),
  status: z.string().optional().default("Active"),
  phone: phoneValidator,
  contact: phoneValidator,
  whatsappPhone: phoneValidator,
  email: z.string().email("Format email tidak valid").optional().or(z.literal("")),
  address: z.string().optional(),
  province: z.string().optional(),
  regency: z.string().optional(),
  district: z.string().optional(),
  village: z.string().optional(),
  pob: z.string().optional(),
  dob: z.string().optional(),
  gender: z.enum(["L", "P"]).optional(),
  nik: nikValidator,
}).passthrough();

// 1. Santri Schema (Recommendation 3 Strict Validation)
export const SantriSchema = BaseEntitySchema.extend({
  type: z.literal("Santri").optional().default("Santri"),
  nisn: nisnValidator,
  nis: z.string().optional(),
  grade: z.string().optional(),
  classId: z.string().optional(),
  previousSchool: z.string().optional(),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  fatherJob: z.string().optional(),
  motherJob: z.string().optional(),
  parentPhone: phoneValidator,
  familyIncome: z.string().optional(),
  
  // Relational IDs
  waliSantriId: z.string().optional(),
  parentName: z.string().optional(),
  dormitoryId: z.string().optional(),
  dormitory: z.string().optional(),
  roomId: z.string().optional(),
  room: z.string().optional(),
  halaqahId: z.string().optional(),
  halaqah: z.string().optional(),
  bloodType: z.string().optional(),
  medical: z.string().optional(),
}).passthrough();

// 2. Wali Santri Schema
export const WaliSantriSchema = BaseEntitySchema.extend({
  type: z.literal("Wali Santri").optional().default("Wali Santri"),
  relation: z.string().optional(),
  santriIds: z.array(z.string()).optional(),
  studentName: z.string().optional(),
  studentGrade: z.string().optional(),
  occupation: z.string().optional(),
  income: z.string().optional(),
  education: z.string().optional(),
}).passthrough();

// 3. Guru Schema
export const GuruSchema = BaseEntitySchema.extend({
  type: z.literal("Guru").optional().default("Guru"),
  nuptk: nuptkValidator,
  gradeOrDepartment: z.string().optional(),
  subjects: z.union([z.string(), z.array(z.string())]).optional(),
  employmentType: z.string().optional(),
  educations: z.array(z.any()).optional(),
  certifications: z.array(z.any()).optional(),
  experiences: z.array(z.any()).optional(),
  assignments: z.array(z.any()).optional(),
}).passthrough();

// 4. Asatidz Schema
export const AsatidzSchema = BaseEntitySchema.extend({
  type: z.literal("Asatidz").optional().default("Asatidz"),
  specialization: z.string().optional(),
  halaqahId: z.string().optional(),
  nuptk: nuptkValidator,
  subjects: z.union([z.string(), z.array(z.string())]).optional(),
}).passthrough();

// 5. Pegawai Schema
export const PegawaiSchema = BaseEntitySchema.extend({
  type: z.literal("Pegawai").optional().default("Pegawai"),
  gradeOrDepartment: z.string().min(1, "Departemen / Divisi wajib diisi").optional().or(z.literal("")),
  department: z.string().optional(),
  employmentType: z.string().optional(),
  npwp: z.string().optional().refine(
    (val) => !val || val.trim() === '' || /^\d{15,16}$/.test(val.replace(/[\.\-]/g, '')),
    { message: "Format NPWP harus 15 atau 16 digit angka" }
  ),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
}).passthrough();

// 6. Alumni Schema
export const AlumniSchema = BaseEntitySchema.extend({
  type: z.literal("Alumni").optional().default("Alumni"),
  graduationYear: z.string().optional().refine(
    (val) => !val || val.trim() === '' || YEAR_REGEX.test(val.trim()),
    { message: "Tahun kelulusan harus 4 digit angka (contoh: 2024)" }
  ),
  currentActivity: z.string().optional(),
  institution: z.string().optional(),
}).passthrough();

// Backward compatibility monolithic EntitySchema
export const EntitySchema = BaseEntitySchema.extend({
  identifier: z.string().optional(),
  gradeOrDepartment: z.string().optional(),
  registrationId: z.string().optional(),
  previousSchool: z.string().optional(),
  grade: z.string().optional(),
  nisn: nisnValidator,
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  fatherJob: z.string().optional(),
  motherJob: z.string().optional(),
  parentPhone: phoneValidator,
  fatherEducation: z.string().optional(),
  motherEducation: z.string().optional(),
  familyIncome: z.string().optional(),
  waliSantriId: z.string().optional(),
  santriIds: z.array(z.string()).optional(),
  dormitoryId: z.string().optional(),
  dormitory: z.string().optional(),
  roomId: z.string().optional(),
  room: z.string().optional(),
  classId: z.string().optional(),
  halaqahId: z.string().optional(),
  halaqah: z.string().optional(),
  unitId: z.string().optional(),
  parentName: z.string().optional(),
  studentName: z.string().optional(),
  studentGrade: z.string().optional(),
  nuptk: nuptkValidator,
  graduationYear: z.string().optional(),
  currentActivity: z.string().optional(),
}).passthrough();

// Master Data Record / Structure Schema
export const MasterDataRecordSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nama fasilitas / data wajib diisi"),
  category: z.string().optional(),
  description: z.string().optional(),
  capacity: z.union([z.string(), z.number()]).optional(),
  type: z.string().optional(),
  location: z.string().optional(),
  grade: z.string().optional(),
  status: z.string().optional().default("Active"),
  parentId: z.string().optional(),
  parentCode: z.string().optional(),
  assignedEntities: z.array(z.string()).optional(),
}).passthrough();

export const StructureSchema = MasterDataRecordSchema;

export const UnitSchema = z.object({
  name: z.string().min(1, "Nama unit wajib diisi"),
  code: z.string().min(1, "Kode unit wajib diisi"),
  status: z.string().optional().default("Active"),
  description: z.string().optional(),
  parentUnitId: z.string().optional(),
}).passthrough();

/**
 * Validates record according to its entity type / subTab
 */
export const validateMasterData = (data: any, activeTab: string, activeSubTab: string) => {
  if (activeTab === "entities") {
    switch (activeSubTab) {
      case "Santri":
        return SantriSchema.safeParse(data);
      case "Wali Santri":
        return WaliSantriSchema.safeParse(data);
      case "Guru":
        return GuruSchema.safeParse(data);
      case "Asatidz":
        return AsatidzSchema.safeParse(data);
      case "Pegawai":
        return PegawaiSchema.safeParse(data);
      case "Alumni":
        return AlumniSchema.safeParse(data);
      default:
        return EntitySchema.safeParse(data);
    }
  }
  return MasterDataRecordSchema.safeParse(data);
};

// Conflict Detection Interface
export interface IdentityConflict {
  field: 'nik' | 'nisn' | 'nuptk' | 'id' | 'email';
  value: string;
  conflictingRecord: any;
  message: string;
}

/**
 * Detects duplicate critical identity attributes (NIK, NISN, NUPTK, ID, Email)
 * across an array of existing records, ignoring the record currently being edited.
 */
export const checkIdentityConflicts = (
  candidate: Record<string, any>,
  existingRecords: any[] = [],
  currentId?: string
): IdentityConflict[] => {
  const conflicts: IdentityConflict[] = [];
  if (!candidate || !Array.isArray(existingRecords)) return conflicts;

  const cleanCurrentId = (currentId || candidate.id || "").toString().trim().toLowerCase();

  for (const record of existingRecords) {
    if (!record) continue;
    const recordId = (record.id || "").toString().trim().toLowerCase();
    
    // Ignore self when editing
    if (cleanCurrentId && recordId === cleanCurrentId) {
      continue;
    }

    // 1. Check ID Conflict (when adding new record)
    if (!currentId && candidate.id) {
      const candId = candidate.id.toString().trim().toLowerCase();
      if (candId && recordId === candId) {
        conflicts.push({
          field: 'id',
          value: candidate.id,
          conflictingRecord: record,
          message: `ID "${candidate.id}" sudah digunakan oleh "${record.name || 'Data Lain'}"`,
        });
      }
    }

    // 2. Check NIK Conflict (16 digits)
    if (candidate.nik && typeof candidate.nik === 'string' && candidate.nik.trim()) {
      const cleanCandNik = candidate.nik.trim();
      const recordNik = (record.nik || "").toString().trim();
      if (recordNik && recordNik === cleanCandNik) {
        conflicts.push({
          field: 'nik',
          value: cleanCandNik,
          conflictingRecord: record,
          message: `NIK "${cleanCandNik}" sudah terdaftar atas nama "${record.name || 'Data Lain'}" (${record.id || '-'})`,
        });
      }
    }

    // 3. Check NISN Conflict (10 digits for Santri)
    if (candidate.nisn && typeof candidate.nisn === 'string' && candidate.nisn.trim()) {
      const cleanCandNisn = candidate.nisn.trim();
      const recordNisn = (record.nisn || "").toString().trim();
      if (recordNisn && recordNisn === cleanCandNisn) {
        conflicts.push({
          field: 'nisn',
          value: cleanCandNisn,
          conflictingRecord: record,
          message: `NISN "${cleanCandNisn}" sudah terdaftar pada santri "${record.name || 'Santri Lain'}" (${record.id || '-'})`,
        });
      }
    }

    // 4. Check NUPTK Conflict (for Guru / Asatidz)
    if (candidate.nuptk && typeof candidate.nuptk === 'string' && candidate.nuptk.trim()) {
      const cleanCandNuptk = candidate.nuptk.trim();
      const recordNuptk = (record.nuptk || "").toString().trim();
      if (recordNuptk && recordNuptk === cleanCandNuptk) {
        conflicts.push({
          field: 'nuptk',
          value: cleanCandNuptk,
          conflictingRecord: record,
          message: `NUPTK "${cleanCandNuptk}" sudah terdaftar atas nama pendidik "${record.name || 'Guru Lain'}" (${record.id || '-'})`,
        });
      }
    }

    // 5. Check Email Conflict
    if (candidate.email && typeof candidate.email === 'string' && candidate.email.trim()) {
      const cleanCandEmail = candidate.email.trim().toLowerCase();
      const recordEmail = (record.email || "").toString().trim().toLowerCase();
      if (recordEmail && recordEmail === cleanCandEmail) {
        conflicts.push({
          field: 'email',
          value: cleanCandEmail,
          conflictingRecord: record,
          message: `Email "${cleanCandEmail}" sudah digunakan oleh "${record.name || 'Pengguna Lain'}"`,
        });
      }
    }
  }

  return conflicts;
};
