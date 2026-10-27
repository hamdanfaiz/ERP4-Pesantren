import { publicRuntimeConfigValue } from "../runtimeConfig";
import {
  assignSupabaseStudentRoom,
  listSupabaseBoardingSnapshot,
} from "./masterDataApi";
import { supabaseRuntimeEnabled } from "../runtimeBackend";

const SUPABASE_MASTER_DATA_RUNTIME = supabaseRuntimeEnabled(publicRuntimeConfigValue("VITE_SUPABASE_MASTER_DATA_RUNTIME_ENABLED"));
const SUPABASE_BOARDING_RUNTIME = supabaseRuntimeEnabled(publicRuntimeConfigValue("VITE_SUPABASE_BOARDING_RUNTIME_ENABLED"));

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

  public setTenant(tenantId: string | null) {
    const normalizedTenantId = tenantId?.trim() || null;
    if (this.tenantId === normalizedTenantId) {
      if (normalizedTenantId && SUPABASE_MASTER_DATA_RUNTIME && SUPABASE_BOARDING_RUNTIME) {
        void this.refreshSupabaseTenant(normalizedTenantId);
      }
      return;
    }

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

    if (normalizedTenantId && SUPABASE_MASTER_DATA_RUNTIME && SUPABASE_BOARDING_RUNTIME) {
      void this.refreshSupabaseTenant(normalizedTenantId);
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
    if (SUPABASE_MASTER_DATA_RUNTIME && SUPABASE_BOARDING_RUNTIME && this.tenantId) {
      void this.refreshSupabaseTenant(this.tenantId);
      return;
    }
    this.recalculateOccupancies();
    this.notify();
  }

  private async refreshSupabaseTenant(tenantId: string) {
    const requestTenantId = tenantId;
    this.isSyncing = true;
    this.notify();
    try {
      const snapshot = await listSupabaseBoardingSnapshot();
      if (this.tenantId !== requestTenantId) return;
      this.buildings = snapshot.structures.filter((item) => item.category === "Gedung");
      this.rooms = snapshot.structures.filter((item) => item.category === "Kamar").map((room) => {
        const building = this.buildings.find((candidate) => candidate.id === room.parentId || candidate.id === room.parentCode);
        const capacity = Number(room.capacity);
        return { ...room, building: room.building || building?.name || "", capacity: Number.isFinite(capacity) ? capacity : 0 };
      });
      this.classes = snapshot.structures.filter((item) => item.category === "Kelas");
      this.halaqahs = [];
      this.subjects = [];
      this.curricula = [];
      this.teachers = [];
      this.santriList = snapshot.students.map((student) => ({
        id: student.id,
        supabaseId: student.supabaseId,
        type: "Santri",
        name: student.name,
        gender: student.gender || undefined,
        grade: student.grade || undefined,
        classId: student.classId || undefined,
        dormitoryId: student.dormitoryId || undefined,
        dormitory: student.dormitory || undefined,
        roomId: student.roomId || undefined,
        room: student.room || undefined,
        nis: student.nis || undefined,
        status: student.status,
      }));
      this.recalculateOccupancies();
      this.lastSynced = new Date();
    } catch (error) {
      if (this.tenantId === requestTenantId) {
        this.buildings = [];
        this.rooms = [];
        this.classes = [];
        this.santriList = [];
        console.warn("Supabase tenant structure snapshot failed:", error);
      }
    } finally {
      if (this.tenantId === requestTenantId) {
        this.isSyncing = false;
        this.notify();
      }
    }
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
    if (!SUPABASE_MASTER_DATA_RUNTIME) {
      return { success: false, message: 'Runtime Master Data Supabase belum diaktifkan.' };
    }
    if (!SUPABASE_BOARDING_RUNTIME) {
      return { success: false, message: 'Runtime asrama Supabase belum diaktifkan.' };
    }

    const santri = this.santriList.find((item) => item.id === santriId || item.supabaseId === santriId);
    if (!santri) return { success: false, message: 'Santri tidak ditemukan pada snapshot tenant.' };

    try {
      await assignSupabaseStudentRoom(
        santri.supabaseId || santri.id,
        targetRoom.id,
        buildingId || targetRoom.parentId || targetRoom.parentCode || null,
      );
      await this.refreshSupabaseTenant(tenantId);
      return { success: true, message: 'Santri berhasil dialokasikan ke ' + targetRoom.name + '.' };
    } catch (error: any) {
      return { success: false, message: error?.message || 'Alokasi kamar Supabase gagal.' };
    }
  }

  public async removeSantriFromRoom(santriId: string): Promise<boolean> {
    const tenantId = this.tenantId;
    if (!tenantId || !SUPABASE_MASTER_DATA_RUNTIME || !SUPABASE_BOARDING_RUNTIME) return false;

    const santri = this.santriList.find((item) => item.id === santriId || item.supabaseId === santriId);
    if (!santri) return false;

    try {
      await assignSupabaseStudentRoom(santri.supabaseId || santri.id, null, null);
      await this.refreshSupabaseTenant(tenantId);
      return true;
    } catch (error) {
      console.warn('Could not remove Supabase room assignment:', error);
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
        const occupied = this.getStudentsByRoom(room.id).length;
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
