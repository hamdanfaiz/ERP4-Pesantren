import { db } from "../firebase";
import { collection, query, where, onSnapshot, doc, runTransaction } from "firebase/firestore";
import { assignSupabaseStudentRoom, listSupabaseBoardingSnapshot } from "./masterDataApi";

const USE_SUPABASE_BOARDING_CUTOVER = (import.meta as any).env?.VITE_SUPABASE_BOARDING_CUTOVER === "true";

export interface CentralStructureItem {
  id: string;
  name: string;
  type?: string;
  category?: string;
  capacity?: string | number;
  gender?: string;
  genderRestriction?: string;
  location?: string;
  status?: string;
  parentId?: string;
  parentCode?: string;
  grade?: string;
  description?: string;
  facilities?: {
    beds?: number;
    lockers?: number;
    ac?: string;
  };
  musyrif?: string;
  occupied?: number;
  building?: string;
}

export interface CentralEntityItem {
  id: string;
  supabaseId?: string;
  name: string;
  type?: string;
  status?: string;
  gender?: "L" | "P";
  grade?: string;
  classId?: string;
  dormitory?: string;
  dormitoryId?: string;
  room?: string;
  roomId?: string;
  halaqah?: string;
  halaqahId?: string;
  phone?: string;
  parentName?: string;
  parentPhone?: string;
  nis?: string;
  nisn?: string;
  email?: string;
}

type Listener = () => void;

function getConfiguredRoomGender(room: any, building: any): 'L' | 'P' | null {
  const values = [room.genderRestriction, room.gender, building?.genderRestriction, building?.gender]
    .filter((value) => typeof value === 'string' && value.trim());
  const explicit: Array<'L' | 'P'> = [];
  for (const value of values) {
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

class CentralStructureService {
  private listeners: Set<Listener> = new Set();
  private isSyncing = false;
  private tenantId: string | null = null;
  private unsubscribeListeners: Array<() => void> = [];
  private supabaseSnapshotTimer: ReturnType<typeof setInterval> | null = null;
  private supabaseSnapshotRevision = 0;
  private lastSynced: Date | null = null;

  // Cached data
  private buildings: CentralStructureItem[] = [];
  private rooms: CentralStructureItem[] = [];
  private classes: CentralStructureItem[] = [];
  private halaqahs: CentralStructureItem[] = [];
  private subjects: CentralStructureItem[] = [];
  private curricula: CentralStructureItem[] = [];
  private teachers: CentralEntityItem[] = [];
  private santriList: CentralEntityItem[] = [];

  constructor() {}

  private recalculateOccupancies() {
    // Dynamically calculate room occupancy from santriList
    const roomCounts: Record<string, number> = {};
    for (const santri of this.santriList) {
      if (santri.roomId) {
        roomCounts[santri.roomId] = (roomCounts[santri.roomId] || 0) + 1;
      } else if (santri.room) {
        // Match by room name or code
        const matched = this.rooms.find(
          (r) => r.name.toLowerCase() === santri.room?.toLowerCase() || r.id === santri.room
        );
        if (matched) {
          roomCounts[matched.id] = (roomCounts[matched.id] || 0) + 1;
        }
      }
    }

    this.rooms = this.rooms.map((room) => ({
      ...room,
      occupied: roomCounts[room.id] || 0,
    }));
  }

  private async refreshSupabaseSnapshot(tenantId: string) {
    try {
      const requestRevision = ++this.supabaseSnapshotRevision;
      const snapshot = await listSupabaseBoardingSnapshot();
      if (this.tenantId !== tenantId || requestRevision !== this.supabaseSnapshotRevision) return;

      this.buildings = snapshot.structures.filter((item) => item.category === "Gedung");
      const buildingsById = new Map(this.buildings.map((item) => [item.id, item]));
      this.rooms = snapshot.structures
        .filter((item) => item.category === "Kamar")
        .map((room) => ({
          ...room,
          building: room.building || buildingsById.get(room.parentId || room.parentCode || "")?.name || "",
          capacity: Number.isFinite(Number(room.capacity)) && Number(room.capacity) >= 0
            ? Number(room.capacity)
            : 0,
          occupied: Number(room.occupied || 0),
        }));
      this.classes = snapshot.structures.filter((item) => item.category === "Kelas");
      this.santriList = snapshot.students.map((student) => ({
        id: student.id,
        supabaseId: student.supabaseId,
        name: student.name,
        type: "Santri",
        status: student.status,
        gender: student.gender || undefined,
        grade: student.grade || undefined,
        nis: student.nis || undefined,
        classId: student.classId || undefined,
        roomId: student.roomId || undefined,
        room: student.room || undefined,
        dormitoryId: student.dormitoryId || undefined,
        dormitory: student.dormitory || undefined,
      }));
      this.lastSynced = new Date();
      this.notify();
    } catch (error) {
      console.warn("Supabase boarding snapshot failed:", error);
    }
  }

  private initRealtimeListeners(tenantId: string) {
    try {
      if (USE_SUPABASE_BOARDING_CUTOVER) {
        void this.refreshSupabaseSnapshot(tenantId);
        this.supabaseSnapshotTimer = setInterval(
          () => void this.refreshSupabaseSnapshot(tenantId),
          30_000
        );
      }

      const structureFilters: any[] = [
        where("tenantId", "==", tenantId),
      ];
      if (USE_SUPABASE_BOARDING_CUTOVER) {
        structureFilters.push(where("category", "in", ["Halaqah", "Mata Pelajaran", "Kurikulum"]));
      }
      const structureQuery = query(
        collection(db, "master_data"),
        ...structureFilters
      );
      this.unsubscribeListeners.push(onSnapshot(structureQuery, (snapshot) => {
        if (this.tenantId !== tenantId) return;
        const items = snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as any));

        if (USE_SUPABASE_BOARDING_CUTOVER) {
          this.halaqahs = items.filter((item) => item.category === "Halaqah") as CentralStructureItem[];
          this.subjects = items.filter((item) => item.category === "Mata Pelajaran") as CentralStructureItem[];
          this.curricula = items.filter((item) => item.category === "Kurikulum") as CentralStructureItem[];
          this.lastSynced = new Date();
          this.notify();
          return;
        }

        const buildings = items.filter((item) => item.category === "Gedung") as CentralStructureItem[];
        const rooms = items.filter((item) => item.category === "Kamar") as CentralStructureItem[];
        this.buildings = buildings;
        this.rooms = rooms.map((room) => {
          const parent = this.buildings.find((building) => building.id === room.parentCode);
          const capacity = Number(room.capacity);
          return {
            ...room,
            building: room.building || parent?.name || "",
            capacity: Number.isFinite(capacity) && capacity >= 0 ? capacity : 0,
          };
        });
        this.classes = items.filter((item) => item.category === "Kelas") as CentralStructureItem[];
        this.halaqahs = items.filter((item) => item.category === "Halaqah") as CentralStructureItem[];
        this.subjects = items.filter((item) => item.category === "Mata Pelajaran") as CentralStructureItem[];
        this.curricula = items.filter((item) => item.category === "Kurikulum") as CentralStructureItem[];
        this.recalculateOccupancies();
        this.lastSynced = new Date();
        this.notify();
      }, (error) => console.warn("Tenant master data listener failed:", error)));

      if (!USE_SUPABASE_BOARDING_CUTOVER) {
        const santriQuery = query(
          collection(db, "entityRecords"),
          where("tenantId", "==", tenantId),
          where("type", "==", "Santri")
        );
        this.unsubscribeListeners.push(onSnapshot(santriQuery, (snapshot) => {
          if (this.tenantId !== tenantId) return;
          this.santriList = snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as any));
          this.recalculateOccupancies();
          this.lastSynced = new Date();
          this.notify();
        }, (error) => console.warn("Tenant santri listener failed:", error)));
      }

      const teacherQuery = query(
        collection(db, "entityRecords"),
        where("tenantId", "==", tenantId),
        where("type", "in", ["Guru", "Asatidz"])
      );
      this.unsubscribeListeners.push(onSnapshot(teacherQuery, (snapshot) => {
        if (this.tenantId !== tenantId) return;
        this.teachers = snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as any));
        this.notify();
      }, (error) => console.warn("Tenant teacher listener failed:", error)));
    } catch (error) {
      console.warn("Could not attach tenant-scoped listeners:", error);
    }
  }

  public setTenant(tenantId: string | null) {
    const normalizedTenantId = tenantId?.trim() || null;
    if (this.tenantId === normalizedTenantId) return;

    this.unsubscribeListeners.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeListeners = [];
    if (this.supabaseSnapshotTimer) clearInterval(this.supabaseSnapshotTimer);
    this.supabaseSnapshotTimer = null;
    this.supabaseSnapshotRevision += 1;
    this.tenantId = normalizedTenantId;
    this.buildings = [];
    this.rooms = [];
    this.classes = [];
    this.halaqahs = [];
    this.subjects = [];
    this.curricula = [];
    this.teachers = [];
    this.santriList = [];
    this.lastSynced = null;
    this.isSyncing = false;

    if (normalizedTenantId) {
      this.initRealtimeListeners(normalizedTenantId);
    }
    this.notify();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public notifyExternalUpdate() {
    if (USE_SUPABASE_BOARDING_CUTOVER && this.tenantId) {
      void this.refreshSupabaseSnapshot(this.tenantId);
      return;
    }
    this.recalculateOccupancies();
    this.notify();
  }

  // --- GETTERS ---
  public getBuildings(): CentralStructureItem[] {
    return this.buildings;
  }

  public getRooms(): CentralStructureItem[] {
    return this.rooms;
  }

  public getClasses(): CentralStructureItem[] {
    return this.classes;
  }

  public getHalaqahs(): CentralStructureItem[] {
    return this.halaqahs;
  }

  public getSubjects(): CentralStructureItem[] {
    return this.subjects;
  }

  public getCurricula(): CentralStructureItem[] {
    return this.curricula;
  }

  public getTeachers(): CentralEntityItem[] {
    return this.teachers;
  }

  public getSantriList(): CentralEntityItem[] {
    return this.santriList;
  }

  public getUnassignedSantri(): CentralEntityItem[] {
    return this.santriList.filter((s) => !s.roomId && !s.room);
  }

  public getStudentsByRoom(roomIdOrName: string): CentralEntityItem[] {
    if (!roomIdOrName) return [];
    const term = roomIdOrName.toLowerCase();
    return this.santriList.filter((s) => {
      if (s.roomId && s.roomId.toLowerCase() === term) return true;
      if (s.room && s.room.toLowerCase() === term) return true;
      return false;
    });
  }

  public getStudentsByClass(classIdOrName: string): string[] {
    if (!classIdOrName) return [];
    const term = classIdOrName.toLowerCase().replace(/\s+/g, '');
    return this.santriList
      .filter((santri) => {
        const classId = (santri.classId || '').toLowerCase().replace(/\s+/g, '');
        const grade = (santri.grade || '').toLowerCase().replace(/\s+/g, '');
        return classId === term || grade === term || classId.includes(term) || (grade && term.includes(grade));
      })
      .map((santri) => santri.name);
  }

  // --- ACTIONS ---
  public async assignSantriToRoom(
    santriId: string,
    roomId: string,
    buildingId?: string
  ): Promise<{ success: boolean; message: string }> {
    const tenantId = this.tenantId;
    const targetRoom = this.rooms.find((room) => room.id === roomId || room.name === roomId);
    if (!tenantId) return { success: false, message: 'Tenant belum aktif.' };
    if (!targetRoom) return { success: false, message: 'Kamar tidak ditemukan.' };
    const santriRef = doc(db, 'entityRecords', santriId);
    const roomRef = doc(db, 'master_data', targetRoom.id);
    const linkedBuildingId = buildingId || targetRoom.parentId || targetRoom.parentCode || "";

    if (USE_SUPABASE_BOARDING_CUTOVER) {
      const santri = this.santriList.find((item) => item.id === santriId || item.supabaseId === santriId);
      if (!santri?.supabaseId) return { success: false, message: "Santri belum tersedia pada sumber Supabase tenant ini." };
      try {
        const result = await assignSupabaseStudentRoom(
          santri.supabaseId,
          targetRoom.id,
          linkedBuildingId || null
        );
        this.supabaseSnapshotRevision += 1;
        const previousRoomId = santri.roomId || "";
        const assignedRoomId = result.roomId || targetRoom.id;
        const assignedBuildingId = result.buildingId || linkedBuildingId || "";
        const assignedBuilding = this.buildings.find((item) => item.id === assignedBuildingId);
        this.santriList = this.santriList.map((item) => item.id === santri.id ? {
          ...item,
          roomId: assignedRoomId,
          room: targetRoom.name,
          dormitoryId: assignedBuildingId || undefined,
          dormitory: assignedBuilding?.name || targetRoom.building || "",
        } : item);
        this.rooms = this.rooms.map((room) => {
          if (room.id === assignedRoomId) {
            return { ...room, occupied: Number(result.occupied ?? room.occupied ?? 0) };
          }
          if (previousRoomId && previousRoomId !== assignedRoomId && room.id === previousRoomId) {
            return { ...room, occupied: Math.max(0, Number(room.occupied || 0) - 1) };
          }
          return room;
        });
        this.lastSynced = new Date();
        this.notify();
        return { success: true, message: "Santri berhasil dialokasikan ke " + targetRoom.name + "." };
      } catch (error: any) {
        return { success: false, message: error?.message || "Alokasi kamar Supabase gagal dan tidak disimpan." };
      }
    }

    const santriRef = doc(db, 'entityRecords', santriId);
    const buildingRef = linkedBuildingId ? doc(db, 'master_data', linkedBuildingId) : null;

    try {
      const result = await runTransaction(db, async (transaction) => {
        const [roomSnapshot, santriSnapshot] = await Promise.all([
          transaction.get(roomRef),
          transaction.get(santriRef),
        ]);
        if (!roomSnapshot.exists() || !santriSnapshot.exists()) throw new Error('Kamar atau data santri tidak ditemukan.');
        const roomData = roomSnapshot.data();
        const santriData = santriSnapshot.data();
        if (roomData.tenantId !== tenantId || santriData.tenantId !== tenantId) throw new Error('Data kamar atau santri berasal dari tenant lain.');
        if (String(roomData.category || '').toLowerCase() !== 'kamar') throw new Error('Data tujuan bukan kamar asrama.');

        let buildingData: any = null;
        if (buildingRef) {
          const buildingSnapshot = await transaction.get(buildingRef);
          if (buildingSnapshot.exists()) {
            buildingData = buildingSnapshot.data();
            if (buildingData.tenantId !== tenantId || String(buildingData.category || '').toLowerCase() !== 'gedung') {
              throw new Error('Gedung kamar tidak valid atau berasal dari tenant lain.');
            }
          } else if (buildingId) {
            throw new Error('Data gedung asrama tidak ditemukan.');
          }
        }
        if (['inactive', 'nonaktif', 'disabled'].includes(String(roomData.status || '').toLowerCase())) throw new Error('Kamar sedang tidak aktif.');
        const roomGender = getConfiguredRoomGender(roomData, buildingData);
        if (!roomGender) throw new Error('Gender kamar belum dikonfigurasi pada data kamar atau gedung.');
        if (santriData.gender !== 'L' && santriData.gender !== 'P') throw new Error('Gender santri belum valid.');
        if (roomGender !== santriData.gender) throw new Error('Gender santri tidak sesuai dengan kamar.');

        const capacity = Number(roomData.capacity);
        if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Kapasitas kamar belum dikonfigurasi dengan benar.');
        const alreadyInRoom = santriData.roomId === targetRoom.id || (!santriData.roomId && santriData.room === roomData.name);
        const observedOccupancy = this.getStudentsByRoom(targetRoom.id).length;
        const storedOccupancy = Number(roomData.occupied);
        const currentOccupancy = Math.max(Number.isInteger(storedOccupancy) && storedOccupancy >= 0 ? storedOccupancy : 0, observedOccupancy);
        if (!alreadyInRoom && currentOccupancy >= capacity) throw new Error('Kamar sudah penuh (' + currentOccupancy + '/' + capacity + ').');

        const previousRoomId = santriData.roomId && santriData.roomId !== targetRoom.id ? String(santriData.roomId) : '';
        const previousRoomRef = previousRoomId ? doc(db, 'master_data', previousRoomId) : null;
        let previousRoomSnapshot: any = null;
        if (previousRoomRef) previousRoomSnapshot = await transaction.get(previousRoomRef);

        const buildingName = buildingData?.name || roomData.building || targetRoom.building || '';
        const parentRoomId = linkedBuildingId || String(roomData.parentCode || '');
        transaction.update(santriRef, {
          roomId: targetRoom.id, room: roomData.name || targetRoom.name,
          dormitoryId: parentRoomId, dormitory: buildingName, updatedAt: new Date().toISOString(),
        });
        if (!alreadyInRoom) transaction.update(roomRef, { occupied: currentOccupancy + 1, updatedAt: new Date().toISOString() });
        if (previousRoomRef && previousRoomSnapshot?.exists()) {
          const previousData = previousRoomSnapshot.data();
          if (previousData.tenantId !== tenantId) throw new Error('Kamar sebelumnya berasal dari tenant lain.');
          const previousStored = Number(previousData.occupied);
          const previousObserved = this.getStudentsByRoom(previousRoomId).length;
          const previousOccupancy = Math.max(Number.isInteger(previousStored) && previousStored >= 0 ? previousStored : 0, previousObserved);
          transaction.update(previousRoomRef, { occupied: Math.max(0, previousOccupancy - 1), updatedAt: new Date().toISOString() });
        }
        return { roomId: targetRoom.id, roomName: roomData.name || targetRoom.name, buildingName, parentRoomId };
      });

      this.santriList = this.santriList.map((santri) => santri.id === santriId ? {
        ...santri, roomId: result.roomId, room: result.roomName, dormitoryId: result.parentRoomId, dormitory: result.buildingName,
      } : santri);
      this.recalculateOccupancies();
      this.notify();
      return { success: true, message: 'Santri berhasil dialokasikan ke ' + result.roomName + '.' };
    } catch (error: any) {
      return { success: false, message: error?.message || 'Alokasi kamar gagal dan tidak disimpan.' };
    }
  }

  public async removeSantriFromRoom(santriId: string): Promise<boolean> {
    const tenantId = this.tenantId;
    if (!tenantId) return false;
    const localSantri = this.santriList.find((santri) => santri.id === santriId);
    if (!localSantri) return false;
    if (USE_SUPABASE_BOARDING_CUTOVER) {
      if (!localSantri.supabaseId) return false;
      try {
        const result = await assignSupabaseStudentRoom(localSantri.supabaseId, null, null);
        this.supabaseSnapshotRevision += 1;
        this.santriList = this.santriList.map((santri) => {
          if (santri.id !== localSantri.id) return santri;
          const { roomId, room, dormitoryId, dormitory, ...rest } = santri;
          return rest as CentralEntityItem;
        });
        const previousRoomId = result.previousRoomId || localSantri.roomId || "";
        this.rooms = this.rooms.map((item) => item.id === previousRoomId
          ? { ...item, occupied: Number(result.occupied ?? Math.max(0, Number(item.occupied || 0) - 1)) }
          : item);
        this.lastSynced = new Date();
        this.notify();
        return true;
      } catch (error) {
        console.warn("Could not remove room assignment in Supabase:", error);
        return false;
      }
    }

    const santriRef = doc(db, 'entityRecords', santriId);
    const room = this.rooms.find((item) => item.id === localSantri.roomId || (!localSantri.roomId && item.name === localSantri.room));
    const assignedRoomId = localSantri.roomId || room?.id || '';
    const roomRef = assignedRoomId ? doc(db, 'master_data', assignedRoomId) : null;

    try {
      await runTransaction(db, async (transaction) => {
        const santriSnapshot = await transaction.get(santriRef);
        if (!santriSnapshot.exists() || santriSnapshot.data().tenantId !== tenantId) throw new Error('Santri tidak ditemukan pada tenant aktif.');
        const roomSnapshot = roomRef ? await transaction.get(roomRef) : null;
        if (roomSnapshot?.exists()) {
          const roomData = roomSnapshot.data();
          if (roomData.tenantId !== tenantId) throw new Error('Kamar berasal dari tenant lain.');
          const stored = Number(roomData.occupied);
          const observed = this.getStudentsByRoom(assignedRoomId).length;
          const occupancy = Math.max(Number.isInteger(stored) && stored >= 0 ? stored : 0, observed);
          transaction.update(roomRef!, { occupied: Math.max(0, occupancy - 1), updatedAt: new Date().toISOString() });
        }
        transaction.update(santriRef, { roomId: null, room: null, dormitoryId: null, dormitory: null, updatedAt: new Date().toISOString() });
      });
      this.santriList = this.santriList.map((santri) => {
        if (santri.id !== santriId) return santri;
        const { roomId, room: roomName, dormitoryId, dormitory, ...rest } = santri;
        return rest as CentralEntityItem;
      });
      this.recalculateOccupancies();
      this.notify();
      return true;
    } catch (error) {
      console.warn('Could not remove room assignment in Firestore:', error);
      return false;
    }
  }

  public async autoAllocateRooms(): Promise<{ allocatedCount: number; message: string }> {
    const unassigned = [...this.getUnassignedSantri()];
    if (unassigned.length === 0) return { allocatedCount: 0, message: 'Semua santri telah memiliki kamar asrama.' };

    let allocated = 0;
    for (const santri of unassigned) {
      if (santri.gender !== 'L' && santri.gender !== 'P') continue;
      const candidates = this.rooms.filter((room) => {
        const building = this.buildings.find((item) => item.id === room.parentId || item.id === room.parentCode || item.name === room.building);
        const roomGender = getConfiguredRoomGender(room, building);
        const capacity = Number(room.capacity);
        const observedOccupancy = this.getStudentsByRoom(room.id).length;
        const occupied = USE_SUPABASE_BOARDING_CUTOVER
          ? Math.max(Number(room.occupied || 0), observedOccupancy)
          : observedOccupancy;
        return roomGender === santri.gender && Number.isInteger(capacity) && capacity > occupied
          && !['inactive', 'nonaktif', 'disabled'].includes(String(room.status || '').toLowerCase());
      });
      for (const room of candidates) {
        const result = await this.assignSantriToRoom(santri.id, room.id, room.parentId || room.parentCode);
        if (result.success) { allocated += 1; break; }
      }
    }

    const remaining = unassigned.length - allocated;
    return {
      allocatedCount: allocated,
      message: allocated + ' santri berhasil dialokasikan. ' + remaining + ' belum dapat ditempatkan karena gender, kapasitas, atau konfigurasi kamar.',
    };
  }

  public getStats() {
    const totalRooms = this.rooms.length;
    const totalCapacity = this.rooms.reduce((acc, room) => {
      const capacity = Number(room.capacity);
      return acc + (Number.isInteger(capacity) && capacity > 0 ? capacity : 0);
    }, 0);
    const assignedSantri = this.santriList.filter((s) => s.roomId || s.room).length;
    const unassignedSantri = this.santriList.length - assignedSantri;

    return {
      buildingsCount: this.buildings.length,
      roomsCount: totalRooms,
      classesCount: this.classes.length,
      subjectsCount: this.subjects.length,
      curriculaCount: this.curricula.length,
      teachersCount: this.teachers.length,
      santriCount: this.santriList.length,
      assignedSantri,
      unassignedSantri,
      totalCapacity,
      occupancyRate: totalCapacity > 0 ? Math.round((assignedSantri / totalCapacity) * 100) : 0,
      lastSynced: this.lastSynced,
      isSyncing: this.isSyncing,
    };
  }
}

export const centralStructureService = new CentralStructureService();
