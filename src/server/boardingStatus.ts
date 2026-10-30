const NON_OPERATIONAL_STUDENT_STATUSES = new Set([
  "archived", "alumni", "graduated", "inactive", "nonaktif", "tidak aktif", "disabled", "dikeluarkan",
]);

export function isOperationalBoardingStudent(status: unknown): boolean {
  return !NON_OPERATIONAL_STUDENT_STATUSES.has(String(status || "").trim().toLocaleLowerCase("id-ID"));
}
