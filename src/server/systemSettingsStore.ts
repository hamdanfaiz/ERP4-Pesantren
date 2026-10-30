import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class SystemSettingsStoreError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SystemSettingsStoreError';
    this.status = status;
  }
}

type SettingsObject = Record<string, any>;
let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new SystemSettingsStoreError(503, 'Konfigurasi backend Supabase belum lengkap.');
  if (!serviceClient) {
    serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return serviceClient;
}

function plainObject(value: unknown): value is SettingsObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function boundedString(value: unknown, max: number, label: string, fallback = ''): string {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string' || value.length > max) {
    throw new SystemSettingsStoreError(400, `${label} tidak valid.`);
  }
  return value.trim();
}

function sanitizeSection(value: unknown, fields: Record<string, number>, label: string): SettingsObject {
  if (value == null) return {};
  if (!plainObject(value)) throw new SystemSettingsStoreError(400, `${label} tidak valid.`);
  return Object.fromEntries(Object.entries(fields)
    .filter(([key]) => Object.prototype.hasOwnProperty.call(value, key))
    .map(([key, max]) => [key, boundedString(value[key], max, `${label}.${key}`)]));
}

/** Keep the tenant settings record small and strip all values that could carry credentials. */
export function sanitizeTenantSettings(value: unknown): SettingsObject {
  if (!plainObject(value)) throw new SystemSettingsStoreError(400, 'Snapshot pengaturan tenant tidak valid.');
  const generalInput = plainObject(value.generalSettings) ? value.generalSettings : {};
  const orgInput = plainObject(value.orgInfo) ? value.orgInfo : {};
  const integrationsInput = plainObject(value.integrations) ? value.integrations : {};
  const mobileInput = plainObject(value.mobileConfig) ? value.mobileConfig : {};
  const requestedTimeZone = generalInput.timezone == null || generalInput.timezone === ''
    ? 'Asia/Jakarta'
    : String(generalInput.timezone);
  if (!['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'].includes(requestedTimeZone)) {
    throw new SystemSettingsStoreError(400, 'Zona waktu pesantren tidak valid. Pilih WIB, WITA, atau WIT.');
  }
  const generalSettings: SettingsObject = {
    academicYear: boundedString(generalInput.academicYear, 20, 'Tahun ajaran', '2026/2027'),
    semester: ['Ganjil', 'Genap'].includes(String(generalInput.semester)) ? generalInput.semester : 'Ganjil',
    language: ['id', 'en', 'ar'].includes(String(generalInput.language)) ? generalInput.language : 'id',
    timezone: requestedTimeZone,
    theme: ['dark', 'light', 'system'].includes(String(generalInput.theme)) ? generalInput.theme : 'dark',
    isReportCardLocked: generalInput.isReportCardLocked === true,
  };
  const orgInfo = {
    schoolName: boundedString(orgInput.schoolName, 180, 'Nama pesantren', 'Pesantren'),
    address: boundedString(orgInput.address, 1000, 'Alamat'),
    phone: boundedString(orgInput.phone, 80, 'Telepon'),
    email: boundedString(orgInput.email, 180, 'Email'),
    principalName: boundedString(orgInput.principalName, 180, 'Nama pimpinan'),
    website: boundedString(orgInput.website, 300, 'Website'),
    logoUrl: boundedString(orgInput.logoUrl, 2000, 'URL logo'),
    faviconUrl: boundedString(orgInput.faviconUrl, 2000, 'URL favicon'),
    pageTitleFormat: boundedString(orgInput.pageTitleFormat, 180, 'Format judul halaman', 'ERP4 Pesantren | {schoolName}'),
  };
  const integrations: SettingsObject = {
    waGatewayEndpoint: boundedString(integrationsInput.waGatewayEndpoint, 500, 'Endpoint gateway WhatsApp'),
    smtpHost: boundedString(integrationsInput.smtpHost, 255, 'Host SMTP'),
    smtpPort: boundedString(integrationsInput.smtpPort, 10, 'Port SMTP'),
    smtpUser: boundedString(integrationsInput.smtpUser, 180, 'User SMTP'),
  };
  const mobileConfig = {
    showDetailedGrades: mobileInput.showDetailedGrades !== false,
    allowLeaveRequests: mobileInput.allowLeaveRequests !== false,
    pushNotifications: mobileInput.pushNotifications !== false,
    supportWhatsapp: boundedString(mobileInput.supportWhatsapp, 80, 'Nomor bantuan WhatsApp'),
  };

  let permissions: SettingsObject = {};
  if (value.permissions != null) {
    if (!plainObject(value.permissions) || JSON.stringify(value.permissions).length > 64000) {
      throw new SystemSettingsStoreError(400, 'Matriks izin modul tidak valid.');
    }
    const allowedRoles = new Set(['SuperAdmin', 'Admin', 'Ustadz', 'Santri', 'Walisantri']);
    const allowedModules = new Set([
      'dashboard', 'master-data', 'users', 'settings', 'ppdb', 'cbt', 'tahfidz', 'boarding',
      'academic', 'lms', 'library', 'finance', 'communication', 'healthcare', 'cooperative',
      'laundry', 'enterprise', 'erp', 'hris', 'ga', 'document', 'alumni', 'crm', 'donation',
      'marketplace', 'intelligence',
    ]);
    for (const [role, moduleMap] of Object.entries(value.permissions)) {
      if (!allowedRoles.has(role) || !plainObject(moduleMap)) continue;
      permissions[role] = Object.fromEntries(Object.entries(moduleMap)
        .filter(([module, enabled]) => allowedModules.has(module) && typeof enabled === 'boolean'));
    }
  }

  const result = { generalSettings, orgInfo, integrations, mobileConfig, permissions };
  if (JSON.stringify(result).length > 131072) throw new SystemSettingsStoreError(400, 'Pengaturan melebihi batas ukuran.');
  return result;
}

async function resolveTenantUuid(identifier: string): Promise<string> {
  const tenant = String(identifier || '').trim();
  if (!tenant) throw new SystemSettingsStoreError(403, 'Tenant aktif tidak ditemukan pada profil.');
  const client = getServiceClient();
  let query = client.from('tenants').select('id,status').limit(2);
  const result = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant)
    ? await query.eq('id', tenant)
    : await query.eq('legacy_tenant_key', tenant);
  let rows = result.data;
  let error = result.error;
  if (!error && (!rows || rows.length === 0) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant)) {
    const bySlug = await client.from('tenants').select('id,status').eq('slug', tenant.toLowerCase()).limit(2);
    rows = bySlug.data;
    error = bySlug.error;
  }
  if (error) throw new SystemSettingsStoreError(503, 'Tenant belum dapat diverifikasi pada Supabase.');
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].status !== 'active') {
    throw new SystemSettingsStoreError(403, 'Tenant aktif tidak ditemukan pada Supabase.');
  }
  return String(rows[0].id);
}

export async function getTenantSystemSettings(tenantIdentifier: string) {
  const tenantUuid = await resolveTenantUuid(tenantIdentifier);
  const { data, error } = await getServiceClient().from('tenant_settings')
    .select('settings,updated_at,legacy_imported_at')
    .eq('tenant_id', tenantUuid)
    .maybeSingle();
  if (error) throw new SystemSettingsStoreError(503, 'Pengaturan tenant belum dapat dimuat dari Supabase.');
  return data ? {
    settings: sanitizeTenantSettings(data.settings),
    updatedAt: data.updated_at,
    legacyImportedAt: data.legacy_imported_at,
  } : null;
}

export async function saveTenantSystemSettings(
  tenantIdentifier: string,
  actorUserId: string,
  expectedUpdatedAt: string | null,
  value: unknown,
) {
  const tenantUuid = await resolveTenantUuid(tenantIdentifier);
  const settings = sanitizeTenantSettings(value);
  const { data, error } = await getServiceClient().rpc('save_tenant_system_settings', {
    p_tenant_id: tenantUuid,
    p_actor_user_id: actorUserId,
    p_expected_updated_at: expectedUpdatedAt,
    p_settings: settings,
  });
  if (error) {
    const status = error.code === '40001' || error.code === '23505' ? 409 : error.code === '42501' ? 403 : error.code === '22023' ? 400 : 503;
    throw new SystemSettingsStoreError(status, status === 409
      ? 'Pengaturan diubah oleh Admin lain; muat ulang data tenant sebelum menyimpan.'
      : status >= 500 ? 'Pengaturan tenant belum dapat disimpan ke Supabase.' : error.message);
  }
  const saved = data && typeof data === 'object' ? data as Record<string, any> : null;
  if (!saved || !saved.settings || typeof saved.updatedAt !== 'string') {
    throw new SystemSettingsStoreError(503, 'Konfirmasi penyimpanan pengaturan belum lengkap.');
  }
  return { settings: sanitizeTenantSettings(saved.settings), updatedAt: saved.updatedAt };
}

export async function importLegacyTenantSystemSettings(
  tenantIdentifier: string,
  actorUserId: string,
  sourceFingerprint: string,
  value: unknown,
) {
  const tenantUuid = await resolveTenantUuid(tenantIdentifier);
  const settings = sanitizeTenantSettings(value);
  const { data, error } = await getServiceClient().rpc('import_legacy_tenant_settings', {
    p_tenant_id: tenantUuid,
    p_actor_user_id: actorUserId,
    p_source_fingerprint: sourceFingerprint,
    p_settings: settings,
  });
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 400 : error.code === '23505' ? 409 : 503;
    throw new SystemSettingsStoreError(status, status >= 500 ? 'Impor pengaturan tenant belum dapat diselesaikan.' : error.message);
  }
  return data as { success: boolean; alreadyImported: boolean };
}
