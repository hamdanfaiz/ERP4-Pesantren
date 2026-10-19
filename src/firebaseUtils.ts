import React, { useCallback, useEffect, useRef, useState } from 'react';
import { auth, db } from './firebase';
import { collection, doc, onSnapshot, query, setDoc, where, writeBatch } from 'firebase/firestore';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}


/** Always scope collection reads to the authenticated profile tenant. Missing scope returns an impossible query. */
export function tenantScopedQuery(source: any, tenantId: string | null | undefined, ...constraints: any[]) {
  const activeTenantId = typeof tenantId === 'string' ? tenantId.trim() : '';
  return query(source, where('tenantId', '==', activeTenantId || '__tenant_scope_unavailable__'), ...constraints);
}

/** Add the authenticated tenant to new records and reject data already bound elsewhere. */
export function tenantRecord<T extends Record<string, any>>(tenantId: string | null | undefined, data: T): T & { tenantId: string } {
  const activeTenantId = typeof tenantId === 'string' ? tenantId.trim() : '';
  if (!activeTenantId) throw new Error('Tenant aktif wajib tersedia untuk menyimpan data.');
  if (typeof data?.tenantId === 'string' && data.tenantId !== activeTenantId) {
    throw new Error('Record berasal dari tenant lain dan tidak dapat disimpan.');
  }
  return { ...data, tenantId: activeTenantId };
}


type TenantOperationalRecord = { id: string; tenantId?: string; _firestoreId?: string; [key: string]: any };
function tenantOperationalDocumentId(tenantId: string, recordId: string): string {
  const safeTenant = encodeURIComponent(tenantId).slice(0, 180);
  const safeRecord = encodeURIComponent(recordId).slice(0, 900);
  if (!tenantId || !recordId || !safeRecord) throw new Error('ID tenant dan record wajib tersedia.');
  return 't_' + safeTenant + '_' + safeRecord;
}
function withoutFirestoreMetadata(record: TenantOperationalRecord): TenantOperationalRecord {
  const { _firestoreId, ...data } = record;
  return data;
}
async function persistTenantOperationalDiff(collectionName: string, tenantId: string, previous: TenantOperationalRecord[], next: TenantOperationalRecord[]) {
  if (!tenantId || !auth.currentUser) throw new Error('Sesi tenant aktif diperlukan untuk menyimpan data.');
  const previousById = new Map(previous.map(record => [String(record.id), record]));
  const nextById = new Map(next.map(record => [String(record.id), record]));
  const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  for (const [id, record] of previousById) {
    if (!nextById.has(id)) {
      const documentId = record._firestoreId || tenantOperationalDocumentId(tenantId, id);
      operations.push(batch => batch.delete(doc(db, collectionName, documentId)));
    }
  }
  for (const [id, record] of nextById) {
    if (!id || id === 'undefined' || id.length > 300) throw new Error('Setiap record harus memiliki ID yang valid (maksimal 300 karakter).');
    const before = previousById.get(id);
    const nextData = withoutFirestoreMetadata(record);
    if (nextData.tenantId && nextData.tenantId !== tenantId) throw new Error('Record dari tenant lain tidak dapat disimpan.');
    const previousData = before ? withoutFirestoreMetadata(before) : null;
    if (before && JSON.stringify(previousData) === JSON.stringify({ ...nextData, tenantId })) continue;
    const documentId = before?._firestoreId || tenantOperationalDocumentId(tenantId, id);
    const safeData: TenantOperationalRecord = { ...nextData, tenantId, id };
    if (before?.createdByUid) safeData.createdByUid = before.createdByUid;
    else if (!before && auth.currentUser?.uid) safeData.createdByUid = auth.currentUser.uid;
    operations.push(batch => batch.set(doc(db, collectionName, documentId), safeData));
  }
  for (let offset = 0; offset < operations.length; offset += 400) {
    const batch = writeBatch(db);
    operations.slice(offset, offset + 400).forEach(operation => operation(batch));
    await batch.commit();
  }
}
/** Live tenant-scoped records with Firestore as the source of truth. No browser persistence fallback is used. */
export function useTenantOperationalCollection<T extends TenantOperationalRecord>(collectionName: string, tenantId?: string | null, ownerUid?: string | null) {
  const [records, setRecords] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recordsRef = useRef<T[]>([]);
  const loadedRef = useRef(false);
  useEffect(() => { recordsRef.current = records; }, [records]);
  useEffect(() => {
    let active = true;
    loadedRef.current = false;
    setRecords([]); recordsRef.current = []; setError(null);
    if (!tenantId || !auth.currentUser) { setLoading(false); return; }
    setLoading(true);
    const filters: any[] = [where('tenantId', '==', tenantId)];
    if (ownerUid) filters.push(where('createdByUid', '==', ownerUid));
    const scoped = query(collection(db, collectionName), ...filters);
    const unsubscribe = onSnapshot(scoped, snapshot => {
      if (!active) return;
      const next = snapshot.docs.map(snapshotDoc => {
        const data = snapshotDoc.data() as TenantOperationalRecord;
        return { ...data, id: String(data.id || snapshotDoc.id), _firestoreId: snapshotDoc.id } as T;
      });
      loadedRef.current = true; recordsRef.current = next; setRecords(next); setLoading(false); setError(null);
    }, cause => {
      if (!active) return;
      loadedRef.current = false; setLoading(false); setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; unsubscribe(); };
  }, [collectionName, tenantId, ownerUid]);
  const updateRecords = useCallback<React.Dispatch<React.SetStateAction<T[]>>>((action) => {
    if (!loadedRef.current || !tenantId || !auth.currentUser) {
      setError('Data belum siap atau tenant belum aktif; perubahan belum disimpan.');
      return;
    }
    const previous = recordsRef.current;
    const requested = typeof action === 'function' ? (action as (value: T[]) => T[])(previous) : action;
    const previousById = new Map(previous.map(record => [String(record.id), record]));
    const next = requested.map(record => {
      const id = String(record.id);
      const before = previousById.get(id);
      return {
        ...record,
        tenantId,
        createdByUid: before?.createdByUid || auth.currentUser!.uid,
        ...(before?._firestoreId ? { _firestoreId: before._firestoreId } : {}),
      } as T;
    });
    recordsRef.current = next;
    setRecords(next);
    void persistTenantOperationalDiff(collectionName, tenantId, previous, next).catch(cause => {
      setError(cause instanceof Error ? cause.message : String(cause));
      console.error('Tenant operational data save failed', { collectionName, tenantId, cause });
    });
  }, [collectionName, tenantId]);
  return { records, setRecords: updateRecords, loading, error };
}
export const LEGACY_OPERATIONAL_DATASETS = [
  { key: 'academics_schedules', label: 'Jadwal akademik', module: 'academic', collection: 'academic_schedules', kind: 'array' },
  { key: 'academics_jurnals', label: 'Jurnal pembelajaran', module: 'academic', collection: 'academic_journals', kind: 'array' },
  { key: 'academics_assessments', label: 'Penilaian akademik', module: 'academic', collection: 'academic_assessments', kind: 'array' },
  { key: 'academics_kktp_threshold', label: 'Ambang ketuntasan KKTP', module: 'academic', collection: 'academic_settings', settingId: 'kktpThreshold', kind: 'value' },
  { key: 'academics_formative_weight', label: 'Bobot penilaian formatif', module: 'academic', collection: 'academic_settings', settingId: 'formativeWeight', kind: 'value' },
  { key: 'academics_walikelas_comments', label: 'Catatan wali kelas', module: 'academic', collection: 'academic_settings', settingId: 'waliKelasComments', kind: 'value' },
  { key: 'academics_rapor_locked', label: 'Status kunci rapor', module: 'academic', collection: 'academic_settings', settingId: 'raporLocked', kind: 'value' },
  { key: 'asrama_musyrifs', label: 'Data musyrif', module: 'boarding', collection: 'boarding_musyrifs', kind: 'array' },
  { key: 'asrama_attendance', label: 'Kehadiran asrama', module: 'boarding', collection: 'boarding_attendance', kind: 'array' },
  { key: 'asrama_audits', label: 'Audit kamar', module: 'boarding', collection: 'boarding_audits', kind: 'array' },
  { key: 'asrama_tickets', label: 'Tiket fasilitas asrama', module: 'boarding', collection: 'boarding_tickets', kind: 'array' },
  { key: 'asrama_rooms', label: 'Data kamar lama', module: 'boarding', collection: 'boarding_rooms', kind: 'array' },
  { key: 'asrama_permits', label: 'Izin santri', module: 'boarding', collection: 'boarding_permits', kind: 'array' },
  { key: 'asrama_discipline', label: 'Catatan kedisiplinan', module: 'boarding', collection: 'boarding_discipline', kind: 'array' },
  { key: 'asrama_unassignedSantri', label: 'Santri belum teralokasi', module: 'master-data', collection: 'entityRecords', kind: 'manual' },
  { key: 'hub_announcements', label: 'Pengumuman lama', module: 'communication', collection: 'communication_announcements', kind: 'array' },
  { key: 'hub_messages', label: 'Pesan lama', module: 'communication', collection: 'communication_messages', kind: 'array' },
] as const;
export function getLegacyOperationalDataSummary() {
  return LEGACY_OPERATIONAL_DATASETS.map(dataset => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(dataset.key) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      const valid = dataset.kind === 'manual' ? true : dataset.kind === 'array' ? Array.isArray(parsed) : raw !== null;
      const count = !raw ? 0 : dataset.kind === 'array' ? (Array.isArray(parsed) ? parsed.length : 0) : 1;
      return { ...dataset, count, valid };
    } catch {
      return { ...dataset, count: 0, valid: false };
    }
  });
}
export async function migrateLegacyOperationalDataset(key: string) {
  const dataset = LEGACY_OPERATIONAL_DATASETS.find(item => item.key === key);
  const currentUser = auth.currentUser;
  if (!dataset || !currentUser) throw new Error('Admin yang sudah login diperlukan untuk migrasi.');
  if (dataset.kind === 'manual') throw new Error('Data ini perlu direkonsiliasi melalui Master Data dan tidak dapat diimpor otomatis.');
  const raw = window.localStorage.getItem(dataset.key);
  if (!raw) return { imported: 0, skipped: 0, alreadyCompleted: false };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Data lokal tidak dapat dibaca sebagai JSON.'); }
  const items = dataset.kind === 'array' ? parsed : [{ id: (dataset as any).settingId, value: parsed }];
  if (!Array.isArray(items)) throw new Error('Data lokal bukan daftar record yang valid.');
  const chunks: unknown[][] = [];
  for (let offset = 0; offset < items.length; offset += 300) chunks.push(items.slice(offset, offset + 300));
  if (chunks.length === 0) return { imported: 0, skipped: 0, alreadyCompleted: false };
  const token = await currentUser.getIdToken();
  let imported = 0;
  let skipped = 0;
  let allAlreadyCompleted = true;
  for (let batchIndex = 0; batchIndex < chunks.length; batchIndex += 1) {
    const response = await fetch('/api/data-migrations/local-storage', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ datasetKey: dataset.key, items: chunks[batchIndex], batchIndex, batchCount: chunks.length }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Migrasi data gagal.');
    imported += Number(result.imported || 0);
    skipped += Number(result.skipped || 0);
    allAlreadyCompleted = allAlreadyCompleted && result.alreadyCompleted === true;
  }
  return { imported, skipped, alreadyCompleted: allAlreadyCompleted };
}
