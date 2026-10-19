import { useState, useEffect, useCallback } from "react";
import {
  centralStructureService,
  CentralStructureItem,
  CentralEntityItem,
} from "../services/centralStructureService";

export function useCentralStructure() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = centralStructureService.subscribe(() => {
      setTick((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  const buildings = centralStructureService.getBuildings();
  const rooms = centralStructureService.getRooms();
  const classes = centralStructureService.getClasses();
  const halaqahs = centralStructureService.getHalaqahs();
  const subjects = centralStructureService.getSubjects();
  const curricula = centralStructureService.getCurricula();
  const teachers = centralStructureService.getTeachers();
  const santriList = centralStructureService.getSantriList();
  const unassignedSantri = centralStructureService.getUnassignedSantri();
  const stats = centralStructureService.getStats();

  const getStudentsByRoom = useCallback((roomIdOrName: string) => {
    return centralStructureService.getStudentsByRoom(roomIdOrName);
  }, []);

  const getStudentsByClass = useCallback((classIdOrName: string) => {
    return centralStructureService.getStudentsByClass(classIdOrName);
  }, []);

  const assignSantriToRoom = useCallback(
    (santriId: string, roomId: string, buildingId?: string) => {
      return centralStructureService.assignSantriToRoom(santriId, roomId, buildingId);
    },
    []
  );

  const removeSantriFromRoom = useCallback((santriId: string) => {
    return centralStructureService.removeSantriFromRoom(santriId);
  }, []);

  const autoAllocateRooms = useCallback(() => {
    return centralStructureService.autoAllocateRooms();
  }, []);

  const notifyExternalUpdate = useCallback(() => {
    centralStructureService.notifyExternalUpdate();
  }, []);

  return {
    buildings,
    rooms,
    classes,
    halaqahs,
    subjects,
    curricula,
    teachers,
    santriList,
    unassignedSantri,
    stats,
    getStudentsByRoom,
    getStudentsByClass,
    assignSantriToRoom,
    removeSantriFromRoom,
    autoAllocateRooms,
    notifyExternalUpdate,
  };
}
