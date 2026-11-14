-- Two-digit NIS grade codes for the sample jenjang catalog.
-- Existing issued numbers are unchanged because these codes were empty.
BEGIN;

UPDATE public.tenant_reference_items AS item
SET nis_grade_code = codes.code
FROM (VALUES
  ('TK', '01'),
  ('SD', '02'),
  ('SMP', '03'),
  ('SMA', '04'),
  ('X-A', '11'),
  ('X-B', '12'),
  ('XI-A', '21'),
  ('XI-B', '22'),
  ('XII-A', '31'),
  ('XII-B', '32')
) AS codes(name, code)
WHERE item.domain = 'academic_grade_level'
  AND item.status = 'active'
  AND item.nis_grade_code IS NULL
  AND lower(btrim(item.name)) = lower(codes.name);

COMMIT;
