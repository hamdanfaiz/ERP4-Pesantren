-- One open academic term and the default KKTP for tenants that do not have them yet.
BEGIN;

INSERT INTO public.academic_settings (tenant_id, kktp_threshold, updated_by)
SELECT tenant_actor.tenant_id, 75, tenant_actor.user_id
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS tenant_actor
WHERE NOT EXISTS (
  SELECT 1 FROM public.academic_settings existing
  WHERE existing.tenant_id = tenant_actor.tenant_id
);

INSERT INTO public.academic_terms (
  tenant_id, name, starts_on, ends_on, status, created_by, updated_by
)
SELECT tenant_actor.tenant_id, '2026/2027 Ganjil', DATE '2026-07-13', DATE '2026-12-19', 'open',
  tenant_actor.user_id, tenant_actor.user_id
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS tenant_actor
WHERE NOT EXISTS (
  SELECT 1 FROM public.academic_terms existing
  WHERE existing.tenant_id = tenant_actor.tenant_id AND existing.status = 'open'
);

COMMIT;
