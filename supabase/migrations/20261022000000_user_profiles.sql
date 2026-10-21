-- Profil RBAC. Identitas ada di Supabase Auth; baris ini menyimpan peran dan tenant.
-- Klien hanya boleh membaca profilnya sendiri. Perubahan akun tetap lewat server.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  username text,
  role text not null,
  tenant_id text not null,
  tenant_name text,
  tenant_type text,
  unit_id text,
  status text not null default 'active',
  must_change_password boolean not null default true,
  module_permissions jsonb not null default '{}'::jsonb,
  linked_santri_id text,
  linked_santri_name text,
  linked_santri_nis text,
  linked_santri_class text,
  linked_santri_room text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_uid uuid,
  updated_by_uid uuid,
  constraint user_profiles_role_check check (role in ('SuperAdmin', 'Admin', 'Ustadz', 'Santri', 'Walisantri')),
  constraint user_profiles_status_check check (status in ('active', 'disabled', 'inactive'))
);

create index if not exists user_profiles_tenant_id_idx on public.user_profiles (tenant_id);

alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_select_own on public.user_profiles;
create policy user_profiles_select_own
  on public.user_profiles
  for select
  to authenticated
  using (auth.uid() = id);

revoke all on public.user_profiles from anon;
grant select on public.user_profiles to authenticated;
