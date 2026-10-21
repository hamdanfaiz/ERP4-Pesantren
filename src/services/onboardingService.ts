import {
  collection,
  doc,
  runTransaction,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Candidate } from '../types';
import { centralStructureService } from './centralStructureService';

export interface OnboardAssignment {
  candidateId: string;
  tenantId: string;
  nis: string;
  classId: string;
  className: string;
  buildingId?: string;
  buildingName: string;
  roomId?: string;
  roomName: string;
  waliName: string;
  waliPhone: string;
}

export interface OnboardResult {
  success: boolean;
  nis: string;
  santriId: string;
  waliId: string;
}

/** Format NIS as [TahunMasuk][KodeJenjang][NomorUrut]. */
export function formatPesantrenNIS(
  grade: string,
  sequence: number,
  year: number = new Date().getFullYear()
): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) {
    throw new Error('Nomor urut NIS harus berada pada rentang 1 sampai 9999.');
  }
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error('Tahun masuk untuk NIS tidak valid.');
  }

  const normalizedGrade = (grade || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let gradeCode = '02';
  if (normalizedGrade.includes('SD') || normalizedGrade.includes('MI') || normalizedGrade.includes('IBTIDAIYAH')) {
    gradeCode = '01';
  } else if (
    normalizedGrade.includes('SMA') || normalizedGrade.includes('MA') ||
    normalizedGrade.includes('SMK') || normalizedGrade.includes('ALIYAH') ||
    /(^|[^0-9])(10|11|12|X|XI|XII)([^0-9]|$)/.test((grade || '').toUpperCase())
  ) {
    gradeCode = '03';
  }
  return String(year) + gradeCode + String(sequence).padStart(4, '0');
}

/** Resolve the next NIS inside one tenant. Query failures stop allocation. */
export async function getNextAvailableNIS(
  grade: string,
  tenantId: string,
  existingCandidates: Candidate[] = []
): Promise<string> {
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId) throw new Error('Tenant wajib ditentukan sebelum NIS dialokasikan.');
  const currentYear = new Date().getFullYear();
  const usedNis = new Set<string>();

  existingCandidates.forEach((candidate) => {
    if (candidate.nis) usedNis.add(candidate.nis);
  });

  const santriQuery = query(
    collection(db, 'entityRecords'),
    where('type', '==', 'Santri'),
    where('tenantId', '==', normalizedTenantId)
  );
  const santriSnapshot = await getDocs(santriQuery);
  santriSnapshot.forEach((santriDocument) => {
    const nis = santriDocument.data().nis;
    if (typeof nis === 'string' && nis) usedNis.add(nis);
  });

  for (let sequence = 1; sequence <= 9999; sequence += 1) {
    const candidateNis = formatPesantrenNIS(grade, sequence, currentYear);
    if (!usedNis.has(candidateNis)) return candidateNis;
  }
  throw new Error('Nomor urut NIS untuk tahun dan jenjang ini telah habis.');
}

function resolveRoomGender(room: any, building: any): 'L' | 'P' | null {
  const sources = [room.genderRestriction, room.gender, building?.genderRestriction, building?.gender]
    .filter((value) => typeof value === 'string' && value.trim());
  const explicit: Array<'L' | 'P'> = [];
  for (const value of sources) {
    const normalized = String(value).trim().toLowerCase();
    if (/^(l|m|male|putra|laki[ -]?laki|ikhwan)$/.test(normalized)) explicit.push('L');
    else if (/^(p|f|female|putri|perempuan|akhwat)$/.test(normalized)) explicit.push('P');
    else return null;
  }
  if (new Set(explicit).size > 1) return null;
  if (explicit.length) return explicit[0];
  const labels = [room.name, room.building, room.location, building?.name, building?.location]
    .filter((value) => typeof value === 'string').join(' ').toLowerCase();
  const male = /putra|ikhwan|laki[ -]?laki|\bmale\b/.test(labels);
  const female = /putri|akhwat|perempuan|\bfemale\b/.test(labels);
  return male === female ? null : male ? 'L' : 'P';
}

async function linkCandidatePpdbInvoices(candidateId: string, tenantId: string, registrationIdValue: unknown, santriId: string): Promise<void> {
  const registrationId = String(registrationIdValue || '').trim();
  if (!registrationId) return;
  const invoiceRefs = ['REG', 'SPP'].map((suffix) =>
    doc(db, 'financeBillings', 'INV-PPDB-' + registrationId + '-' + suffix)
  );
const candidateRef = doc(db, 'candidates', candidateId);
    await runTransaction(db, async (transaction) => {
    const candidateSnapshot = await transaction.get(candidateRef);
    if (!candidateSnapshot.exists()) throw new Error('Calon santri tidak ditemukan saat rekonsiliasi tagihan.');
    const candidateData = candidateSnapshot.data();
    if (candidateData.tenantId !== tenantId || String(candidateData.registrationId || '').trim() !== registrationId || candidateData.masterStudentId !== santriId) {
      throw new Error('Relasi calon santri berubah; muat ulang sebelum menautkan tagihan PPDB.');
    }
    const snapshots = await Promise.all(invoiceRefs.map((invoiceRef) => transaction.get(invoiceRef)));
    for (const snapshot of snapshots) {
      if (!snapshot.exists()) continue;
      const invoice = snapshot.data();
      if (invoice.tenantId !== tenantId || invoice.candidateId !== candidateId) {
        throw new Error('Tagihan PPDB tidak cocok dengan tenant atau calon santri yang sedang di-onboard.');
      }
      if (invoice.santriId && invoice.santriId !== santriId) {
        throw new Error('Tagihan PPDB sudah terhubung ke santri lain.');
      }
    }
    for (const snapshot of snapshots) {
      if (!snapshot.exists() || snapshot.data().santriId === santriId) continue;
      transaction.update(snapshot.ref, { santriId, masterStudentId: santriId, linkedAt: new Date().toISOString() });
    }
  });
}

export const onboardingService = {
  formatPesantrenNIS,
  getNextAvailableNIS,

  /** Create tenant-tagged student and guardian records. Portal access is provisioned separately. */
  async onboardCandidate(
    candidate: Candidate,
    assignment: OnboardAssignment
  ): Promise<OnboardResult> {
    const tenantId = assignment.tenantId.trim();
    const nis = assignment.nis.trim();
    const roomId = assignment.roomId?.trim() || '';
    const classId = assignment.classId?.trim() || '';

    if (!tenantId) throw new Error('Tenant wajib dipilih untuk onboarding.');
    if (!candidate.id?.trim()) throw new Error('ID calon santri tidak valid.');
    if (!/^\d{10}$/.test(nis)) throw new Error('Format NIS harus 10 digit: tahun, kode jenjang, dan nomor urut.');
    if (!roomId || !classId || !assignment.className.trim() || !assignment.roomName.trim()) {
      throw new Error('Kelas dan kamar terdaftar wajib dipilih sebelum onboarding.');
    }
    if (!assignment.waliName.trim() || !assignment.waliPhone.trim()) {
      throw new Error('Nama dan nomor kontak wali wajib diisi.');
    }

    const sequence = Number(nis.slice(-4));
    const entryYear = Number(nis.slice(0, 4));
    if (formatPesantrenNIS(candidate.grade || '', sequence, entryYear) !== nis) {
      throw new Error('NIS tidak sesuai dengan tahun dan jenjang calon santri.');
    }

    const candidateRef = doc(db, 'candidates', candidate.id);
    const roomRef = doc(db, 'master_data', roomId);
    const classRef = doc(db, 'master_data', classId);
    const santriRef = doc(collection(db, 'entityRecords'));
    const waliRef = doc(collection(db, 'entityRecords'));
    const reservationId = encodeURIComponent(tenantId) + '_' + nis;
    const reservationRef = doc(db, 'nisReservations', reservationId);
    const now = new Date().toISOString();

    const currentCandidateSnapshot = await getDoc(candidateRef);
    if (!currentCandidateSnapshot.exists()) throw new Error('Data calon santri tidak ditemukan.');
    const currentCandidateData = currentCandidateSnapshot.data();
    
    if (currentCandidateData.tenantId !== tenantId) throw new Error('Tenant calon santri tidak cocok dengan sesi aktif.');
    if (currentCandidateData.onboardingStatus === 'Completed' || currentCandidateData.syncToMasterData === true) {
      if (typeof currentCandidateData.masterStudentId === 'string' && currentCandidateData.masterStudentId) {
await linkCandidatePpdbInvoices(candidateRef.id, tenantId, currentCandidateData.registrationId, currentCandidateData.masterStudentId);
                return { success: true, nis: currentCandidateData.nis || nis, santriId: currentCandidateData.masterStudentId, waliId: currentCandidateData.masterGuardianId || '' };
      }
      throw new Error('Status onboarding sudah selesai, tetapi relasi master santri tidak lengkap. Periksa data sebelum mencoba lagi.');
    }

    const normalizedNik = String(currentCandidateData.nik || candidate.nik || '').trim().replace(/\D/g, '');
    const normalizedNisn = String(currentCandidateData.nisn || candidate.nisn || '').trim().replace(/\D/g, '');
    if (!/^\d{16}$/.test(normalizedNik)) throw new Error('NIK calon santri harus terdiri dari 16 digit sebelum onboarding.');
    if (normalizedNisn && !/^\d{10}$/.test(normalizedNisn)) throw new Error('NISN calon santri harus terdiri dari 10 digit.');
    const identityValues = [
      { kind: 'nik', value: normalizedNik },
      ...(normalizedNisn ? [{ kind: 'nisn', value: normalizedNisn }] : []),
    ];
    const identityRefs = identityValues.map(({ kind, value }) =>
      doc(db, 'identityReservations', encodeURIComponent(tenantId) + '_' + kind + '_' + encodeURIComponent(value))
    );

    const studentCollection = collection(db, 'entityRecords');
    const existingNisQuery = query(studentCollection, where('tenantId', '==', tenantId), where('type', '==', 'Santri'), where('nis', '==', nis));
    const existingRoomIdQuery = query(studentCollection, where('tenantId', '==', tenantId), where('type', '==', 'Santri'), where('roomId', '==', roomId));
    const existingRoomNameQuery = query(studentCollection, where('tenantId', '==', tenantId), where('type', '==', 'Santri'), where('room', '==', assignment.roomName));

    const [existingNisSnapshot, existingIdentitySnapshots, roomIdSnapshot, roomNameSnapshot] = await Promise.all([
      getDocs(existingNisQuery),
      Promise.all(identityValues.map(({ kind, value }) => getDocs(query(studentCollection, where('tenantId', '==', tenantId), where('type', '==', 'Santri'), where(kind, '==', value))))),
      getDocs(existingRoomIdQuery),
      getDocs(existingRoomNameQuery),
    ]);

    if (existingNisSnapshot.docs.some((item) => item.id !== currentCandidateData.masterStudentId)) {
      throw new Error('NIS sudah digunakan oleh santri aktif pada tenant ini.');
    }
    identityValues.forEach((item, index) => {
      if (existingIdentitySnapshots[index].docs.length > 0) {
        throw new Error(item.kind.toUpperCase() + ' sudah digunakan oleh santri lain pada tenant ini.');
      }
    });

    const occupiedRecordIds = new Set([
      ...roomIdSnapshot.docs.map((item) => item.id),
      ...roomNameSnapshot.docs.filter((item) => !item.data().roomId).map((item) => item.id),
    ]);
    const observedRoomOccupancy = occupiedRecordIds.size;

    return runTransaction(db, async (transaction) => {
      const [candidateSnapshot, reservationSnapshot, roomSnapshot, classSnapshot, ...identitySnapshots] = await Promise.all([
        transaction.get(candidateRef),
        transaction.get(reservationRef),
        transaction.get(roomRef),
        transaction.get(classRef),
        ...identityRefs.map((identityRef) => transaction.get(identityRef)),
      ]);

      if (!candidateSnapshot.exists()) throw new Error('Data calon santri tidak ditemukan.');
      const source = candidateSnapshot.data();
      if (source.tenantId !== tenantId) throw new Error('Tenant calon santri tidak cocok dengan sesi aktif.');
      if (source.onboardingStatus === 'Completed' || source.syncToMasterData === true) {
        if (typeof source.masterStudentId === 'string' && source.masterStudentId) {
          return { success: true, nis: source.nis || nis, santriId: source.masterStudentId, waliId: source.masterGuardianId || '' };
        }
        throw new Error('Status onboarding sudah selesai, tetapi relasi master santri tidak lengkap. Periksa data sebelum mencoba lagi.');
      }
      if (source.stage !== 'Accepted') throw new Error('Hanya calon santri berstatus diterima yang dapat di-onboard.');
      if (source.gender !== 'L' && source.gender !== 'P') throw new Error('Jenis kelamin calon santri belum valid.');
      if (formatPesantrenNIS(source.grade || '', sequence, entryYear) !== nis) {
        throw new Error('Jenjang NIS tidak sesuai dengan data calon santri di server.');
      }
      if (reservationSnapshot.exists()) throw new Error('Nomor NIS sudah dikunci oleh proses onboarding lain.');

      identityValues.forEach((item, index) => {
        const reservation = identitySnapshots[index];
        if (reservation.exists() && reservation.data().ownerId !== candidate.id) {
          throw new Error(item.kind.toUpperCase() + ' sudah terdaftar pada data lain di tenant ini.');
        }
      });

      if (!classSnapshot.exists() || !roomSnapshot.exists()) {
        throw new Error('Kelas atau kamar yang dipilih tidak ditemukan. Muat ulang struktur pesantren.');
      }

      const classData = classSnapshot.data();
      const roomData = roomSnapshot.data();
      if (classData.tenantId !== tenantId || String(classData.category || '').toLowerCase() !== 'kelas') {
        throw new Error('Kelas tidak valid atau berasal dari tenant lain.');
      }
      if (roomData.tenantId !== tenantId || String(roomData.category || '').toLowerCase() !== 'kamar') {
        throw new Error('Kamar tidak valid atau berasal dari tenant lain.');
      }
      if (['inactive', 'nonaktif', 'disabled'].includes(String(roomData.status || '').toLowerCase())) {
        throw new Error('Kamar yang dipilih sedang tidak aktif.');
      }

      const linkedBuildingId = assignment.buildingId?.trim() || String(roomData.parentCode || '');
      let buildingData: any = null;
      if (linkedBuildingId) {
        const buildingSnapshot = await transaction.get(doc(db, 'master_data', linkedBuildingId));
        if (buildingSnapshot.exists()) {
          buildingData = buildingSnapshot.data();
          if (buildingData.tenantId !== tenantId || String(buildingData.category || '').toLowerCase() !== 'gedung') {
            throw new Error('Gedung asrama tidak valid atau berasal dari tenant lain.');
          }
        } else if (assignment.buildingId?.trim()) {
          throw new Error('Data gedung asrama tidak ditemukan.');
        }
      }

      const roomGender = resolveRoomGender(roomData, buildingData);
      if (!roomGender) throw new Error('Gender kamar belum dikonfigurasi. Atur gender pada data kamar atau gedung sebelum onboarding.');
      if (roomGender !== source.gender) throw new Error('Kamar tidak sesuai dengan gender calon santri.');

      const capacity = Number(roomData.capacity);
      if (!Number.isInteger(capacity) || capacity < 1) {
        throw new Error('Kapasitas kamar belum diatur dengan benar. Lengkapi data kapasitas terlebih dahulu.');
      }
      const storedOccupancy = Number(roomData.occupied);
      const currentOccupancy = Math.max(
        Number.isInteger(storedOccupancy) && storedOccupancy >= 0 ? storedOccupancy : 0,
        observedRoomOccupancy
      );
      if (currentOccupancy >= capacity) {
        throw new Error('Kamar sudah penuh (' + currentOccupancy + '/' + capacity + '). Pilih kamar lain.');
      }

      const registrationId = String(source.registrationId || '').trim();
      const ppdbInvoiceRefs = registrationId
        ? ['REG', 'SPP'].map((suffix) =>
          doc(db, 'financeBillings', 'INV-PPDB-' + registrationId + '-' + suffix)
        )
        : [];
      const ppdbInvoiceSnapshots = await Promise.all(ppdbInvoiceRefs.map((invoiceRef) => transaction.get(invoiceRef)));
      const santriData = {
        tenantId,
        type: 'Santri',
        sourceCandidateId: candidate.id,
        name: source.name || '',
        nis,
        nisn: source.nisn || '',
        nik: source.nik || '',
        pob: source.pob || '',
        dob: source.dob || '',
        gender: source.gender,
        address: source.address || '',
        previousSchool: source.previousSchool || '',
        fatherName: source.fatherName || '',
        motherName: source.motherName || '',
        parentPhone: assignment.waliPhone.trim(),
        contact: source.phone || '',
        email: source.email || '',
        status: 'Active',
        registrationId: source.registrationId || '',
        gradeOrDepartment: source.grade || '',
        classId,
        className: classData.name || assignment.className,
        dormitory: buildingData?.name || roomData.building || assignment.buildingName,
        dormitoryId: linkedBuildingId,
        room: roomData.name || assignment.roomName,
        roomId,
        createdAt: now,
        updatedAt: now,
      };
      const waliData = {
        tenantId,
        type: 'Wali Santri',
        name: assignment.waliName.trim(),
        contact: assignment.waliPhone.trim(),
        phone: assignment.waliPhone.trim(),
        address: source.address || '',
        fatherJob: source.fatherJob || '',
        motherJob: source.motherJob || '',
        status: 'Active',
        santriIds: [santriRef.id],
        santriNames: [source.name || ''],
        role: 'Walisantri',
        createdAt: now,
        updatedAt: now,
      };

      for (const invoiceSnapshot of ppdbInvoiceSnapshots) {
        if (!invoiceSnapshot.exists()) continue;
        const invoice = invoiceSnapshot.data();
        if (invoice.tenantId !== tenantId || invoice.candidateId !== candidateRef.id) {
          throw new Error('Tagihan PPDB tidak cocok dengan tenant atau calon santri yang sedang di-onboard.');
        }
        if (invoice.santriId && invoice.santriId !== santriRef.id) {
          throw new Error('Tagihan PPDB sudah terhubung ke santri lain.');
        }
      }
      for (const invoiceSnapshot of ppdbInvoiceSnapshots) {
        if (!invoiceSnapshot.exists() || invoiceSnapshot.data().santriId === santriRef.id) continue;
        transaction.update(invoiceSnapshot.ref, { santriId: santriRef.id, masterStudentId: santriRef.id, linkedAt: now });
      }
      transaction.set(santriRef, santriData);
      transaction.set(waliRef, waliData);
      transaction.set(reservationRef, { tenantId, nis, candidateId: candidate.id, santriId: santriRef.id, ownerId: candidate.id, source: 'onboarding', createdAt: now });
      identityValues.forEach((item, index) => {
        if (!identitySnapshots[index].exists()) {
          transaction.set(identityRefs[index], { tenantId, kind: item.kind, value: item.value, ownerId: candidate.id, recordId: candidate.id, source: 'ppdb', createdAt: now });
        }
      });
      transaction.update(roomRef, { occupied: currentOccupancy + 1, updatedAt: now });
      transaction.update(candidateRef, {
        tenantId,
        nis,
        classId,
        className: classData.name || assignment.className,
        dormitory: buildingData?.name || roomData.building || assignment.buildingName,
        dormitoryId: linkedBuildingId,
        room: roomData.name || assignment.roomName,
        roomId,
        syncToMasterData: true,
        syncDate: now,
        onboardingStatus: 'Completed',
        onboardedAt: now,
        masterStudentId: santriRef.id,
        masterGuardianId: waliRef.id,
        waliAccountCreated: false,
        waliAccountStatus: 'PendingProvisioning',
      });

      return { success: true, nis, santriId: santriRef.id, waliId: waliRef.id };
    });
  },

  /** Batch onboarding requires one explicit tenant and valid classes and rooms. */
  async batchOnboardAcceptedCandidates(
    candidates: Candidate[],
    tenantId: string
  ): Promise<{ success: number; errors: number; details: any[] }> {
    const normalizedTenantId = tenantId.trim();
    if (!normalizedTenantId) throw new Error('Tenant wajib ditentukan sebelum onboarding massal.');
    if (candidates.some((candidate) => candidate.tenantId && candidate.tenantId !== normalizedTenantId)) {
      throw new Error('Daftar calon santri berisi data dari tenant lain.');
    }

    const acceptedCandidates = candidates.filter(
      (candidate) => candidate.stage === 'Accepted' && (!candidate.syncToMasterData || !candidate.nis)
    );
    if (acceptedCandidates.length === 0) return { success: 0, errors: 0, details: [] };

    const classes = centralStructureService.getClasses();
    const rooms = centralStructureService.getRooms();
    const buildings = centralStructureService.getBuildings();
    let success = 0;
    let errors = 0;
    const details: any[] = [];
    const roomOccupancy = new Map(rooms.map((room) => [room.id, centralStructureService.getStudentsByRoom(room.id).length]));

    for (const candidate of acceptedCandidates) {
      try {
        if (candidate.gender !== 'L' && candidate.gender !== 'P') {
          throw new Error('Jenis kelamin calon santri belum valid untuk alokasi asrama.');
        }
        const nis = await getNextAvailableNIS(candidate.grade, normalizedTenantId, candidates);
        const isSma = /SMA|MA|SMK|ALIYAH|(^|[^0-9])(10|11|12|X|XI|XII)([^0-9]|$)/i.test(candidate.grade || '');
        const availableClasses = classes.filter((item) =>
          isSma ? item.name.includes('X') || item.name.includes('SMA') : item.name.includes('VII') || item.name.includes('SMP')
        );
        if (availableClasses.length === 0) throw new Error('Tidak ada kelas yang sesuai untuk jenjang calon santri.');
        const selectedClass = availableClasses[success % availableClasses.length];

        const targetRooms = rooms.filter((room) => {
          const building = buildings.find((item) => item.id === room.parentId || item.id === room.parentCode || item.name === room.building);
          const labels = [building?.name, room.building, room.name, room.location].filter(Boolean).join(' ').toLowerCase();
          const explicit = String(room.genderRestriction || room.gender || building?.genderRestriction || building?.gender || '').toLowerCase();
          const female = /putri|akhwat|perempuan|female|^p$|^f$/.test(explicit) || /putri|akhwat|perempuan|female/.test(labels);
          const male = /putra|ikhwan|laki[ -]?laki|male|^l$|^m$/.test(explicit) || /putra|ikhwan|laki[ -]?laki|male/.test(labels);
          const capacity = Number(room.capacity);
          const occupied = roomOccupancy.get(room.id) || 0;
          const genderMatches = candidate.gender === 'P' ? female && !male : male && !female;
          return genderMatches && Number.isInteger(capacity) && capacity > occupied
            && !['inactive', 'nonaktif', 'disabled'].includes(String(room.status || '').toLowerCase());
        });
        if (targetRooms.length === 0) throw new Error('Tidak ada kamar aktif yang gendernya sesuai dan masih memiliki kapasitas. Periksa konfigurasi gedung, kamar, dan jumlah penghuni.');
        const selectedRoom = targetRooms[0];
        const waliName = candidate.fatherName || candidate.motherName || '';
        const waliPhone = candidate.whatsappPhone || candidate.phone || '';
        if (!waliName.trim() || !waliPhone.trim()) throw new Error('Nama dan nomor kontak wali belum tersedia.');

        await this.onboardCandidate(candidate, {
          candidateId: candidate.id,
          tenantId: normalizedTenantId,
          nis,
          classId: selectedClass.id,
          className: selectedClass.name,
          buildingId: selectedRoom.parentId || selectedRoom.parentCode || '',
          buildingName: buildings.find((item) => item.id === selectedRoom.parentId || item.id === selectedRoom.parentCode)?.name || selectedRoom.building || '',
          roomId: selectedRoom.id,
          roomName: selectedRoom.name,
          waliName,
          waliPhone,
        });

        roomOccupancy.set(selectedRoom.id, (roomOccupancy.get(selectedRoom.id) || 0) + 1);
        success += 1;
        details.push({ id: candidate.id, name: candidate.name, nis, className: selectedClass.name, roomName: selectedRoom.name });
      } catch (error: any) {
        errors += 1;
        details.push({ id: candidate.id, error: error?.message || 'Onboarding gagal.' });
      }
    }

    return { success, errors, details };
  },
};
