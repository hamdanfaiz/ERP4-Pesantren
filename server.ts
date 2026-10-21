import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { App, initializeApp, applicationDefault } from "firebase-admin/app";
import { Auth, getAuth } from "firebase-admin/auth";
import { FieldPath, FieldValue, Firestore, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { loadSupabasePublicPpdbConfig, PublicPpdbError, registerSupabasePublicPpdb } from "./server/supabasePublicPpdb";
import { SupabasePpdbAdminError, createSupabasePpdbCandidate, listSupabasePpdbCandidates, updateSupabasePpdbCandidate, updateSupabasePpdbCandidatesBatch, uploadSupabasePpdbCandidateDocument } from "./server/supabasePpdbAdmin";
import { listSupabaseBoardingSnapshot, assignSupabaseStudentRoom, deleteSupabaseMasterDataStructure, getSupabaseNextSantriNis, listSupabaseMasterDataStructures, listSupabaseMasterDataStudents, upsertSupabaseMasterDataStudent, archiveSupabaseMasterDataStudent, onboardSupabaseAcceptedCandidate, upsertSupabaseMasterDataStructure, migrateSupabaseMasterDataStructures, migrateSupabaseLegacyMasterDataStudents } from "./server/supabaseOnboarding";
import { createSupabasePpdbFinanceBilling, listSupabaseFinanceBillings, migrateSupabaseFinanceBillings, recordSupabasePpdbFinancePayment, rejectSupabasePpdbFinancePayment, readSupabaseFinanceProof, uploadSupabaseFinanceProof } from "./server/supabaseFinance";
import { listSupabaseTahfidzSnapshot, migrateSupabaseTahfidzConfiguration, recordSupabaseTahfidzSetoran, SupabaseTahfidzError } from "./server/supabaseTahfidz";

dotenv.config();

// Load project configuration from firebase-applet-config.json
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
} catch {
  // Config fallback
}

export type AdminServicesResult =
  | { ok: true; auth: Auth; db: Firestore }
  | { ok: false; error: string };

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;
let adminInitError: string | null = null;

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

function getAdminServices(): AdminServicesResult {
  if (adminInitError) {
    return { ok: false, error: adminInitError };
  }
  if (!adminApp) {
    try {
      const projectId =
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        firebaseConfig.projectId;

      // Use Application Default Credentials only (no private keys or secrets in source)
      adminApp = initializeApp({
        credential: applicationDefault(),
        projectId: projectId || undefined,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket || undefined,
      });
      adminAuth = getAuth(adminApp);

      if (firebaseConfig.firestoreDatabaseId) {
        adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
      } else {
        adminDb = getFirestore(adminApp);
      }
    } catch (err: any) {
      adminInitError = err.message || "Failed to initialize Firebase Admin SDK with Application Default Credentials";
      return { ok: false, error: adminInitError };
    }
  }
  return { ok: true, auth: adminAuth!, db: adminDb! };
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

// Middleware: Authenticate caller with Firebase ID token
async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ code: "UNAUTHORIZED", error: "Missing or invalid authorization header" });
  }

  const token = authHeader.split("Bearer ")[1].trim();
  const services = getAdminServices();
  if (services.ok === false) {
    return res.status(503).json({
      code: "ADMIN_SDK_UNAVAILABLE",
      error: services.error
    });
  }

  try {
    const decodedToken = await services.auth.verifyIdToken(token);
    (req as any).user = decodedToken;
    next();
  } catch (err: any) {
    if (isCredentialError(err)) {
      return res.status(503).json({
        code: "ADMIN_SDK_UNAVAILABLE",
        error: "Firebase Admin SDK credentials are unavailable in this environment."
      });
    }
    return res.status(401).json({ code: "UNAUTHORIZED", error: "Invalid or expired Firebase ID token" });
  }
}

// Middleware: Enforce acting admin profile from Firestore
async function requireTenantAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const uid = (req as any).user?.uid;
  if (!uid) {
    return res.status(401).json({ code: "UNAUTHORIZED", error: "Autentikasi diperlukan." });
  }

  const services = getAdminServices();
  if (services.ok === false) {
    return res.status(503).json({
      code: "ADMIN_SDK_UNAVAILABLE",
      error: "Kredensial Firebase Admin SDK (Application Default Credentials) belum terpasang di server."
    });
  }

  try {
    const actorDoc = await services.db.collection("users").doc(uid).get();
    if (!actorDoc.exists) {
      return res.status(403).json({
        code: "ADMIN_PROFILE_NOT_FOUND",
        error: "Profil akun pengguna tidak ditemukan dalam basis data tenant."
      });
    }

    const actor = actorDoc.data() || {};
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
    if (isCredentialError(err)) {
      return res.status(503).json({
        code: "ADMIN_SDK_UNAVAILABLE",
        error: "Kredensial Firebase Admin SDK (Application Default Credentials) belum terpasang di server."
      });
    }

    if (isFirestoreStoreError(err)) {
      return res.status(503).json({
        code: "ADMIN_PROFILE_STORE_UNAVAILABLE",
        error: "Layanan basis data profil admin (Firestore) tidak dapat diakses. Pastikan IAM role 'Cloud Datastore User' aktif untuk service account backend dan ID database sesuai."
      });
    }

    return res.status(500).json({
      code: "INTERNAL_ERROR",
      error: "Terjadi kesalahan internal saat memverifikasi status admin."
    });
  }
}

async function requirePpdbAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const uid = (req as any).user?.uid;
  if (!uid) return res.status(401).json({ code: "UNAUTHORIZED", error: "Autentikasi diperlukan." });
  const services = getAdminServices();
  if (services.ok === false) {
    return res.status(503).json({ code: "PROFILE_STORE_UNAVAILABLE", error: "Profil pengguna belum dapat diverifikasi." });
  }
  try {
    const profileSnapshot = await services.db.collection("users").doc(uid).get();
    if (!profileSnapshot.exists) return res.status(403).json({ code: "PROFILE_NOT_FOUND", error: "Profil pengguna tidak ditemukan." });
    const profile = profileSnapshot.data() || {};
    const tenantId = typeof profile.tenantId === "string" ? profile.tenantId.trim() : "";
    const role = typeof profile.role === "string" ? profile.role : "";
    if (String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      return res.status(403).json({ code: "ACCOUNT_INACTIVE", error: "Akun aktif dan tenant valid diperlukan." });
    }
    const permissions = resolveUserModulePermissions(role, profile.modulePermissions);
    if (permissions.ppdb !== true) {
      return res.status(403).json({ code: "MODULE_FORBIDDEN", error: "Akses modul PPDB tidak diberikan kepada akun ini." });
    }
    (req as any).actor = { uid, role, tenantId, modulePermissions: permissions };
    next();
  } catch (err: any) {
    if (isCredentialError(err) || isFirestoreStoreError(err)) {
      return res.status(503).json({ code: "PROFILE_STORE_UNAVAILABLE", error: "Profil pengguna belum dapat diverifikasi." });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", error: "Gagal memverifikasi hak akses PPDB." });
  }
}


async function requireMasterDataAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const uid = (req as any).user?.uid;
  if (!uid) return res.status(401).json({ code: "UNAUTHORIZED", error: "Autentikasi diperlukan." });
  const services = getAdminServices();
  if (services.ok === false) {
    return res.status(503).json({ code: "PROFILE_STORE_UNAVAILABLE", error: "Profil pengguna belum dapat diverifikasi." });
  }
  try {
    const profileSnapshot = await services.db.collection("users").doc(uid).get();
    if (!profileSnapshot.exists) return res.status(403).json({ code: "PROFILE_NOT_FOUND", error: "Profil pengguna tidak ditemukan." });
    const profile = profileSnapshot.data() || {};
    const tenantId = typeof profile.tenantId === "string" ? profile.tenantId.trim() : "";
    const role = typeof profile.role === "string" ? profile.role : "";
    if (String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      return res.status(403).json({ code: "ACCOUNT_INACTIVE", error: "Akun aktif dan tenant valid diperlukan." });
    }
    const permissions = resolveUserModulePermissions(role, profile.modulePermissions);
    if (permissions["master-data"] !== true) {
      return res.status(403).json({ code: "MODULE_FORBIDDEN", error: "Akses modul Master Data tidak diberikan kepada akun ini." });
    }
    (req as any).actor = { uid, role, tenantId, modulePermissions: permissions };
    return next();
  } catch (err: any) {
    if (isCredentialError(err) || isFirestoreStoreError(err)) {
      return res.status(503).json({ code: "PROFILE_STORE_UNAVAILABLE", error: "Profil pengguna belum dapat diverifikasi." });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", error: "Gagal memverifikasi hak akses Master Data." });
  }
}


function requireMasterDataStudentAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const actor = (req as any).actor;
  if (!actor || !["Admin", "SuperAdmin"].includes(String(actor.role || ""))) {
    return res.status(403).json({
      code: "STUDENT_PII_FORBIDDEN",
      error: "Data identitas santri hanya dapat dikelola Admin atau SuperAdmin.",
    });
  }
  return next();
}


async function requireBoardingAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const uid = (req as any).user?.uid;
  if (!uid) return res.status(401).json({ code: "UNAUTHORIZED", error: "Autentikasi diperlukan." });
  const services = getAdminServices();
  if (services.ok === false) {
    return res.status(503).json({ code: "PROFILE_STORE_UNAVAILABLE", error: "Profil pengguna belum dapat diverifikasi." });
  }
  try {
    const profileSnapshot = await services.db.collection("users").doc(uid).get();
    if (!profileSnapshot.exists) return res.status(403).json({ code: "PROFILE_NOT_FOUND", error: "Profil pengguna tidak ditemukan." });
    const profile = profileSnapshot.data() || {};
    const tenantId = typeof profile.tenantId === "string" ? profile.tenantId.trim() : "";
    const role = typeof profile.role === "string" ? profile.role : "";
    if (String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      return res.status(403).json({ code: "ACCOUNT_INACTIVE", error: "Akun aktif dan tenant valid diperlukan." });
    }
    const permissions = resolveUserModulePermissions(role, profile.modulePermissions);
    if (permissions.boarding !== true && permissions["master-data"] !== true) {
      return res.status(403).json({ code: "MODULE_FORBIDDEN", error: "Akses modul asrama atau Master Data tidak diberikan." });
    }
    (req as any).actor = { uid, role, tenantId, modulePermissions: permissions };
    return next();
  } catch (err: any) {
    if (isCredentialError(err) || isFirestoreStoreError(err)) {
      return res.status(503).json({ code: "PROFILE_STORE_UNAVAILABLE", error: "Profil pengguna belum dapat diverifikasi." });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", error: "Gagal memverifikasi hak akses asrama." });
  }
}

async function requireTahfidzAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const uid = (req as any).user?.uid;
  if (!uid) return res.status(401).json({ code: "UNAUTHORIZED", error: "Autentikasi diperlukan." });
  const services = getAdminServices();
  if (services.ok === false) {
    return res.status(503).json({ code: "PROFILE_STORE_UNAVAILABLE", error: "Profil pengguna belum dapat diverifikasi." });
  }
  try {
    const profileSnapshot = await services.db.collection("users").doc(uid).get();
    if (!profileSnapshot.exists) return res.status(403).json({ code: "PROFILE_NOT_FOUND", error: "Profil pengguna tidak ditemukan." });
    const profile = profileSnapshot.data() || {};
    const tenantId = typeof profile.tenantId === "string" ? profile.tenantId.trim() : "";
    const role = typeof profile.role === "string" ? profile.role : "";
    if (String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
      return res.status(403).json({ code: "ACCOUNT_INACTIVE", error: "Akun aktif dan tenant valid diperlukan." });
    }
    const modulePermissions = resolveUserModulePermissions(role, profile.modulePermissions);
    if (modulePermissions.tahfidz !== true) {
      return res.status(403).json({ code: "MODULE_FORBIDDEN", error: "Akses modul Tahfidz tidak diberikan kepada akun ini." });
    }
    (req as any).actor = {
      uid,
      name: String(profile.name || profile.displayName || ""),
      role,
      tenantId,
      modulePermissions,
    };
    return next();
  } catch (err: any) {
    if (isCredentialError(err) || isFirestoreStoreError(err)) {
      return res.status(503).json({ code: "PROFILE_STORE_UNAVAILABLE", error: "Profil pengguna belum dapat diverifikasi." });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", error: "Gagal memverifikasi hak akses Tahfidz." });
  }
}

function requireTahfidzRecorder(req: express.Request, res: express.Response, next: express.NextFunction) {
  const actor = (req as any).actor;
  if (!actor || !["SuperAdmin", "Admin", "Ustadz"].includes(String(actor.role || ""))) {
    return res.status(403).json({ code: "TAHFIDZ_WRITE_FORBIDDEN", error: "Hanya Admin atau Ustadz yang dapat mencatat setoran." });
  }
  return next();
}

type FinanceProofError = Error & { status: number };
function financeProofError(status: number, message: string): FinanceProofError {
  return Object.assign(new Error(message), { status });
}

async function loadFinanceProofActor(db: Firestore, uid: string) {
  const snapshot = await db.collection("users").doc(uid).get();
  if (!snapshot.exists) throw financeProofError(403, "Profil pengguna tidak ditemukan.");
  const profile = snapshot.data() || {};
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


const LEGACY_LOCAL_STORAGE_DATASETS: Record<string, { collection: string; module: string; kind: 'array' | 'value'; settingId?: string }> = {
  academics_schedules: { collection: 'academic_schedules', module: 'academic', kind: 'array' },
  academics_jurnals: { collection: 'academic_journals', module: 'academic', kind: 'array' },
  academics_assessments: { collection: 'academic_assessments', module: 'academic', kind: 'array' },
  academics_kktp_threshold: { collection: 'academic_settings', module: 'academic', kind: 'value', settingId: 'kktpThreshold' },
  academics_formative_weight: { collection: 'academic_settings', module: 'academic', kind: 'value', settingId: 'formativeWeight' },
  academics_walikelas_comments: { collection: 'academic_settings', module: 'academic', kind: 'value', settingId: 'waliKelasComments' },
  academics_rapor_locked: { collection: 'academic_settings', module: 'academic', kind: 'value', settingId: 'raporLocked' },
  asrama_musyrifs: { collection: 'boarding_musyrifs', module: 'boarding', kind: 'array' },
  asrama_attendance: { collection: 'boarding_attendance', module: 'boarding', kind: 'array' },
  asrama_audits: { collection: 'boarding_audits', module: 'boarding', kind: 'array' },
  asrama_tickets: { collection: 'boarding_tickets', module: 'boarding', kind: 'array' },
  asrama_rooms: { collection: 'boarding_rooms', module: 'boarding', kind: 'array' },
  asrama_permits: { collection: 'boarding_permits', module: 'boarding', kind: 'array' },
  asrama_discipline: { collection: 'boarding_discipline', module: 'boarding', kind: 'array' },
  hub_announcements: { collection: 'communication_announcements', module: 'communication', kind: 'array' },
  hub_messages: { collection: 'communication_messages', module: 'communication', kind: 'array' },
};
function operationalRecordDocumentId(tenantId: string, recordId: string) {
  return 't_' + encodeURIComponent(tenantId).slice(0, 180) + '_' + encodeURIComponent(recordId).slice(0, 900);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Cloud Run terminates TLS at one trusted proxy hop.
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "18mb" }));

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

  // Remove legacy browser-visible secrets before a client may subscribe to tenant settings.
  app.post("/api/system/settings/prepare", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const services = getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: "Backend pengamanan settings belum tersedia." });
    try {
      const uid = (req as any).user?.uid;
      const profileSnapshot = await services.db.collection("users").doc(uid).get();
      const profile = profileSnapshot.data() || {};
      const tenantId = typeof profile.tenantId === "string" ? profile.tenantId.trim() : "";
      if (!profileSnapshot.exists || String(profile.status || "").toLowerCase() !== "active" || !tenantId) {
        return res.status(403).json({ error: "Profil aktif dengan tenant valid diperlukan." });
      }
      const settingsRef = services.db.collection("tenants").doc(tenantId).collection("settings").doc("global");
      const settingsSnapshot = await settingsRef.get();
      if (settingsSnapshot.exists) {
        const settings = settingsSnapshot.data() || {};
        if (settings.tenantId !== tenantId) return res.status(409).json({ error: "Tenant pada settings tidak cocok." });
        const integrations = settings.integrations && typeof settings.integrations === "object" ? settings.integrations : {};
        const patch: Record<string, any> = {};
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


  // Local data is migrated only after an authenticated tenant admin explicitly submits a reviewed dataset.
  app.post('/api/data-migrations/local-storage', requireAuth, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const services = getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: 'Layanan migrasi backend belum tersedia.' });
    try {
      const uid = (req as any).user?.uid;
      const datasetKey = typeof req.body?.datasetKey === 'string' ? req.body.datasetKey : '';
      const dataset = LEGACY_LOCAL_STORAGE_DATASETS[datasetKey];
      if (!uid || !dataset) return res.status(400).json({ error: 'Dataset migrasi tidak dikenal.' });
      const profileSnapshot = await services.db.collection('users').doc(uid).get();
      const profile = profileSnapshot.data() || {};
      const tenantId = typeof profile.tenantId === 'string' ? profile.tenantId.trim() : '';
      const role = String(profile.role || '');
      if (!profileSnapshot.exists || String(profile.status || '').toLowerCase() !== 'active' || !tenantId) {
        return res.status(403).json({ error: 'Profil aktif dengan tenant valid diperlukan.' });
      }
      if (!['Admin', 'SuperAdmin'].includes(role)) return res.status(403).json({ error: 'Migrasi lokal hanya dapat dijalankan Admin tenant.' });
      if (!resolveUserModulePermissions(role, profile.modulePermissions)[dataset.module]) {
        return res.status(403).json({ error: 'Role Anda tidak memiliki izin pada modul dataset ini.' });
      }
      const incoming = req.body?.items;
      const batchIndex = Number(req.body?.batchIndex ?? 0);
      const batchCount = Number(req.body?.batchCount ?? 1);
      if (!Number.isInteger(batchIndex) || !Number.isInteger(batchCount) || batchCount < 1 || batchCount > 50 || batchIndex < 0 || batchIndex >= batchCount) return res.status(400).json({ error: 'Nomor batch migrasi tidak valid.' });
      if (!Array.isArray(incoming) || incoming.length > 350) return res.status(400).json({ error: 'Setiap batch harus berupa daftar maksimal 350 record.' });
      if (dataset.kind === 'value' && (incoming.length !== 1 || incoming[0]?.id !== dataset.settingId)) {
        return res.status(400).json({ error: 'Record pengaturan tidak sesuai dengan daftar migrasi yang diizinkan.' });
      }
      const seenIds = new Set<string>();
      const records = incoming.map((item: any) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Setiap item harus berupa record.');
        const id = typeof item.id === 'string' ? item.id.trim() : '';
        if (typeof item.tenantId === 'string' && item.tenantId.trim() !== tenantId) throw new Error('Record lokal terikat ke tenant lain dan tidak dapat dipindahkan.');
        if (!id || id.length > 300 || seenIds.has(id)) throw new Error('ID record kosong, terlalu panjang, atau duplikat.');
        seenIds.add(id);
        const sanitized = JSON.parse(JSON.stringify(item, (key, value) => {
          if (key === 'tenantId' || key === '_firestoreId' || key === 'createdByUid') return undefined;
          if (/password|secret|api.?key|smtp|token/i.test(key)) return undefined;
          return value;
        }));
        return {
          ...sanitized,
          id,
          tenantId,
          createdByUid: uid,
          migrationSourceKey: datasetKey,
          migratedAt: new Date().toISOString(),
          ...(datasetKey === 'hub_announcements' ? { sourceModule: 'healthcare', notificationType: 'urgent' } : {}),
          ...(datasetKey === 'hub_messages' ? { sourceModule: 'healthcare', notificationType: 'message' } : {}),
        };
      });
      const migrationId = 'm_' + encodeURIComponent(tenantId).slice(0, 180) + '_' + encodeURIComponent(uid).slice(0, 180) + '_' + datasetKey + '_b' + batchIndex;
      const markerRef = services.db.collection('dataMigrationJobs').doc(migrationId);
      const outcome = await services.db.runTransaction(async transaction => {
        const markerSnapshot = await transaction.get(markerRef);
        if (markerSnapshot.exists && markerSnapshot.get('status') === 'completed') {
          return {
            imported: Number(markerSnapshot.get('imported') || 0),
            skipped: Number(markerSnapshot.get('skipped') || 0),
            alreadyCompleted: true,
          };
        }
        const refs = records.map((record: any) => services.db.collection(dataset.collection).doc(operationalRecordDocumentId(tenantId, record.id)));
        const snapshots = await Promise.all(refs.map((ref: any) => transaction.get(ref)));
        let imported = 0;
        let skipped = 0;
        snapshots.forEach((snapshot: any, index: number) => {
          if (snapshot.exists) { skipped += 1; return; }
          transaction.create(refs[index], records[index]);
          imported += 1;
        });
        const status = skipped > 0 ? 'partial' : 'completed';
        transaction.set(markerRef, {
          tenantId,
          createdByUid: uid,
          datasetKey,
          batchIndex,
          batchCount,
          module: dataset.module,
          collection: dataset.collection,
          status,
          imported,
          skipped,
          completedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { imported, skipped, alreadyCompleted: false };
      });
      return res.json(outcome);
    } catch (error: any) {
      console.error('Local tenant data migration failed:', error?.code || 'invalid-dataset');
      return res.status(error?.message?.includes('ID record') || error?.message?.includes('item harus') || error?.message?.includes('tenant lain') ? 400 : 500)
        .json({ error: error?.message || 'Migrasi data lokal gagal.' });
    }
  });

  app.get("/api/tahfidz/snapshot", requireAuth, requireTahfidzAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (String(process.env.SUPABASE_TAHFIDZ_RUNTIME_ENABLED || "").toLowerCase() !== "true") {
      return res.status(503).json({ error: "Runtime Tahfidz Supabase belum diaktifkan oleh operator instalasi." });
    }
    try {
      const actor = (req as any).actor;
      const snapshot = await listSupabaseTahfidzSnapshot(actor.tenantId);
      return res.json(snapshot);
    } catch (err: any) {
      const status = err instanceof SupabaseTahfidzError ? err.status : 503;
      if (status >= 500) console.error("Supabase Tahfidz snapshot failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Data Tahfidz belum dapat dimuat dari backend." : err.message });
    }
  });

  app.post("/api/tahfidz/records", requireAuth, requireTahfidzAccess, requireTahfidzRecorder, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (String(process.env.SUPABASE_TAHFIDZ_RUNTIME_ENABLED || "").toLowerCase() !== "true") {
      return res.status(503).json({ error: "Runtime Tahfidz Supabase belum diaktifkan oleh operator instalasi." });
    }
    try {
      const actor = (req as any).actor;
      const result = await recordSupabaseTahfidzSetoran(actor.tenantId, actor.uid, actor.name, req.body?.record);
      return res.status(201).json(result);
    } catch (err: any) {
      const status = err instanceof SupabaseTahfidzError ? err.status : 503;
      if (status >= 500) console.error("Supabase Tahfidz record failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Setoran Tahfidz belum dapat disimpan ke backend." : err.message });
    }
  });

  app.post("/api/tahfidz/migrate", requireAuth, requireTahfidzAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const actor = (req as any).actor;
    if (!["Admin", "SuperAdmin"].includes(String(actor.role || ""))) {
      return res.status(403).json({ error: "Hanya Admin pesantren yang dapat mengimpor konfigurasi Tahfidz." });
    }
    const apply = req.body?.apply === true;
    if (apply && String(process.env.SUPABASE_TAHFIDZ_IMPORT_ENABLED || "").toLowerCase() !== "true") {
      return res.status(503).json({ error: "Impor Tahfidz belum diaktifkan operator setelah backup dan rekonsiliasi prasyarat." });
    }
    if (apply && req.body?.confirm !== "IMPORT_TAHFIDZ_HALAQAHS_AND_MEMBERSHIPS") {
      return res.status(400).json({ error: "Konfirmasi impor belum valid. Jalankan preview terlebih dahulu." });
    }
    const services = getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: "Sumber Firebase lama belum dapat diakses untuk migrasi." });

    try {
      const readTenantDocuments = async (baseQuery: any, maximum: number) => {
        const documents: any[] = [];
        let cursor: any = null;
        while (true) {
          const remaining = maximum - documents.length;
          const pageSize = Math.min(500, remaining + 1);
          let query = baseQuery.orderBy(FieldPath.documentId()).limit(pageSize);
          if (cursor) query = query.startAfter(cursor);
          const snapshot = await query.get();
          if (documents.length + snapshot.size > maximum) {
            throw new SupabaseTahfidzError(400, "Snapshot Tahfidz melebihi batas migrasi yang didukung.");
          }
          documents.push(...snapshot.docs);
          if (snapshot.size < pageSize) break;
          cursor = snapshot.docs[snapshot.docs.length - 1];
        }
        return documents;
      };
      const [halaqahDocuments, studentDocuments] = await Promise.all([
        readTenantDocuments(
          services.db.collection("master_data")
            .where("tenantId", "==", actor.tenantId)
            .where("category", "==", "Halaqah"),
          2000
        ),
        readTenantDocuments(
          services.db.collection("entityRecords")
            .where("tenantId", "==", actor.tenantId)
            .where("type", "==", "Santri"),
          5000
        ),
      ]);
      const result = await migrateSupabaseTahfidzConfiguration(
        actor.tenantId,
        halaqahDocuments.map((document) => ({ id: document.id, record: document.data() || {} })),
        studentDocuments.map((document) => ({ id: document.id, record: document.data() || {} })),
        apply,
        typeof req.body?.previewFingerprint === "string" ? req.body.previewFingerprint : ""
      );
      return res.json({
        ...result,
        legacyHalaqahCount: halaqahDocuments.length,
        legacyStudentCount: studentDocuments.length,
        mode: apply ? "apply" : "preview",
      });
    } catch (error: any) {
      if (isCredentialError(error) || isFirestoreStoreError(error)) {
        return res.status(503).json({ error: "Sumber Firebase lama belum dapat diakses untuk migrasi." });
      }
      const status = error instanceof SupabaseTahfidzError ? error.status : 503;
      if (status >= 500) console.error("Tahfidz legacy import failed:", error?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Impor Tahfidz belum dapat diselesaikan." : error.message });
    }
  });

  app.get("/api/ppdb/candidates", requireAuth, requirePpdbAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const actor = (req as any).actor;
      const candidates = await listSupabasePpdbCandidates(actor.tenantId);
      return res.json({ candidates });
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase PPDB candidate listing failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Data PPDB belum dapat dimuat." : err.message });
    }
  });

  app.post("/api/ppdb/candidates", requireAuth, requirePpdbAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const actor = (req as any).actor;
      const candidate = await createSupabasePpdbCandidate(actor.tenantId, req.body?.candidate);
      return res.status(201).json({ candidate });
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase PPDB candidate creation failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Calon santri belum dapat disimpan." : err.message });
    }
  });

  app.post("/api/ppdb/candidates/:candidateId/documents", requireAuth, requirePpdbAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const actor = (req as any).actor;
      await uploadSupabasePpdbCandidateDocument(
        actor.tenantId,
        String(req.params.candidateId || ""),
        String(req.body?.docKey || ""),
        req.body?.file
      );
      return res.json({ ok: true });
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase PPDB document upload failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Dokumen belum dapat disimpan." : err.message });
    }
  });

  app.patch("/api/ppdb/candidates/batch", requireAuth, requirePpdbAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const actor = (req as any).actor;
      const updatedCount = await updateSupabasePpdbCandidatesBatch(actor.tenantId, req.body?.updates);
      return res.json({ updatedCount });
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase PPDB batch update failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Perubahan kandidat belum dapat disimpan." : err.message });
    }
  });

  app.patch("/api/ppdb/candidates/:candidateId", requireAuth, requirePpdbAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const actor = (req as any).actor;
      await updateSupabasePpdbCandidate(actor.tenantId, String(req.params.candidateId || ""), req.body?.patch);
      return res.json({ ok: true });
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase PPDB candidate update failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Perubahan kandidat belum dapat disimpan." : err.message });
    }
  });


  // Tenant structures and accepted-candidate onboarding use Supabase.
  // Authentication is still Firebase-backed in this migration phase; the tenant comes from the verified server profile.
  app.get("/api/ppdb/onboarding/structures", requireAuth, requirePpdbAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const actor = (req as any).actor;
      const records = await listSupabaseMasterDataStructures(actor.tenantId);
      return res.json({ records });
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase PPDB onboarding structures failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Struktur pesantren belum dapat dimuat dari backend." : err.message });
    }
  });

  app.get("/api/ppdb/onboarding/next-nis", requireAuth, requirePpdbAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const actor = (req as any).actor;
      const grade = typeof req.query.grade === "string" ? req.query.grade.trim() : "";
      const candidateId = typeof req.query.candidateId === "string" ? req.query.candidateId.trim() : undefined;
      if (!grade || grade.length > 50) return res.status(400).json({ error: "Jenjang calon santri tidak valid." });
      const nis = await getSupabaseNextSantriNis(actor.tenantId, grade, candidateId);
      return res.json({ nis });
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase NIS preview failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "NIS belum dapat dibuat dari backend." : err.message });
    }
  });

  app.post("/api/ppdb/candidates/:candidateId/onboard", requireAuth, requirePpdbAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const actor = (req as any).actor;
      if (!["Admin", "SuperAdmin"].includes(String(actor.role || "")) || actor.modulePermissions?.["master-data"] !== true) {
        return res.status(403).json({ error: "Onboarding hanya dapat dilakukan Admin dengan akses Master Data." });
      }
      const result = await onboardSupabaseAcceptedCandidate(actor.tenantId, req.params.candidateId, req.body?.assignment);
      return res.json(result);
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase candidate onboarding failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Onboarding calon santri belum dapat diselesaikan." : err.message });
    }
  });

  app.get("/api/master-data/structures", requireAuth, requireMasterDataAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const actor = (req as any).actor;
      const records = await listSupabaseMasterDataStructures(actor.tenantId);
      return res.json({ records });
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase Master Data structures failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Struktur Master Data belum dapat dimuat." : err.message });
    }
  });



  // Santri Master Data reads/writes are tenant-scoped in Supabase; Firebase remains the token source during cutover.
  app.get("/api/master-data/students", requireAuth, requireMasterDataAccess, requireMasterDataStudentAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const actor = (req as any).actor;
      const records = await listSupabaseMasterDataStudents(actor.tenantId);
      return res.json({ records });
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase Master Data students failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Data santri Supabase belum dapat dimuat." : err.message });
    }
  });

  app.put("/api/master-data/students/:studentId", requireAuth, requireMasterDataAccess, requireMasterDataStudentAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const actor = (req as any).actor;
      const record = await upsertSupabaseMasterDataStudent(
        actor.tenantId,
        String(req.params.studentId || ""),
        req.body?.record
      );
      return res.json({ record });
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase Master Data student save failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Data santri belum dapat disimpan ke Supabase." : err.message });
    }
  });

  app.delete("/api/master-data/students/:studentId", requireAuth, requireMasterDataAccess, requireMasterDataStudentAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const actor = (req as any).actor;
      const result = await archiveSupabaseMasterDataStudent(actor.tenantId, String(req.params.studentId || ""));
      return res.json(result);
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase Master Data student archive failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Data santri belum dapat diarsipkan." : err.message });
    }
  });

  app.get("/api/boarding/snapshot", requireAuth, requireBoardingAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const actor = (req as any).actor;
      const snapshot = await listSupabaseBoardingSnapshot(actor.tenantId);
      return res.json(snapshot);
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase boarding snapshot failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Data santri dan struktur belum dapat dimuat." : err.message });
    }
  });

  app.put("/api/boarding/students/:studentId/room", requireAuth, requireBoardingAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!req.body || !Object.prototype.hasOwnProperty.call(req.body, "roomId")) {
      return res.status(400).json({ error: "roomId wajib dikirim; gunakan null untuk melepas penempatan." });
    }
    const roomValue = req.body.roomId;
    if (roomValue !== null && typeof roomValue !== "string") {
      return res.status(400).json({ error: "ID kamar tidak valid." });
    }
    const buildingValue = req.body.buildingId;
    if (buildingValue !== undefined && buildingValue !== null && typeof buildingValue !== "string") {
      return res.status(400).json({ error: "ID gedung tidak valid." });
    }

    try {
      const actor = (req as any).actor;
      const result = await assignSupabaseStudentRoom(
        actor.tenantId,
        req.params.studentId,
        roomValue,
        buildingValue
      );
      return res.json(result);
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase room placement failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Perubahan penempatan kamar belum dapat diselesaikan." : err.message });
    }
  });

  app.post("/api/master-data/structures/migrate", requireAuth, requireMasterDataAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const actor = (req as any).actor;
    if (!["Admin", "SuperAdmin"].includes(String(actor.role || ""))) {
      return res.status(403).json({ error: "Hanya Admin pesantren yang dapat menjalankan migrasi struktur." });
    }
    const apply = req.body?.apply === true;
    if (apply && req.body?.confirm !== "IMPORT_MASTER_DATA_STRUCTURES") {
      return res.status(400).json({ error: "Konfirmasi migrasi belum valid. Jalankan preview lalu kirim token konfirmasi yang diwajibkan." });
    }
    const services = getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: "Sumber Firebase lama belum dapat diakses untuk migrasi." });

    try {
      const [structureSnapshot, studentSnapshot] = await Promise.all([
        services.db.collection("master_data").where("tenantId", "==", actor.tenantId).get(),
        services.db.collection("entityRecords")
          .where("tenantId", "==", actor.tenantId)
          .where("type", "==", "Santri")
          .get(),
      ]);
      const allowedCategories = new Set(["Gedung", "Kamar", "Kelas"]);
      const legacyStructures = structureSnapshot.docs.flatMap((document) => {
        const raw = document.data() || {};
        const category = typeof raw.category === "string" ? raw.category : "";
        if (!allowedCategories.has(category)) return [];
        const prefix = category + "_";
        const id = typeof raw.id === "string" && raw.id.trim()
          ? raw.id.trim()
          : document.id.startsWith(prefix) ? document.id.slice(prefix.length) : document.id;
        const safeRecord = JSON.parse(JSON.stringify(raw, (key, value) => {
          if (key === "tenantId" || key === "_firestoreId" || key === "createdByUid") return undefined;
          if (/password|secret|api.?key|smtp|token/i.test(key)) return undefined;
          return value;
        }));
        return [{ id, category, record: { ...safeRecord, id, category } }];
      });

      const roomById = new Map<string, any>();
      const roomIdsByName = new Map<string, string[]>();
      for (const item of legacyStructures) {
        if (item.category !== "Kamar") continue;
        roomById.set(item.id, item);
        const roomName = String(item.record?.name || "").trim().toLowerCase();
        if (roomName) roomIdsByName.set(roomName, [...(roomIdsByName.get(roomName) || []), item.id]);
      }
      const roomOccupancy = new Map<string, number>();
      let unassignedRoomRecords = 0;
      for (const document of studentSnapshot.docs) {
        const student = document.data() || {};
        const roomId = typeof student.roomId === "string" ? student.roomId.trim() : "";
        const roomName = typeof student.room === "string" ? student.room.trim().toLowerCase() : "";
        let matchedId = roomId && roomById.has(roomId) ? roomId : "";
        if (!matchedId && roomName) {
          const matches = roomIdsByName.get(roomName) || [];
          if (matches.length === 1) matchedId = matches[0];
        }
        if (!matchedId) {
          unassignedRoomRecords += 1;
          continue;
        }
        roomOccupancy.set(matchedId, (roomOccupancy.get(matchedId) || 0) + 1);
      }
      const records = legacyStructures.map((item) => ({
        ...item,
        occupied: item.category === "Kamar" ? roomOccupancy.get(item.id) || 0 : 0,
      }));
      const result = await migrateSupabaseMasterDataStructures(actor.tenantId, records, apply);
      return res.json({
        ...result,
        legacyStructureCount: legacyStructures.length,
        legacyStudentCount: studentSnapshot.size,
        studentsWithoutUnambiguousRoom: unassignedRoomRecords,
        mode: apply ? "apply" : "preview",
      });
    } catch (error: any) {
      if (isCredentialError(error) || isFirestoreStoreError(error)) {
        return res.status(503).json({ error: "Sumber Firebase lama belum dapat diakses untuk migrasi." });
      }
      const status = error instanceof SupabasePpdbAdminError ? error.status : 503;
      if (status >= 500) console.error("Master Data structure migration failed:", error?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Migrasi struktur Master Data belum dapat diselesaikan." : error.message });
    }
  });

  app.post("/api/master-data/students/migrate", requireAuth, requireMasterDataAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const actor = (req as any).actor;
    if (!["Admin", "SuperAdmin"].includes(String(actor.role || ""))) {
      return res.status(403).json({ error: "Hanya Admin pesantren yang dapat menjalankan migrasi data santri." });
    }
    if (String(process.env.LEGACY_MASTER_DATA_IMPORT_ENABLED || "").toLowerCase() !== "true") {
      return res.status(503).json({ error: "Impor legacy belum diaktifkan oleh operator instalasi setelah backup dan persiapan jendela migrasi." });
    }
    const apply = req.body?.apply === true;
    if (apply && req.body?.confirm !== "IMPORT_LEGACY_MASTER_DATA_STUDENTS") {
      return res.status(400).json({ error: "Konfirmasi impor belum valid. Jalankan preview terlebih dahulu." });
    }
    const services = getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: "Sumber Firebase lama belum dapat diakses untuk migrasi." });

    try {
      const readTenantEntities = async (type: string) => {
        const documents: any[] = [];
        let cursor: any = null;
        while (true) {
          const remaining = 5000 - documents.length;
          const pageSize = Math.min(500, remaining + 1);
          let query = services.db.collection("entityRecords")
            .where("tenantId", "==", actor.tenantId)
            .where("type", "==", type)
            .orderBy(FieldPath.documentId())
            .limit(pageSize);
          if (cursor) query = query.startAfter(cursor);
          const snapshot = await query.get();
          if (documents.length + snapshot.size > 5000) {
            throw new SupabasePpdbAdminError(400, "Data tenant melebihi batas satu batch migrasi (5.000 record).");
          }
          documents.push(...snapshot.docs);
          if (snapshot.size < pageSize) break;
          cursor = snapshot.docs[snapshot.docs.length - 1];
        }
        return documents;
      };

      const [studentDocs, guardianDocs] = await Promise.all([
        readTenantEntities("Santri"),
        readTenantEntities("Wali Santri"),
      ]);
      const guardiansById = new Map<string, { id: string; record: Record<string, any> }>();
      const guardiansByStudent = new Map<string, Array<{ id: string; record: Record<string, any> }>>();
      for (const document of guardianDocs) {
        const record = document.data() || {};
        const guardian = { id: document.id, record };
        guardiansById.set(document.id, guardian);
        if (typeof record.id === "string" && record.id.trim()) guardiansById.set(record.id.trim(), guardian);
        const studentIds = Array.isArray(record.santriIds) ? record.santriIds : [];
        for (const studentId of studentIds) {
          if (typeof studentId !== "string" || !studentId.trim()) continue;
          const key = studentId.trim();
          guardiansByStudent.set(key, [...(guardiansByStudent.get(key) || []), guardian]);
        }
      }

      const source = studentDocs.map((document) => {
        const record = document.data() || {};
        const recordId = typeof record.id === "string" && record.id.trim() ? record.id.trim() : document.id;
        const linkedIds = [record.waliSantriId, record.guardianId, record.parentId]
          .filter((value) => typeof value === "string" && value.trim())
          .map((value) => String(value).trim());
        const directMatches = Array.from(new Set(linkedIds.map((id) => guardiansById.get(id)).filter(Boolean))) as Array<{ id: string; record: Record<string, any> }>;
        const studentMatches = Array.from(new Set([
          ...(guardiansByStudent.get(document.id) || []),
          ...(guardiansByStudent.get(recordId) || []),
        ]));
        let guardian: { id: string; record: Record<string, any> } | null = null;
        const candidates = directMatches.length ? directMatches : studentMatches;
        const sourceWarnings: string[] = [];
        if (candidates.length === 1) guardian = candidates[0];
        else if (candidates.length > 1) sourceWarnings.push("Relasi wali ambigu pada sumber; perlu dipetakan manual.");
        return { id: document.id, record, guardian, sourceWarnings };
      });

      const result = await migrateSupabaseLegacyMasterDataStudents(actor.tenantId, source, apply);
      return res.json(result);
    } catch (error: any) {
      if (isFirestoreStoreError(error)) {
        return res.status(503).json({ error: "Data sumber Firebase belum dapat dibaca untuk migrasi." });
      }
      const status = error instanceof SupabasePpdbAdminError ? error.status : 503;
      if (status >= 500) console.error("Legacy Master Data student import failed:", error?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Impor data santri belum dapat diselesaikan." : error.message });
    }
  });

  app.put("/api/master-data/structures/:category/:recordId", requireAuth, requireMasterDataAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const actor = (req as any).actor;
    if (!["Admin", "SuperAdmin"].includes(String(actor.role || ""))) {
      return res.status(403).json({ error: "Hanya Admin pesantren yang dapat mengelola struktur Master Data." });
    }
    try {
      const record = await upsertSupabaseMasterDataStructure(
        actor.tenantId,
        req.params.category,
        req.params.recordId,
        req.body?.record
      );
      return res.json({ record });
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase Master Data structure write failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Perubahan struktur Master Data belum dapat disimpan." : err.message });
    }
  });

  app.delete("/api/master-data/structures/:category/:recordId", requireAuth, requireMasterDataAccess, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const actor = (req as any).actor;
    if (!["Admin", "SuperAdmin"].includes(String(actor.role || ""))) {
      return res.status(403).json({ error: "Hanya Admin pesantren yang dapat mengelola struktur Master Data." });
    }
    try {
      await deleteSupabaseMasterDataStructure(actor.tenantId, req.params.category, req.params.recordId);
      return res.json({ deleted: true });
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase Master Data structure delete failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Struktur Master Data belum dapat dihapus." : err.message });
    }
  });

  // Public PPDB submissions are handled by Supabase through this trusted server.
  // The Supabase service-role secret and PII encryption keys are server-only environment variables.
  app.get("/api/public/ppdb/config", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      return res.json(await loadSupabasePublicPpdbConfig());
    } catch (err: any) {
      const status = err instanceof PublicPpdbError ? err.status : 503;
      return res.status(status).json({ error: status >= 500 ? (err?.message || "Konfigurasi PPDB belum dapat dimuat.") : err.message });
    }
  });

  app.post("/api/public/ppdb/registrations", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const candidate = await registerSupabasePublicPpdb(req.body, String(req.ip || req.socket.remoteAddress || "unknown"));
      return res.status(201).json({ candidate });
    } catch (err: any) {
      const status = err instanceof PublicPpdbError ? err.status : 503;
      if (status === 429) res.setHeader("Retry-After", "900");
      if (status >= 500) console.error("Supabase public PPDB registration failed:", err?.message || "unknown error");
      return res.status(status).json({
        error: status >= 500
          ? (err?.message || "Pendaftaran gagal diproses. Silakan coba kembali atau hubungi panitia.")
          : err.message,
      });
    }
  });

  // Supabase finance endpoints are tenant-scoped. Firebase Auth/profile verification remains a temporary bridge.
  app.get("/api/finance/supabase/billings", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const services = getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: "Profil pengguna belum dapat diverifikasi." });
    try {
      const uid = (req as any).user?.uid;
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFinanceProofActor(services.db, uid);
      if (!["Admin", "SuperAdmin", "Walisantri"].includes(actor.role)) {
        return res.status(403).json({ error: "Akses daftar tagihan tidak diizinkan." });
      }
      if (actor.role === "Walisantri" && !actor.linkedSantriId) {
        return res.status(403).json({ error: "Akun wali belum terhubung ke data santri." });
      }
      const billings = await listSupabaseFinanceBillings(
        actor.tenantId,
        actor.role === "Walisantri" ? actor.linkedSantriId : undefined,
        req.query.scope === "ppdb"
      );
      return res.json({ billings });
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase finance billing list failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Tagihan Supabase belum dapat dimuat." : err.message });
    }
  });

  app.post("/api/finance/supabase/ppdb-billings/generate", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const services = getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: "Profil pengguna belum dapat diverifikasi." });
    try {
      const uid = (req as any).user?.uid;
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFinanceProofActor(services.db, uid);
      if (!["Admin", "SuperAdmin"].includes(actor.role)) return res.status(403).json({ error: "Penerbitan tagihan hanya untuk Admin tenant." });
      const candidateIds = req.body?.candidateIds;
      const paymentType = req.body?.paymentType;
      const feeAmount = Number(req.body?.amount);
      if (!Array.isArray(candidateIds) || candidateIds.length > 500
        || !["registration", "tuition"].includes(paymentType)
        || !Number.isFinite(feeAmount) || feeAmount <= 0) {
        return res.status(400).json({ error: "Daftar kandidat, jenis, atau nominal tagihan tidak valid." });
      }
      let createdCount = 0;
      let skippedCount = 0;
      const errors: Array<{ candidateId: string; error: string }> = [];
      for (const candidateId of candidateIds) {
        try {
          const result = await createSupabasePpdbFinanceBilling(actor.tenantId, candidateId, paymentType, feeAmount, uid);
          if (result.created) createdCount += 1;
          else skippedCount += 1;
        } catch (err: any) {
          errors.push({ candidateId: String(candidateId || ""), error: err?.message || "Tagihan gagal diterbitkan." });
        }
      }
      return res.status(errors.length ? 207 : 200).json({ createdCount, skippedCount, failedCount: errors.length, errors });
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase PPDB billing generation failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Tagihan PPDB belum dapat diterbitkan." : err.message });
    }
  });

  app.post("/api/finance/supabase/ppdb-candidates/:candidateId/payments", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const services = getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: "Profil pengguna belum dapat diverifikasi." });
    try {
      const uid = (req as any).user?.uid;
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFinanceProofActor(services.db, uid);
      if (!["Admin", "SuperAdmin"].includes(actor.role)) return res.status(403).json({ error: "Pencatatan pembayaran hanya untuk Admin tenant." });
      const result = await recordSupabasePpdbFinancePayment(
        actor.tenantId,
        req.params.candidateId,
        req.body?.paymentType,
        req.body?.paidAmount,
        req.body?.status,
        req.body?.method,
        req.body?.receiptNo,
        uid
      );
      return res.json(result);
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase PPDB payment record failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Pembayaran PPDB belum dapat dicatat." : err.message });
    }
  });

  app.post("/api/finance/supabase/ppdb-candidates/:candidateId/payment-rejection", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const services = getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: "Profil pengguna belum dapat diverifikasi." });
    try {
      const uid = (req as any).user?.uid;
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFinanceProofActor(services.db, uid);
      if (!["Admin", "SuperAdmin"].includes(actor.role)) return res.status(403).json({ error: "Penolakan pembayaran hanya untuk Admin tenant." });
      const result = await rejectSupabasePpdbFinancePayment(
        actor.tenantId,
        req.params.candidateId,
        req.body?.paymentType,
        req.body?.reason,
        uid
      );
      return res.json(result);
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase PPDB payment rejection failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Penolakan pembayaran PPDB belum dapat disimpan." : err.message });
    }
  });

  app.post("/api/finance/supabase/billings/migrate", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const services = getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: "Profil pengguna belum dapat diverifikasi." });
    try {
      const uid = (req as any).user?.uid;
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFinanceProofActor(services.db, uid);
      if (!["Admin", "SuperAdmin"].includes(actor.role)) return res.status(403).json({ error: "Impor tagihan hanya dapat dijalankan Admin tenant." });
      const apply = req.body?.apply === true;
      if (apply && req.body?.confirmation !== "IMPORT_FINANCE_BILLINGS") {
        return res.status(400).json({ error: "Konfirmasi impor tagihan tidak cocok." });
      }
      const snapshot = await services.db.collection("financeBillings")
        .where("tenantId", "==", actor.tenantId)
        .limit(5001)
        .get();
      if (snapshot.size > 5000) return res.status(413).json({ error: "Tenant memiliki lebih dari 5.000 tagihan. Impor perlu dijalankan dalam batch bertahap." });
      const records = snapshot.docs.map((document) => ({ id: document.id, record: document.data() }));
      const result = await migrateSupabaseFinanceBillings(actor.tenantId, records, apply);
      return res.json(result);
    } catch (err: any) {
      const status = err instanceof SupabasePpdbAdminError ? err.status : 503;
      if (status >= 500) console.error("Supabase finance billing migration failed:", err?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Tagihan belum dapat dimigrasikan ke Supabase." : err.message });
    }
  });

  // New proofs for Supabase-backed billing are stored in the private Supabase Storage bucket.
  app.post("/api/finance/supabase/payment-proofs", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const services = getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: "Profil pengguna belum dapat diverifikasi." });
    const uid = (req as any).user?.uid;
    if (!uid || !consumePaymentProofUploadLimit(uid)) {
      res.setHeader("Retry-After", "900");
      return res.status(429).json({ error: "Batas unggahan bukti pembayaran sementara tercapai." });
    }
    try {
      const actor = await loadFinanceProofActor(services.db, uid);
      if (!["Admin", "SuperAdmin", "Walisantri"].includes(actor.role)) {
        return res.status(403).json({ error: "Akses unggah bukti pembayaran tidak diizinkan." });
      }
      if (actor.role === "Walisantri" && !actor.linkedSantriId) {
        return res.status(403).json({ error: "Akun wali belum terhubung ke data santri." });
      }
      const billingId = typeof req.body?.billingId === "string" ? req.body.billingId.trim() : "";
      if (!billingId || billingId.length > 180 || billingId.includes("/")) {
        return res.status(400).json({ error: "ID tagihan tidak valid." });
      }
      const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "";
      if (!["image/png", "image/jpeg", "application/pdf"].includes(mimeType)) {
        return res.status(400).json({ error: "Format bukti harus PNG, JPG, atau PDF." });
      }
      const base64 = typeof req.body?.base64 === "string" ? req.body.base64 : "";
      const maxBytes = 3 * 1024 * 1024;
      const maxEncodedLength = Math.ceil(maxBytes / 3) * 4;
      if (!base64 || base64.length > maxEncodedLength || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
        return res.status(400).json({ error: "Ukuran atau encoding berkas tidak valid. Maksimal 3 MB." });
      }
      const bytes = Buffer.from(base64, "base64");
      if (!bytes.length || bytes.length > maxBytes || bytes.toString("base64") !== base64 || detectPaymentProofMime(bytes) !== mimeType) {
        return res.status(400).json({ error: "Isi berkas tidak cocok dengan tipe PNG, JPG, atau PDF." });
      }
      const payChannel = typeof req.body?.payChannel === "string" ? req.body.payChannel.trim() : "";
      if (!["BSI", "Muamalat", "MandiriSyariah"].includes(payChannel)) {
        return res.status(400).json({ error: "Metode transfer tidak valid." });
      }
      const result = await uploadSupabaseFinanceProof(
        actor.tenantId,
        billingId,
        actor.role === "Walisantri" ? actor.linkedSantriId : "",
        safePaymentProofName(req.body?.fileName),
        mimeType,
        base64,
        "Transfer Manual (" + payChannel + ")",
        uid
      );
      return res.status(201).json({ ok: true, ...result });
    } catch (error: any) {
      const status = error instanceof SupabasePpdbAdminError ? error.status : 503;
      if (status >= 500) console.error("Supabase payment proof upload failed:", error?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Bukti pembayaran belum dapat disimpan." : error.message });
    }
  });

  app.get("/api/finance/supabase/payment-proofs/:billingId", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const services = getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: "Profil pengguna belum dapat diverifikasi." });
    try {
      const uid = (req as any).user?.uid;
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFinanceProofActor(services.db, uid);
      if (!["Admin", "SuperAdmin", "Walisantri"].includes(actor.role)) {
        return res.status(403).json({ error: "Akses bukti pembayaran tidak diizinkan." });
      }
      if (actor.role === "Walisantri" && !actor.linkedSantriId) {
        return res.status(404).json({ error: "Bukti pembayaran tidak ditemukan." });
      }
      const proof = await readSupabaseFinanceProof(
        actor.tenantId,
        req.params.billingId,
        actor.role === "Walisantri" ? actor.linkedSantriId : undefined
      );
      res.setHeader("Content-Type", proof.mimeType);
      res.setHeader("Content-Disposition", 'inline; filename="' + safePaymentProofName(proof.fileName) + '"');
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.send(proof.bytes);
    } catch (error: any) {
      const status = error instanceof SupabasePpdbAdminError ? error.status : 503;
      if (status >= 500) console.error("Supabase payment proof read failed:", error?.message || "unknown error");
      return res.status(status).json({ error: status >= 500 ? "Bukti pembayaran belum dapat dibuka." : error.message });
    }
  });

  // Payment proof bytes and billing metadata are handled only by this authenticated backend.
  app.post("/api/finance/payment-proofs", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const services = getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: "Layanan keuangan belum tersedia." });
    const uid = (req as any).user?.uid;
    if (!uid || !consumePaymentProofUploadLimit(uid)) {
      res.setHeader("Retry-After", "900");
      return res.status(429).json({ error: "Batas unggahan bukti pembayaran sementara tercapai." });
    }

    let storedFile: any = null;
    try {
      const actor = await loadFinanceProofActor(services.db, uid);
      const billingId = typeof req.body?.billingId === "string" ? req.body.billingId.trim() : "";
      if (!billingId || billingId.length > 150 || billingId.includes("/")) {
        return res.status(400).json({ error: "ID tagihan tidak valid." });
      }
      const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "";
      if (!["image/png", "image/jpeg", "application/pdf"].includes(mimeType)) {
        return res.status(400).json({ error: "Format bukti harus PNG, JPG, atau PDF." });
      }
      const base64 = typeof req.body?.base64 === "string" ? req.body.base64 : "";
      const maxBytes = 3 * 1024 * 1024;
      const maxEncodedLength = Math.ceil(maxBytes / 3) * 4;
      if (!base64 || base64.length > maxEncodedLength || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
        return res.status(400).json({ error: "Ukuran atau encoding berkas tidak valid. Maksimal 3 MB." });
      }
      const bytes = Buffer.from(base64, "base64");
      if (!bytes.length || bytes.length > maxBytes || bytes.toString("base64") !== base64 || detectPaymentProofMime(bytes) !== mimeType) {
        return res.status(400).json({ error: "Isi berkas tidak cocok dengan tipe PNG, JPG, atau PDF." });
      }
      const payChannel = typeof req.body?.payChannel === "string" ? req.body.payChannel.trim() : "";
      if (!["BSI", "Muamalat", "MandiriSyariah"].includes(payChannel)) {
        return res.status(400).json({ error: "Metode transfer tidak valid." });
      }

      const billingRef = services.db.collection("financeBillings").doc(billingId);
      const billingSnapshot = await billingRef.get();
      if (!billingSnapshot.exists) return res.status(404).json({ error: "Tagihan tidak ditemukan." });
      const billing = billingSnapshot.data() || {};
      if (billing.tenantId !== actor.tenantId) return res.status(404).json({ error: "Tagihan tidak ditemukan pada tenant ini." });
      const santriId = typeof billing.santriId === "string" ? billing.santriId : "";
      if (actor.role === "Walisantri" && (!actor.linkedSantriId || actor.linkedSantriId !== santriId)) {
        return res.status(403).json({ error: "Tagihan tidak terhubung ke akun wali ini." });
      }
      if (!["Unpaid", "Overdue", "Partial"].includes(String(billing.status || ""))) {
        return res.status(409).json({ error: "Status tagihan tidak menerima bukti pembayaran baru." });
      }

      const bucketName = String(process.env.FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket || "").trim();
      if (!bucketName || !adminApp) return res.status(503).json({ error: "Bucket Storage server belum dikonfigurasi." });
      const safeName = safePaymentProofName(req.body?.fileName);
      const safeSantriId = santriId || "unlinked";
      const storagePath = "financeProofs/" + encodeURIComponent(actor.tenantId) + "/" + encodeURIComponent(safeSantriId) + "/" + encodeURIComponent(billingId) + "/" + uid + "-" + Date.now() + "-" + randomUUID() + "-" + safeName;
      const bucket = getStorage(adminApp).bucket(bucketName);
      storedFile = bucket.file(storagePath);
      await storedFile.save(bytes, {
        resumable: false,
        metadata: {
          contentType: mimeType,
          metadata: { tenantId: actor.tenantId, santriId: safeSantriId, billingId, uploadedByUid: uid },
        },
      });

      const financeControlRef = services.db.collection("tenants").doc(actor.tenantId).collection("settings").doc("financeControl");
      await services.db.runTransaction(async (transaction) => {
        const controlSnapshot = await transaction.get(financeControlRef);
        const latestSnapshot = await transaction.get(billingRef);
        if (!latestSnapshot.exists) throw financeProofError(404, "Tagihan tidak ditemukan.");
        const latest = latestSnapshot.data() || {};
        if (latest.tenantId !== actor.tenantId || latest.santriId !== billing.santriId) throw financeProofError(404, "Tagihan tidak ditemukan pada tenant ini.");
        if (actor.role === "Walisantri" && latest.santriId !== actor.linkedSantriId) throw financeProofError(403, "Tagihan tidak terhubung ke akun wali ini.");
        if (controlSnapshot.exists && controlSnapshot.data()?.financeLocked === true) throw financeProofError(423, "Buku keuangan sedang ditutup.");
        if (!["Unpaid", "Overdue", "Partial"].includes(String(latest.status || ""))) throw financeProofError(409, "Status tagihan berubah dan tidak menerima bukti baru.");
        transaction.update(billingRef, {
          status: "Verification",
          paymentMethod: "Transfer Manual (" + payChannel + ")",
          proofFile: safeName,
          proofStoragePath: storagePath,
          uploadedAt: new Date().toISOString(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedByUid: uid,
        });
      });
      return res.status(201).json({ ok: true, proofFile: safeName, proofStoragePath: storagePath });
    } catch (error: any) {
      if (storedFile) {
        try { await storedFile.delete({ ignoreNotFound: true }); } catch { /* Compensating cleanup is best-effort. */ }
      }
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error("Payment proof upload failed:", error?.code || "internal");
      return res.status(500).json({ error: "Bukti pembayaran gagal disimpan. Silakan coba kembali." });
    }
  });

  app.get("/api/finance/payment-proofs/:billingId", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const services = getAdminServices();
    if (services.ok === false) return res.status(503).json({ error: "Layanan keuangan belum tersedia." });
    try {
      const uid = (req as any).user?.uid;
      if (!uid) return res.status(401).json({ error: "Autentikasi diperlukan." });
      const actor = await loadFinanceProofActor(services.db, uid);
      const billingId = typeof req.params.billingId === "string" ? req.params.billingId.trim() : "";
      if (!billingId || billingId.length > 150 || billingId.includes("/")) return res.status(400).json({ error: "ID tagihan tidak valid." });
      const billingSnapshot = await services.db.collection("financeBillings").doc(billingId).get();
      if (!billingSnapshot.exists) return res.status(404).json({ error: "Bukti transfer tidak ditemukan." });
      const billing = billingSnapshot.data() || {};
      if (billing.tenantId !== actor.tenantId || typeof billing.proofStoragePath !== "string") return res.status(404).json({ error: "Bukti transfer tidak ditemukan." });
      const santriId = typeof billing.santriId === "string" && billing.santriId ? billing.santriId : "unlinked";
      if (actor.role === "Walisantri" && (!actor.linkedSantriId || actor.linkedSantriId !== santriId)) return res.status(404).json({ error: "Bukti transfer tidak ditemukan." });
      const expectedPrefix = "financeProofs/" + encodeURIComponent(actor.tenantId) + "/" + encodeURIComponent(santriId) + "/" + encodeURIComponent(billingId) + "/";
      if (!billing.proofStoragePath.startsWith(expectedPrefix) || billing.proofStoragePath.includes("..")) return res.status(404).json({ error: "Bukti transfer tidak ditemukan." });
      const bucketName = String(process.env.FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket || "").trim();
      if (!bucketName || !adminApp) return res.status(503).json({ error: "Bucket Storage server belum dikonfigurasi." });
      const file = getStorage(adminApp).bucket(bucketName).file(billing.proofStoragePath);
      const [exists] = await file.exists();
      if (!exists) return res.status(404).json({ error: "Berkas bukti transfer tidak ditemukan." });
      const [metadata] = await file.getMetadata();
      const custom = metadata.metadata || {};
      if ((custom.tenantId && custom.tenantId !== actor.tenantId) || (custom.billingId && custom.billingId !== billingId) || (custom.santriId && custom.santriId !== santriId)) {
        return res.status(404).json({ error: "Bukti transfer tidak ditemukan." });
      }
      const allowedMime = ["image/png", "image/jpeg", "application/pdf"];
      const mimeType = String(metadata.contentType || "");
      if (!allowedMime.includes(mimeType)) return res.status(415).json({ error: "Tipe berkas bukti tidak didukung." });
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", 'inline; filename="' + safePaymentProofName(billing.proofFile) + '"');
      res.setHeader("X-Content-Type-Options", "nosniff");
      getStorage(adminApp).bucket(bucketName).file(billing.proofStoragePath).createReadStream()
        .on("error", () => { if (!res.headersSent) res.status(404).end(); else res.end(); })
        .pipe(res);
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error("Payment proof download failed:", error?.code || "internal");
      return res.status(500).json({ error: "Bukti pembayaran tidak dapat dibuka." });
    }
  });

  // --------------------------------------------------------------------------
  // USER MANAGEMENT ENDPOINTS
  // --------------------------------------------------------------------------

  // 1. List / Search Users for acting admin's tenant
  app.get("/api/users", requireAuth, requireTenantAdmin, async (req, res) => {
    const actor = (req as any).actor;
    const services = getAdminServices();
    if (services.ok === false) {
      return res.status(503).json({ code: "ADMIN_SDK_UNAVAILABLE", error: services.error });
    }

    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
      const roleFilter = typeof req.query.role === "string" ? req.query.role.trim() : "";
      const statusFilter = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";

      const snapshot = await services.db
        .collection("users")
        .where("tenantId", "==", actor.tenantId)
        .get();

      let users = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          uid: doc.id,
          id: doc.id,
          name: data.name || data.displayName || "",
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
        };
      });

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
      if (isCredentialError(err)) {
        return res.status(503).json({
          code: "ADMIN_SDK_UNAVAILABLE",
          error: "Kredensial Firebase Admin SDK (Application Default Credentials) belum terpasang di server."
        });
      }
      if (isFirestoreStoreError(err)) {
        return res.status(503).json({
          code: "ADMIN_PROFILE_STORE_UNAVAILABLE",
          error: "Layanan basis data Firestore tidak dapat diakses untuk memuat daftar pengguna. Pastikan IAM role 'Cloud Datastore User' aktif."
        });
      }
      return res.status(500).json({ code: "INTERNAL_ERROR", error: "Gagal memuat daftar pengguna tenant." });
    }
  });

  // 2. Create User (Staff / Student / Guardian)
  app.post("/api/users", requireAuth, requireTenantAdmin, async (req, res) => {
    const actor = (req as any).actor;
    const services = getAdminServices();
    if (services.ok === false) {
      return res.status(503).json({ code: "ADMIN_SDK_UNAVAILABLE", error: services.error });
    }

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

    let createdAuthUid: string | null = null;
    try {
      // 1. Create Auth user via Firebase Admin SDK
      const authUserRecord = await services.auth.createUser({
        email: normalizedEmail,
        password: tempPassword,
        displayName: normalizedName,
        disabled: false,
      });
      createdAuthUid = authUserRecord.uid;

      // 2. Prepare user profile in Firestore (Tenant is immutable and taken from acting admin profile)
      const userProfile: Record<string, any> = {
        uid: createdAuthUid,
        email: normalizedEmail,
        name: normalizedName,
        username: typeof username === "string" && username.trim() ? username.trim() : normalizedEmail.split("@")[0],
        role,
        tenantId: actor.tenantId,
        tenantName: actor.tenantName || actor.tenantId,
        status: "active",
        mustChangePassword: true,
        modulePermissions: finalPermissions,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUid: actor.uid,
      };

      if (linkedSantriId) userProfile.linkedSantriId = linkedSantriId;
      if (linkedSantriName) userProfile.linkedSantriName = linkedSantriName;
      if (linkedSantriNis) userProfile.linkedSantriNis = linkedSantriNis;
      if (linkedSantriClass) userProfile.linkedSantriClass = linkedSantriClass;
      if (linkedSantriRoom) userProfile.linkedSantriRoom = linkedSantriRoom;

      // 3. Write profile to Firestore
      await services.db.collection("users").doc(createdAuthUid).set(userProfile);

      return res.status(201).json({
        success: true,
        user: userProfile,
      });
    } catch (err: any) {
      // Handle partial failure: rollback created Auth user if Firestore write fails
      if (createdAuthUid) {
        try {
          await services.auth.deleteUser(createdAuthUid);
        } catch {
          // Cleanup log
        }
      }

      if (isCredentialError(err)) {
        return res.status(503).json({
          code: "ADMIN_SDK_UNAVAILABLE",
          error: "Kredensial Firebase Admin SDK (Application Default Credentials) belum terpasang di server."
        });
      }

      if (isFirestoreStoreError(err)) {
        return res.status(503).json({
          code: "ADMIN_PROFILE_STORE_UNAVAILABLE",
          error: "Layanan basis data Firestore tidak dapat diakses untuk menyimpan profil pengguna baru. Pastikan IAM role 'Cloud Datastore User' aktif."
        });
      }

      const safeMessage = err.code === "auth/email-already-exists"
        ? "Alamat email ini sudah terdaftar dalam sistem."
        : "Gagal membuat akun pengguna.";

      return res.status(400).json({ code: "CREATION_FAILED", error: safeMessage });
    }
  });

  // 3. Update User (Role, Status, Module Permissions, Name)
  app.patch("/api/users/:uid", requireAuth, requireTenantAdmin, async (req, res) => {
    const actor = (req as any).actor;
    const targetUid = req.params.uid;
    const services = getAdminServices();
    if (services.ok === false) {
      return res.status(503).json({ code: "ADMIN_SDK_UNAVAILABLE", error: services.error });
    }

    try {
      const targetDoc = await services.db.collection("users").doc(targetUid).get();
      if (!targetDoc.exists) {
        return res.status(404).json({ code: "NOT_FOUND", error: "Pengguna tidak ditemukan." });
      }

      const targetData = targetDoc.data() || {};

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
        try {
          await services.auth.updateUser(targetUid, { disabled: normalizedStatus !== "active" });
        } catch {
          // Continue if auth update fails due to preview limits
        }
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

      await services.db.collection("users").doc(targetUid).update(updates);

      return res.json({
        success: true,
        user: { ...targetData, ...updates, uid: targetUid },
      });
    } catch (err: any) {
      if (isCredentialError(err)) {
        return res.status(503).json({
          code: "ADMIN_SDK_UNAVAILABLE",
          error: "Kredensial Firebase Admin SDK (Application Default Credentials) belum terpasang di server."
        });
      }
      if (isFirestoreStoreError(err)) {
        return res.status(503).json({
          code: "ADMIN_PROFILE_STORE_UNAVAILABLE",
          error: "Layanan basis data Firestore tidak dapat diakses untuk memperbarui pengguna. Pastikan IAM role 'Cloud Datastore User' aktif."
        });
      }
      return res.status(500).json({ code: "UPDATE_FAILED", error: "Gagal memperbarui data pengguna." });
    }
  });

  // 4. Send Firebase Password Reset Email
  app.post("/api/users/:uid/reset-password", requireAuth, requireTenantAdmin, async (req, res) => {
    const actor = (req as any).actor;
    const targetUid = req.params.uid;
    const services = getAdminServices();
    if (services.ok === false) {
      return res.status(503).json({ code: "ADMIN_SDK_UNAVAILABLE", error: services.error });
    }

    try {
      const targetDoc = await services.db.collection("users").doc(targetUid).get();
      if (!targetDoc.exists) {
        return res.status(404).json({ code: "NOT_FOUND", error: "Pengguna tidak ditemukan." });
      }

      const targetData = targetDoc.data() || {};
      if (targetData.tenantId !== actor.tenantId) {
        return res.status(403).json({ code: "FORBIDDEN", error: "Pengguna berada di luar tenant Anda." });
      }

      if (!targetData.email) {
        return res.status(400).json({ code: "NO_EMAIL", error: "Pengguna tidak memiliki alamat email terdaftar." });
      }

      // Generate password reset link via Firebase Admin SDK
      const link = await services.auth.generatePasswordResetLink(targetData.email);

      return res.json({
        success: true,
        message: `Tautan reset kata sandi berhasil disiapkan untuk ${targetData.email}.`,
        resetLink: link,
      });
    } catch (err: any) {
      if (isCredentialError(err)) {
        return res.status(503).json({
          code: "ADMIN_SDK_UNAVAILABLE",
          error: "Kredensial Firebase Admin SDK (Application Default Credentials) belum terpasang di server."
        });
      }
      if (isFirestoreStoreError(err)) {
        return res.status(503).json({
          code: "ADMIN_PROFILE_STORE_UNAVAILABLE",
          error: "Layanan basis data Firestore tidak dapat diakses untuk memverifikasi profil pengguna. Pastikan IAM role 'Cloud Datastore User' aktif."
        });
      }
      return res.status(500).json({ code: "RESET_FAILED", error: "Gagal membuat tautan reset password." });
    }
  });

  // 5. Clear mustChangePassword (Self-Authenticated endpoint)
  app.post("/api/users/clear-must-change-password", requireAuth, async (req, res) => {
    const uid = (req as any).user?.uid;
    const services = getAdminServices();
    if (services.ok === false) {
      return res.status(503).json({ code: "ADMIN_SDK_UNAVAILABLE", error: services.error });
    }

    try {
      const userRef = services.db.collection("users").doc(uid);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        return res.status(404).json({ code: "NOT_FOUND", error: "Profil pengguna tidak ditemukan." });
      }

      await userRef.update({
        mustChangePassword: false,
        updatedAt: new Date().toISOString(),
      });

      return res.json({ success: true, message: "Status mustChangePassword berhasil dihapus." });
    } catch (err: any) {
      if (isCredentialError(err)) {
        return res.status(503).json({
          code: "ADMIN_SDK_UNAVAILABLE",
          error: "Kredensial Firebase Admin SDK (Application Default Credentials) belum terpasang di server."
        });
      }
      if (isFirestoreStoreError(err)) {
        return res.status(503).json({
          code: "ADMIN_PROFILE_STORE_UNAVAILABLE",
          error: "Layanan basis data Firestore tidak dapat diakses untuk memperbarui status kata sandi. Pastikan IAM role 'Cloud Datastore User' aktif."
        });
      }
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
