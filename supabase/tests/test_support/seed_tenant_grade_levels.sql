-- Test-only reference rows for workflows that require a tenant grade catalog.
-- Keep these fixtures out of migrations and production seed data.
INSERT INTO public.tenant_reference_items (
  tenant_id, domain, code, name, description, status, nis_grade_code,
  created_by_user_id, updated_by_user_id
)
SELECT DISTINCT tenant_actor.tenant_id,
  'academic_grade_level', grade.code, grade.name, grade.description, 'active', grade.nis_grade_code,
  tenant_actor.user_id, tenant_actor.user_id
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE WHEN lower(role) = 'super_admin' THEN 0 ELSE 1 END, user_id
) AS tenant_actor
CROSS JOIN (VALUES
  ('PGTAP_GRADE_I', 'I', 'Jenjang kelas satu untuk skenario pengujian.', '01'),
  ('PGTAP_GRADE_II', 'II', 'Jenjang kelas dua untuk skenario pengujian.', '02'),
  ('PGTAP_GRADE_III', 'III', 'Jenjang kelas tiga untuk skenario pengujian.', '03'),
  ('PGTAP_GRADE_IV', 'IV', 'Jenjang kelas empat untuk skenario pengujian.', '04'),
  ('PGTAP_GRADE_V', 'V', 'Jenjang kelas lima untuk skenario pengujian.', '05'),
  ('PGTAP_GRADE_VI', 'VI', 'Jenjang kelas enam untuk skenario pengujian.', '06'),
  ('PGTAP_GRADE_VII', 'VII', 'Jenjang kelas tujuh untuk skenario pengujian.', '07'),
  ('PGTAP_GRADE_VIII', 'VIII', 'Jenjang kelas delapan untuk skenario pengujian.', '08'),
  ('PGTAP_GRADE_IX', 'IX', 'Jenjang kelas sembilan untuk skenario pengujian.', '09'),
  ('PGTAP_GRADE_X', 'X', 'Jenjang kelas sepuluh untuk skenario pengujian.', '10'),
  ('PGTAP_GRADE_XI', 'XI', 'Jenjang kelas sebelas untuk skenario pengujian.', '11'),
  ('PGTAP_GRADE_XII', 'XII', 'Jenjang kelas dua belas untuk skenario pengujian.', '12'),
  ('PGTAP_GRADE_SMP', 'SMP', 'Jenjang SMP untuk skenario migrasi pengujian.', '80')
) AS grade(code, name, description, nis_grade_code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_reference_items existing
  WHERE existing.tenant_id = tenant_actor.tenant_id
    AND existing.domain = 'academic_grade_level'
    AND (existing.code = grade.code OR lower(btrim(existing.name)) = lower(grade.name))
)
ON CONFLICT DO NOTHING;
