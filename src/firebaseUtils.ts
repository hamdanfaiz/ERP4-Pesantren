import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthSession, useAuthSessionUid } from './authSession';
import { db } from './firebase';
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
      userId: getAuthSession()?.uid,
      email: getAuthSession()?.email,
      emailVerified: null,
      isAnonymous: false,
      tenantId: null,
      providerInfo: []
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
  const session = getAuthSession();
  if (!tenantId || !session) throw new Error('Sesi tenant aktif diperlukan untuk menyimpan data.');
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
    else if (!before && session.uid) safeData.createdByUid = session.uid;
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
  const sessionUid = useAuthSessionUid();
  useEffect(() => { recordsRef.current = records; }, [records]);
  useEffect(() => {
    let active = true;
    loadedRef.current = false;
    setRecords([]); recordsRef.current = []; setError(null);
    if (!tenantId || !sessionUid) { setLoading(false); return; }
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
  }, [collectionName, tenantId, ownerUid, sessionUid]);
  const updateRecords = useCallback<React.Dispatch<React.SetStateAction<T[]>>>((action) => {
    const session = getAuthSession();
    if (!loadedRef.current || !tenantId || !session) {
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
        createdByUid: before?.createdByUid || session.uid,
        ...(before?._firestoreId ? { _firestoreId: before._firestoreId } : {}),
      } as T;
    });
    recordsRef.current = next;
    setRecords(next);
    void persistTenantOperationalDiff(collectionName, tenantId, previous, next).catch(cause => {
      setError(cause instanceof Error ? cause.message : String(cause));
      console.error('Tenant operational data save failed', { collectionName, tenantId, cause });
    });
  }, [collectionName, tenantId, sessionUid]);
  return { records, setRecords: updateRecords, loading, error };
}

