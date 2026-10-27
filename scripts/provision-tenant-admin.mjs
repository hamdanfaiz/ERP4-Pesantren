import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function findExistingProfile(supabase, email) {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id,tenant_id,role,status,display_name,username')
    .eq('email', email)
    .maybeSingle();
  if (error) throw new Error('Profil dengan email tersebut tidak dapat diverifikasi di Supabase.');
  return data;
}

async function assertTenantCanReceiveInitialAdmin(supabase, input) {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id,name,tenant_type,time_zone,status')
    .eq('slug', input.slug)
    .maybeSingle();
  if (error) throw new Error('Status tenant tidak dapat diverifikasi di Supabase.');
  if (!tenant) return;
  if (tenant.name !== input.name || (tenant.tenant_type ?? null) !== input.tenantType
    || tenant.time_zone !== input.timeZone || tenant.status !== 'active') {
    throw new Error('Slug tenant sudah digunakan dengan konfigurasi berbeda atau tenant tidak aktif.');
  }

  const { count, error: profileError } = await supabase
    .from('profiles')
    .select('user_id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id);
  if (profileError) throw new Error('Isi tenant tidak dapat diverifikasi di Supabase.');
  if ((count || 0) > 0) {
    throw new Error('Tenant sudah memiliki profil; bootstrap Admin pertama sudah ditutup.');
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4) {
    throw new Error(
      'Pemakaian: npm run provision:tenant-admin -- <slug-tenant> "Nama Pesantren" <email-admin> "Nama Admin"',
    );
  }

  const [tenantSlugInput, tenantNameInput, adminEmailInput, adminNameInput] = args;
  const tenantSlug = tenantSlugInput.trim().toLowerCase();
  const tenantName = tenantNameInput.trim();
  const adminEmail = adminEmailInput.trim().toLowerCase();
  const adminName = adminNameInput.trim();
  const tenantType = process.env.BOOTSTRAP_TENANT_TYPE?.trim() || null;
  const timeZone = process.env.BOOTSTRAP_TENANT_TIME_ZONE?.trim() || 'Asia/Jakarta';
  const redirectTo = process.env.SUPABASE_AUTH_REDIRECT_URL?.trim();

  if (!/^[a-z0-9-]{1,63}$/.test(tenantSlug)) throw new Error('Slug tenant hanya boleh berisi huruf kecil, angka, dan tanda hubung.');
  if (tenantName.length < 2 || tenantName.length > 200) throw new Error('Nama pesantren harus berisi 2–200 karakter.');
  if (adminEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error('Alamat email Admin tidak valid.');
  if (adminName.length < 2 || adminName.length > 160) throw new Error('Nama Admin harus berisi 2–160 karakter.');
  if (timeZone.length < 1 || timeZone.length > 100) throw new Error('Zona waktu tenant tidak valid.');
  if (redirectTo) {
    let parsed;
    try { parsed = new URL(redirectTo); } catch { throw new Error('SUPABASE_AUTH_REDIRECT_URL harus berupa URL yang valid.'); }
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
      throw new Error('URL pengalihan undangan harus memakai HTTPS, kecuali untuk localhost.');
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error('SUPABASE_URL dan SUPABASE_SECRET_KEY harus tersedia di environment server/operator.');
  }

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const existingProfile = await findExistingProfile(supabase, adminEmail);
  if (existingProfile) {
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('slug,name,tenant_type,time_zone,status')
      .eq('id', existingProfile.tenant_id)
      .maybeSingle();
    if (tenantError) throw new Error('Tenant profil Admin tidak dapat diverifikasi di Supabase.');
    const expectedUsername = adminEmail.split('@')[0].slice(0, 100);
    if (tenant?.slug !== tenantSlug || tenant.name !== tenantName
      || (tenant.tenant_type ?? null) !== tenantType || tenant.time_zone !== timeZone || tenant.status !== 'active'
      || existingProfile.role !== 'admin' || existingProfile.status !== 'active'
      || existingProfile.display_name !== adminName || existingProfile.username !== expectedUsername) {
      throw new Error('Email sudah memiliki profil ERP yang berbeda; bootstrap dihentikan agar tenant/role tidak berubah.');
    }
    console.log(`Tenant ${tenantSlug} dan profil Admin sudah terprovisi; tidak ada undangan atau perubahan yang dibuat.`);
    return;
  }

  await assertTenantCanReceiveInitialAdmin(supabase, {
    slug: tenantSlug,
    name: tenantName,
    tenantType,
    timeZone,
  });

  const inviteOptions = {
    data: { name: adminName, display_name: adminName },
    ...(redirectTo ? { redirectTo } : {}),
  };
  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(adminEmail, inviteOptions);
  if (inviteError || !inviteData.user) {
    throw new Error(
      'Undangan Admin gagal dibuat. Pastikan email belum terdaftar tanpa profil ERP, SMTP Auth aktif, dan URL pengalihan diizinkan.',
    );
  }

  const { data: provisioned, error: provisionError } = await supabase.rpc(
    'provision_tenant_with_initial_admin',
    {
      p_tenant_slug: tenantSlug,
      p_tenant_name: tenantName,
      p_tenant_type: tenantType,
      p_time_zone: timeZone,
      p_admin_user_id: inviteData.user.id,
      p_admin_email: adminEmail,
      p_admin_display_name: adminName,
      p_admin_username: adminEmail.split('@')[0].slice(0, 100),
    },
  );

  if (provisionError || !Array.isArray(provisioned) || provisioned.length !== 1) {
    const { error: cleanupError } = await supabase.auth.admin.deleteUser(inviteData.user.id);
    if (cleanupError) {
      throw new Error(
        'Bootstrap database gagal dan akun Auth sementara tidak berhasil dibersihkan. Profil tidak dibuat; minta operator memeriksa akun undangan sebelum mencoba ulang.',
      );
    }
    const reason = provisionError?.code ? ` Kode: ${provisionError.code}.` : '';
    throw new Error(`Bootstrap tenant/Admin gagal; akun undangan sementara sudah dibersihkan.${reason}`);
  }

  const result = provisioned[0];
  console.log(`Tenant ${tenantSlug} dan profil Admin berhasil diprovisi.`);
  console.log(`Tenant ID: ${result.tenant_id}`);
  console.log(`Supabase Auth mengirim undangan ke ${adminEmail}; Admin menetapkan kata sandi sendiri melalui tautan tersebut.`);
}

main().catch((error) => fail(error instanceof Error ? error.message : 'Provisioning gagal.'));
