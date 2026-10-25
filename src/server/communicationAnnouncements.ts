import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { listTenantProfiles, type StoredUserProfile } from './identityStore';

export class CommunicationStoreError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'CommunicationStoreError';
    this.status = status;
  }
}

type AnnouncementRow = {
  id: string;
  tenant_id: string;
  title: string;
  body: string;
  target_audience: string;
  status: 'draft' | 'scheduled' | 'sent';
  is_urgent: boolean;
  read_count: number;
  legacy_read_count: number;
  created_by_user_id: string;
  created_at: string;
  scheduled_at: string | null;
};

let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new CommunicationStoreError(503, 'Konfigurasi backend Supabase belum lengkap.');
  if (!serviceClient) {
    serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return serviceClient;
}

function normalizedRole(profile: StoredUserProfile): string {
  return String(profile.role || '').trim().toLowerCase();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolveTenantUuid(tenantIdentifier: string): Promise<string> {
  const identifier = String(tenantIdentifier || '').trim();
  if (!identifier) throw new CommunicationStoreError(403, 'Tenant aktif tidak ditemukan pada profil.');
  const client = getServiceClient();
  const query = client.from('tenants').select('id,status').limit(2);
  const result = isUuid(identifier)
    ? await query.eq('id', identifier)
    : await query.eq('legacy_tenant_key', identifier);
  let rows = result.data;
  let error = result.error;
  if (!error && (!rows || rows.length === 0) && !isUuid(identifier)) {
    const bySlug = await client.from('tenants').select('id,status').eq('slug', identifier.toLowerCase()).limit(2);
    rows = bySlug.data;
    error = bySlug.error;
  }
  if (error) throw new CommunicationStoreError(503, 'Tenant belum dapat diverifikasi pada Supabase.');
  if (!Array.isArray(rows) || rows.length !== 1 || String(rows[0].status).toLowerCase() !== 'active') {
    throw new CommunicationStoreError(403, 'Tenant aktif tidak ditemukan pada Supabase.');
  }
  return String(rows[0].id);
}

async function assertAnnouncementImportReady(tenantUuid: string): Promise<void> {
  const { data, error } = await getServiceClient()
    .from('communication_announcement_import_state')
    .select('tenant_id')
    .eq('tenant_id', tenantUuid)
    .maybeSingle();
  if (error) throw new CommunicationStoreError(503, 'Status migrasi pengumuman belum dapat diverifikasi.');
  if (!data) throw new CommunicationStoreError(503, 'Admin harus meninjau dan menyelesaikan snapshot pengumuman lama sebelum modul diaktifkan.');
}

const ALLOWED_ANNOUNCEMENT_TARGETS = [
  'Semua Wali Santri', 'Guru & Musyrif', 'Semua Santri', 'Wali Santri Kelas VII - A',
];

async function announcementRecipientUserIds(tenantUuid: string, target: string): Promise<Set<string>> {
  if (!ALLOWED_ANNOUNCEMENT_TARGETS.includes(target)) return new Set();
  const client = getServiceClient();
  const recipients = new Set<string>();
  const pageSize = 500;
  const maxRecipients = 50000;
  for (let offset = 0; offset < maxRecipients; offset += pageSize) {
    const { data, error } = await client.rpc('communication_announcement_recipient_user_ids', {
      p_tenant_id: tenantUuid,
      p_target_audience: target,
    }).range(offset, offset + pageSize - 1);
    if (error || !Array.isArray(data)) {
      throw new CommunicationStoreError(503, 'Daftar penerima pengumuman belum dapat diverifikasi.');
    }
    for (const row of data as Array<{ user_id?: string }>) {
      const userId = String(row.user_id || '').trim();
      if (userId) recipients.add(userId);
    }
    if (data.length < pageSize) return recipients;
  }
  throw new CommunicationStoreError(503, 'Jumlah penerima pengumuman melebihi batas pemrosesan aman.');
}
async function announcementRecipientsByTarget(tenantUuid: string, targets: string[]) {
  const uniqueTargets = [...new Set(targets)].filter((target) => ALLOWED_ANNOUNCEMENT_TARGETS.includes(target));
  const entries = await Promise.all(uniqueTargets.map(async (target) => [
    target,
    await announcementRecipientUserIds(tenantUuid, target),
  ] as const));
  return new Map<string, Set<string>>(entries);
}

function mapAnnouncement(row: AnnouncementRow, readCount: number, totalTarget: number, readByActor: boolean, actorName: string) {
  const createdAt = new Date(row.scheduled_at || row.created_at);
  const date = Number.isNaN(createdAt.getTime()) ? '' : createdAt.toISOString().slice(0, 10);
  return {
    id: row.id,
    title: row.title,
    content: row.body,
    target: row.target_audience,
    date,
    status: row.status === 'sent' ? 'Sent' : row.status === 'scheduled' ? 'Scheduled' : 'Draft',
    readCount,
    legacyReadCount: Number(row.legacy_read_count || 0),
    totalTarget,
    readByCurrentUser: readByActor,
    acknowledgedBy: readByActor && actorName ? [actorName] : [],
    isUrgent: row.is_urgent,
  };
}

export async function listCommunicationAnnouncements(tenantId: string, actor: StoredUserProfile) {
  const client = getServiceClient();
  const tenantUuid = await resolveTenantUuid(tenantId);
  await assertAnnouncementImportReady(tenantUuid);
  const rowsResult = await client.from('communication_announcements')
    .select('id,tenant_id,title,body,target_audience,status,is_urgent,read_count,legacy_read_count,created_by_user_id,created_at,scheduled_at')
    .eq('tenant_id', tenantUuid)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(500);
  if (rowsResult.error) throw new CommunicationStoreError(503, 'Pengumuman belum dapat dimuat dari Supabase.');
  const rows = (rowsResult.data || []) as AnnouncementRow[];
  const recipientsByTarget = await announcementRecipientsByTarget(tenantUuid, rows.map((row) => row.target_audience));
  const canManageAnnouncements = ['admin', 'superadmin', 'super_admin'].includes(normalizedRole(actor));
  const visibleRows = rows.filter((row) => canManageAnnouncements
    ? true
    : row.status === 'sent' && recipientsByTarget.get(row.target_audience)?.has(actor.uid));
  if (!visibleRows.length) return [];

  const announcementIds = visibleRows.map((row) => row.id);
  const readsResult = await client.from('communication_announcement_reads')
    .select('announcement_id')
    .eq('tenant_id', tenantUuid)
    .eq('user_id', actor.uid)
    .in('announcement_id', announcementIds)
    .limit(500);
  if (readsResult.error) throw new CommunicationStoreError(503, 'Status baca pengumuman belum dapat dimuat.');
  const actorReadIds = new Set((readsResult.data || []).map((read) => String(read.announcement_id)));

  return visibleRows.map((row) => {
    const totalTarget = recipientsByTarget.get(row.target_audience)?.size || 0;
    return mapAnnouncement(row, Number(row.read_count || 0) + Number(row.legacy_read_count || 0), totalTarget, actorReadIds.has(row.id), actor.name);
  });
}

export async function createCommunicationAnnouncement(
  tenantId: string,
  actor: StoredUserProfile,
  input: { title: unknown; content: unknown; target: unknown; isUrgent: unknown },
) {
  if (!['admin', 'superadmin', 'super_admin'].includes(normalizedRole(actor))) {
    throw new CommunicationStoreError(403, 'Hanya Admin tenant yang dapat menerbitkan pengumuman.');
  }
  const rawTitle = String(input.title || '').trim();
  const content = String(input.content || '').trim();
  const target = String(input.target || '').trim();
  const title = input.isUrgent === true && !rawTitle.toLowerCase().startsWith('darurat:') ? 'DARURAT: ' + rawTitle : rawTitle;
  if (!title || title.length > 180 || !content || content.length > 12000 || !ALLOWED_ANNOUNCEMENT_TARGETS.includes(target)) {
    throw new CommunicationStoreError(400, 'Judul, isi, atau target pengumuman tidak valid.');
  }
  const tenantUuid = await resolveTenantUuid(tenantId);
  const totalTarget = (await announcementRecipientUserIds(tenantUuid, target)).size;
  if (totalTarget === 0) {
    throw new CommunicationStoreError(409, 'Belum ada akun aktif dan tertaut pada audiens ini; pengumuman belum diterbitkan.');
  }
  const client = getServiceClient();
  await assertAnnouncementImportReady(tenantUuid);
  const { data, error } = await client.from('communication_announcements').insert({
    tenant_id: tenantUuid,
    title,
    body: content,
    target_audience: target,
    status: 'sent',
    is_urgent: input.isUrgent === true,
    created_by_user_id: actor.uid,
  }).select('id,tenant_id,title,body,target_audience,status,is_urgent,read_count,legacy_read_count,created_by_user_id,created_at,scheduled_at').single();
  if (error || !data) {
    throw new CommunicationStoreError(503, 'Pengumuman belum dapat disimpan ke Supabase.');
  }
  return mapAnnouncement(data as AnnouncementRow, Number(data.read_count || 0) + Number(data.legacy_read_count || 0), totalTarget, false, actor.name);
}

export async function acknowledgeCommunicationAnnouncement(tenantId: string, actor: StoredUserProfile, announcementId: string) {
  if (!['walisantri', 'wali_santri'].includes(normalizedRole(actor))) {
    throw new CommunicationStoreError(403, 'Hanya akun Wali Santri yang dapat mengonfirmasi pengumuman.');
  }
  const client = getServiceClient();
  const tenantUuid = await resolveTenantUuid(tenantId);
  await assertAnnouncementImportReady(tenantUuid);
  const { data: announcement, error: announcementError } = await client.from('communication_announcements')
    .select('id,target_audience,status')
    .eq('tenant_id', tenantUuid)
    .eq('id', announcementId)
    .maybeSingle();
  if (announcementError) throw new CommunicationStoreError(503, 'Pengumuman belum dapat diverifikasi.');
  if (!announcement || announcement.status !== 'sent') throw new CommunicationStoreError(404, 'Pengumuman tidak ditemukan.');
  const recipients = await announcementRecipientUserIds(tenantUuid, String(announcement.target_audience));
  if (!recipients.has(actor.uid)) {
    throw new CommunicationStoreError(403, 'Pengumuman ini bukan untuk akun Anda.');
  }

  const { error } = await client.from('communication_announcement_reads').insert({
    tenant_id: tenantUuid,
    announcement_id: announcementId,
    user_id: actor.uid,
  });
  if (!error) return { alreadyRead: false };
  if (error.code === '23505') return { alreadyRead: true };
  throw new CommunicationStoreError(503, 'Konfirmasi baca belum dapat disimpan.');
}
type PreparedLegacyAnnouncement = {
  legacy_source_id: string;
  title: string;
  body: string;
  target_audience: string;
  status: 'draft' | 'scheduled' | 'sent';
  is_urgent: boolean;
  legacy_read_count: number;
  created_at: string;
  scheduled_at: string | null;
  acknowledged_user_ids: string[];
};

type LegacyAnnouncementPreview = {
  tenantUuid: string;
  rows: PreparedLegacyAnnouncement[];
  issues: Array<{ sourceId: string; reason: string }>;
  warnings: Array<{ sourceId: string; reason: string }>;
  fingerprint: string;
};

function toLegacyCreatedAt(value: unknown): string | null {
  let dateValue = value;
  if (dateValue && typeof dateValue === 'object' && 'toDate' in dateValue && typeof (dateValue as any).toDate === 'function') {
    dateValue = (dateValue as any).toDate();
  }
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    const parsed = new Date(`${dateValue}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const parsed = dateValue instanceof Date ? dateValue : new Date(String(dateValue || ''));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function previewLegacyCommunicationAnnouncements(
  tenantIdentifier: string,
  actor: StoredUserProfile,
  sourceRows: Array<{ sourceId: string; value: Record<string, any> }>,
): Promise<LegacyAnnouncementPreview> {
  if (!['admin', 'superadmin', 'super_admin'].includes(normalizedRole(actor))) {
    throw new CommunicationStoreError(403, 'Hanya Admin tenant yang dapat mengimpor pengumuman.');
  }
  if (!Array.isArray(sourceRows) || sourceRows.length > 500) {
    throw new CommunicationStoreError(413, 'Impor pengumuman dibatasi maksimal 500 record per preview.');
  }
  const [tenantUuid, profiles] = await Promise.all([
    resolveTenantUuid(tenantIdentifier),
    listTenantProfiles(tenantIdentifier),
  ]);
  const issues: LegacyAnnouncementPreview['issues'] = [];
  const warnings: LegacyAnnouncementPreview['warnings'] = [];
  const rows: PreparedLegacyAnnouncement[] = [];
  const sourceIds = new Set<string>();
  const allowedTargets = ALLOWED_ANNOUNCEMENT_TARGETS;
  const orderedSourceRows = [...sourceRows].sort((left, right) => String(left?.sourceId || '').localeCompare(String(right?.sourceId || '')));
  const recipientIdsByTarget = await announcementRecipientsByTarget(tenantUuid, orderedSourceRows.map((item) => String(item?.value?.target || '').trim()));

  for (const item of orderedSourceRows) {
    const sourceId = String(item?.sourceId || '').trim();
    const value = item?.value || {};
    const issue = (reason: string) => issues.push({ sourceId: sourceId || '(tanpa id)', reason });
    if (!sourceId || sourceId.length > 1800 || sourceIds.has(sourceId)) {
      issue('ID dokumen kosong, terlalu panjang, atau duplikat.');
      continue;
    }
    sourceIds.add(sourceId);
    const rawTitle = String(value.title || '').trim();
    const title = value.isUrgent === true && !rawTitle.toLowerCase().startsWith('darurat:') ? `DARURAT: ${rawTitle}` : rawTitle;
    const body = String(value.content ?? value.body ?? '').trim();
    const target = String(value.target || '').trim();
    const rawStatus = String(value.status || 'draft').trim().toLowerCase();
    const status = rawStatus === 'sent' ? 'sent' : rawStatus === 'scheduled' ? 'scheduled' : rawStatus === 'draft' ? 'draft' : null;
    const createdAt = toLegacyCreatedAt(value.createdAt ?? value.date);
    const scheduledAt = status === 'scheduled' ? toLegacyCreatedAt(value.scheduledAt ?? value.scheduledDate ?? value.date) : null;
    if (!title || title.length > 180 || !body || body.length > 12000 || !allowedTargets.includes(target) || !status || !createdAt || (status === 'scheduled' && !scheduledAt)) {
      issue('Judul, isi, audiens, status, atau tanggal tidak valid; sesuaikan record sumber lalu preview ulang.');
      continue;
    }

    const rawAcknowledgedBy = Array.isArray(value.acknowledgedBy) ? value.acknowledgedBy : [];
    if (!Array.isArray(value.acknowledgedBy) && value.acknowledgedBy != null) {
      issue('Daftar konfirmasi baca lama tidak berbentuk array.');
      continue;
    }
    const mappedUserIds = new Set<string>();
    let hasUnmatchedAcknowledgement = false;
    for (const rawName of rawAcknowledgedBy) {
      const name = String(rawName || '').trim().toLocaleLowerCase();
      if (!name) continue;
      const matches = profiles.filter((profile) =>
        String(profile.name || '').trim().toLocaleLowerCase() === name
        && ['walisantri', 'wali_santri'].includes(normalizedRole(profile))
        && recipientIdsByTarget.get(target)?.has(profile.uid) === true);
      if (matches.length !== 1) {
        hasUnmatchedAcknowledgement = true;
        issue('Satu atau lebih konfirmasi baca tidak cocok secara unik dengan akun Wali aktif pada audiens ini.');
        break;
      }
      mappedUserIds.add(matches[0].uid);
    }
    if (hasUnmatchedAcknowledgement) continue;

    const rawReadCount = value.readCount == null ? mappedUserIds.size : Number(value.readCount);
    if (!Number.isSafeInteger(rawReadCount) || rawReadCount < mappedUserIds.size) {
      issue('Jumlah baca lama tidak valid atau lebih kecil daripada daftar konfirmasi yang dapat dipetakan.');
      continue;
    }
    const legacyReadCount = rawReadCount - mappedUserIds.size;
    if (legacyReadCount > 0) {
      warnings.push({ sourceId, reason: `${legacyReadCount} hitungan baca lama tidak memiliki identitas akun; nilai agregat akan tetap disimpan terpisah.` });
    }
    rows.push({
      legacy_source_id: sourceId,
      title,
      body,
      target_audience: target,
      status,
      is_urgent: value.isUrgent === true,
      legacy_read_count: legacyReadCount,
      created_at: createdAt,
      scheduled_at: scheduledAt,
      acknowledged_user_ids: Array.from(mappedUserIds).sort(),
    });
  }

  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ tenantUuid, rows, issues, warnings }))
    .digest('hex');
  return { tenantUuid, rows, issues, warnings, fingerprint };
}

export async function applyLegacyCommunicationAnnouncements(preview: LegacyAnnouncementPreview, actor: StoredUserProfile) {
  if (!['admin', 'superadmin', 'super_admin'].includes(normalizedRole(actor))) {
    throw new CommunicationStoreError(403, 'Hanya Admin tenant yang dapat mengimpor pengumuman.');
  }
  if (preview.issues.length) {
    throw new CommunicationStoreError(409, 'Preview memiliki record yang perlu direkonsiliasi sebelum impor.');
  }
  const client = getServiceClient();
  const { data, error } = await client.rpc('import_communication_announcements', {
    p_tenant_id: preview.tenantUuid,
    p_actor_user_id: actor.uid,
    p_rows: preview.rows,
    p_source_fingerprint: preview.fingerprint,
  });
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 400 : error.code === '23514' ? 409 : 503;
    throw new CommunicationStoreError(status, status >= 500 ? 'Impor pengumuman belum dapat diselesaikan.' : error.message);
  }
  return data as { imported: number; alreadyImported: number; rowsScanned: number };
}
