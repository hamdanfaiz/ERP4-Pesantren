import { validateProvisionUserInput } from "../_shared/provision-user-validation.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("normalizes email and trims display name without accepting unexpected fields", () => {
  const result = validateProvisionUserInput({
    email: "  ADMIN@EXAMPLE.COM ",
    displayName: "  Pengelola Pesantren  ",
    role: "ustadz",
    temporaryPassword: "Temporary#Pass123",
  });

  assert(result.ok, "expected valid input");
  assert(result.value.email === "admin@example.com", "email should be normalized");
  assert(result.value.displayName === "Pengelola Pesantren", "name should be trimmed");
  assert(Object.keys(result.value.modulePermissions).length === 0,
    "permissions should default to an empty object");
  assert(result.value.temporaryPassword === "Temporary#Pass123", "explicit temporary password should be preserved");
});

Deno.test("rejects attempts to assign a super-admin role or client-supplied tenant", () => {
  const privilegedRole = validateProvisionUserInput({
    email: "user@example.com",
    displayName: "User",
    role: "super_admin",
    temporaryPassword: "Temporary#Pass123",
  });
  const clientTenant = validateProvisionUserInput({
    email: "user@example.com",
    displayName: "User",
    role: "santri",
    tenantId: "another-tenant",
    temporaryPassword: "Temporary#Pass123",
  });

  assert(!privilegedRole.ok, "super-admin must not be assignable");
  assert(!clientTenant.ok, "tenantId must not be accepted from the client");
});

Deno.test("rejects weak passwords, control characters, and malformed modules", () => {
  const weakPassword = validateProvisionUserInput({
    email: "user@example.com",
    displayName: "User",
    role: "santri",
    temporaryPassword: "short",
  });
  const controlCharacter = validateProvisionUserInput({
    email: "user@example.com",
    displayName: "User\nName",
    role: "santri",
    temporaryPassword: "Temporary#Pass123",
  });
  const malformedPermission = validateProvisionUserInput({
    email: "user@example.com",
    displayName: "User",
    role: "santri",
    temporaryPassword: "Temporary#Pass123",
    modulePermissions: { finance: "true" },
  });
  const unknownModule = validateProvisionUserInput({
    email: "user@example.com",
    displayName: "User",
    role: "santri",
    temporaryPassword: "Temporary#Pass123",
    modulePermissions: { "root-access": true },
  });

  assert(!weakPassword.ok, "weak password must be rejected");
  assert(!controlCharacter.ok, "control characters must be rejected");
  assert(!malformedPermission.ok, "non-boolean module permission must be rejected");
  assert(!unknownModule.ok, "unknown module must be rejected");
});
