-- Sample grade labels for classes created without a jenjang.
-- The labels match the grade text already stored on students.
BEGIN;

WITH numbered AS (
  SELECT tenant_id, category, id,
    row_number() OVER (
      PARTITION BY tenant_id
      ORDER BY NULLIF(substring(name FROM '([0-9]+)$'), '')::integer, name, id
    ) AS n
  FROM public.master_data_records
  WHERE category = 'Kelas' AND NULLIF(btrim(grade), '') IS NULL
), labels(slot, grade) AS (
  VALUES (0, 'X-A'), (1, 'X-B'), (2, 'XI-A'), (3, 'XI-B'), (4, 'XII-A'), (5, 'XII-B')
)
UPDATE public.master_data_records AS class_record
SET grade = labels.grade
FROM numbered
JOIN labels ON labels.slot = (numbered.n - 1) % 6
WHERE class_record.tenant_id = numbered.tenant_id
  AND class_record.category = numbered.category
  AND class_record.id = numbered.id;

COMMIT;
