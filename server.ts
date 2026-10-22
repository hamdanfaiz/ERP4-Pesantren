import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import type { App } from "firebase-admin/app";
import type { Firestore } from "firebase-admin/firestore";
import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  IdentityConflictError,
  IdentityUnavailableError,
  clearPasswordChangeRequired,
  createAuthUserWithProfile,
  createRecoveryLink,
  getUserProfile,
  listTenantProfiles,
  setAuthDisabled,
  updateUserProfile,
  verifyAccessToken,
} from "./src/server/identityStore";
import {
  acknowledgeCommunicationAnnouncement,
  applyLegacyCommunicationAnnouncements,
  CommunicationStoreError,
  createCommunicationAnnouncement,
  listCommunicationAnnouncements,
  previewLegacyCommunicationAnnouncements,
} from "./src/server/communicationAnnouncements";
import {
  getTenantSystemSettings,
  importLegacyTenantSystemSettings,
  sanitizeTenantSettings,
  saveTenantSystemSettings,
  SystemSettingsStoreError,
} from "./src/server/systemSettingsStore";
import { recordTenantSearchFeedback, SearchFeedbackStoreError } from "./src/server/searchFeedbackStore";
import {
  assignSupabaseTahfidzMembership,
  getSupabaseTahfidzLegacyTenantKey,
  listSupabaseTahfidzSessions,
  listSupabaseTahfidzSnapshot,
  migrateSupabaseTahfidzConfiguration,
  mutateSupabaseTahfidzSession,
  recordSupabaseTahfidzSetoran,
  recordSupabaseTahfidzTarget,
  saveSupabaseTahfidzHalaqah,
  SupabaseTahfidzError,
} from "./src/server/supabaseTahfidz";
import {
  deleteSupabaseFinanceProof,
  downloadSupabaseFinanceProof,
  FinanceProofStorageError,
  uploadSupabaseFinanceProof,
} from "./src/server/financeProofStorage";
import {
  archiveSupabaseMasterDataStudent,
  assignSupabaseStudentRoom,
  deleteSupabaseMasterDataStructure,
  getSupabaseNextSantriNis,
  listSupabaseBoardingSnapshot,
  listSupabaseMasterDataStudents,
  listSupabaseMasterDataStructures,
  onboardSupabaseAcceptedCandidate,
  SupabaseOnboardingError,
  upsertSupabaseMasterDataStudent,
  upsertSupabaseMasterDataStructure,
} from "./src/server/supabaseOnboarding";
import {
  graduateSupabaseStudent,
  listSupabaseAlumniSnapshot,
  SupabaseAlumniError,
} from "./src/server/supabaseAlumni";
import {
  checkoutSupabaseLibraryBook,
  listSupabaseLibrarySnapshot,
  returnSupabaseLibraryBook,
  SupabaseLibraryError,
  upsertSupabaseLibraryBook,
} from "./src/server/supabaseLibrary";
import {
  createSupabaseLaundryOrder,
  getSupabaseLaundrySnapshot,
  saveSupabaseLaundrySettings,
  SupabaseLaundryError,
  transitionSupabaseLaundryOrder,
} from "./src/server/supabaseLaundry";
import {
  listSupabaseBoardingPermits,
  migrateSupabaseLegacyBoardingPermits,
  requestSupabaseBoardingPermit,
  transitionSupabaseBoardingPermit,
} from "./src/server/supabaseBoardingPermits";
import {
  createSupabaseFinanceBills,
  createSupabaseFinanceExpense,
  getSupabaseFinanceBill,
  listSupabaseFinanceSnapshot,
  registerSupabaseFinanceProof,
  reviewSupabaseFinanceBill,
  reviewSupabaseFinanceExpense,
  setSupabaseFinanceLock,
  SupabaseFinanceError,
} from "./src/server/supabaseFinance";
import { getSupabaseDashboardSnapshot, SupabaseDashboardError } from "./src/server/supabaseDashboard";
import { getSupabaseAcademicSnapshot, saveSupabaseAcademicRecord, SupabaseAcademicError } from "./src/server/supabaseAcademic";
import {
  adjustSupabaseCooperativeStock,
  checkoutSupabaseCooperativeSale,
  getSupabaseCooperativeSnapshot,
  manageSupabaseCooperativeProduct,
  manageSupabaseCooperativeSupplier,
  setSupabaseCooperativeWalletPolicy,
  SupabaseCooperativeError,
  topUpSupabaseCooperativeWallet,
} from "./src/server/supabaseCooperative";
import {
  listSupabaseHrisSnapshot,
  recordSupabaseHrisAttendance,
  requestSupabaseHrisLeave,
  reviewSupabaseHrisLeave,
  SupabaseHrisError,
  upsertSupabaseHrisEmployee,
} from "./src/server/supabaseHris";
import { getSupabaseAcademicLegacyTenantKey, importSupabaseLegacyAcademic, previewSupabaseLegacyAcademic } from "./src/server/supabaseAcademicImport";
import {
  createSupabaseCbtExam,
  getSupabaseCbtStudentSnapshot,
  listSupabaseCbtAdminSnapshot,
  saveSupabaseCbtAttemptAnswers,
  startSupabaseCbtAttempt,
  submitSupabaseCbtAttempt,
  SupabaseCbtError,
  upsertSupabaseCbtQuestion,
} from "./src/server/supabaseCbt";
import { applySupabaseLegacyCbtImport, getSupabaseCbtLegacyImportContext, previewSupabaseLegacyCbt } from "./src/server/supabaseCbtImport";
import { listSupabasePpdbCandidates, SupabasePpdbError, updateSupabasePpdbCandidate } from "./src/server/supabasePpdb";
import { addSupabaseLmsLearningRecord, getSupabaseLmsLegacyImportContext, getSupabaseLmsSnapshot, gradeSupabaseLmsSubmission, manageSupabaseLmsCatalog, saveSupabaseLmsProgress, submitSupabaseLmsAssignment, SupabaseLmsError } from "./src/server/supabaseLms";
import { applySupabaseLegacyLmsImport, previewSupabaseLegacyLms } from "./src/server/supabaseLmsImport";
import {
  adjustSupabaseHealthcareStock,
  createSupabaseHealthcareMedicine,
  createSupabaseHealthcareVisit,
  getSupabaseHealthcareLegacyImportContext,
  getSupabaseHealthcareSnapshot,
  saveSupabaseHealthcareRecord,
  SupabaseHealthcareError,
} from "./src/server/supabaseHealthcare";
import { applySupabaseLegacyHealthcareImport, previewSupabaseLegacyHealthcare } from "./src/server/supabaseHealthcareImport";
import {
  adjustSupabaseGeneralAffairsStock,
  getSupabaseGeneralAffairsImportContext,
  getSupabaseGeneralAffairsSnapshot,
  manageSupabaseGeneralAffairsFacility,
  manageSupabaseGeneralAffairsInventory,
  SupabaseGeneralAffairsError,
} from "./src/server/supabaseGeneralAffairs";
import { applySupabaseLegacyGeneralAffairsImport, previewSupabaseLegacyGeneralAffairs } from "./src/server/supabaseGeneralAffairsImport";
import {
  adjustSupabaseMarketplaceStock,
  assertSupabaseMarketplaceReady,
  createSupabaseMarketplaceOrder,
  getSupabaseMarketplaceImportContext,
  getSupabaseMarketplaceSnapshot,
  manageSupabaseMarketplaceProduct,
  SupabaseMarketplaceError,
  transitionSupabaseMarketplaceOrder,
} from "./src/server/supabaseMarketplace";
import { applySupabaseLegacyMarketplace, previewSupabaseLegacyMarketplace } from "./src/server/supabaseMarketplaceImport";
import { assertSupabaseFacilityBookingsReady, getSupabaseFacilityBookings, getSupabaseFacilityBookingImportContext, manageSupabaseFacilityBooking, SupabaseFacilityBookingError } from "./src/server/supabaseFacilityBookings";
import { applySupabaseLegacyFacilityBookings as applyFacilityBookingImport, previewSupabaseLegacyFacilityBookings } from "./src/server/supabaseFacilityBookingsImport";
import {
  getSupabaseDonationSnapshot,
  manageSupabaseDonationCampaign,
  manageSupabaseDonationDonor,
  manageSupabaseWaqfAsset,
  recordSupabaseDonation,
  SupabaseDonationError,
  voidSupabaseDonation,
} from "./src/server/supabaseDonation";
import { getSupabasePublicPpdbConfig, submitSupabasePublicPpdbRegistration } from "./src/server/supabasePublicPpdb";
import {
  createSupabaseBoardingDiscipline,
  listSupabaseBoardingDiscipline,
  migrateSupabaseLegacyBoardingDiscipline,
  resolveSupabaseBoardingDiscipline,
} from "./src/server/supabaseBoardingDiscipline";
import {
  getSupabaseBoardingAttendance,
  migrateSupabaseLegacyBoardingAttendance,
  setSupabaseBoardingAttendance,
} from "./src/server/supabaseBoardingAttendance";
import {
  listSupabaseBoardingStaffAssignments,
  setSupabaseBoardingStaffAssignment,
} from "./src/server/supabaseBoardingAssignments";
import {
  createSupabaseBoardingCleanlinessAudit,
  createSupabaseBoardingFacilityTicket,
  listSupabaseBoardingFacilityOps,
  migrateSupabaseLegacyBoardingFacilityOps,
  resolveSupabaseBoardingFacilityTicket,
} from "./src/server/supabaseBoardingFacilityOps";

dotenv.config();

let firebaseConfig: any | null = null;
function getFirebaseConfig(): any {
  if (firebaseConfig) return firebaseConfig;
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    firebaseConfig = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, "utf8"))
      : {};
  } catch {
    firebaseConfig = {};
  }
  return firebaseConfig;
}

export type AdminServicesResult =
  | { ok: true; db: Firestore }
  | { ok: false; error: string };

let adminApp: App | null = null;
let adminDb: Firestore | null = null;
let adminInitError: string | null = null;
let adminInitPromise: Promise<AdminServicesResult> | null = null;
const legacyFirebaseAdminEnabled = String(process.env.LEGACY_FIREBASE_ADMIN_ENABLED || "").trim().toLowerCase() === "true";

function isCredentialError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  const code = String(err.code || "").toLowerCase();
  return (
    code === "16" ||
    code.includes("credential") ||
    code.includes("auth/configuration-not-found") ||
    code.includes("could-not-load-credentials") ||
    code.includes("unauthenticated") ||
    msg.includes("default credentials") ||
    msg.includes("could not load the default credentials") ||
    msg.includes("credentials are unavailable") ||
    msg.includes("application default credentials") ||
    msg.includes("authentication failed") ||
    msg.includes("metadata server") ||
    msg.includes("failed to get default credentials") ||
    msg.includes("unauthenticated")
  );
}

function isFirestoreStoreError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  const code = String(err.code || "").toLowerCase();
  const details = String(err.details || "").toLowerCase();
  return (
    code === "7" || // PERMISSION_DENIED
    code === "5" || // NOT_FOUND
    code === "14" || // UNAVAILABLE
    code === "4" || // DEADLINE_EXCEEDED
    code === "3" || // INVALID_ARGUMENT
    code.includes("permission_denied") ||
    code.includes("not_found") ||
    code.includes("unavailable") ||
    msg.includes("permission_denied") ||
    msg.includes("missing or insufficient permissions") ||
    msg.includes("permission denied") ||
    msg.includes("not found") ||
    msg.includes("not_found") ||
    msg.includes("database") ||
    msg.includes("datastore") ||
    msg.includes("project") ||
    msg.includes("unavailable") ||
    msg.includes("transport error") ||
    msg.includes("deadline exceeded") ||
    details.includes("missing or insufficient permissions")
  );
}

async function getAdminServices(): Promise<AdminServicesResult> {
  if (!legacyFirebaseAdminEnabled) {
    return { ok: false, error: "Legacy Firebase Admin access is disabled. Enable it only for an approved archive migration window." };
  }
  if (adminInitError) {
    return { ok: false, error: adminInitError };
  }
  if (adminApp && adminDb) return { ok: true, db: adminDb };
  if (!adminInitPromise) {
    adminInitPromise = (async (): Promise<AdminServicesResult> => {
      try {
        const [{ initializeApp, applicationDefault }, { getFirestore }] = await Promise.all([
          import("firebase-admin/app"),
          import("firebase-admin/firestore"),
        ]);
        const config = getFirebaseConfig();
        const projectId =
          process.env.FIREBASE_PROJECT_ID ||
          process.env.GOOGLE_CLOUD_PROJECT ||
          config.projectId;

        // Use Application Default Credentials only (no private keys or secrets in source)
        const app = initializeApp({
          credential: applicationDefault(),
          projectId: projectId || undefined,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || config.storageBucket || undefined,
        });
        adminApp = app;
        adminDb = config.firestoreDatabaseId
          ? getFirestore(app, config.firestoreDatabaseId)
          : getFirestore(app);
        return { ok: true, db: adminDb! };
      } catch (err: any) {
        adminInitError = err.message || "Failed to initialize Firebase Admin SDK with Application Default Credentials";
        return { ok: false, error: adminInitError };
      }
    })();
  }
  return adminInitPromise!;
}

async function loadFirestoreFieldValue() {
  const { FieldValue } = await import("firebase-admin/firestore");
  return FieldValue;
}

const PLATFORM_ONLY_MODULES = ["settings"];

const ALL_SYSTEM_MODULES = [
  "dashboard", "master-data", "users", "settings", "ppdb", "cbt", "tahfidz", "boarding",
  "academic", "lms", "library", "finance", "communication", "healthcare", "cooperative",
  "laundry", "enterprise", "erp", "hris", "ga", "document", "alumni", "crm", "donation",
  "marketplace", "ecosystem", "intelligence"
];

const TENANT_SCOPED_MODULES = ALL_SYSTEM_MODULES.filter(
  (m) => !PLATFORM_ONLY_MODULES.includes(m)
);

const DEFAULT_ROLE_MODULES: Record<string, string[]> = {
  SuperAdmin: [...ALL_SYSTEM_MODULES],
  Admin: [...TENANT_SCOPED_MODULES],
  Ustadz: [
    "dashboard", "academic", "tahfidz", "boarding", "lms", "cbt", "communication", "library"
  ],
  Santri: [
    "dashboard", "academic", "tahfidz", "boarding", "finance", "lms", "cbt", "library"
  ],
  Walisantri: [
    "dashboard", "academic", "tahfidz", "boarding", "finance", "communication", "donation"
  ],
};

function resolveUserModulePermissions(role: string, perms?: Record<string, boolean> | null): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  const isSuper = role === "SuperAdmin";
  const isAdmin = role === "Admin";
  const baseline = DEFAULT_ROLE_MODULES[role] || [];

  ALL_SYSTEM_MODULES.forEach((modId) => {
    if (isSuper) {
      result[modId] = true;
      return;
    }
    if (PLATFORM_ONLY_MODULES.includes(modId)) {
      result[modId] = false;
      return;
    }
    if (perms && typeof perms === "object" && modId in perms) {
      result[modId] = Boolean(perms[modId]);
      return;
    }
    // Missing key or missing map falls back to role baseline (Admin gets all tenant modules by default)
    result[modId] = isAdmin ? true : baseline.includes(modId);
  });
  return result;
}

function identityFailure(res: express.Response, err: unknown) {
  if (err instanceof IdentityUnavailableError) {
    return res.status(503).json({
      code: "SUPABASE_IDENTITY_UNAVAILABLE",
      error: err.message,
    });
  }
  if (err instanceof IdentityConflictError) {
    return res.status(400).json({ code: "CREATION_FAILED", error: err.message });
  }
  return null;
}

// Middleware: Authenticate caller with the Supabase session token.
async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ code: "UNAUTHORIZED", error: "Missing or invalid authorization header" });
  }

  const token = authHeader.split("Bearer ")[1].trim();
  try {
    const verified = await verifyAccessToken(token);
    (req as any).user = verified;
    next();
  } catch (err: any) {
    const unavailable = identityFailure(res, err);
    if (unavailable) return unavailable;
    return res.status(401).json({ code: "UNAUTHORIZED", error: "Sesi tidak valid atau sudah berakhir." });
  }
}

// Middleware: Enforce acting admin profile from the Supabase RBAC profile.
async function requireTenantAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const uid = (req as any).user?.uid;
  if (!uid) {
    return res.status(401).json({ code: "UNAUTHORIZED", error: "Autentikasi diperlukan." });
  }

  try {
    const actor = await getUserProfile(uid);
    if (!actor) {
      return res.status(403).json({
        code: "ADMIN_PROFILE_NOT_FOUND",
        error: "Profil akun pengguna tidak ditemukan dalam basis data tenant."
      });
    }

    const status = String(actor.status || "").toLowerCase();
    if (status !== "active") {
      return res.status(403).json({
        code: "ACCOUNT_INACTIVE",
        error: "Akun pengguna dalam status tidak aktif atau dinonaktifkan."
      });
    }

    const role = actor.role;
    if (role !== "SuperAdmin" && role !== "Admin") {
      return res.status(403).json({
        code: "FORBIDDEN_ROLE",
        error: "Akses ditolak: modul manajemen pengguna hanya dapat diakses oleh peran Admin atau SuperAdmin."
      });
    }

    if (!resolveUserModulePermissions(role, actor.modulePermissions).users) {
      return res.status(403).json({
        code: "MODULE_ACCESS_DENIED",
        error: "Akses modul manajemen pengguna tidak diberikan kepada akun ini."
      });
    }

    const tenantId = typeof actor.tenantId === "string" ? actor.tenantId.trim() : "";
    if (!tenantId) {
      return res.status(403).json({
        code: "MISSING_TENANT",
        error: "Profil pengguna tidak memiliki asosiasi tenant yang valid."
      });
    }

    (req as any).actor = {
      ...actor,
      uid,
      role,
      tenantId,
      tenantName: actor.tenantName || tenantId,
    };
    next();
  } catch (err: any) {
    const unavailable = identityFailure(res, err);
    if (unavailable) return unavailable;

    return res.status(500).json({
      code: "INTERNAL_ERROR",
      error: "Terjadi kesalahan internal saat memverifikasi status admin."
    });
  }
}

const publicPpdbRateBuckets = new Map<string, { startedAt: number; count: number }>();
function consumePublicPpdbRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const limit = 5;
  const bucket = publicPpdbRateBuckets.get(ip);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    if (!bucket && publicPpdbRateBuckets.size >= 5000) {
      for (const [key, existingBucket] of publicPpdbRateBuckets) {
        if (now - existingBucket.startedAt >= windowMs) publicPpdbRateBuckets.delete(key);
      }
      if (publicPpdbRateBuckets.size >= 5000) {
        const oldestKey = publicPpdbRateBuckets.keys().next().value;
        if (oldestKey) publicPpdbRateBuckets.delete(oldestKey);
      }
    }
    publicPpdbRateBuckets.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

type FinanceProofError = Error & { status: number };
function financeProofError(status: number, message: string): FinanceProofError {
  return Object.assign(new Error(message), { status });
}

async function loadFinanceProofActor(uid: string) {
  let profile;
  try {
    profile = await getUserProfile(uid);
  } catch (err) {
    if (err instanceof IdentityUnavailableError) throw financeProofError(503, err.message);
    throw err;
  }
  if (!profile) throw financeProofError(403, "Profil pengguna tidak ditemukan.");
  const tenantId = typeof profile.tenantId === "string" ? profile.tenantId.trim() : "";
  const role = typeof profile.role === "string" ? profile.role : "";
  if (String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
    throw financeProofError(403, "Akun aktif dan tenant valid diperlukan.");
  }
  if (!["SuperAdmin", "Admin", "Walisantri"].includes(role)) {
    throw financeProofError(403, "Role ini tidak dapat mengelola bukti pembayaran.");
  }
  const modulePermissions = resolveUserModulePermissions(role, profile.modulePermissions);
  if (modulePermissions.finance !== true) {
    throw financeProofError(403, "Akses modul keuangan tidak diberikan kepada akun ini.");
  }
  return {
    uid,
    role,
    tenantId,
    linkedSantriId: typeof profile.linkedSantriId === "string" ? profile.linkedSantriId : "",
  };
}

function safePaymentProofName(input: unknown): string {
  const rawName = typeof input === "string" ? input : "bukti-pembayaran";
  const baseName = path.basename(rawName.replaceAll(String.fromCharCode(92), "/"));
  return baseName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "bukti-pembayaran";
}

function detectPaymentProofMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

const paymentProofUploadBuckets = new Map<string, { startedAt: number; count: number }>();
function consumePaymentProofUploadLimit(uid: string): boolean {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const bucket = paymentProofUploadBuckets.get(uid);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    if (!bucket && paymentProofUploadBuckets.size >= 5000) {
      for (const [key, value] of paymentProofUploadBuckets) {
        if (now - value.startedAt >= windowMs) paymentProofUploadBuckets.delete(key);
      }
    }
    paymentProofUploadBuckets.set(uid, { startedAt: now, count: 1 });
    return true;
  }
  if (bucket.count >= 12) return false;
  bucket.count += 1;
  return true;
}


async function startServer() {
  const app = express();
  const configuredPort = Number.parseInt(process.env.PORT || "3000", 10);
  const PORT = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535
    ? configuredPort
    : 3000;

  // Cloud Run terminates TLS at one trusted proxy hop.
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "5mb" }));

  const loadCommunicationActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    if (!profile) throw new CommunicationStoreError(403, "Profil akun tidak ditemukan.");
    const tenantId = String(profile.tenantId || "").trim();
    if (String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      throw new CommunicationStoreError(403, "Akun aktif dengan tenant valid diperlukan.");
    }
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).communication) {
      throw new CommunicationStoreError(403, "Akses modul Komunikasi tidak diberikan kepada akun ini.");
    }
    return profile;
  };
  const communicationRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) {
      return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    }
    if (error instanceof CommunicationStoreError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Supabase communication endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan Komunikasi Supabase belum dapat diproses." });
  };
  const communicationRuntimeEnabled = String(process.env.SUPABASE_COMMUNICATION_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const communicationImportEnabled = String(process.env.SUPABASE_COMMUNICATION_IMPORT_ENABLED || "").trim().toLowerCase() === "true";
  const supabasePublicPpdbRuntimeEnabled = String(process.env.SUPABASE_PUBLIC_PPDB_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const publicPpdbEnabled = String(process.env.PUBLIC_PPDB_ENABLED || "").trim().toLowerCase() === "true";

  const loadTahfidzActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      throw new SupabaseTahfidzError(403, "Profil aktif dengan tenant valid diperlukan.");
    }
    if (!["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"].includes(profile.role)) {
      throw new SupabaseTahfidzError(403, "Role ini tidak dapat mengakses data operasional Tahfidz.");
    }
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).tahfidz) {
      throw new SupabaseTahfidzError(403, "Akses modul Tahfidz tidak diberikan kepada akun ini.");
    }
    return { ...profile, uid, tenantId };
  };
  const tahfidzRuntimeEnabled = String(process.env.SUPABASE_TAHFIDZ_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const tahfidzImportEnabled = String(process.env.SUPABASE_TAHFIDZ_IMPORT_ENABLED || "").trim().toLowerCase() === "true";
  const tahfidzRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseTahfidzError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase Tahfidz endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan Tahfidz Supabase belum dapat diproses." });
  };

  const loadMasterDataActor = async (uid: string, moduleId: "master-data" | "boarding") => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      throw new SupabaseOnboardingError(403, "Profil aktif dengan tenant valid diperlukan.");
    }
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions)[moduleId]) {
      throw new SupabaseOnboardingError(403, "Akses modul tidak diberikan kepada akun ini.");
    }
    return { ...profile, uid, tenantId };
  };
  const requireMasterDataAdmin = (actor: { role: string }) => {
    if (!(["Admin", "SuperAdmin"] as string[]).includes(actor.role)) {
      throw new SupabaseOnboardingError(403, "Operasi ini hanya tersedia untuk Admin pesantren.");
    }
  };
  const loadHrisActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      throw new SupabaseHrisError(403, "Profil aktif dengan tenant valid diperlukan.");
    }
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).hris) {
      throw new SupabaseHrisError(403, "Akses modul HRIS tidak diberikan kepada akun ini.");
    }
    if (profile.role !== "Admin" && profile.role !== "SuperAdmin") {
      throw new SupabaseHrisError(403, "Pengelolaan HRIS saat ini hanya tersedia untuk Admin tenant.");
    }
    return { ...profile, uid, tenantId };
  };
  const hrisRuntimeEnabled = String(process.env.SUPABASE_HRIS_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const cooperativeRuntimeEnabled = String(process.env.SUPABASE_COOPERATIVE_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const loadCooperativeActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      throw new SupabaseCooperativeError(403, "Profil aktif dengan tenant valid diperlukan.");
    }
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).cooperative) {
      throw new SupabaseCooperativeError(403, "Akses modul Koperasi tidak diberikan kepada akun ini.");
    }
    if (profile.role !== "Admin" && profile.role !== "SuperAdmin") {
      throw new SupabaseCooperativeError(403, "Pengelolaan Koperasi saat ini hanya tersedia untuk Admin tenant.");
    }
    return { ...profile, uid, tenantId };
  };
  const cooperativeRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseCooperativeError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase cooperative endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan Koperasi Supabase belum dapat diproses." });
  };
  const hrisRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseHrisError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase HRIS endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan HRIS Supabase belum dapat diproses." });
  };
  const masterDataRuntimeEnabled = String(process.env.SUPABASE_MASTER_DATA_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const alumniRuntimeEnabled = String(process.env.SUPABASE_ALUMNI_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const libraryRuntimeEnabled = String(process.env.SUPABASE_LIBRARY_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const boardingRuntimeEnabled = String(process.env.SUPABASE_BOARDING_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const boardingPermitsRuntimeEnabled = String(process.env.SUPABASE_BOARDING_PERMITS_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const boardingPermitsImportEnabled = String(process.env.SUPABASE_BOARDING_PERMITS_IMPORT_ENABLED || "").trim().toLowerCase() === "true";
  const boardingDisciplineRuntimeEnabled = String(process.env.SUPABASE_BOARDING_DISCIPLINE_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const boardingDisciplineImportEnabled = String(process.env.SUPABASE_BOARDING_DISCIPLINE_IMPORT_ENABLED || "").trim().toLowerCase() === "true";
  const boardingAttendanceRuntimeEnabled = String(process.env.SUPABASE_BOARDING_ATTENDANCE_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const boardingAttendanceImportEnabled = String(process.env.SUPABASE_BOARDING_ATTENDANCE_IMPORT_ENABLED || "").trim().toLowerCase() === "true";
  const boardingAssignmentsRuntimeEnabled = String(process.env.SUPABASE_BOARDING_ASSIGNMENTS_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const boardingFacilityOpsRuntimeEnabled = String(process.env.SUPABASE_BOARDING_FACILITY_OPS_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const boardingFacilityOpsImportEnabled = String(process.env.SUPABASE_BOARDING_FACILITY_OPS_IMPORT_ENABLED || "").trim().toLowerCase() === "true";
  const ppdbRuntimeEnabled = String(process.env.SUPABASE_PPDB_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const ppdbOnboardingRuntimeEnabled = String(process.env.SUPABASE_PPDB_ONBOARDING_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const academicRuntimeEnabled = String(process.env.SUPABASE_ACADEMIC_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const academicImportEnabled = String(process.env.SUPABASE_ACADEMIC_IMPORT_ENABLED || "").trim().toLowerCase() === "true";
  const cbtRuntimeEnabled = String(process.env.SUPABASE_CBT_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const cbtImportEnabled = String(process.env.SUPABASE_CBT_IMPORT_ENABLED || "").trim().toLowerCase() === "true";
  const lmsRuntimeEnabled = String(process.env.SUPABASE_LMS_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const lmsImportEnabled = String(process.env.SUPABASE_LMS_IMPORT_ENABLED || "").trim().toLowerCase() === "true";
  const healthcareRuntimeEnabled = String(process.env.SUPABASE_HEALTHCARE_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const healthcareImportEnabled = String(process.env.SUPABASE_HEALTHCARE_IMPORT_ENABLED || "").trim().toLowerCase() === "true";
  const generalAffairsRuntimeEnabled = String(process.env.SUPABASE_GA_ASSETS_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const generalAffairsImportEnabled = String(process.env.SUPABASE_GA_ASSETS_IMPORT_ENABLED || "").trim().toLowerCase() === "true";
  const marketplaceRuntimeEnabled = String(process.env.SUPABASE_MARKETPLACE_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const marketplaceImportEnabled = String(process.env.SUPABASE_MARKETPLACE_IMPORT_ENABLED || "").trim().toLowerCase() === "true";
  const donationRuntimeEnabled = String(process.env.SUPABASE_DONATION_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const facilityBookingsRuntimeEnabled = String(process.env.SUPABASE_FACILITY_BOOKINGS_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const facilityBookingsImportEnabled = String(process.env.SUPABASE_FACILITY_BOOKINGS_IMPORT_ENABLED || "").trim().toLowerCase() === "true";
  const masterDataRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseOnboardingError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase Master Data endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan Master Data Supabase belum dapat diproses." });
  };

  const loadPpdbActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      throw new SupabasePpdbError(403, "Profil aktif dengan tenant valid diperlukan.");
    }
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).ppdb) {
      throw new SupabasePpdbError(403, "Akses modul PPDB tidak diberikan kepada akun ini.");
    }
    if (!["Admin", "SuperAdmin"].includes(profile.role)) {
      throw new SupabasePpdbError(403, "Pengelolaan pendaftar PPDB hanya tersedia untuk Admin tenant.");
    }
    return { ...profile, uid, tenantId };
  };
  const loadAcademicActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      throw new SupabaseAcademicError(403, "Profil aktif dengan tenant valid diperlukan.");
    }
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).academic) {
      throw new SupabaseAcademicError(403, "Akses modul Akademik tidak diberikan kepada akun ini.");
    }
    if (!["Admin", "SuperAdmin", "Ustadz"].includes(profile.role)) {
      throw new SupabaseAcademicError(403, "Runtime Akademik Supabase saat ini hanya tersedia untuk Admin dan Ustadz.");
    }
    return { ...profile, uid, tenantId };
  };
  const academicRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseAcademicError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase academic endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan Akademik Supabase belum dapat diproses." });
  };
  const loadCbtAdminActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) throw new SupabaseCbtError(403, "Profil aktif dengan tenant valid diperlukan.");
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).cbt) throw new SupabaseCbtError(403, "Akses CBT tidak diberikan kepada akun ini.");
    if (!["Admin", "SuperAdmin"].includes(profile.role)) throw new SupabaseCbtError(403, "Pengelolaan CBT hanya tersedia untuk Admin tenant.");
    return { ...profile, uid, tenantId };
  };
  const loadCbtStudentActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) throw new SupabaseCbtError(403, "Profil aktif dengan tenant valid diperlukan.");
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).cbt) throw new SupabaseCbtError(403, "Akses CBT tidak diberikan kepada akun ini.");
    if (profile.role !== "Santri" || !profile.linkedSantriId) throw new SupabaseCbtError(403, "Pengerjaan CBT hanya tersedia untuk akun Santri yang tertaut ke roster.");
    return { ...profile, uid, tenantId };
  };
  const cbtRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseCbtError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase CBT endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan CBT Supabase belum dapat diproses." });
  };
  const loadLmsActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) throw new SupabaseLmsError(403, "Profil aktif dengan tenant valid diperlukan.");
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).lms) throw new SupabaseLmsError(403, "Akses LMS tidak diberikan kepada akun ini.");
    if (!["Admin", "SuperAdmin", "Ustadz", "Santri"].includes(profile.role)) throw new SupabaseLmsError(403, "LMS Supabase belum tersedia untuk role akun ini.");
    if (profile.role === "Santri" && !profile.linkedSantriId) throw new SupabaseLmsError(403, "Akun Santri belum tertaut ke roster tenant.");
    return { ...profile, uid, tenantId };
  };
  const lmsRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseLmsError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase LMS endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan LMS Supabase belum dapat diproses." });
  };
  const loadHealthcareActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) throw new SupabaseHealthcareError(403, "Profil aktif dengan tenant valid diperlukan.");
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).healthcare) throw new SupabaseHealthcareError(403, "Akses modul kesehatan tidak diberikan kepada akun ini.");
    if (!["Admin", "SuperAdmin"].includes(profile.role)) throw new SupabaseHealthcareError(403, "Rekam medis dan operasi UKS hanya tersedia untuk Admin pesantren.");
    return { ...profile, uid, tenantId };
  };
  const healthcareRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseHealthcareError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase healthcare endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan UKS Supabase belum dapat diproses." });
  };
  const loadGeneralAffairsActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) throw new SupabaseGeneralAffairsError(403, "Profil aktif dengan tenant valid diperlukan.");
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).ga) throw new SupabaseGeneralAffairsError(403, "Akses modul General Affairs tidak diberikan kepada akun ini.");
    if (!["Admin", "SuperAdmin"].includes(profile.role)) throw new SupabaseGeneralAffairsError(403, "Pengelolaan aset dan inventaris hanya tersedia untuk Admin tenant.");
    return { ...profile, uid, tenantId };
  };
  const generalAffairsRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseGeneralAffairsError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase General Affairs endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan General Affairs Supabase belum dapat diproses." });
  };
  const loadMarketplaceActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) throw new SupabaseMarketplaceError(403, "Profil aktif dengan tenant valid diperlukan.");
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).marketplace) throw new SupabaseMarketplaceError(403, "Akses modul Marketplace tidak diberikan kepada akun ini.");
    if (!["Admin", "SuperAdmin"].includes(profile.role)) throw new SupabaseMarketplaceError(403, "Runtime Marketplace saat ini hanya tersedia untuk Admin tenant.");
    return { ...profile, uid, tenantId };
  };
  const marketplaceRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseMarketplaceError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase Marketplace endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan Marketplace Supabase belum dapat diproses." });
  };
  const loadDonationActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) throw new SupabaseDonationError(403, "Profil aktif dengan tenant valid diperlukan.");
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).donation) throw new SupabaseDonationError(403, "Akses Donasi & Wakaf tidak diberikan kepada akun ini.");
    if (!["Admin", "SuperAdmin"].includes(profile.role)) throw new SupabaseDonationError(403, "Pengelolaan Donasi & Wakaf hanya tersedia untuk Admin tenant.");
    return { ...profile, uid, tenantId };
  };
  const donationRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseDonationError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase Donation endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan Donasi & Wakaf Supabase belum dapat diproses." });
  };
  const loadFacilityBookingActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) throw new SupabaseFacilityBookingError(403, "Profil aktif dengan tenant valid diperlukan.");
    const permissions = resolveUserModulePermissions(profile.role, profile.modulePermissions);
    if (!permissions.ga && !permissions.boarding) throw new SupabaseFacilityBookingError(403, "Akses pemesanan fasilitas tidak diberikan kepada akun ini.");
    if (!["Admin", "SuperAdmin"].includes(profile.role)) throw new SupabaseFacilityBookingError(403, "Pengelolaan pemesanan fasilitas hanya tersedia untuk Admin tenant.");
    return { ...profile, uid, tenantId };
  };
  const facilityBookingRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseFacilityBookingError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase facility booking endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan pemesanan fasilitas Supabase belum dapat diproses." });
  };
  const ppdbRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabasePpdbError) return res.status(error.status).json({ error: error.message });
    if (error instanceof SupabaseOnboardingError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase PPDB endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan PPDB Supabase belum dapat diproses." });
  };

  const loadAlumniActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      throw new SupabaseAlumniError(403, "Profil aktif dengan tenant valid diperlukan.");
    }
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).alumni) {
      throw new SupabaseAlumniError(403, "Akses modul Alumni tidak diberikan kepada akun ini.");
    }
    if (!["Admin", "SuperAdmin"].includes(profile.role)) {
      throw new SupabaseAlumniError(403, "Modul Alumni Supabase saat ini hanya tersedia untuk Admin pesantren.");
    }
    return { ...profile, uid, tenantId };
  };
  const alumniRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseAlumniError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase Alumni endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan Alumni Supabase belum dapat diproses." });
  };

  app.get("/api/alumni", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!alumniRuntimeEnabled) return res.status(503).json({ error: "Runtime Alumni Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadAlumniActor(uid);
      return res.json(await listSupabaseAlumniSnapshot(actor.tenantId));
    } catch (error) { return alumniRouteError(res, error); }
  });

  app.post("/api/alumni/graduations", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!alumniRuntimeEnabled) return res.status(503).json({ error: "Runtime Alumni Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadAlumniActor(uid);
      const result = await graduateSupabaseStudent(actor.tenantId, actor.uid, actor.role, req.body);
      return res.status(result.alreadyGraduated ? 200 : 201).json(result);
    } catch (error) { return alumniRouteError(res, error); }
  });

  app.get("/api/ppdb/candidates", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!ppdbRuntimeEnabled) return res.status(503).json({ error: "Runtime PPDB Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadPpdbActor(uid);
      const limit = Math.max(1, Math.min(250, Number.parseInt(String(req.query.limit || "250"), 10) || 250));
      const offset = Math.max(0, Math.min(50000, Number.parseInt(String(req.query.offset || "0"), 10) || 0));
      return res.json(await listSupabasePpdbCandidates(actor.tenantId, limit, offset));
    } catch (error) { return ppdbRouteError(res, error); }
  });

  app.patch("/api/ppdb/candidates/:candidateId", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!ppdbRuntimeEnabled) return res.status(503).json({ error: "Runtime PPDB Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadPpdbActor(uid);
      return res.json(await updateSupabasePpdbCandidate(actor.tenantId, actor.uid, req.params.candidateId, req.body));
    } catch (error) { return ppdbRouteError(res, error); }
  });

  const requirePpdbOnboardingRuntime = (res: express.Response) => {
    if (!ppdbOnboardingRuntimeEnabled || !ppdbRuntimeEnabled || !masterDataRuntimeEnabled || !boardingRuntimeEnabled) {
      res.status(503).json({ error: "Onboarding Supabase memerlukan runtime PPDB, Master Data, dan Asrama yang sudah disiapkan." });
      return false;
    }
    return true;
  };
  const loadPpdbOnboardingActor = async (uid: string) => {
    const actor = await loadPpdbActor(uid);
    const permissions = resolveUserModulePermissions(actor.role, actor.modulePermissions);
    if (!permissions["master-data"] || !permissions.boarding) {
      throw new SupabasePpdbError(403, "Akses PPDB, Master Data, dan Asrama diperlukan untuk onboarding santri.");
    }
    return actor;
  };

  app.post("/api/ppdb/onboarding/next-nis", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!requirePpdbOnboardingRuntime(res)) return;
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadPpdbOnboardingActor(uid);
      const nis = await getSupabaseNextSantriNis(actor.tenantId, String(req.body?.grade || ""), String(req.body?.candidateId || ""));
      return res.json({ nis });
    } catch (error) { return ppdbRouteError(res, error); }
  });

  app.post("/api/ppdb/candidates/:candidateId/onboard", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!requirePpdbOnboardingRuntime(res)) return;
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadPpdbOnboardingActor(uid);
      const result = await onboardSupabaseAcceptedCandidate(
        actor.tenantId,
        actor.uid,
        req.params.candidateId,
        req.body?.clientRequestId,
        req.body?.assignment
      );
      return res.status(result.alreadyOnboarded ? 200 : 201).json(result);
    } catch (error) { return ppdbRouteError(res, error); }
  });

  app.get("/api/academic/snapshot", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!academicRuntimeEnabled) return res.status(503).json({ error: "Runtime Akademik Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadAcademicActor(uid);
      return res.json(await getSupabaseAcademicSnapshot(actor.tenantId, actor.uid, actor.role));
    } catch (error) { return academicRouteError(res, error); }
  });

  app.post("/api/academic/:kind", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!academicRuntimeEnabled) return res.status(503).json({ error: "Runtime Akademik Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadAcademicActor(uid);
      const result = await saveSupabaseAcademicRecord(actor.tenantId, actor.uid, actor.role, req.params.kind, req.body?.record);
      return res.status(result.alreadyApplied ? 200 : 201).json(result);
    } catch (error) { return academicRouteError(res, error); }
  });

  app.post("/api/academic/legacy/import", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!academicImportEnabled) return res.status(503).json({ error: "Impor historis Akademik Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadAcademicActor(uid);
      if (!["Admin", "SuperAdmin"].includes(actor.role)) return res.status(403).json({ error: "Impor historis hanya tersedia untuk Admin tenant." });
      const action = String(req.body?.action || "");
      if (action !== "preview" && action !== "apply") return res.status(400).json({ error: "Aksi impor Akademik tidak valid." });
      const { legacyTenantKey } = await getSupabaseAcademicLegacyTenantKey(actor.tenantId);
      const services = await getAdminServices();
      if (!services.ok) throw new SupabaseAcademicError(503, "Sumber arsip Firebase belum dapat dibaca oleh backend migrasi.");
      const collections = ["academic_schedules", "academic_journals", "academic_assessments"];
      const snapshots = await Promise.all(collections.map((name) => services.db.collection(name)
        .where("tenantId", "==", legacyTenantKey).limit(3001).get()));
      const sourceRows = snapshots.flatMap((snapshot, index) => snapshot.docs.map((document) => ({
        collection: collections[index], id: document.id, data: document.data() as Record<string, any>,
      })));
      if (action === "preview") return res.json(await previewSupabaseLegacyAcademic(actor.tenantId, sourceRows));
      const expectedFingerprint = String(req.body?.expectedFingerprint || "");
      const result = await importSupabaseLegacyAcademic(actor.tenantId, actor.uid, sourceRows, expectedFingerprint);
      return res.status(201).json(result);
    } catch (error) { return academicRouteError(res, error); }
  });

  app.get("/api/cbt/admin", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cbtRuntimeEnabled) return res.status(503).json({ error: "Runtime CBT Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCbtAdminActor(uid);
      return res.json(await listSupabaseCbtAdminSnapshot(actor.tenantId));
    } catch (error) { return cbtRouteError(res, error); }
  });

  app.post("/api/cbt/legacy/import", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cbtImportEnabled) return res.status(503).json({ error: "Impor bank soal CBT lama belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCbtAdminActor(uid);
      const action = String(req.body?.action || "");
      if (action !== "preview" && action !== "apply") return res.status(400).json({ error: "Aksi impor CBT tidak valid." });
      const { legacyTenantKey, existingRows } = await getSupabaseCbtLegacyImportContext(actor.tenantId);
      const services = await getAdminServices();
      if (!services.ok) throw new SupabaseCbtError(503, "Arsip Firebase belum dapat dibaca backend migrasi.");
      const snapshot = await services.db.collection("cbt_questions")
        .where("tenantId", "==", legacyTenantKey).limit(3001).get();
      const sourceRows = snapshot.docs.map((document) => ({ id: document.id, data: document.data() as Record<string, any> }));
      if (action === "preview") {
        const preview = await previewSupabaseLegacyCbt(sourceRows, existingRows);
        const { items: _items, ...summary } = preview;
        return res.json(summary);
      }
      const result = await applySupabaseLegacyCbtImport(actor.tenantId, actor.uid, sourceRows, existingRows, String(req.body?.expectedFingerprint || ""));
      return res.status(201).json(result);
    } catch (error) { return cbtRouteError(res, error); }
  });

  app.post("/api/cbt/questions", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cbtRuntimeEnabled) return res.status(503).json({ error: "Runtime CBT Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCbtAdminActor(uid);
      const result = await upsertSupabaseCbtQuestion(actor.tenantId, actor.uid, req.body?.questionId, req.body?.clientRequestId, req.body?.question);
      return res.status(result.alreadyApplied ? 200 : 201).json(result);
    } catch (error) { return cbtRouteError(res, error); }
  });

  app.post("/api/cbt/exams", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cbtRuntimeEnabled) return res.status(503).json({ error: "Runtime CBT Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCbtAdminActor(uid);
      const result = await createSupabaseCbtExam(actor.tenantId, actor.uid, req.body?.exam);
      return res.status(result.alreadyApplied ? 200 : 201).json(result);
    } catch (error) { return cbtRouteError(res, error); }
  });

  app.get("/api/cbt/student", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cbtRuntimeEnabled) return res.status(503).json({ error: "Runtime CBT Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCbtStudentActor(uid);
      return res.json(await getSupabaseCbtStudentSnapshot(actor.tenantId, actor.linkedSantriId));
    } catch (error) { return cbtRouteError(res, error); }
  });

  app.post("/api/cbt/exams/:examId/start", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cbtRuntimeEnabled) return res.status(503).json({ error: "Runtime CBT Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCbtStudentActor(uid);
      return res.json(await startSupabaseCbtAttempt(actor.tenantId, actor.uid, req.params.examId));
    } catch (error) { return cbtRouteError(res, error); }
  });

  app.put("/api/cbt/attempts/:attemptId/answers", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cbtRuntimeEnabled) return res.status(503).json({ error: "Runtime CBT Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCbtStudentActor(uid);
      return res.json(await saveSupabaseCbtAttemptAnswers(actor.tenantId, actor.uid, req.params.attemptId, req.body?.answers));
    } catch (error) { return cbtRouteError(res, error); }
  });

  app.post("/api/cbt/attempts/:attemptId/submit", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cbtRuntimeEnabled) return res.status(503).json({ error: "Runtime CBT Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCbtStudentActor(uid);
      return res.json(await submitSupabaseCbtAttempt(actor.tenantId, actor.uid, req.params.attemptId));
    } catch (error) { return cbtRouteError(res, error); }
  });

  app.get("/api/healthcare/snapshot", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!healthcareRuntimeEnabled) return res.status(503).json({ error: "Runtime UKS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadHealthcareActor(uid);
      return res.json(await getSupabaseHealthcareSnapshot(actor.tenantId));
    } catch (error) { return healthcareRouteError(res, error); }
  });

  app.post("/api/healthcare/records", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!healthcareRuntimeEnabled) return res.status(503).json({ error: "Runtime UKS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadHealthcareActor(uid);
      return res.status(201).json(await saveSupabaseHealthcareRecord(actor.tenantId, actor.uid, req.body));
    } catch (error) { return healthcareRouteError(res, error); }
  });

  app.post("/api/healthcare/visits", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!healthcareRuntimeEnabled) return res.status(503).json({ error: "Runtime UKS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadHealthcareActor(uid);
      return res.status(201).json(await createSupabaseHealthcareVisit(actor.tenantId, actor.uid, req.body));
    } catch (error) { return healthcareRouteError(res, error); }
  });

  app.post("/api/healthcare/medicines", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!healthcareRuntimeEnabled) return res.status(503).json({ error: "Runtime UKS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadHealthcareActor(uid);
      return res.status(201).json(await createSupabaseHealthcareMedicine(actor.tenantId, actor.uid, req.body));
    } catch (error) { return healthcareRouteError(res, error); }
  });

  app.post("/api/healthcare/stock-adjustments", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!healthcareRuntimeEnabled) return res.status(503).json({ error: "Runtime UKS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadHealthcareActor(uid);
      return res.status(201).json(await adjustSupabaseHealthcareStock(actor.tenantId, actor.uid, req.body));
    } catch (error) { return healthcareRouteError(res, error); }
  });

  app.post("/api/healthcare/legacy/import", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!healthcareImportEnabled) return res.status(503).json({ error: "Impor data UKS lama belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadHealthcareActor(uid);
      const action = String(req.body?.action || "");
      if (action !== "preview" && action !== "apply") return res.status(400).json({ error: "Aksi impor UKS tidak valid." });
      const context = await getSupabaseHealthcareLegacyImportContext(actor.tenantId);
      const services = await getAdminServices();
      if (!services.ok) throw new SupabaseHealthcareError(503, "Arsip Firebase belum dapat dibaca backend migrasi.");
      const readLegacyRows = async (collectionName: string) => {
        const result = await services.db.collection(collectionName).where("tenantId", "==", context.legacyTenantKey).limit(3001).get();
        return result.docs.map((document) => ({ id: document.id, data: document.data() as Record<string, any> }));
      };
      const [records, visits, medicines] = await Promise.all([
        readLegacyRows("healthcare_records"), readLegacyRows("healthcare_visits"), readLegacyRows("healthcare_inventory"),
      ]);
      const sources = { records, visits, medicines };
      if (action === "preview") {
        const preview = previewSupabaseLegacyHealthcare(sources, context.existingRows, context.students);
        const { items: _items, ...summary } = preview;
        return res.json(summary);
      }
      const result = await applySupabaseLegacyHealthcareImport(actor.tenantId, actor.uid, sources, context.existingRows, context.students, String(req.body?.expectedFingerprint || ""));
      return res.status(201).json(result);
    } catch (error) { return healthcareRouteError(res, error); }
  });

  app.get("/api/ga/assets-snapshot", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!generalAffairsRuntimeEnabled) return res.status(503).json({ error: "Runtime aset dan inventaris GA Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadGeneralAffairsActor(uid);
      return res.json(await getSupabaseGeneralAffairsSnapshot(actor.tenantId));
    } catch (error) { return generalAffairsRouteError(res, error); }
  });

  app.post("/api/ga/assets", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!generalAffairsRuntimeEnabled) return res.status(503).json({ error: "Runtime aset dan inventaris GA Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadGeneralAffairsActor(uid);
      return res.status(201).json(await manageSupabaseGeneralAffairsFacility(actor.tenantId, actor.uid, req.body));
    } catch (error) { return generalAffairsRouteError(res, error); }
  });

  app.post("/api/ga/inventory", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!generalAffairsRuntimeEnabled) return res.status(503).json({ error: "Runtime aset dan inventaris GA Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadGeneralAffairsActor(uid);
      return res.status(201).json(await manageSupabaseGeneralAffairsInventory(actor.tenantId, actor.uid, req.body));
    } catch (error) { return generalAffairsRouteError(res, error); }
  });

  app.post("/api/ga/stock-adjustments", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!generalAffairsRuntimeEnabled) return res.status(503).json({ error: "Runtime aset dan inventaris GA Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadGeneralAffairsActor(uid);
      return res.status(201).json(await adjustSupabaseGeneralAffairsStock(actor.tenantId, actor.uid, req.body));
    } catch (error) { return generalAffairsRouteError(res, error); }
  });

  app.post("/api/ga/legacy/import", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!generalAffairsImportEnabled) return res.status(503).json({ error: "Impor aset dan inventaris GA lama belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadGeneralAffairsActor(uid);
      const action = String(req.body?.action || "");
      if (action !== "preview" && action !== "apply") return res.status(400).json({ error: "Aksi impor GA tidak valid." });
      const context = await getSupabaseGeneralAffairsImportContext(actor.tenantId);
      const services = await getAdminServices();
      if (!services.ok) throw new SupabaseGeneralAffairsError(503, "Arsip Firestore lama belum dapat dibaca oleh backend migrasi.");
      const readLegacyRows = async (collectionName: string) => {
        const result = await services.db.collection(collectionName).where("tenantId", "==", context.legacyTenantKey).limit(6001).get();
        return result.docs.map((document) => ({ id: document.id, data: document.data() as Record<string, any> }));
      };
      const [facilities, inventory] = await Promise.all([readLegacyRows("ga_facilities"), readLegacyRows("ga_inventory")]);
      const sources = { facilities, inventory };
      if (action === "preview") {
        const preview = previewSupabaseLegacyGeneralAffairs(sources, context.existingRows, context.assetCodes, context.inventoryCodes);
        const { items: _items, ...summary } = preview;
        return res.json(summary);
      }
      const result = await applySupabaseLegacyGeneralAffairsImport(actor.tenantId, actor.uid, sources, context.existingRows, context.assetCodes, context.inventoryCodes, String(req.body?.expectedFingerprint || ""));
      return res.status(201).json(result);
    } catch (error) { return generalAffairsRouteError(res, error); }
  });

  app.get("/api/cooperative/snapshot", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cooperativeRuntimeEnabled) return res.status(503).json({ error: "Runtime Koperasi Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCooperativeActor(uid);
      return res.json(await getSupabaseCooperativeSnapshot(actor.tenantId));
    } catch (error) { return cooperativeRouteError(res, error); }
  });
  app.post("/api/cooperative/products", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cooperativeRuntimeEnabled) return res.status(503).json({ error: "Runtime Koperasi Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCooperativeActor(uid);
      return res.status(201).json(await manageSupabaseCooperativeProduct(actor.tenantId, actor.uid, req.body || {}));
    } catch (error) { return cooperativeRouteError(res, error); }
  });
  app.post("/api/cooperative/stock-adjustments", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cooperativeRuntimeEnabled) return res.status(503).json({ error: "Runtime Koperasi Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCooperativeActor(uid);
      return res.status(201).json(await adjustSupabaseCooperativeStock(actor.tenantId, actor.uid, req.body || {}));
    } catch (error) { return cooperativeRouteError(res, error); }
  });
  app.post("/api/cooperative/suppliers", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cooperativeRuntimeEnabled) return res.status(503).json({ error: "Runtime Koperasi Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCooperativeActor(uid);
      return res.status(201).json(await manageSupabaseCooperativeSupplier(actor.tenantId, actor.uid, req.body || {}));
    } catch (error) { return cooperativeRouteError(res, error); }
  });
  app.patch("/api/cooperative/wallets/:walletId/policy", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cooperativeRuntimeEnabled) return res.status(503).json({ error: "Runtime Koperasi Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCooperativeActor(uid);
      return res.json(await setSupabaseCooperativeWalletPolicy(actor.tenantId, actor.uid, { ...(req.body || {}), walletId: req.params.walletId }));
    } catch (error) { return cooperativeRouteError(res, error); }
  });
  app.post("/api/cooperative/wallets/:walletId/top-ups", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cooperativeRuntimeEnabled) return res.status(503).json({ error: "Runtime Koperasi Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCooperativeActor(uid);
      return res.status(201).json(await topUpSupabaseCooperativeWallet(actor.tenantId, actor.uid, { ...(req.body || {}), walletId: req.params.walletId }));
    } catch (error) { return cooperativeRouteError(res, error); }
  });
  app.post("/api/cooperative/sales", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!cooperativeRuntimeEnabled) return res.status(503).json({ error: "Runtime Koperasi Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCooperativeActor(uid);
      return res.status(201).json(await checkoutSupabaseCooperativeSale(actor.tenantId, actor.uid, req.body || {}));
    } catch (error) { return cooperativeRouteError(res, error); }
  });

  app.get("/api/marketplace/snapshot", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!marketplaceRuntimeEnabled) return res.status(503).json({ error: "Runtime Marketplace Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMarketplaceActor(uid);
      return res.json(await getSupabaseMarketplaceSnapshot(actor.tenantId));
    } catch (error) { return marketplaceRouteError(res, error); }
  });
  app.post("/api/marketplace/products", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!marketplaceRuntimeEnabled) return res.status(503).json({ error: "Runtime Marketplace Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMarketplaceActor(uid);
      await assertSupabaseMarketplaceReady(actor.tenantId);
      return res.status(201).json(await manageSupabaseMarketplaceProduct(actor.tenantId, actor.uid, req.body));
    } catch (error) { return marketplaceRouteError(res, error); }
  });
  app.post("/api/marketplace/stock-adjustments", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!marketplaceRuntimeEnabled) return res.status(503).json({ error: "Runtime Marketplace Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMarketplaceActor(uid);
      await assertSupabaseMarketplaceReady(actor.tenantId);
      return res.status(201).json(await adjustSupabaseMarketplaceStock(actor.tenantId, actor.uid, req.body));
    } catch (error) { return marketplaceRouteError(res, error); }
  });
  app.post("/api/marketplace/orders", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!marketplaceRuntimeEnabled) return res.status(503).json({ error: "Runtime Marketplace Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMarketplaceActor(uid);
      await assertSupabaseMarketplaceReady(actor.tenantId);
      return res.status(201).json(await createSupabaseMarketplaceOrder(actor.tenantId, actor.uid, req.body));
    } catch (error) { return marketplaceRouteError(res, error); }
  });
  app.patch("/api/marketplace/orders/:orderId/status", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!marketplaceRuntimeEnabled) return res.status(503).json({ error: "Runtime Marketplace Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMarketplaceActor(uid);
      await assertSupabaseMarketplaceReady(actor.tenantId);
      return res.json(await transitionSupabaseMarketplaceOrder(actor.tenantId, actor.uid, req.params.orderId, String(req.body?.status || ""), String(req.body?.clientRequestId || "")));
    } catch (error) { return marketplaceRouteError(res, error); }
  });
  app.post("/api/marketplace/legacy/import", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!marketplaceImportEnabled) return res.status(503).json({ error: "Impor Marketplace lama belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMarketplaceActor(uid);
      const action = String(req.body?.action || "");
      if (action !== "preview" && action !== "apply") return res.status(400).json({ error: "Aksi impor Marketplace tidak valid." });
      const context = await getSupabaseMarketplaceImportContext(actor.tenantId);
      const services = await getAdminServices();
      if (!services.ok) throw new SupabaseMarketplaceError(503, "Arsip Firestore lama belum dapat dibaca oleh backend migrasi.");
      const readLegacyRows = async (collectionName: string) => {
        const result = await services.db.collection(collectionName).where("tenantId", "==", context.legacyTenantKey).limit(6001).get();
        return result.docs.map((document) => ({ id: document.id, data: document.data() as Record<string, any> }));
      };
      const [products, orders] = await Promise.all([readLegacyRows("marketplace_products"), readLegacyRows("marketplace_orders")]);
      const sources = { products, orders };
      if (action === "preview") {
        const preview = previewSupabaseLegacyMarketplace(sources, context.existingRows, context.skus);
        const { items: _items, ...summary } = preview;
        return res.json(summary);
      }
      return res.status(201).json(await applySupabaseLegacyMarketplace(actor.tenantId, actor.uid, sources, context.existingRows, context.skus, String(req.body?.expectedFingerprint || "")));
    } catch (error) { return marketplaceRouteError(res, error); }
  });

  app.get("/api/facility-bookings", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!facilityBookingsRuntimeEnabled) return res.status(503).json({ error: "Runtime pemesanan fasilitas Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFacilityBookingActor(uid);
      return res.json(await getSupabaseFacilityBookings(actor.tenantId));
    } catch (error) { return facilityBookingRouteError(res, error); }
  });
  app.post("/api/facility-bookings", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!facilityBookingsRuntimeEnabled) return res.status(503).json({ error: "Runtime pemesanan fasilitas Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFacilityBookingActor(uid);
      await assertSupabaseFacilityBookingsReady(actor.tenantId);
      return res.status(201).json(await manageSupabaseFacilityBooking(actor.tenantId, actor.uid, req.body));
    } catch (error) { return facilityBookingRouteError(res, error); }
  });
  app.post("/api/facility-bookings/legacy/import", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!facilityBookingsImportEnabled) return res.status(503).json({ error: "Impor arsip pemesanan fasilitas belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFacilityBookingActor(uid);
      const action = String(req.body?.action || "");
      if (action !== "preview" && action !== "apply") return res.status(400).json({ error: "Aksi impor pemesanan fasilitas tidak valid." });
      const context = await getSupabaseFacilityBookingImportContext(actor.tenantId);
      const services = await getAdminServices();
      if (!services.ok) throw new SupabaseFacilityBookingError(503, "Arsip Firestore lama belum dapat dibaca backend migrasi.");
      const snapshot = await services.db.collection("facility_bookings").where("tenantId", "==", context.legacyTenantKey).limit(6001).get();
      const sources = snapshot.docs.map((document) => ({ id: document.id, data: document.data() as Record<string, any> }));
      if (action === "preview") {
        const preview = previewSupabaseLegacyFacilityBookings(sources, context.existingRows);
        const { items: _items, ...summary } = preview;
        return res.json(summary);
      }
      return res.status(201).json(await applyFacilityBookingImport(actor.tenantId, actor.uid, sources, context.existingRows, String(req.body?.expectedFingerprint || "")));
    } catch (error) { return facilityBookingRouteError(res, error); }
  });

  app.get("/api/donation/snapshot", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!donationRuntimeEnabled) return res.status(503).json({ error: "Runtime Donasi & Wakaf Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadDonationActor(uid);
      return res.json(await getSupabaseDonationSnapshot(actor.tenantId));
    } catch (error) { return donationRouteError(res, error); }
  });
  app.post("/api/donation/campaigns", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!donationRuntimeEnabled) return res.status(503).json({ error: "Runtime Donasi & Wakaf Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadDonationActor(uid);
      return res.status(201).json(await manageSupabaseDonationCampaign(actor.tenantId, actor.uid, req.body));
    } catch (error) { return donationRouteError(res, error); }
  });
  app.post("/api/donation/donors", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!donationRuntimeEnabled) return res.status(503).json({ error: "Runtime Donasi & Wakaf Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadDonationActor(uid);
      return res.status(201).json(await manageSupabaseDonationDonor(actor.tenantId, actor.uid, req.body));
    } catch (error) { return donationRouteError(res, error); }
  });
  app.post("/api/donation/waqf-assets", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!donationRuntimeEnabled) return res.status(503).json({ error: "Runtime Donasi & Wakaf Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadDonationActor(uid);
      return res.status(201).json(await manageSupabaseWaqfAsset(actor.tenantId, actor.uid, req.body));
    } catch (error) { return donationRouteError(res, error); }
  });
  app.post("/api/donation/transactions", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!donationRuntimeEnabled) return res.status(503).json({ error: "Runtime Donasi & Wakaf Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadDonationActor(uid);
      return res.status(201).json(await recordSupabaseDonation(actor.tenantId, actor.uid, req.body));
    } catch (error) { return donationRouteError(res, error); }
  });
  app.patch("/api/donation/transactions/:donationId/void", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!donationRuntimeEnabled) return res.status(503).json({ error: "Runtime Donasi & Wakaf Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadDonationActor(uid);
      return res.json(await voidSupabaseDonation(actor.tenantId, actor.uid, req.params.donationId, String(req.body?.reason || ""), String(req.body?.clientRequestId || "")));
    } catch (error) { return donationRouteError(res, error); }
  });

  app.get("/api/lms/snapshot", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!lmsRuntimeEnabled) return res.status(503).json({ error: "Runtime LMS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLmsActor(uid);
      return res.json(await getSupabaseLmsSnapshot(actor.tenantId, actor.uid, actor.role, actor.linkedSantriId));
    } catch (error) { return lmsRouteError(res, error); }
  });

  app.post("/api/lms/legacy/import", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!lmsImportEnabled) return res.status(503).json({ error: "Impor katalog LMS lama belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLmsActor(uid);
      if (!['Admin', 'SuperAdmin'].includes(actor.role)) return res.status(403).json({ error: "Pratinjau dan impor katalog LMS hanya tersedia untuk Admin tenant." });
      const action = String(req.body?.action || "");
      if (action !== "preview" && action !== "apply") return res.status(400).json({ error: "Aksi impor LMS tidak valid." });
      const context = await getSupabaseLmsLegacyImportContext(actor.tenantId);
      const services = await getAdminServices();
      if (!services.ok) throw new SupabaseLmsError(503, "Arsip Firebase belum dapat dibaca backend migrasi.");
      const fetchTenantRows = async (collectionName: string) => {
        const result = await services.db.collection(collectionName).where("tenantId", "==", context.legacyTenantKey).limit(3001).get();
        return result.docs.map((document) => ({ id: document.id, data: document.data() as Record<string, any> }));
      };
      const [categories, courses, assessments] = await Promise.all([
        fetchTenantRows("lms_categories"), fetchTenantRows("lms_courses"), fetchTenantRows("lms_assessments"),
      ]);
      const collections = { categories, courses, assessments };
      if (action === "preview") {
        const preview = previewSupabaseLegacyLms(collections, context.existingRows, context.teachers);
        const { items: _items, ...summary } = preview;
        return res.json(summary);
      }
      const result = await applySupabaseLegacyLmsImport(actor.tenantId, actor.uid, collections, context.existingRows, context.teachers, String(req.body?.expectedFingerprint || ""));
      return res.status(201).json(result);
    } catch (error) { return lmsRouteError(res, error); }
  });

  app.post("/api/lms/catalog/:action", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!lmsRuntimeEnabled) return res.status(503).json({ error: "Runtime LMS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLmsActor(uid);
      const result = await manageSupabaseLmsCatalog(actor.tenantId, actor.uid, req.params.action, req.body?.item);
      return res.status(result?.alreadyApplied ? 200 : 201).json(result);
    } catch (error) { return lmsRouteError(res, error); }
  });

  app.post("/api/lms/progress", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!lmsRuntimeEnabled) return res.status(503).json({ error: "Runtime LMS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLmsActor(uid);
      return res.json(await saveSupabaseLmsProgress(actor.tenantId, actor.uid, req.body));
    } catch (error) { return lmsRouteError(res, error); }
  });

  app.post("/api/lms/learning-records", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!lmsRuntimeEnabled) return res.status(503).json({ error: "Runtime LMS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLmsActor(uid);
      return res.status(201).json(await addSupabaseLmsLearningRecord(actor.tenantId, actor.uid, req.body));
    } catch (error) { return lmsRouteError(res, error); }
  });

  app.post("/api/lms/assignments/:assignmentId/submissions", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!lmsRuntimeEnabled) return res.status(503).json({ error: "Runtime LMS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLmsActor(uid);
      return res.status(201).json(await submitSupabaseLmsAssignment(actor.tenantId, actor.uid, req.params.assignmentId, req.body));
    } catch (error) { return lmsRouteError(res, error); }
  });

  app.patch("/api/lms/submissions/:submissionId/grade", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!lmsRuntimeEnabled) return res.status(503).json({ error: "Runtime LMS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLmsActor(uid);
      return res.json(await gradeSupabaseLmsSubmission(actor.tenantId, actor.uid, req.params.submissionId, req.body));
    } catch (error) { return lmsRouteError(res, error); }
  });

  const loadLibraryActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      throw new SupabaseLibraryError(403, "Profil aktif dengan tenant valid diperlukan.");
    }
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).library) {
      throw new SupabaseLibraryError(403, "Akses modul Perpustakaan tidak diberikan kepada akun ini.");
    }
    if (!["Admin", "SuperAdmin", "Ustadz"].includes(profile.role)) {
      throw new SupabaseLibraryError(403, "Modul Perpustakaan Supabase saat ini hanya tersedia untuk Admin dan Ustadz.");
    }
    return { ...profile, uid, tenantId };
  };
  const libraryRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseLibraryError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase library endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan Perpustakaan Supabase belum dapat diproses." });
  };
  const loadLaundryActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      throw new SupabaseLaundryError(403, "Profil aktif dengan tenant valid diperlukan.");
    }
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).laundry) {
      throw new SupabaseLaundryError(403, "Akses modul Laundry tidak diberikan kepada akun ini.");
    }
    if (profile.role !== "Admin" && profile.role !== "SuperAdmin") {
      throw new SupabaseLaundryError(403, "Pengelolaan Laundry saat ini hanya tersedia untuk Admin tenant.");
    }
    return { ...profile, uid, tenantId };
  };
  const laundryRuntimeEnabled = String(process.env.SUPABASE_LAUNDRY_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const laundryRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseLaundryError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase laundry endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan Laundry Supabase belum dapat diproses." });
  };
  const financeRuntimeEnabled = String(process.env.SUPABASE_FINANCE_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const dashboardRuntimeEnabled = String(process.env.SUPABASE_DASHBOARD_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const dashboardRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseDashboardError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase dashboard endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Ringkasan dashboard Supabase belum dapat dimuat." });
  };
  const loadDashboardActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      throw new SupabaseDashboardError(403, "Profil aktif dengan tenant valid diperlukan.");
    }
    if (!["Admin", "SuperAdmin"].includes(profile.role)) {
      throw new SupabaseDashboardError(403, "Dashboard eksekutif hanya tersedia untuk Admin pesantren.");
    }
    const modulePermissions = resolveUserModulePermissions(profile.role, profile.modulePermissions);
    if (!modulePermissions.dashboard) throw new SupabaseDashboardError(403, "Akses dashboard tidak diberikan kepada akun ini.");
    return {
      uid,
      tenantId,
      permissions: {
        ppdb: modulePermissions.ppdb === true,
        "master-data": modulePermissions["master-data"] === true,
        finance: modulePermissions.finance === true,
      },
    };
  };

  app.get("/api/dashboard/snapshot", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!dashboardRuntimeEnabled) return res.status(503).json({ error: "Runtime Dashboard Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadDashboardActor(uid);
      return res.json(await getSupabaseDashboardSnapshot(actor.tenantId, actor.uid, actor.permissions, req.query.period));
    } catch (error) { return dashboardRouteError(res, error); }
  });

  const loadFinanceActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    const tenantId = String(profile?.tenantId || "").trim();
    if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      throw new SupabaseFinanceError(403, "Profil aktif dengan tenant valid diperlukan.");
    }
    if (!resolveUserModulePermissions(profile.role, profile.modulePermissions).finance) {
      throw new SupabaseFinanceError(403, "Akses modul keuangan tidak diberikan kepada akun ini.");
    }
    if (!["Admin", "SuperAdmin", "Ustadz", "Walisantri"].includes(profile.role)) {
      throw new SupabaseFinanceError(403, "Role ini belum memiliki alur Finance Supabase.");
    }
    return { ...profile, uid, tenantId };
  };
  const financeRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SupabaseFinanceError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase finance endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Layanan Finance Supabase belum dapat diproses." });
  };

  app.get("/api/library/snapshot", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!libraryRuntimeEnabled) return res.status(503).json({ error: "Runtime Perpustakaan Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLibraryActor(uid);
      return res.json(await listSupabaseLibrarySnapshot(actor.tenantId));
    } catch (error) { return libraryRouteError(res, error); }
  });

  app.post("/api/library/books", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!libraryRuntimeEnabled) return res.status(503).json({ error: "Runtime Perpustakaan Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLibraryActor(uid);
      const result = await upsertSupabaseLibraryBook(actor.tenantId, actor.uid, actor.role, req.body?.book);
      return res.status(result?.alreadyApplied ? 200 : 201).json(result);
    } catch (error) { return libraryRouteError(res, error); }
  });

  app.post("/api/library/checkout", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!libraryRuntimeEnabled) return res.status(503).json({ error: "Runtime Perpustakaan Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLibraryActor(uid);
      const result = await checkoutSupabaseLibraryBook(actor.tenantId, actor.uid, actor.role, req.body?.checkout);
      return res.status(result?.alreadyApplied ? 200 : 201).json(result);
    } catch (error) { return libraryRouteError(res, error); }
  });

  app.post("/api/library/returns", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!libraryRuntimeEnabled) return res.status(503).json({ error: "Runtime Perpustakaan Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLibraryActor(uid);
      const result = await returnSupabaseLibraryBook(actor.tenantId, actor.uid, actor.role, req.body?.return);
      return res.status(result?.alreadyApplied ? 200 : 201).json(result);
    } catch (error) { return libraryRouteError(res, error); }
  });

  app.get("/api/laundry/snapshot", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!laundryRuntimeEnabled) return res.status(503).json({ error: "Runtime Laundry Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLaundryActor(uid);
      return res.json(await getSupabaseLaundrySnapshot(actor.tenantId));
    } catch (error) { return laundryRouteError(res, error); }
  });

  app.post("/api/laundry/orders", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!laundryRuntimeEnabled) return res.status(503).json({ error: "Runtime Laundry Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLaundryActor(uid);
      const result = await createSupabaseLaundryOrder(actor.tenantId, actor.uid, req.body || {});
      return res.status(result?.replayed ? 200 : 201).json(result);
    } catch (error) { return laundryRouteError(res, error); }
  });

  app.post("/api/laundry/orders/:orderId/status", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!laundryRuntimeEnabled) return res.status(503).json({ error: "Runtime Laundry Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLaundryActor(uid);
      const result = await transitionSupabaseLaundryOrder(actor.tenantId, actor.uid, req.params.orderId, req.body || {});
      return res.json(result);
    } catch (error) { return laundryRouteError(res, error); }
  });

  app.post("/api/laundry/settings", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!laundryRuntimeEnabled) return res.status(503).json({ error: "Runtime Laundry Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadLaundryActor(uid);
      const result = await saveSupabaseLaundrySettings(actor.tenantId, actor.uid, req.body || {});
      return res.status(200).json(result);
    } catch (error) { return laundryRouteError(res, error); }
  });

  app.get("/api/finance/snapshot", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!financeRuntimeEnabled) return res.status(503).json({ error: "Runtime Finance Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFinanceActor(uid);
      return res.json(await listSupabaseFinanceSnapshot(actor.tenantId, actor.uid, actor.role));
    } catch (error) { return financeRouteError(res, error); }
  });

  app.post("/api/finance/bills", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!financeRuntimeEnabled) return res.status(503).json({ error: "Runtime Finance Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFinanceActor(uid);
      const result = await createSupabaseFinanceBills(actor.tenantId, actor.uid, actor.role, req.body?.batch);
      return res.status(201).json(result);
    } catch (error) { return financeRouteError(res, error); }
  });

  app.post("/api/finance/expenses", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!financeRuntimeEnabled) return res.status(503).json({ error: "Runtime Finance Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFinanceActor(uid);
      const result = await createSupabaseFinanceExpense(actor.tenantId, actor.uid, actor.role, actor.name, req.body?.expense);
      return res.status(201).json(result);
    } catch (error) { return financeRouteError(res, error); }
  });

  app.post("/api/finance/expenses/review", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!financeRuntimeEnabled) return res.status(503).json({ error: "Runtime Finance Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFinanceActor(uid);
      if (!["Admin", "SuperAdmin"].includes(actor.role)) return res.status(403).json({ error: "Persetujuan pengeluaran hanya untuk Admin tenant." });
      const result = await reviewSupabaseFinanceExpense(actor.tenantId, actor.uid, actor.role, req.body?.review);
      return res.json(result);
    } catch (error) { return financeRouteError(res, error); }
  });

  app.post("/api/finance/bills/review", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!financeRuntimeEnabled) return res.status(503).json({ error: "Runtime Finance Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFinanceActor(uid);
      if (!["Admin", "SuperAdmin"].includes(actor.role)) return res.status(403).json({ error: "Verifikasi tagihan hanya untuk Admin tenant." });
      const review = req.body?.review || {};
      const priorBill = review.action === "reject" ? await getSupabaseFinanceBill(actor.tenantId, String(review.billId || "")) : null;
      const result = await reviewSupabaseFinanceBill(actor.tenantId, actor.uid, actor.role, review);
      if (priorBill?.proof_storage_provider === "supabase" && typeof priorBill.proof_storage_path === "string") {
        try { await deleteSupabaseFinanceProof(priorBill.proof_storage_path); } catch { /* Private orphan cleanup can be retried by maintenance. */ }
      }
      return res.json(result);
    } catch (error) { return financeRouteError(res, error); }
  });

  app.post("/api/finance/lock", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!financeRuntimeEnabled) return res.status(503).json({ error: "Runtime Finance Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFinanceActor(uid);
      if (!["Admin", "SuperAdmin"].includes(actor.role)) return res.status(403).json({ error: "Penutupan buku hanya untuk Admin tenant." });
      const result = await setSupabaseFinanceLock(actor.tenantId, actor.uid, actor.role, req.body?.lock);
      return res.json(result);
    } catch (error) { return financeRouteError(res, error); }
  });

  app.get("/api/master-data/structures", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!masterDataRuntimeEnabled) return res.status(503).json({ error: "Runtime Master Data Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "master-data");
      return res.json({ records: await listSupabaseMasterDataStructures(actor.tenantId) });
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.put("/api/master-data/structures/:category/:recordId", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!masterDataRuntimeEnabled) return res.status(503).json({ error: "Runtime Master Data Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "master-data");
      requireMasterDataAdmin(actor);
      const record = await upsertSupabaseMasterDataStructure(actor.tenantId, req.params.category, req.params.recordId, req.body?.record);
      return res.json({ record });
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.delete("/api/master-data/structures/:category/:recordId", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!masterDataRuntimeEnabled) return res.status(503).json({ error: "Runtime Master Data Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "master-data");
      requireMasterDataAdmin(actor);
      return res.json(await deleteSupabaseMasterDataStructure(actor.tenantId, req.params.category, req.params.recordId));
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.get("/api/master-data/students", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!masterDataRuntimeEnabled) return res.status(503).json({ error: "Runtime Master Data Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "master-data");
      requireMasterDataAdmin(actor);
      return res.json({ records: await listSupabaseMasterDataStudents(actor.tenantId) });
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.put("/api/master-data/students/:studentId", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!masterDataRuntimeEnabled) return res.status(503).json({ error: "Runtime Master Data Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "master-data");
      requireMasterDataAdmin(actor);
      const record = await upsertSupabaseMasterDataStudent(actor.tenantId, req.params.studentId, req.body?.record);
      return res.json({ record });
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.delete("/api/master-data/students/:studentId", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!masterDataRuntimeEnabled) return res.status(503).json({ error: "Runtime Master Data Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "master-data");
      requireMasterDataAdmin(actor);
      return res.json(await archiveSupabaseMasterDataStudent(actor.tenantId, req.params.studentId));
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.get("/api/boarding/snapshot", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingRuntimeEnabled) return res.status(503).json({ error: "Runtime asrama Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      if (!["Admin", "SuperAdmin", "Ustadz"].includes(actor.role)) throw new SupabaseOnboardingError(403, "Role ini tidak dapat membaca data asrama.");
      const snapshot = await listSupabaseBoardingSnapshot(actor.tenantId);
      return res.json(snapshot);
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.put("/api/boarding/students/:studentId/room", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingRuntimeEnabled) return res.status(503).json({ error: "Runtime asrama Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      requireMasterDataAdmin(actor);
      const result = await assignSupabaseStudentRoom(actor.tenantId, req.params.studentId, req.body?.roomId ?? null, req.body?.buildingId ?? null);
      return res.json(result);
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.get("/api/boarding/permits", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingPermitsRuntimeEnabled) return res.status(503).json({ error: "Runtime izin asrama Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      return res.json(await listSupabaseBoardingPermits(actor));
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.post("/api/boarding/permits", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingPermitsRuntimeEnabled) return res.status(503).json({ error: "Runtime izin asrama Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      const result = await requestSupabaseBoardingPermit(actor, req.body);
      return res.status(result.alreadyApplied ? 200 : 201).json(result);
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.post("/api/boarding/permits/:permitId/status", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingPermitsRuntimeEnabled) return res.status(503).json({ error: "Runtime izin asrama Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      const result = await transitionSupabaseBoardingPermit(actor, req.params.permitId, req.body);
      return res.json(result);
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.post("/api/boarding/permits/migrate", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingPermitsImportEnabled) return res.status(503).json({ error: "Impor izin asrama belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      requireMasterDataAdmin(actor);
      const services = await getAdminServices();
      if (services.ok === false) return res.status(503).json({ error: "Sumber Firestore izin lama belum dapat diakses." });
      const legacyTenantId = await getSupabaseTahfidzLegacyTenantKey(actor.tenantId);
      const snapshot = await services.db.collection("boarding_permits")
        .where("tenantId", "==", legacyTenantId)
        .limit(1001)
        .get();
      if (snapshot.size > 1000) return res.status(413).json({ error: "Impor izin dibatasi maksimal 1.000 record per tenant." });
      const sourceRows = snapshot.docs.map((doc) => ({ sourceId: doc.id, value: doc.data() as Record<string, any> }));
      const apply = req.body?.apply === true;
      if (apply && String(req.body?.confirmation || "") !== "IMPORT_BOARDING_PERMITS") {
        return res.status(400).json({ error: "Konfirmasi impor izin tidak cocok." });
      }
      const report = await migrateSupabaseLegacyBoardingPermits(
        actor,
        sourceRows,
        apply,
        String(req.body?.previewFingerprint || ""),
      );
      if (apply && !report.canApply) return res.status(409).json(report);
      return res.json(report);
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.get("/api/boarding/discipline", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingDisciplineRuntimeEnabled) return res.status(503).json({ error: "Runtime kedisiplinan asrama Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      return res.json(await listSupabaseBoardingDiscipline(actor));
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.post("/api/boarding/discipline", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingDisciplineRuntimeEnabled) return res.status(503).json({ error: "Runtime kedisiplinan asrama Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      const result = await createSupabaseBoardingDiscipline(actor, req.body);
      return res.status(result.alreadyApplied ? 200 : 201).json(result);
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.post("/api/boarding/discipline/:incidentId/resolve", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingDisciplineRuntimeEnabled) return res.status(503).json({ error: "Runtime kedisiplinan asrama Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      return res.json(await resolveSupabaseBoardingDiscipline(actor, req.params.incidentId, req.body));
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.post("/api/boarding/discipline/migrate", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingDisciplineImportEnabled) return res.status(503).json({ error: "Impor kedisiplinan asrama belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      requireMasterDataAdmin(actor);
      const services = await getAdminServices();
      if (services.ok === false) return res.status(503).json({ error: "Sumber Firestore kedisiplinan lama belum dapat diakses." });
      const legacyTenantId = await getSupabaseTahfidzLegacyTenantKey(actor.tenantId);
      const snapshot = await services.db.collection("boarding_discipline")
        .where("tenantId", "==", legacyTenantId).limit(1001).get();
      if (snapshot.size > 1000) return res.status(413).json({ error: "Impor kedisiplinan dibatasi maksimal 1.000 record per tenant." });
      const sourceRows = snapshot.docs.map((doc) => ({ sourceId: doc.id, value: doc.data() as Record<string, any> }));
      const apply = req.body?.apply === true;
      if (apply && String(req.body?.confirmation || "") !== "IMPORT_BOARDING_DISCIPLINE") {
        return res.status(400).json({ error: "Konfirmasi impor kedisiplinan tidak cocok." });
      }
      const report = await migrateSupabaseLegacyBoardingDiscipline(actor, sourceRows, apply, String(req.body?.previewFingerprint || ""));
      if (apply && !report.canApply) return res.status(409).json(report);
      return res.json(report);
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.get("/api/boarding/attendance", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingAttendanceRuntimeEnabled) return res.status(503).json({ error: "Runtime kehadiran asrama Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      return res.json(await getSupabaseBoardingAttendance(actor, req.query.date));
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.post("/api/boarding/attendance", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingAttendanceRuntimeEnabled) return res.status(503).json({ error: "Runtime kehadiran asrama Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      return res.json(await setSupabaseBoardingAttendance(actor, req.body));
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.post("/api/boarding/attendance/migrate", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingAttendanceImportEnabled) return res.status(503).json({ error: "Impor kehadiran asrama belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      requireMasterDataAdmin(actor);
      const services = await getAdminServices();
      if (services.ok === false) return res.status(503).json({ error: "Sumber Firestore kehadiran lama belum dapat diakses." });
      const legacyTenantId = await getSupabaseTahfidzLegacyTenantKey(actor.tenantId);
      const snapshot = await services.db.collection("boarding_attendance")
        .where("tenantId", "==", legacyTenantId).limit(1001).get();
      if (snapshot.size > 1000) return res.status(413).json({ error: "Impor kehadiran dibatasi maksimal 1.000 record per tenant." });
      const sourceRows = snapshot.docs.map((doc) => ({ sourceId: doc.id, value: doc.data() as Record<string, any> }));
      const apply = req.body?.apply === true;
      if (apply && String(req.body?.confirmation || "") !== "IMPORT_BOARDING_ATTENDANCE") {
        return res.status(400).json({ error: "Konfirmasi impor kehadiran tidak cocok." });
      }
      const report = await migrateSupabaseLegacyBoardingAttendance(actor, req.body?.attendanceDate, sourceRows, apply, String(req.body?.previewFingerprint || ""));
      if (apply && !report.canApply) return res.status(409).json(report);
      return res.json(report);
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.get("/api/boarding/staff-assignments", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingAssignmentsRuntimeEnabled) return res.status(503).json({ error: "Runtime penugasan asrama Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      requireMasterDataAdmin(actor);
      return res.json(await listSupabaseBoardingStaffAssignments(actor));
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.post("/api/boarding/staff-assignments", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingAssignmentsRuntimeEnabled) return res.status(503).json({ error: "Runtime penugasan asrama Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      requireMasterDataAdmin(actor);
      const result = await setSupabaseBoardingStaffAssignment(actor, req.body);
      return res.json(result);
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.get("/api/boarding/facility-ops", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingFacilityOpsRuntimeEnabled) return res.status(503).json({ error: "Runtime audit dan tiket fasilitas Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      return res.json(await listSupabaseBoardingFacilityOps(actor));
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.post("/api/boarding/facility-ops/audits", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingFacilityOpsRuntimeEnabled) return res.status(503).json({ error: "Runtime audit fasilitas Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      const result = await createSupabaseBoardingCleanlinessAudit(actor, req.body);
      return res.status(result.alreadyApplied ? 200 : 201).json(result);
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.post("/api/boarding/facility-ops/tickets", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingFacilityOpsRuntimeEnabled) return res.status(503).json({ error: "Runtime tiket fasilitas Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      actor.name = String(actor.name || actor.email || "Pengguna");
      const result = await createSupabaseBoardingFacilityTicket(actor, req.body);
      return res.status(result.alreadyApplied ? 200 : 201).json(result);
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.post("/api/boarding/facility-ops/tickets/:ticketId/resolve", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingFacilityOpsRuntimeEnabled) return res.status(503).json({ error: "Runtime tiket fasilitas Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      return res.json(await resolveSupabaseBoardingFacilityTicket(actor, req.params.ticketId, req.body?.clientRequestId));
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.post("/api/boarding/facility-ops/migrate", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!boardingFacilityOpsImportEnabled) return res.status(503).json({ error: "Impor audit dan tiket fasilitas belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadMasterDataActor(uid, "boarding");
      requireMasterDataAdmin(actor);
      const services = await getAdminServices();
      if (services.ok === false) return res.status(503).json({ error: "Sumber Firestore asrama lama belum dapat diakses." });
      const legacyTenantId = await getSupabaseTahfidzLegacyTenantKey(actor.tenantId);
      const [auditSnapshot, ticketSnapshot] = await Promise.all([
        services.db.collection("boarding_audits").where("tenantId", "==", legacyTenantId).limit(1001).get(),
        services.db.collection("boarding_tickets").where("tenantId", "==", legacyTenantId).limit(1001).get(),
      ]);
      if (auditSnapshot.size > 1000 || ticketSnapshot.size > 1000) {
        return res.status(413).json({ error: "Impor dibatasi maksimal 1.000 audit dan 1.000 tiket per tenant." });
      }
      const audits = auditSnapshot.docs.map((document) => {
        const value = document.data() as Record<string, any>;
        return { ...value, sourceRecordId: String(value.id || document.id) };
      });
      const tickets = ticketSnapshot.docs.map((document) => {
        const value = document.data() as Record<string, any>;
        return { ...value, sourceRecordId: String(value.id || document.id) };
      });
      const apply = req.body?.apply === true;
      if (apply && String(req.body?.confirmation || "") !== "IMPORT_BOARDING_FACILITY_OPS") {
        return res.status(400).json({ error: "Konfirmasi impor audit dan tiket tidak cocok." });
      }
      const report = await migrateSupabaseLegacyBoardingFacilityOps(
        actor, audits, tickets, apply, String(req.body?.previewFingerprint || ""),
      );
      if (apply && !report.canApply) return res.status(409).json(report);
      return res.json(report);
    } catch (error) { return masterDataRouteError(res, error); }
  });

  app.get("/api/tahfidz/snapshot", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!tahfidzRuntimeEnabled) return res.status(503).json({ error: "Runtime Tahfidz Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadTahfidzActor(uid);
      return res.json(await listSupabaseTahfidzSnapshot(actor.tenantId, actor.uid, actor.role));
    } catch (error) { return tahfidzRouteError(res, error); }
  });

  app.get("/api/tahfidz/sessions", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!tahfidzRuntimeEnabled) return res.status(503).json({ error: "Runtime Tahfidz Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const kind = String(req.query.kind || "");
      if (kind !== "talaqqi" && kind !== "exam") return res.status(400).json({ error: "Jenis sesi Tahfidz tidak valid." });
      const actor = await loadTahfidzActor(uid);
      return res.json(await listSupabaseTahfidzSessions(actor.tenantId, actor.uid, actor.role, kind));
    } catch (error) { return tahfidzRouteError(res, error); }
  });

  app.post("/api/tahfidz/sessions", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!tahfidzRuntimeEnabled) return res.status(503).json({ error: "Runtime Tahfidz Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadTahfidzActor(uid);
      if (!["Admin", "SuperAdmin", "Ustadz"].includes(actor.role)) return res.status(403).json({ error: "Role ini hanya dapat melihat sesi Tahfidz." });
      const result = await mutateSupabaseTahfidzSession(actor.tenantId, actor.uid, actor.role, req.body?.session);
      return res.status(req.body?.session?.sessionId || result.alreadyApplied ? 200 : 201).json(result);
    } catch (error) { return tahfidzRouteError(res, error); }
  });

  app.post("/api/tahfidz/records", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!tahfidzRuntimeEnabled) return res.status(503).json({ error: "Runtime Tahfidz Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadTahfidzActor(uid);
      if (!["Admin", "SuperAdmin", "Ustadz"].includes(actor.role)) return res.status(403).json({ error: "Role tidak dapat mencatat setoran." });
      const result = await recordSupabaseTahfidzSetoran(actor.tenantId, actor.uid, actor.role, actor.name, req.body?.record);
      return res.status(result.alreadyRecorded ? 200 : 201).json(result);
    } catch (error) { return tahfidzRouteError(res, error); }
  });

  app.post("/api/tahfidz/targets", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!tahfidzRuntimeEnabled) return res.status(503).json({ error: "Runtime Tahfidz Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadTahfidzActor(uid);
      const result = await recordSupabaseTahfidzTarget(actor.tenantId, actor.uid, actor.role, req.body?.target);
      return res.status(result.alreadyApplied ? 200 : 201).json(result);
    } catch (error) { return tahfidzRouteError(res, error); }
  });

  app.post("/api/tahfidz/halaqahs", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!tahfidzRuntimeEnabled) return res.status(503).json({ error: "Runtime Tahfidz Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadTahfidzActor(uid);
      if (!["Admin", "SuperAdmin"].includes(actor.role)) return res.status(403).json({ error: "Hanya Admin pesantren yang dapat mengelola halaqah." });
      const result = await saveSupabaseTahfidzHalaqah(actor.tenantId, actor.uid, actor.role, req.body?.halaqah);
      return res.status(result.alreadyApplied || req.body?.halaqah?.id ? 200 : 201).json(result);
    } catch (error) { return tahfidzRouteError(res, error); }
  });

  app.post("/api/tahfidz/memberships", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!tahfidzRuntimeEnabled) return res.status(503).json({ error: "Runtime Tahfidz Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadTahfidzActor(uid);
      if (!["Admin", "SuperAdmin"].includes(actor.role)) return res.status(403).json({ error: "Hanya Admin pesantren yang dapat mengatur penempatan halaqah." });
      const result = await assignSupabaseTahfidzMembership(actor.tenantId, actor.uid, actor.role, req.body?.membership);
      return res.status(result.alreadyApplied || result.alreadyAssigned ? 200 : 201).json(result);
    } catch (error) { return tahfidzRouteError(res, error); }
  });

  app.post("/api/tahfidz/migration", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!tahfidzImportEnabled) return res.status(503).json({ error: "Impor Tahfidz Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadTahfidzActor(uid);
      if (!["Admin", "SuperAdmin"].includes(actor.role)) {
        return res.status(403).json({ error: "Hanya Admin tenant yang dapat memindahkan konfigurasi Tahfidz." });
      }
      const services = await getAdminServices();
      if (services.ok === false) return res.status(503).json({ error: "Sumber legacy Firestore untuk preview belum tersedia." });
      const legacyTenantId = await getSupabaseTahfidzLegacyTenantKey(actor.tenantId);
      const [halaqahSnapshot, studentSnapshot] = await Promise.all([
        services.db.collection("master_data").where("tenantId", "==", legacyTenantId).where("category", "==", "Halaqah").limit(2001).get(),
        services.db.collection("entityRecords").where("tenantId", "==", legacyTenantId).where("type", "==", "Santri").limit(5001).get(),
      ]);
      if (halaqahSnapshot.size > 2000 || studentSnapshot.size > 5000) {
        return res.status(413).json({ error: "Snapshot dibatasi maksimal 2.000 halaqah dan 5.000 santri." });
      }
      const halaqahRows = halaqahSnapshot.docs.map((doc) => ({ id: doc.id, record: doc.data() as Record<string, any> }));
      const studentRows = studentSnapshot.docs.map((doc) => ({ id: doc.id, record: doc.data() as Record<string, any> }));
      const apply = req.body?.apply === true;
      if (apply && String(req.body?.confirmation || "") !== "IMPORT_TAHFIDZ_CONFIGURATION") {
        return res.status(400).json({ error: "Konfirmasi impor Tahfidz tidak cocok." });
      }
      const report = await migrateSupabaseTahfidzConfiguration(
        actor.tenantId,
        halaqahRows,
        studentRows,
        apply,
        String(req.body?.previewFingerprint || "")
      );
      if (apply && !report.canApply) return res.status(409).json(report);
      return res.json(report);
    } catch (error) { return tahfidzRouteError(res, error); }
  });

  app.get("/api/communication/announcements", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!communicationRuntimeEnabled) return res.status(503).json({ error: "Runtime pengumuman Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCommunicationActor(uid);
      const announcements = await listCommunicationAnnouncements(actor.tenantId, actor);
      return res.json({ announcements });
    } catch (error) {
      return communicationRouteError(res, error);
    }
  });

  app.post("/api/communication/announcements", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!communicationRuntimeEnabled) return res.status(503).json({ error: "Runtime pengumuman Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCommunicationActor(uid);
      const announcement = await createCommunicationAnnouncement(actor.tenantId, actor, req.body || {});
      return res.status(201).json({ announcement });
    } catch (error) {
      return communicationRouteError(res, error);
    }
  });

  app.post("/api/communication/announcements/:announcementId/acknowledge", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!communicationRuntimeEnabled) return res.status(503).json({ error: "Runtime pengumuman Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCommunicationActor(uid);
      const result = await acknowledgeCommunicationAnnouncement(actor.tenantId, actor, String(req.params.announcementId || ""));
      return res.json(result);
    } catch (error) {
      return communicationRouteError(res, error);
    }
  });

  app.post("/api/communication/announcements/migrate", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!communicationImportEnabled) return res.status(503).json({ error: "Impor pengumuman Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadCommunicationActor(uid);
      if (!['Admin', 'SuperAdmin'].includes(String(actor.role))) {
        return res.status(403).json({ error: "Hanya Admin tenant yang dapat mengimpor pengumuman." });
      }
      const services = await getAdminServices();
      if (services.ok === false) return res.status(503).json({ error: "Sumber Firestore untuk preview migrasi belum tersedia." });
      const snapshot = await services.db.collection("communication_announcements")
        .where("tenantId", "==", actor.tenantId)
        .limit(501)
        .get();
      if (snapshot.size > 500) return res.status(413).json({ error: "Impor pengumuman dibatasi maksimal 500 record per preview." });
      const sourceRows = snapshot.docs.map((doc) => ({ sourceId: doc.id, value: doc.data() as Record<string, any> }));
      const preview = await previewLegacyCommunicationAnnouncements(actor.tenantId, actor, sourceRows);
      const summary = {
        previewFingerprint: preview.fingerprint,
        scanned: sourceRows.length,
        ready: preview.rows.length,
        blockingIssues: preview.issues,
        warnings: preview.warnings,
        canApply: preview.issues.length === 0,
      };

      if (req.body?.apply !== true) return res.json(summary);
      if (String(req.body?.confirmation || '') !== 'IMPORT_COMMUNICATION_ANNOUNCEMENTS') {
        return res.status(400).json({ error: "Konfirmasi impor pengumuman tidak cocok." });
      }
      if (String(req.body?.previewFingerprint || '') !== preview.fingerprint) {
        return res.status(409).json({ error: "Snapshot atau pemetaan akun berubah sejak preview. Jalankan preview baru." });
      }
      if (preview.issues.length) {
        return res.status(409).json({ error: "Preview memiliki record yang perlu direkonsiliasi sebelum impor." });
      }
      const result = await applyLegacyCommunicationAnnouncements(preview, actor);
      return res.json({ ok: true, scanned: sourceRows.length, ...result, warnings: preview.warnings });
    } catch (error) {
      return communicationRouteError(res, error);
    }
  });

  // AI/OCR routes remain closed until auth, tenant scope, and rate limits are enforced.
  const unavailableUntilAuth = (_req: any, res: any) => {
    res.setHeader("Retry-After", "3600");
    return res.status(503).json({
      code: "AI_ENDPOINTS_UNAVAILABLE",
      error: "Endpoint AI/OCR dinonaktifkan sampai autentikasi server dan pembatasan akses aktif."
    });
  };

  app.post("/api/ai-search", unavailableUntilAuth);
  app.post("/api/header-ai-search", unavailableUntilAuth);
  app.post("/api/ocr", unavailableUntilAuth);

  const systemSettingsRuntimeEnabled = String(process.env.SUPABASE_SYSTEM_SETTINGS_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  const systemSettingsImportEnabled = String(process.env.SUPABASE_SYSTEM_SETTINGS_IMPORT_ENABLED || "").trim().toLowerCase() === "true";
  const loadSettingsActor = async (uid: string) => {
    const profile = await getUserProfile(uid);
    if (!profile) return null;
    const tenantId = String(profile.tenantId || "").trim();
    if (String(profile.status || "").toLowerCase() !== "active" || !tenantId) return null;
    return { ...profile, tenantId };
  };
  const systemSettingsRouteError = (res: express.Response, error: unknown) => {
    if (error instanceof IdentityUnavailableError) return res.status(503).json({ error: "Profil Supabase belum dapat diverifikasi." });
    if (error instanceof SystemSettingsStoreError) return res.status(error.status).json({ error: error.message });
    console.error("Supabase system settings endpoint failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Pengaturan tenant belum dapat diproses." });
  };

  app.get("/api/system/settings", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!systemSettingsRuntimeEnabled) return res.status(503).json({ error: "Runtime pengaturan Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadSettingsActor(uid);
      if (!actor) return res.status(403).json({ error: "Profil aktif dengan tenant valid diperlukan." });
      const saved = await getTenantSystemSettings(actor.tenantId);
      const settings = saved?.settings || null;
      if (actor.role !== "SuperAdmin" && settings) {
        delete settings.integrations;
        delete settings.permissions;
      }
      return res.json({ settings, updatedAt: saved?.updatedAt || null });
    } catch (error) {
      return systemSettingsRouteError(res, error);
    }
  });

  app.put("/api/system/settings", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!systemSettingsRuntimeEnabled) return res.status(503).json({ error: "Runtime pengaturan Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadSettingsActor(uid);
      if (!actor) return res.status(403).json({ error: "Profil aktif dengan tenant valid diperlukan." });
      if (actor.role !== "SuperAdmin" || !resolveUserModulePermissions(actor.role, actor.modulePermissions).settings) {
        return res.status(403).json({ error: "Hanya SuperAdmin yang dapat mengubah pengaturan sistem." });
      }
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, "expectedUpdatedAt")) {
        return res.status(400).json({ error: "Versi pengaturan yang dibaca wajib dikirim sebelum menyimpan." });
      }
      const expectedValue = req.body?.expectedUpdatedAt;
      const isTimestamp = typeof expectedValue === "string"
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(expectedValue)
        && Number.isFinite(Date.parse(expectedValue));
      if (expectedValue !== null && !isTimestamp) {
        return res.status(400).json({ error: "Versi pengaturan tidak valid. Muat ulang sebelum menyimpan." });
      }
      // Preserve the exact Postgres timestamp text: converting through Date would truncate microseconds.
      const expectedUpdatedAt = typeof expectedValue === "string" ? expectedValue : null;
      const saved = await saveTenantSystemSettings(actor.tenantId, actor.uid, expectedUpdatedAt, req.body?.settings);
      return res.json(saved);
    } catch (error) {
      return systemSettingsRouteError(res, error);
    }
  });

  app.post("/api/system/settings/migrate", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!systemSettingsImportEnabled) return res.status(503).json({ error: "Impor pengaturan Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadSettingsActor(uid);
      if (!actor || actor.role !== "SuperAdmin") return res.status(403).json({ error: "Hanya SuperAdmin tenant yang dapat mengimpor pengaturan." });
      const services = await getAdminServices();
      if (services.ok === false) return res.status(503).json({ error: "Sumber Firestore pengaturan lama belum dapat diakses." });
      const legacySnapshot = await services.db.collection("tenants").doc(actor.tenantId)
        .collection("settings").doc("global").get();
      const legacySource = legacySnapshot.exists ? legacySnapshot.data() || {} : {};
      const sanitizedSettings = sanitizeTenantSettings(legacySource);
      const sourceFingerprint = createHash("sha256")
        .update(JSON.stringify({ tenantId: actor.tenantId, exists: legacySnapshot.exists, settings: sanitizedSettings }))
        .digest("hex");
      const preview = {
        sourceExists: legacySnapshot.exists,
        previewFingerprint: sourceFingerprint,
        settings: sanitizedSettings,
        canApply: true,
      };
      if (req.body?.apply !== true) return res.json(preview);
      if (String(req.body?.confirmation || "") !== "IMPORT_TENANT_SYSTEM_SETTINGS") {
        return res.status(400).json({ error: "Konfirmasi impor pengaturan tidak cocok." });
      }
      if (String(req.body?.previewFingerprint || "") !== sourceFingerprint) {
        return res.status(409).json({ error: "Sumber atau pengaturan berubah sejak preview. Jalankan preview ulang." });
      }
      const result = await importLegacyTenantSystemSettings(actor.tenantId, actor.uid, sourceFingerprint, sanitizedSettings);
      return res.json({ ...preview, ...result, importedAt: new Date().toISOString() });
    } catch (error) {
      return systemSettingsRouteError(res, error);
    }
  });

  // Remove legacy browser-visible secrets before a client may subscribe to tenant settings.
  app.post("/api/system/settings/prepare", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (String(process.env.LEGACY_FIREBASE_SETTINGS_CLEANUP_ENABLED || "").trim().toLowerCase() !== "true") {
      return res.status(410).json({ error: "Pembersihan settings Firebase legacy dinonaktifkan dari runtime. Gunakan prosedur migrasi terkontrol." });
    }
    const services = await getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: "Backend pengamanan settings belum tersedia." });
    try {
      const uid = (req as any).user?.uid;
      const profile = await getUserProfile(uid);
      const tenantId = typeof profile?.tenantId === "string" ? profile.tenantId.trim() : "";
      if (!profile || String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
        return res.status(403).json({ error: "Profil aktif dengan tenant valid diperlukan." });
      }
      if (profile.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Pembersihan settings legacy hanya dapat dijalankan oleh SuperAdmin." });
      }
      const settingsRef = services.db.collection("tenants").doc(tenantId).collection("settings").doc("global");
      const settingsSnapshot = await settingsRef.get();
      if (settingsSnapshot.exists) {
        const settings = settingsSnapshot.data() || {};
        if (settings.tenantId !== tenantId) return res.status(409).json({ error: "Tenant pada settings tidak cocok." });
        const integrations = settings.integrations && typeof settings.integrations === "object" ? settings.integrations : {};
        const patch: Record<string, any> = {};
        const FieldValue = await loadFirestoreFieldValue();
        ["waGatewayKey", "paymentGatewayKey", "smtpPassword", "smtpPass"].forEach((field) => {
          if (Object.prototype.hasOwnProperty.call(integrations, field)) patch["integrations." + field] = FieldValue.delete();
        });
        if (Object.keys(patch).length) {
          patch.updatedAt = new Date().toISOString();
          await settingsRef.update(patch);
        }
      }
      return res.json({ ok: true });
    } catch (error: any) {
      console.error("Legacy integration secret cleanup failed:", error?.code || "internal");
      return res.status(503).json({ error: "Server belum dapat membersihkan secret integrasi lama." });
    }
  });

  const searchFeedbackRuntimeEnabled = String(process.env.SUPABASE_SEARCH_FEEDBACK_RUNTIME_ENABLED || "").trim().toLowerCase() === "true";
  app.post("/api/search/feedback", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!searchFeedbackRuntimeEnabled) return res.status(503).json({ error: "Penyimpanan feedback Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadSettingsActor(uid);
      if (!actor) return res.status(403).json({ error: "Profil aktif dengan tenant valid diperlukan." });
      const ratingValue = req.body?.rating;
      if (ratingValue !== "up" && ratingValue !== "down") return res.status(400).json({ error: "Rating feedback tidak valid." });
      const requestId = typeof req.body?.requestId === "string" ? req.body.requestId.trim() : "";
      const result = await recordTenantSearchFeedback(actor.tenantId, actor.uid, requestId, ratingValue === "up" ? 1 : -1);
      return res.json(result);
    } catch (error) {
      if (error instanceof SearchFeedbackStoreError) return res.status(error.status).json({ error: error.message });
      console.error("Search feedback endpoint failed:", error instanceof Error ? error.message : "unknown error");
      return res.status(503).json({ error: "Feedback belum dapat disimpan." });
    }
  });


  // Local data is migrated only after an authenticated tenant admin explicitly submits a reviewed dataset.
  app.post('/api/data-migrations/local-storage', requireAuth, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(410).json({ error: 'Impor browser lama ke Firestore telah dinonaktifkan. Gunakan alur impor tenant Supabase yang memiliki preview dan rekonsiliasi.' });
  });

  // Public PPDB is served only by this trusted server. Tenant identity is fixed in server configuration.
  app.get("/api/public/ppdb/config", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!supabasePublicPpdbRuntimeEnabled) return res.status(503).json({ error: "Pendaftaran PPDB Supabase belum disiapkan; pendaftaran belum dapat dibuka." });
    if (!publicPpdbEnabled) return res.status(503).json({ error: "Pendaftaran PPDB online belum diaktifkan oleh pengelola pesantren." });
    try {
      const config = await getSupabasePublicPpdbConfig(String(process.env.PUBLIC_PPDB_TENANT_ID || ""));
      return res.json({ academicYear: config.academicYear, orgInfo: config.orgInfo, documentUploadEnabled: true });
    } catch (err: any) {
      const status = Number(err?.status) || 503;
      return res.status(status).json({ error: status === 503 ? "Konfigurasi PPDB Supabase belum tersedia." : err.message });
    }
  });

  app.post("/api/public/ppdb/registrations", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const clientKey = String(req.ip || req.socket.remoteAddress || "unknown");
    if (!supabasePublicPpdbRuntimeEnabled) return res.status(503).json({ error: "Pendaftaran PPDB Supabase belum disiapkan; pendaftaran belum dapat dibuka." });
    if (!publicPpdbEnabled) return res.status(503).json({ error: "Pendaftaran PPDB online belum diaktifkan oleh pengelola pesantren." });
    if (!consumePublicPpdbRateLimit(clientKey)) {
      res.setHeader("Retry-After", "900");
      return res.status(429).json({ error: "Batas pendaftaran sementara tercapai. Silakan coba lagi 15 menit kemudian." });
    }
    try {
      return res.status(201).json(await submitSupabasePublicPpdbRegistration(
        String(process.env.PUBLIC_PPDB_TENANT_ID || ""), clientKey, req.body,
      ));
    } catch (err: any) {
      const status = Number(err?.status) || 500;
      if (status === 429) res.setHeader("Retry-After", "900");
      if (status >= 500) console.error("Supabase public PPDB registration failed:", err?.name || "error");
      return res.status(status).json({ error: status === 500 ? "Pendaftaran gagal diproses. Silakan coba kembali atau hubungi panitia." : err.message || "Pendaftaran belum dapat diproses." });
    }
  });

  // Payment proof bytes and billing metadata are handled only by this authenticated backend.
  app.post("/api/finance/payment-proofs", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!financeRuntimeEnabled) return res.status(503).json({ error: "Upload bukti pembayaran Supabase belum disiapkan; penyimpanan lama telah dinonaktifkan." });
    const uid = String((req as any).user?.uid || "");
    if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
    if (String(process.env.SUPABASE_FINANCE_PROOF_STORAGE_RUNTIME_ENABLED || "").trim().toLowerCase() !== "true") {
      return res.status(503).json({ error: "Storage bukti pembayaran Supabase belum diaktifkan operator." });
    }
    let uploadedPath = "";
    try {
        const actor = await loadFinanceProofActor(uid);
        const billingId = typeof req.body?.billingId === "string" ? req.body.billingId.trim() : "";
        if (!billingId || billingId.length > 150) return res.status(400).json({ error: "ID tagihan tidak valid." });
        const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "";
        if (!["image/png", "image/jpeg", "application/pdf"].includes(mimeType)) return res.status(400).json({ error: "Format bukti harus PNG, JPG, atau PDF." });
        const base64 = typeof req.body?.base64 === "string" ? req.body.base64 : "";
        const maxBytes = 3 * 1024 * 1024;
        const maxEncodedLength = Math.ceil(maxBytes / 3) * 4;
        if (!base64 || base64.length > maxEncodedLength || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return res.status(400).json({ error: "Ukuran atau encoding berkas tidak valid. Maksimal 3 MB." });
        const bytes = Buffer.from(base64, "base64");
        if (!bytes.length || bytes.length > maxBytes || bytes.toString("base64") !== base64 || detectPaymentProofMime(bytes) !== mimeType) return res.status(400).json({ error: "Isi berkas tidak cocok dengan tipe PNG, JPG, atau PDF." });
        const payChannel = typeof req.body?.payChannel === "string" ? req.body.payChannel.trim() : "";
        if (!["BSI", "Muamalat", "MandiriSyariah"].includes(payChannel)) return res.status(400).json({ error: "Metode transfer tidak valid." });
        const billing = await getSupabaseFinanceBill(actor.tenantId, billingId);
        if (actor.role === "Walisantri" && (!actor.linkedSantriId || actor.linkedSantriId !== String(billing.student_id))) return res.status(404).json({ error: "Tagihan tidak ditemukan pada tenant ini." });
        const requestId = typeof req.body?.clientRequestId === "string" ? req.body.clientRequestId : "";
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return res.status(400).json({ error: "Kunci unggahan pembayaran tidak valid." });
        if (!consumePaymentProofUploadLimit(uid)) {
          res.setHeader("Retry-After", "900");
          return res.status(429).json({ error: "Batas unggahan bukti pembayaran sementara tercapai." });
        }
        const safeName = safePaymentProofName(req.body?.fileName);
        const safeSantriId = String(billing.student_id || "unlinked");
        uploadedPath = "financeProofs/" + encodeURIComponent(actor.tenantId) + "/" + encodeURIComponent(safeSantriId) + "/" + encodeURIComponent(billingId) + "/" + uid + "-" + Date.now() + "-" + randomUUID() + "-" + safeName;
        await uploadSupabaseFinanceProof(uploadedPath, bytes, mimeType);
        const fileSha256 = createHash("sha256").update(bytes).digest("hex");
        const result = await registerSupabaseFinanceProof(actor.tenantId, uid, actor.role, billingId, uploadedPath, safeName, payChannel, fileSha256, requestId);
        const alreadyApplied = result.alreadyApplied === true;
        const savedBill = alreadyApplied ? await getSupabaseFinanceBill(actor.tenantId, billingId) : null;
        if (alreadyApplied) { try { await deleteSupabaseFinanceProof(uploadedPath); } catch { /* The referenced original remains private and readable. */ } }
        return res.status(alreadyApplied ? 200 : 201).json({ ok: true, alreadyApplied, proofFile: alreadyApplied ? savedBill?.proof_file : safeName, proofStoragePath: alreadyApplied ? savedBill?.proof_storage_path : uploadedPath, proofStorageProvider: "supabase" });
    } catch (error: any) {
      if (uploadedPath) { try { await deleteSupabaseFinanceProof(uploadedPath); } catch { /* Best-effort cleanup after a failed metadata transaction. */ } }
      if (error instanceof FinanceProofStorageError || error?.status) return res.status(Number(error.status) || 503).json({ error: error.message || "Bukti pembayaran gagal disimpan." });
      console.error("Supabase payment proof upload failed:", error?.code || "internal");
      return res.status(500).json({ error: "Bukti pembayaran gagal disimpan. Silakan coba kembali." });
    }
  });

  app.get("/api/finance/payment-proofs/:billingId", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (!financeRuntimeEnabled) return res.status(503).json({ error: "Bukti pembayaran Supabase belum disiapkan; penyimpanan lama telah dinonaktifkan." });
    try {
        const uid = String((req as any).user?.uid || "");
        if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
        const actor = await loadFinanceProofActor(uid);
        const billingId = typeof req.params.billingId === "string" ? req.params.billingId.trim() : "";
        if (!billingId || billingId.length > 150) return res.status(400).json({ error: "ID tagihan tidak valid." });
        const billing = await getSupabaseFinanceBill(actor.tenantId, billingId);
        if (actor.role === "Walisantri" && (!actor.linkedSantriId || actor.linkedSantriId !== String(billing.student_id))) return res.status(404).json({ error: "Bukti transfer tidak ditemukan." });
        if (billing.proof_storage_provider !== "supabase" || typeof billing.proof_storage_path !== "string") return res.status(404).json({ error: "Bukti transfer tidak ditemukan." });
        const safeSantriId = String(billing.student_id || "unlinked");
        const expectedPrefix = "financeProofs/" + encodeURIComponent(actor.tenantId) + "/" + encodeURIComponent(safeSantriId) + "/" + encodeURIComponent(billingId) + "/";
        if (!billing.proof_storage_path.startsWith(expectedPrefix) || billing.proof_storage_path.includes("..")) return res.status(404).json({ error: "Bukti transfer tidak ditemukan." });
        const proof = await downloadSupabaseFinanceProof(billing.proof_storage_path);
        if (!["image/png", "image/jpeg", "application/pdf"].includes(proof.contentType)) return res.status(415).json({ error: "Tipe berkas bukti tidak didukung." });
        res.setHeader("Content-Disposition", 'inline; filename="' + safePaymentProofName(billing.proof_file) + '"');
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Type", proof.contentType);
        return res.end(proof.bytes);
    } catch (error: any) {
      if (error instanceof FinanceProofStorageError || error?.status) return res.status(Number(error.status) || 503).json({ error: error.message || "Bukti transfer tidak dapat dibuka." });
      console.error("Supabase payment proof download failed:", error?.code || "internal");
      return res.status(500).json({ error: "Bukti pembayaran tidak dapat dibuka." });
    }
  });

  // --------------------------------------------------------------------------
  // USER MANAGEMENT ENDPOINTS
  // --------------------------------------------------------------------------

  // HRIS core runtime: employee directory and attendance are tenant scoped.
  app.get("/api/hris/snapshot", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!hrisRuntimeEnabled) return res.status(503).json({ error: "Runtime HRIS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadHrisActor(uid);
      return res.json(await listSupabaseHrisSnapshot(actor.tenantId));
    } catch (error) { return hrisRouteError(res, error); }
  });

  app.post("/api/hris/employees", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!hrisRuntimeEnabled) return res.status(503).json({ error: "Runtime HRIS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadHrisActor(uid);
      return res.json(await upsertSupabaseHrisEmployee(actor.tenantId, actor.uid, req.body?.employee));
    } catch (error) { return hrisRouteError(res, error); }
  });

  app.post("/api/hris/attendance", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!hrisRuntimeEnabled) return res.status(503).json({ error: "Runtime HRIS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadHrisActor(uid);
      return res.json(await recordSupabaseHrisAttendance(actor.tenantId, actor.uid, req.body));
    } catch (error) { return hrisRouteError(res, error); }
  });

  app.post("/api/hris/leave-requests", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!hrisRuntimeEnabled) return res.status(503).json({ error: "Runtime HRIS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadHrisActor(uid);
      return res.status(201).json(await requestSupabaseHrisLeave(actor.tenantId, actor.uid, req.body?.leaveRequest));
    } catch (error) { return hrisRouteError(res, error); }
  });

  app.post("/api/hris/leave-requests/:leaveRequestId/review", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!hrisRuntimeEnabled) return res.status(503).json({ error: "Runtime HRIS Supabase belum diaktifkan operator." });
    try {
      const uid = String((req as any).user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadHrisActor(uid);
      return res.json(await reviewSupabaseHrisLeave(actor.tenantId, actor.uid, {
        ...(req.body || {}), leaveRequestId: req.params.leaveRequestId,
      }));
    } catch (error) { return hrisRouteError(res, error); }
  });

  // 1. List / Search Users for acting admin's tenant
  app.get("/api/users", requireAuth, requireTenantAdmin, async (req, res) => {
    const actor = (req as any).actor;

    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
      const roleFilter = typeof req.query.role === "string" ? req.query.role.trim() : "";
      const statusFilter = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";

      const profiles = await listTenantProfiles(actor.tenantId);
      let users = profiles.map((data) => ({
        uid: data.uid,
        id: data.uid,
        name: data.name || "",
        email: data.email || "",
        username: data.username || "",
        role: data.role || "Santri",
        status: data.status || "active",
        tenantId: data.tenantId,
        tenantName: data.tenantName,
        mustChangePassword: Boolean(data.mustChangePassword),
        modulePermissions: resolveUserModulePermissions(data.role, data.modulePermissions),
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        linkedSantriId: data.linkedSantriId || null,
        linkedSantriName: data.linkedSantriName || null,
        linkedSantriNis: data.linkedSantriNis || null,
      }));

      // Filter in memory for search query and role/status
      if (q) {
        users = users.filter((u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q)
        );
      }
      if (roleFilter) {
        users = users.filter((u) => u.role === roleFilter);
      }
      if (statusFilter) {
        users = users.filter((u) => u.status.toLowerCase() === statusFilter);
      }

      // Sort by name or createdAt
      users.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

      return res.json({ users, total: users.length });
    } catch (err: any) {
      const unavailable = identityFailure(res, err);
      if (unavailable) return unavailable;
      return res.status(500).json({ code: "INTERNAL_ERROR", error: "Gagal memuat daftar pengguna tenant." });
    }
  });

  // 2. Create User (Staff / Student / Guardian)
  app.post("/api/users", requireAuth, requireTenantAdmin, async (req, res) => {
    const actor = (req as any).actor;

    const {
      email,
      name,
      role,
      tempPassword,
      modulePermissions,
      username,
      linkedSantriId,
      linkedSantriName,
      linkedSantriNis,
      linkedSantriClass,
      linkedSantriRoom,
    } = req.body || {};

    // Validate email
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ code: "INVALID_EMAIL", error: "Alamat email tidak valid." });
    }

    // Validate name
    const normalizedName = typeof name === "string" ? name.trim() : "";
    if (!normalizedName || normalizedName.length < 2) {
      return res.status(400).json({ code: "INVALID_NAME", error: "Nama pengguna minimal 2 karakter." });
    }

    // Validate temporary password (min 12 chars, never write to logs or firestore)
    if (typeof tempPassword !== "string" || tempPassword.length < 12) {
      return res.status(400).json({
        code: "INVALID_PASSWORD",
        error: "Kata sandi sementara harus memiliki panjang minimal 12 karakter."
      });
    }

    // Validate role and enforce hierarchy:
    // "Admin must not grant SuperAdmin; only SuperAdmin may grant Admin."
    const allowedRoles = ["SuperAdmin", "Admin", "Ustadz", "Santri", "Walisantri"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ code: "INVALID_ROLE", error: "Role yang dipilih tidak valid." });
    }

    if (actor.role === "Admin") {
      if (role === "SuperAdmin" || role === "Admin") {
        return res.status(403).json({
          code: "FORBIDDEN_ROLE_ASSIGNMENT",
          error: "Admin tidak berwenang memberikan role SuperAdmin atau Admin. Hanya SuperAdmin yang berwenang mengangkat Admin."
        });
      }
    }

    // Module Permissions calculation:
    // SuperAdmin gets all access and its permissions cannot be reduced.
    // Tenant Admin gets all tenant-scoped modules by default, settings is locked out.
    // Ensure actor cannot grant platform-only module 'settings' (Admin boundary).
    const finalPermissions: Record<string, boolean> = {};

    if (role === "SuperAdmin") {
      ALL_SYSTEM_MODULES.forEach((modId) => {
        finalPermissions[modId] = true;
      });
    } else {
      ALL_SYSTEM_MODULES.forEach((modId) => {
        if (PLATFORM_ONLY_MODULES.includes(modId)) {
          finalPermissions[modId] = false;
          return;
        }
        if (modulePermissions && typeof modulePermissions === "object" && modId in modulePermissions) {
          finalPermissions[modId] = Boolean(modulePermissions[modId]);
        } else {
          finalPermissions[modId] = (DEFAULT_ROLE_MODULES[role] || []).includes(modId);
        }
      });
      // Safety: actor cannot grant modules outside their boundary (Admin cannot grant settings)
      if (actor.role === "Admin") {
        finalPermissions["settings"] = false;
      }
    }

    try {
      const userProfile = await createAuthUserWithProfile({
        email: normalizedEmail,
        password: tempPassword,
        name: normalizedName,
        username: typeof username === "string" && username.trim() ? username.trim() : normalizedEmail.split("@")[0],
        role,
        tenantId: actor.tenantId,
        tenantName: actor.tenantName || actor.tenantId,
        modulePermissions: finalPermissions,
        createdByUid: actor.uid,
        linkedSantriId,
        linkedSantriName,
        linkedSantriNis,
        linkedSantriClass,
        linkedSantriRoom,
      });

      return res.status(201).json({
        success: true,
        user: userProfile,
      });
    } catch (err: any) {
      const unavailable = identityFailure(res, err);
      if (unavailable) return unavailable;
      return res.status(400).json({ code: "CREATION_FAILED", error: "Gagal membuat akun pengguna." });
    }
  });

  // 3. Update User (Role, Status, Module Permissions, Name)
  app.patch("/api/users/:uid", requireAuth, requireTenantAdmin, async (req, res) => {
    const actor = (req as any).actor;
    const targetUid = req.params.uid;

    try {
      const targetData = await getUserProfile(targetUid);
      if (!targetData) {
        return res.status(404).json({ code: "NOT_FOUND", error: "Pengguna tidak ditemukan." });
      }

      // Tenant match constraint
      if (targetData.tenantId !== actor.tenantId) {
        return res.status(403).json({ code: "FORBIDDEN", error: "Akses ditolak: pengguna berada di luar tenant Anda." });
      }

      const { name, role, status, modulePermissions } = req.body || {};

      // Prevent actor from disabling or demoting their own account
      if (targetUid === actor.uid) {
        if (status && String(status).toLowerCase() !== "active") {
          return res.status(400).json({ code: "SELF_DISABLE_FORBIDDEN", error: "Anda tidak dapat menonaktifkan akun Anda sendiri." });
        }
        if (role && role !== actor.role) {
          return res.status(400).json({ code: "SELF_DEMOTE_FORBIDDEN", error: "Anda tidak dapat mengubah role akun Anda sendiri." });
        }
      }

      // Hierarchy constraint: Admin cannot modify SuperAdmin or other Admin accounts
      if (actor.role === "Admin") {
        if (targetData.role === "SuperAdmin" || (targetData.role === "Admin" && targetUid !== actor.uid)) {
          return res.status(403).json({
            code: "FORBIDDEN",
            error: "Admin tidak berwenang mengedit akun SuperAdmin atau Admin lainnya."
          });
        }
        if (role && (role === "SuperAdmin" || role === "Admin")) {
          return res.status(403).json({
            code: "FORBIDDEN",
            error: "Hanya SuperAdmin yang dapat mengangkat role Admin atau SuperAdmin."
          });
        }
      }

      const updates: Record<string, any> = {
        updatedAt: new Date().toISOString(),
        updatedByUid: actor.uid,
      };

      if (typeof name === "string" && name.trim()) {
        updates.name = name.trim();
      }

      let newRole = targetData.role;
      if (role && ["SuperAdmin", "Admin", "Ustadz", "Santri", "Walisantri"].includes(role)) {
        updates.role = role;
        newRole = role;
      }

      if (status && ["active", "disabled", "inactive"].includes(String(status).toLowerCase())) {
        const normalizedStatus = String(status).toLowerCase();
        updates.status = normalizedStatus;
      }

      // Module permissions handling
      if (newRole === "SuperAdmin") {
        // SuperAdmin gets all access and its permissions cannot be reduced
        const fullPerms: Record<string, boolean> = {};
        ALL_SYSTEM_MODULES.forEach((m) => { fullPerms[m] = true; });
        updates.modulePermissions = fullPerms;
      } else if (modulePermissions && typeof modulePermissions === "object") {
        const merged: Record<string, boolean> = { ...(targetData.modulePermissions || {}) };
        ALL_SYSTEM_MODULES.forEach((m) => {
          if (PLATFORM_ONLY_MODULES.includes(m)) {
            merged[m] = false;
            return;
          }
          if (modulePermissions[m] !== undefined) {
            merged[m] = Boolean(modulePermissions[m]);
          } else if (merged[m] === undefined) {
            merged[m] = (DEFAULT_ROLE_MODULES[newRole] || []).includes(m);
          }
        });
        if (actor.role === "Admin") {
          merged["settings"] = false;
        }
        updates.modulePermissions = merged;
      }

      const statusChanged = typeof updates.status === "string";
      const wasDisabled = String(targetData.status || "active").toLowerCase() !== "active";
      if (statusChanged) await setAuthDisabled(targetUid, updates.status !== "active");
      try {
        await updateUserProfile(targetUid, {
          name: updates.name,
          role: updates.role,
          status: updates.status,
          modulePermissions: updates.modulePermissions,
          updatedByUid: actor.uid,
        });
      } catch (profileError) {
        if (statusChanged) {
          try { await setAuthDisabled(targetUid, wasDisabled); }
          catch { console.error("Could not compensate Supabase Auth ban after profile update failure."); }
        }
        throw profileError;
      }

      return res.json({
        success: true,
        user: { ...targetData, ...updates, uid: targetUid },
      });
    } catch (err: any) {
      const unavailable = identityFailure(res, err);
      if (unavailable) return unavailable;
      return res.status(500).json({ code: "UPDATE_FAILED", error: "Gagal memperbarui data pengguna." });
    }
  });

  // 4. Prepare a password recovery link for an account in the acting tenant.
  app.post("/api/users/:uid/reset-password", requireAuth, requireTenantAdmin, async (req, res) => {
    const actor = (req as any).actor;
    const targetUid = req.params.uid;

    try {
      const targetData = await getUserProfile(targetUid);
      if (!targetData) {
        return res.status(404).json({ code: "NOT_FOUND", error: "Pengguna tidak ditemukan." });
      }

      if (targetData.tenantId !== actor.tenantId) {
        return res.status(403).json({ code: "FORBIDDEN", error: "Pengguna berada di luar tenant Anda." });
      }

      if (!targetData.email) {
        return res.status(400).json({ code: "NO_EMAIL", error: "Pengguna tidak memiliki alamat email terdaftar." });
      }

      const link = await createRecoveryLink(targetData.email);

      return res.json({
        success: true,
        message: `Tautan reset kata sandi berhasil disiapkan untuk ${targetData.email}.`,
        resetLink: link,
      });
    } catch (err: any) {
      const unavailable = identityFailure(res, err);
      if (unavailable) return unavailable;
      return res.status(500).json({ code: "RESET_FAILED", error: "Gagal membuat tautan reset password." });
    }
  });

  // 5. Clear mustChangePassword (Self-Authenticated endpoint)
  app.post("/api/users/clear-must-change-password", requireAuth, async (req, res) => {
    const uid = (req as any).user?.uid;

    try {
      const profile = await getUserProfile(uid);
      if (!profile) {
        return res.status(404).json({ code: "NOT_FOUND", error: "Profil pengguna tidak ditemukan." });
      }

      await clearPasswordChangeRequired(uid);

      return res.json({ success: true, message: "Status mustChangePassword berhasil dihapus." });
    } catch (err: any) {
      const unavailable = identityFailure(res, err);
      if (unavailable) return unavailable;
      return res.status(500).json({ code: "CLEAR_FAILED", error: "Gagal memperbarui status kata sandi pengguna." });
    }
  });

  // --------------------------------------------------------------------------
  // WILAYAH & QURAN API PROXIES
  // --------------------------------------------------------------------------
  app.get("/api/wilayah/provinces", async (_req, res) => {
    try {
      const response = await fetch("https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json");
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/wilayah/regencies/:provinceId", async (req, res) => {
    try {
      const response = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${req.params.provinceId}.json`);
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/wilayah/districts/:regencyId", async (req, res) => {
    try {
      const response = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/districts/${req.params.regencyId}.json`);
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/wilayah/villages/:districtId", async (req, res) => {
    try {
      const response = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/villages/${req.params.districtId}.json`);
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/quran/surat", async (_req, res) => {
    try {
      const response = await fetch("https://equran.id/api/v2/surat");
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/quran/surat/:nomor", async (req, res) => {
    try {
      const response = await fetch(`https://equran.id/api/v2/surat/${req.params.nomor}`);
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
