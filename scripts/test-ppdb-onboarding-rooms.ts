import assert from "node:assert/strict";
import { getEligibleSupabaseOnboardingRooms, isActiveOnboardingStructure } from "../src/utils/ppdbOnboardingRooms";
import type { SupabaseStructureRecord } from "../src/services/masterDataApi";

function structure(values: Partial<SupabaseStructureRecord> & Pick<SupabaseStructureRecord, "id" | "category">): SupabaseStructureRecord {
  return {
    id: values.id,
    name: values.name || values.id,
    category: values.category,
    type: values.category,
    status: values.status || "Active",
    occupied: values.occupied ?? 0,
    ...values,
  };
}

const records = [
  structure({ id: "building-l", category: "Gedung", gender: "L" }),
  structure({ id: "room-l", category: "Kamar", parentId: "building-l", parentCode: "building-l", capacity: 10, occupied: 9 }),
  structure({ id: "room-p", category: "Kamar", gender: "P", capacity: 10, occupied: 0 }),
  structure({ id: "room-missing-gender", category: "Kamar", capacity: 10, occupied: 0 }),
  structure({ id: "room-full", category: "Kamar", gender: "L", capacity: 10, occupied: 10 }),
  structure({ id: "room-no-capacity", category: "Kamar", gender: "L" }),
  structure({ id: "room-unknown-building", category: "Kamar", parentId: "missing", capacity: 10, gender: "L" }),
  structure({ id: "room-parent-conflict", category: "Kamar", parentId: "building-l", parentCode: "building-p", capacity: 10 }),
  structure({ id: "building-disabled", category: "Gedung", gender: "L", status: "Inactive" }),
  structure({ id: "room-disabled-building", category: "Kamar", parentId: "building-disabled", capacity: 10 }),
  structure({ id: "room-disabled", category: "Kamar", gender: "L", capacity: 10, status: "Nonaktif" }),
];

assert.deepEqual(getEligibleSupabaseOnboardingRooms(records, "L").map((room) => room.id), ["room-l"]);
assert.deepEqual(getEligibleSupabaseOnboardingRooms(records, "P").map((room) => room.id), ["room-p"]);
assert.deepEqual(getEligibleSupabaseOnboardingRooms(records, "unknown"), []);
assert.equal(isActiveOnboardingStructure(structure({ id: "active", category: "Kelas" })), true);
assert.equal(isActiveOnboardingStructure(structure({ id: "inactive", category: "Kelas", status: "disabled" })), false);

// Staging baseline: legacy rooms have capacity but no room/building gender configured.
const stagingRooms = Array.from({ length: 50 }, (_, index) => structure({
  id: `staging-room-${index}`,
  category: "Kamar",
  capacity: 10,
  occupied: 0,
}));
assert.deepEqual(getEligibleSupabaseOnboardingRooms(stagingRooms, "L"), []);
assert.deepEqual(getEligibleSupabaseOnboardingRooms(stagingRooms, "P"), []);

console.log("Supabase PPDB onboarding room eligibility passed.");
