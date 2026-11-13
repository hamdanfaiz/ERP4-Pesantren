-- Sample academic subjects and one classroom for tenants that already have an Admin.
-- Existing classes, students, and academic records are left unchanged.
BEGIN;

INSERT INTO public.tenant_reference_items (
  tenant_id, domain, code, name, description, status, created_by_user_id, updated_by_user_id
)
SELECT tenant_actor.tenant_id, sample.domain, sample.code, sample.name, sample.description, 'active',
  tenant_actor.user_id, tenant_actor.user_id
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS tenant_actor
CROSS JOIN (VALUES
  ('academic_subject', 'FIQIH', 'Fiqih', 'Pembelajaran fikih ibadah dan muamalah untuk santri.'),
  ('academic_subject', 'NAHWU', 'Nahwu', 'Pembelajaran tata bahasa Arab dasar untuk santri.'),
  ('academic_subject', 'TAHFIDZ', 'Tahfidz', 'Setoran dan murajaah hafalan Al-Quran.'),
  ('academic_subject', 'BAHASA_ARAB', 'Bahasa Arab', 'Pembelajaran kosakata dan percakapan bahasa Arab.'),
  ('academic_subject', 'MATEMATIKA', 'Matematika', 'Pembelajaran berhitung pada kurikulum formal.'),
  ('academic_subject', 'BAHASA_INDONESIA', 'Bahasa Indonesia', 'Pembelajaran bahasa Indonesia pada kurikulum formal.'),
  ('facility_resource', 'RUANG_KELAS', 'Ruang Kelas', 'Ruang belajar sampel untuk jadwal KBM.')
) AS sample(domain, code, name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_reference_items existing
  WHERE existing.tenant_id = tenant_actor.tenant_id
    AND existing.domain = sample.domain
    AND (existing.code = sample.code OR lower(btrim(existing.name)) = lower(sample.name))
);

COMMIT;
