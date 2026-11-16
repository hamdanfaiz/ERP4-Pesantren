-- Verify tenant-scoped CBT student keyset pages, literal NIS search, and server-only access.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(30);

INSERT INTO public.tenants(id,slug,name,status) VALUES
  ('e1900000-0000-4000-8000-000000000009','cbt-roster-one','CBT Roster One','active'),
  ('e1900000-0000-4000-8000-000000000019','cbt-roster-two','CBT Roster Two','active');

INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e1900000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cbt-roster-a@test.invalid','',now(),'{}','{}',now(),now()),
  ('e1900000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cbt-roster-b@test.invalid','',now(),'{}','{}',now(),now());

INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions) VALUES
  ('e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000009','cbt-roster-a@test.invalid','CBT Roster Admin A','admin','active','{"master-data":true,"cbt":true}'),
  ('e1900000-0000-4000-8000-000000000012','e1900000-0000-4000-8000-000000000019','cbt-roster-b@test.invalid','CBT Roster Admin B','admin','active','{"master-data":true,"cbt":true}');

INSERT INTO public.tenant_reference_items (
  id,tenant_id,domain,code,name,description,status,nis_grade_code,created_by_user_id,updated_by_user_id
) VALUES
  ('e1900000-0000-4000-8000-000000000101','e1900000-0000-4000-8000-000000000009','academic_grade_level','GRADE_VII','Kelas VII','Jenjang uji untuk roster CBT tenant A.','active','07','e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000011'),
  ('e1900000-0000-4000-8000-000000000201','e1900000-0000-4000-8000-000000000019','academic_grade_level','GRADE_VII','Kelas VII','Jenjang uji untuk roster CBT tenant B.','active','07','e1900000-0000-4000-8000-000000000012','e1900000-0000-4000-8000-000000000012');

INSERT INTO public.master_data_records(tenant_id,category,id,name,status,grade,grade_level_reference_id)
VALUES
  ('e1900000-0000-4000-8000-000000000009','Kelas','CBT-ROSTER-KELAS','Kelas CBT Roster','Active','Kelas VII','e1900000-0000-4000-8000-000000000101'),
  ('e1900000-0000-4000-8000-000000000019','Kelas','CBT-ROSTER-KELAS','Kelas CBT Roster Tenant B','Active','Kelas VII','e1900000-0000-4000-8000-000000000201');

INSERT INTO public.master_data_records(tenant_id,category,id,name,status,capacity)
VALUES
  ('e1900000-0000-4000-8000-000000000009','Kamar','CBT-ROSTER-KAMAR','Kamar CBT Roster','Active',1),
  ('e1900000-0000-4000-8000-000000000019','Kamar','CBT-ROSTER-KAMAR','Kamar CBT Roster Tenant B','Active',1);

INSERT INTO public.candidates(id,tenant_id,registration_id,name,grade,grade_level_reference_id)
SELECT
  ('e1900000-0000-4000-8000-' || lpad((300000000 + generated.sequence)::TEXT,12,'0'))::UUID,
  'e1900000-0000-4000-8000-000000000009',
  'CBT-ROSTER-' || lpad(generated.sequence::TEXT,5,'0'),
  'Kandidat CBT Roster ' || generated.sequence,
  'Kelas VII','e1900000-0000-4000-8000-000000000101'::UUID
FROM generate_series(1,2108) AS generated(sequence);

INSERT INTO public.candidates(id,tenant_id,registration_id,name,grade,grade_level_reference_id)
VALUES
  ('e1900000-0000-4000-8000-000400000019','e1900000-0000-4000-8000-000000000019','CBT-ROSTER-B-1','Kandidat Tenant B','Kelas VII','e1900000-0000-4000-8000-000000000201');

INSERT INTO public.students(
  id,tenant_id,source_candidate_id,nis,name,gender,grade,nik_ciphertext,nik_fingerprint,class_id,room_id,status
)
SELECT
  ('e1900000-0000-4000-8000-' || lpad((200000000 + generated.sequence)::TEXT,12,'0'))::UUID,
  'e1900000-0000-4000-8000-000000000009',
  ('e1900000-0000-4000-8000-' || lpad((300000000 + generated.sequence)::TEXT,12,'0'))::UUID,
  lpad(generated.sequence::TEXT,10,'0'),
  CASE generated.sequence
    WHEN 2106 THEN 'Santri Sama'
    WHEN 2107 THEN 'Santri Sama'
    WHEN 2108 THEN 'Santri Z 100%_ Literal'
    ELSE 'Santri Paginasi ' || lpad(generated.sequence::TEXT,4,'0')
  END,
  'L','Kelas VII',
  decode(md5('cipher-' || generated.sequence::TEXT),'hex'),
  decode(md5('fingerprint-' || generated.sequence::TEXT),'hex'),
  'CBT-ROSTER-KELAS','CBT-ROSTER-KAMAR',
  CASE WHEN generated.sequence = 2105 THEN 'Archived' ELSE 'Active' END
FROM generate_series(1,2108) AS generated(sequence);

INSERT INTO public.students(
  id,tenant_id,source_candidate_id,nis,name,gender,grade,nik_ciphertext,nik_fingerprint,class_id,room_id,status
)
VALUES (
  'e1900000-0000-4000-8000-000400000019','e1900000-0000-4000-8000-000000000019',
  'e1900000-0000-4000-8000-000400000019','9000000001','Santri Tenant B','P','Kelas VII',
  decode(md5('cipher-tenant-b'),'hex'),decode(md5('fingerprint-tenant-b'),'hex'),
  'CBT-ROSTER-KELAS','CBT-ROSTER-KAMAR','Active'
);

SELECT is((
  SELECT string_agg(page.id::TEXT, ',' ORDER BY page.name ASC,page.id ASC)
  FROM public.list_cbt_admin_student_page(
    'e1900000-0000-4000-8000-000000000009',2,NULL,NULL,NULL
  ) AS page
),'e1900000-0000-4000-8000-000200000001,e1900000-0000-4000-8000-000200000002',
'first page has stable tenant name and ID ordering');

SELECT is((
  SELECT string_agg(page.id::TEXT, ',' ORDER BY page.name ASC,page.id ASC)
  FROM public.list_cbt_admin_student_page(
    'e1900000-0000-4000-8000-000000000009',2,
    'Santri Paginasi 0002','e1900000-0000-4000-8000-000200000002',NULL
  ) AS page
),'e1900000-0000-4000-8000-000200000003,e1900000-0000-4000-8000-000200000004',
'keyset cursor advances without skipping the next names');

SELECT is((
  SELECT count(*)::TEXT
  FROM public.list_cbt_admin_student_page(
    'e1900000-0000-4000-8000-000000000009',101,NULL,NULL,NULL
  )
),'101','page size supports the maximum plus look-ahead row');

SELECT is((
  SELECT count(*)::TEXT
  FROM public.list_cbt_admin_student_page(
    'e1900000-0000-4000-8000-000000000009',10,NULL,NULL,'100%_'
  )
),'1','name search treats percent and underscore literally');

SELECT is((
  SELECT string_agg(page.id::TEXT, ',' ORDER BY page.name ASC,page.id ASC)
  FROM public.list_cbt_admin_student_page(
    'e1900000-0000-4000-8000-000000000009',10,NULL,NULL,'0000002104'
  ) AS page
),'e1900000-0000-4000-8000-000200002104','NIS search resolves the matching student without returning NIS');

SELECT is((
  SELECT count(*)::TEXT
  FROM public.list_cbt_admin_student_page(
    'e1900000-0000-4000-8000-000000000009',10,NULL,NULL,'Santri Sama'
  )
),'2','same-name records are retained as separate selectable students');

SELECT is((
  SELECT count(*)::TEXT
  FROM public.list_cbt_admin_student_page(
    'e1900000-0000-4000-8000-000000000009',10,NULL,NULL,'0000002105'
  )
),'0','archived students cannot be selected for a new CBT exam');

SELECT is((
  SELECT string_agg(page.id::TEXT, ',' ORDER BY page.name ASC,page.id ASC)
  FROM public.list_cbt_admin_student_page(
    'e1900000-0000-4000-8000-000000000019',10,NULL,NULL,NULL
  ) AS page
),'e1900000-0000-4000-8000-000400000019','tenant pages return only their own students');

SELECT is((
  SELECT count(*)::TEXT
  FROM public.list_cbt_admin_student_page(
    'e1900000-0000-4000-8000-000000000009',10,NULL,NULL,'Santri Tenant B'
  )
),'0','tenant search cannot return a student owned by another tenant');

SELECT throws_ok(
  $$SELECT * FROM public.list_cbt_admin_student_page('e1900000-0000-4000-8000-000000000099',2,NULL,NULL,NULL)$$,
  '42501','Tenant CBT tidak tersedia','unknown tenant is rejected');

SELECT throws_ok(
  $$SELECT * FROM public.list_cbt_admin_student_page('e1900000-0000-4000-8000-000000000009',1,NULL,NULL,NULL)$$,
  '22023','Parameter halaman santri CBT tidak valid','undersized page is rejected');

SELECT throws_ok(
  $$SELECT * FROM public.list_cbt_admin_student_page('e1900000-0000-4000-8000-000000000009',102,NULL,NULL,NULL)$$,
  '22023','Parameter halaman santri CBT tidak valid','oversized page is rejected');

SELECT throws_ok(
  $$SELECT * FROM public.list_cbt_admin_student_page('e1900000-0000-4000-8000-000000000009',2,'Santri Paginasi 0001',NULL,NULL)$$,
  '22023','Parameter halaman santri CBT tidak valid','partial cursor is rejected');

SELECT throws_ok(
  $$SELECT * FROM public.list_cbt_admin_student_page('e1900000-0000-4000-8000-000000000009',2,NULL,NULL,'ab')$$,
  '22023','Parameter halaman santri CBT tidak valid','short search is rejected');

SELECT throws_ok(
  $$SELECT * FROM public.list_cbt_admin_student_page('e1900000-0000-4000-8000-000000000009',2,NULL,NULL,repeat('x',101))$$,
  '22023','Parameter halaman santri CBT tidak valid','oversized search is rejected');

CREATE TEMP TABLE cbt_student_page_buffer(id UUID PRIMARY KEY,name TEXT NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE cbt_student_page_seen(id UUID PRIMARY KEY) ON COMMIT DROP;

DO $$
DECLARE
  v_cursor_name TEXT;
  v_cursor_id UUID;
  v_buffer_count INTEGER;
  v_inserted INTEGER;
BEGIN
  LOOP
    TRUNCATE cbt_student_page_buffer;
    INSERT INTO cbt_student_page_buffer(id,name)
    SELECT page.id,page.name
    FROM public.list_cbt_admin_student_page(
      'e1900000-0000-4000-8000-000000000009',101,
      v_cursor_name,v_cursor_id,NULL
    ) AS page
    ORDER BY page.name ASC,page.id ASC;

    SELECT count(*) INTO v_buffer_count FROM cbt_student_page_buffer;
    EXIT WHEN v_buffer_count = 0;

    INSERT INTO cbt_student_page_seen(id)
    SELECT id FROM cbt_student_page_buffer ORDER BY name ASC,id ASC LIMIT 100
    ON CONFLICT (id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    SELECT name,id INTO v_cursor_name,v_cursor_id
    FROM cbt_student_page_buffer
    ORDER BY name ASC,id ASC
    LIMIT 1 OFFSET 99;
    EXIT WHEN v_buffer_count <= 100 OR v_inserted = 0;
  END LOOP;
END;
$$;

SELECT is((SELECT count(*)::TEXT FROM cbt_student_page_seen),'2107','traversal reaches all 2,107 selectable students beyond the old 2,000-row limit');
SELECT is((SELECT count(DISTINCT id)::TEXT FROM cbt_student_page_seen),'2107','keyset traversal produces no duplicate student IDs');

SELECT is((
  SELECT string_agg(label.id::TEXT, ',')
  FROM public.list_cbt_admin_student_labels(
    'e1900000-0000-4000-8000-000000000009',
    ARRAY['e1900000-0000-4000-8000-000200000001'::UUID,'e1900000-0000-4000-8000-000400000019'::UUID]
  ) AS label
),'e1900000-0000-4000-8000-000200000001','result labels are limited to the requested tenant');

SELECT is((
  SELECT string_agg(label.class_name, ',')
  FROM public.list_cbt_admin_student_labels(
    'e1900000-0000-4000-8000-000000000009',
    ARRAY['e1900000-0000-4000-8000-000200000001'::UUID]
  ) AS label
),'Kelas CBT Roster','result labels include the tenant class name');

SELECT throws_ok(
  $$SELECT * FROM public.list_cbt_admin_student_labels('e1900000-0000-4000-8000-000000000099',ARRAY[]::UUID[])$$,
  '42501','Tenant CBT tidak tersedia','label lookup rejects an unknown tenant');

SELECT throws_ok(
  $$SELECT * FROM public.list_cbt_admin_student_labels('e1900000-0000-4000-8000-000000000009',ARRAY[NULL::UUID])$$,
  '22023','Daftar peserta CBT tidak valid','label lookup rejects null IDs');

SELECT ok(NOT has_function_privilege('anon','public.list_cbt_admin_student_page(uuid,integer,text,uuid,text)','EXECUTE'),'anon cannot execute student page directly');
SELECT ok(NOT has_function_privilege('authenticated','public.list_cbt_admin_student_page(uuid,integer,text,uuid,text)','EXECUTE'),'authenticated cannot execute student page directly');
SELECT ok(has_function_privilege('service_role','public.list_cbt_admin_student_page(uuid,integer,text,uuid,text)','EXECUTE'),'backend can execute student page');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.list_cbt_admin_student_page(uuid,integer,text,uuid,text)'::regprocedure),'student page uses invoker privileges');
SELECT ok(NOT has_function_privilege('anon','public.list_cbt_admin_student_labels(uuid,uuid[])','EXECUTE'),'anon cannot execute student label lookup directly');
SELECT ok(NOT has_function_privilege('authenticated','public.list_cbt_admin_student_labels(uuid,uuid[])','EXECUTE'),'authenticated cannot execute student label lookup directly');
SELECT ok(has_function_privilege('service_role','public.list_cbt_admin_student_labels(uuid,uuid[])','EXECUTE'),'backend can execute student label lookup');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.list_cbt_admin_student_labels(uuid,uuid[])'::regprocedure),'student label lookup uses invoker privileges');
SELECT ok(
  to_regclass('public.students_tenant_name_page_idx') IS NOT NULL
  AND to_regclass('public.students_name_trgm_idx') IS NOT NULL
  AND to_regclass('public.students_nis_trgm_idx') IS NOT NULL,
  'tenant ordering and name/NIS search indexes are present'
);

SELECT * FROM finish();
ROLLBACK;
