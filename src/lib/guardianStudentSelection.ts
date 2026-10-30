export type GuardianLinkedStudent = { id: unknown };

/** Keep a requested student only while that student remains in the server-authorized list. */
export function resolveGuardianStudentId(
  students: readonly GuardianLinkedStudent[],
  requestedId: string | null | undefined,
): string {
  const requested = typeof requestedId === "string" ? requestedId.trim() : "";
  if (requested && students.some((student) => String(student.id ?? "").trim() === requested)) {
    return requested;
  }
  return String(students.find((student) => String(student.id ?? "").trim())?.id ?? "").trim();
}
