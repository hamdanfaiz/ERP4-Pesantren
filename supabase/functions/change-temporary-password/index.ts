import { withSupabase } from "npm:@supabase/server@1";

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
    if (Number.isFinite(contentLength) && contentLength > 1_024) {
      return json(413, { error: "Body permintaan terlalu besar." });
    }

    const body = await readBoundedJson(req, 1_024);
    if (!body.ok) {
      return json(body.status, {
        error: body.status === 413 ? "Body permintaan terlalu besar." : "Body JSON tidak valid.",
      });
    }

    if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
      return json(400, { error: "Body permintaan tidak valid." });
    }
    const input = body.value as Record<string, unknown>;
    if (Object.keys(input).length !== 1 || typeof input.newPassword !== "string") {
      return json(400, { error: "Hanya kata sandi baru yang boleh dikirim." });
    }
    const newPassword = input.newPassword;
    if (newPassword.length < 12 || newPassword.length > 128
      || /[\u0000-\u001f\u007f]/.test(newPassword)) {
      return json(400, {
        error: "Kata sandi baru harus 12–128 karakter dan tidak boleh berisi karakter kontrol.",
      });
    }

    const userId = ctx.userClaims?.id;
    if (!userId) return json(401, { error: "Sesi pengguna tidak valid." });

    const { data: profile, error: profileReadError } = await ctx.supabase
      .from("profiles")
      .select("user_id, status, must_change_password")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileReadError || !profile || profile.status !== "active") {
      return json(403, { error: "Profil aktif tidak ditemukan." });
    }
    if (profile.must_change_password !== true) {
      return json(409, { error: "Akun ini tidak sedang menunggu penggantian kata sandi awal." });
    }

    const { error: passwordError } = await ctx.supabase.auth.updateUser({ password: newPassword });
    if (passwordError) {
      return json(400, { error: "Kata sandi tidak dapat diperbarui. Periksa kebijakan kata sandi." });
    }

    const { data: updatedProfile, error: profileUpdateError } = await ctx.supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("user_id", userId)
      .eq("must_change_password", true)
      .select("user_id")
      .maybeSingle();

    if (profileUpdateError || !updatedProfile) {
      console.error("temporary_password_gate_clear_failed", {
        userId,
        profileErrorCode: profileUpdateError?.code ?? null,
      });
      return json(503, {
        error: "Kata sandi diperbarui, tetapi penyelesaian setup tertunda. Kirim ulang permintaan atau hubungi administrator.",
      });
    }

    return json(200, { success: true, mustChangePassword: false });
  }),
};
