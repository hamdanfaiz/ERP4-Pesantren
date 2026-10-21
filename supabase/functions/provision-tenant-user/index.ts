import { withSupabase } from "npm:@supabase/server@1";
import { validateProvisionUserInput } from "../_shared/provision-user-validation.ts";

type BodyReadResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 };

async function readBoundedJson(req: Request, maxBytes: number): Promise<BodyReadResult> {
  const reader = req.body?.getReader();
  if (!reader) return { ok: false, status: 400 };

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }
}

function json(status: number, payload: Record<string, unknown>): Response {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return json(405, { error: "Metode tidak didukung." });
    }

    const contentLength = Number(req.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > 8_192) {
      return json(413, { error: "Body permintaan terlalu besar." });
    }

    const body = await readBoundedJson(req, 8_192);
    if (!body.ok) {
      return json(body.status, {
        error: body.status === 413 ? "Body permintaan terlalu besar." : "Body JSON tidak valid.",
      });
    }

    const parsed = validateProvisionUserInput(body.value);
    if (!parsed.ok) return json(400, { error: parsed.error });

    const actorId = ctx.userClaims?.id;
    if (!actorId) return json(401, { error: "Sesi pengguna tidak valid." });

    const { data: actor, error: actorError } = await ctx.supabase
      .from("profiles")
      .select("user_id, tenant_id, role, status")
      .eq("user_id", actorId)
      .maybeSingle();

    if (actorError || !actor || actor.status !== "active") {
      return json(403, { error: "Profil aktif tidak ditemukan." });
    }
    if (actor.role !== "admin" && actor.role !== "super_admin") {
      return json(403, { error: "Hanya Admin tenant yang dapat mengelola pengguna." });
    }

    const { data: tenant, error: tenantError } = await ctx.supabase
      .from("tenants")
      .select("id, status")
      .eq("id", actor.tenant_id)
      .maybeSingle();

    if (tenantError || !tenant || tenant.status !== "active") {
      return json(403, { error: "Tenant tidak aktif." });
    }

    const { data: canManageUsers, error: usersPermissionError } = await ctx.supabase.rpc(
      "has_module_access",
      { p_module: "users" },
    );
    if (usersPermissionError || canManageUsers !== true) {
      return json(403, { error: "Akses modul manajemen pengguna ditolak." });
    }

    if (parsed.value.role === "admin" && actor.role !== "super_admin") {
      return json(403, { error: "Admin tenant tidak dapat membuat Admin lain." });
    }

    if (actor.role !== "super_admin") {
      const requestedModules = Object.entries(parsed.value.modulePermissions)
        .filter(([, allowed]) => allowed)
        .map(([module]) => module);
      const moduleChecks = await Promise.all(
        requestedModules.map((module) =>
          ctx.supabase.rpc("has_module_access", { p_module: module })
        ),
      );
      if (moduleChecks.some(({ data, error }) => error || data !== true)) {
        return json(403, { error: "Permission tidak boleh melebihi akses Admin yang membuat akun." });
      }
    }

    const { data: createData, error: createError } = await ctx.supabaseAdmin.auth.admin.createUser({
      email: parsed.value.email,
      password: parsed.value.temporaryPassword,
      email_confirm: true,
      user_metadata: { display_name: parsed.value.displayName },
    });

    if (createError || !createData.user) {
      console.error("tenant_user_create_failed", {
        actorId,
        tenantId: actor.tenant_id,
        status: createError?.status ?? null,
      });
      return json(409, { error: "Akun tidak dapat dibuat. Periksa apakah email sudah terdaftar." });
    }

    const user = createData.user;
    const { error: profileError } = await ctx.supabaseAdmin.from("profiles").insert({
      user_id: user.id,
      tenant_id: actor.tenant_id,
      email: parsed.value.email,
      display_name: parsed.value.displayName,
      role: parsed.value.role,
      status: "active",
      module_permissions: parsed.value.modulePermissions,
      must_change_password: true,
    });

    if (profileError) {
      const { error: cleanupError } = await ctx.supabaseAdmin.auth.admin.deleteUser(user.id);
      console.error("tenant_user_profile_insert_failed", {
        actorId,
        tenantId: actor.tenant_id,
        createdUserId: user.id,
        profileErrorCode: profileError.code ?? null,
        authCleanupFailed: Boolean(cleanupError),
      });
      return json(500, {
        error: "Akun belum dapat diselesaikan. Minta administrator sistem memeriksa log provisioning.",
      });
    }

    return json(201, {
      user: {
        id: user.id,
        email: parsed.value.email,
        displayName: parsed.value.displayName,
        role: parsed.value.role,
        tenantId: actor.tenant_id,
        status: "active",
      },
      mustChangePassword: true,
    });
  }),
};
