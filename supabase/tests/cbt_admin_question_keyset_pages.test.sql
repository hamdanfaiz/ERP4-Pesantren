-- Verify keyset paging, literal search, tenant isolation, large-bank traversal, and server-only CBT RPC access.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(33);

INSERT INTO public.tenants(id,slug,name,status) VALUES
  ('e1900000-0000-4000-8000-000000000009','cbt-page-one','CBT Page One','active'),
  ('e1900000-0000-4000-8000-000000000019','cbt-page-two','CBT Page Two','active');

INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e1900000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cbt-page-one@test.invalid','',now(),'{}','{}',now(),now()),
  ('e1900000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cbt-page-two@test.invalid','',now(),'{}','{}',now(),now());

INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000009','cbt-page-one@test.invalid','CBT Page Admin One','admin','active','{"cbt":true}'),
  ('e1900000-0000-4000-8000-000000000012','e1900000-0000-4000-8000-000000000019','cbt-page-two@test.invalid','CBT Page Admin Two','admin','active','{"cbt":true}');

INSERT INTO public.tenant_reference_items (
  id,tenant_id,domain,code,name,description,status,nis_grade_code,created_by_user_id,updated_by_user_id
) VALUES
  ('e1900000-0000-4000-8000-00000000a001','e1900000-0000-4000-8000-000000000009','academic_subject','CBT_PAGE_MATH','Matematika','Referensi CBT page test.','active',NULL,'e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000011'),
  ('e1900000-0000-4000-8000-00000000a005','e1900000-0000-4000-8000-000000000009','academic_subject','CBT_PAGE_AQIDAH','Akidah','Referensi CBT page test.','active',NULL,'e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000011'),
  ('e1900000-0000-4000-8000-00000000a002','e1900000-0000-4000-8000-000000000009','academic_grade_level','CBT_PAGE_VII','VII','Referensi jenjang CBT page test.','active','07','e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000011'),
  ('e1900000-0000-4000-8000-00000000a003','e1900000-0000-4000-8000-000000000009','cbt_question_template','CBT_PAGE_CORE','Paket Inti','Paket inti CBT page test.','active',NULL,'e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000011'),
  ('e1900000-0000-4000-8000-00000000a004','e1900000-0000-4000-8000-000000000009','cbt_question_template','CBT_PAGE_EXTRA','Paket Pengayaan','Paket tambahan CBT page test.','active',NULL,'e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000011'),
  ('e1900000-0000-4000-8000-00000000b001','e1900000-0000-4000-8000-000000000019','academic_subject','CBT_PAGE_MATH','Matematika','Referensi CBT tenant kedua.','active',NULL,'e1900000-0000-4000-8000-000000000012','e1900000-0000-4000-8000-000000000012'),
  ('e1900000-0000-4000-8000-00000000b002','e1900000-0000-4000-8000-000000000019','academic_grade_level','CBT_PAGE_VII','VII','Referensi jenjang CBT tenant kedua.','active','07','e1900000-0000-4000-8000-000000000012','e1900000-0000-4000-8000-000000000012'),
  ('e1900000-0000-4000-8000-00000000b003','e1900000-0000-4000-8000-000000000019','cbt_question_template','CBT_PAGE_CORE','Paket Inti','Paket CBT tenant kedua.','active',NULL,'e1900000-0000-4000-8000-000000000012','e1900000-0000-4000-8000-000000000012');

INSERT INTO public.cbt_questions (
  id,tenant_id,subject,grade,template,question_html,options,correct_answer,explanation,
  difficulty,tags,status,created_by,updated_by,created_at,updated_at,
  subject_reference_id,grade_level_reference_id,template_reference_id
) VALUES
  ('e1900000-0000-4000-8000-000000000701','e1900000-0000-4000-8000-000000000009','Matematika','VII','Paket Inti','Soal urutan A','["A","B"]'::JSONB,0,'','Easy','{}','active','e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000011','2027-01-10 10:00:00+00','2027-01-10 10:00:00+00','e1900000-0000-4000-8000-00000000a001','e1900000-0000-4000-8000-00000000a002','e1900000-0000-4000-8000-00000000a003'),
  ('e1900000-0000-4000-8000-000000000702','e1900000-0000-4000-8000-000000000009','Matematika','VII','Paket Inti','Soal urutan B','["A","B"]'::JSONB,0,'','Easy','{}','active','e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000011','2027-01-10 10:00:00+00','2027-01-10 10:00:00+00','e1900000-0000-4000-8000-00000000a001','e1900000-0000-4000-8000-00000000a002','e1900000-0000-4000-8000-00000000a003'),
  ('e1900000-0000-4000-8000-000000000703','e1900000-0000-4000-8000-000000000009','Matematika','VII','Paket Inti','Apa makna cinta yang bernilai 100%?','["A","B"]'::JSONB,0,'','Medium','{filsafat}','active','e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000011','2027-01-10 10:00:00+00','2027-01-10 10:00:00+00','e1900000-0000-4000-8000-00000000a001','e1900000-0000-4000-8000-00000000a002','e1900000-0000-4000-8000-00000000a003'),
  ('e1900000-0000-4000-8000-000000000704','e1900000-0000-4000-8000-000000000009','Matematika','VII','Paket Inti','Soal arsip','["A","B"]'::JSONB,0,'','Hard','{}','archived','e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000011','2027-01-10 10:00:00+00','2027-01-10 10:00:00+00','e1900000-0000-4000-8000-00000000a001','e1900000-0000-4000-8000-00000000a002','e1900000-0000-4000-8000-00000000a003'),
  ('e1900000-0000-4000-8000-000000000705','e1900000-0000-4000-8000-000000000009','Akidah','VII','Paket Pengayaan','Soal paket pengayaan','["A","B"]'::JSONB,0,'','Medium','{}','active','e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000011','2027-01-09 10:00:00+00','2027-01-09 10:00:00+00','e1900000-0000-4000-8000-00000000a005','e1900000-0000-4000-8000-00000000a002','e1900000-0000-4000-8000-00000000a004'),
  ('e1900000-0000-4000-8000-000000000706','e1900000-0000-4000-8000-000000000019','Matematika','VII','Paket Inti','Soal milik tenant lain','["A","B"]'::JSONB,0,'','Easy','{}','active','e1900000-0000-4000-8000-000000000012','e1900000-0000-4000-8000-000000000012','2027-01-10 10:00:00+00','2027-01-10 10:00:00+00','e1900000-0000-4000-8000-00000000b001','e1900000-0000-4000-8000-00000000b002','e1900000-0000-4000-8000-00000000b003');

INSERT INTO public.cbt_questions (
  id,tenant_id,subject,grade,template,question_html,options,correct_answer,explanation,
  difficulty,tags,status,created_by,updated_by,created_at,updated_at,
  subject_reference_id,grade_level_reference_id,template_reference_id
)
SELECT
  ('e1900000-0000-4000-8000-' || lpad((100000000 + generated.sequence)::TEXT,12,'0'))::UUID,
  'e1900000-0000-4000-8000-000000000009',
  'Matematika','VII','Paket Inti',
  'Pertanyaan paginasi ' || generated.sequence,
  '["A","B"]'::JSONB,0,'','Easy',ARRAY['paginasi'],'active',
  'e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000011',
  '2027-01-01 10:00:00+00','2027-01-01 10:00:00+00',
  'e1900000-0000-4000-8000-00000000a001','e1900000-0000-4000-8000-00000000a002','e1900000-0000-4000-8000-00000000a003'
FROM generate_series(1,2105) AS generated(sequence);

SELECT is((
  SELECT string_agg(page.id::TEXT, ',' ORDER BY page.created_at DESC,page.id ASC)
  FROM public.list_cbt_admin_question_page(
    'e1900000-0000-4000-8000-000000000009',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL
  ) AS page
),'e1900000-0000-4000-8000-000000000701,e1900000-0000-4000-8000-000000000702','first page orders equal timestamps by id');

SELECT is((
  SELECT string_agg(page.id::TEXT, ',' ORDER BY page.created_at DESC,page.id ASC)
  FROM public.list_cbt_admin_question_page(
    'e1900000-0000-4000-8000-000000000009',2,'2027-01-10 10:00:00+00','e1900000-0000-4000-8000-000000000702',NULL,NULL,NULL,NULL,NULL
  ) AS page
),'e1900000-0000-4000-8000-000000000703,e1900000-0000-4000-8000-000000000704','keyset cursor advances without skipping equal-timestamp rows');

SELECT is((
  SELECT count(*)::TEXT
  FROM public.list_cbt_admin_question_page(
    'e1900000-0000-4000-8000-000000000009',101,NULL,NULL,NULL,'active',NULL,NULL,'e1900000-0000-4000-8000-00000000a003'
  )
),'101','page size is bounded at the API maximum plus look-ahead row');

SELECT is((
  SELECT count(*)::TEXT
  FROM public.list_cbt_admin_question_page(
    'e1900000-0000-4000-8000-000000000009',101,NULL,NULL,NULL,'archived',NULL,NULL,'e1900000-0000-4000-8000-00000000a003'
  )
),'1','archived questions are filterable');

SELECT is((
  SELECT count(*)::TEXT
  FROM public.list_cbt_admin_question_page(
    'e1900000-0000-4000-8000-000000000009',101,NULL,NULL,'cinta',NULL,NULL,NULL,NULL
  )
),'1','search includes question content');

SELECT is((
  SELECT count(*)::TEXT
  FROM public.list_cbt_admin_question_page(
    'e1900000-0000-4000-8000-000000000009',101,NULL,NULL,'filsafat',NULL,NULL,NULL,NULL
  )
),'1','search includes question tags');

SELECT is((
  SELECT count(*)::TEXT
  FROM public.list_cbt_admin_question_page(
    'e1900000-0000-4000-8000-000000000009',101,NULL,NULL,'100%',NULL,NULL,NULL,NULL
  )
),'1','search treats LIKE wildcard characters literally');

SELECT is((
  SELECT count(*)::TEXT
  FROM public.list_cbt_admin_question_page(
    'e1900000-0000-4000-8000-000000000009',101,NULL,NULL,NULL,NULL,
    'e1900000-0000-4000-8000-00000000a001','e1900000-0000-4000-8000-00000000a002','e1900000-0000-4000-8000-00000000a003'
  )
),'101','tenant reference filters apply server-side');

SELECT is((
  SELECT count(*)::TEXT
  FROM public.list_cbt_admin_question_page(
    'e1900000-0000-4000-8000-000000000009',101,NULL,NULL,NULL,NULL,
    'e1900000-0000-4000-8000-00000000b001',NULL,NULL
  )
),'0','cross-tenant reference filters return no rows');

SELECT is((
  SELECT string_agg(page.id::TEXT, ',' ORDER BY page.created_at DESC,page.id ASC)
  FROM public.list_cbt_admin_question_page(
    'e1900000-0000-4000-8000-000000000019',101,NULL,NULL,NULL,NULL,NULL,NULL,NULL
  ) AS page
),'e1900000-0000-4000-8000-000000000706','tenant pages contain only that tenant');

CREATE TEMP TABLE cbt_question_page_buffer(id UUID PRIMARY KEY,created_at TIMESTAMPTZ NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE cbt_question_page_seen(id UUID PRIMARY KEY) ON COMMIT DROP;

DO $$
DECLARE
  v_cursor_created_at TIMESTAMPTZ;
  v_cursor_id UUID;
  v_buffer_count INTEGER;
  v_inserted INTEGER;
BEGIN
  LOOP
    TRUNCATE cbt_question_page_buffer;
    INSERT INTO cbt_question_page_buffer(id,created_at)
    SELECT page.id,page.created_at
    FROM public.list_cbt_admin_question_page(
      'e1900000-0000-4000-8000-000000000009',101,
      v_cursor_created_at,v_cursor_id,NULL,NULL,NULL,NULL,NULL
    ) AS page
    ORDER BY page.created_at DESC,page.id ASC;
    SELECT count(*) INTO v_buffer_count FROM cbt_question_page_buffer;
    EXIT WHEN v_buffer_count = 0;

    INSERT INTO cbt_question_page_seen(id)
    SELECT id FROM cbt_question_page_buffer
    ORDER BY created_at DESC,id ASC
    LIMIT 100;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    SELECT created_at,id INTO v_cursor_created_at,v_cursor_id
    FROM cbt_question_page_buffer
    ORDER BY created_at DESC,id ASC
    LIMIT 1 OFFSET 99;
    EXIT WHEN v_buffer_count <= 100 OR v_inserted = 0;
  END LOOP;
END;
$$;

SELECT is((SELECT count(*)::TEXT FROM cbt_question_page_seen),'2110','walking every 100-row page visits the complete large tenant bank');
SELECT is((SELECT count(DISTINCT id)::TEXT FROM cbt_question_page_seen),'2110','keyset traversal produces no duplicate question IDs');

SELECT is(jsonb_array_length(public.get_cbt_question_package_summary('e1900000-0000-4000-8000-000000000009'))::TEXT,'2','package summary contains only referenced packages with questions');
SELECT is((
  SELECT item.value->>'totalQuestions'
  FROM jsonb_array_elements(public.get_cbt_question_package_summary('e1900000-0000-4000-8000-000000000009')) AS item(value)
  WHERE item.value->>'templateReferenceId' = 'e1900000-0000-4000-8000-00000000a003'
),'2109','package total counts the complete large bank');
SELECT is((
  SELECT item.value->>'activeQuestions'
  FROM jsonb_array_elements(public.get_cbt_question_package_summary('e1900000-0000-4000-8000-000000000009')) AS item(value)
  WHERE item.value->>'templateReferenceId' = 'e1900000-0000-4000-8000-00000000a003'
),'2108','package availability excludes archived questions');
SELECT is((
  SELECT item.value->>'subjects'
  FROM jsonb_array_elements(public.get_cbt_question_package_summary('e1900000-0000-4000-8000-000000000009')) AS item(value)
  WHERE item.value->>'templateReferenceId' = 'e1900000-0000-4000-8000-00000000a003'
),'["Matematika"]','package summary resolves tenant subject names');
SELECT is((
  SELECT item.value->>'gradeLevels'
  FROM jsonb_array_elements(public.get_cbt_question_package_summary('e1900000-0000-4000-8000-000000000009')) AS item(value)
  WHERE item.value->>'templateReferenceId' = 'e1900000-0000-4000-8000-00000000a003'
),'["VII"]','package summary resolves tenant grade names');
SELECT is((
  SELECT item.value->>'totalQuestions'
  FROM jsonb_array_elements(public.get_cbt_question_package_summary('e1900000-0000-4000-8000-000000000009')) AS item(value)
  WHERE item.value->>'templateReferenceId' = 'e1900000-0000-4000-8000-00000000a004'
),'1','package totals remain separated by reference ID');
SELECT is((
  SELECT item.value->>'totalQuestions'
  FROM jsonb_array_elements(public.get_cbt_question_package_summary('e1900000-0000-4000-8000-000000000019')) AS item(value)
  WHERE item.value->>'templateReferenceId' = 'e1900000-0000-4000-8000-00000000b003'
),'1','other tenant gets an independent package aggregate');

SELECT throws_ok($$SELECT * FROM public.list_cbt_admin_question_page('e1900000-0000-4000-8000-000000000099',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL)$$,'42501','Tenant CBT tidak tersedia','unknown tenant is rejected');
SELECT throws_ok($$SELECT * FROM public.list_cbt_admin_question_page('e1900000-0000-4000-8000-000000000009',1,NULL,NULL,NULL,NULL,NULL,NULL,NULL)$$,'22023','Parameter halaman soal CBT tidak valid','undersized page is rejected');
SELECT throws_ok($$SELECT * FROM public.list_cbt_admin_question_page('e1900000-0000-4000-8000-000000000009',2,'2027-01-10 10:00:00+00',NULL,NULL,NULL,NULL,NULL,NULL)$$,'22023','Parameter halaman soal CBT tidak valid','partial cursor is rejected');
SELECT throws_ok($$SELECT * FROM public.list_cbt_admin_question_page('e1900000-0000-4000-8000-000000000009',2,NULL,NULL,'ab',NULL,NULL,NULL,NULL)$$,'22023','Pencarian soal CBT tidak valid','short search is rejected');
SELECT throws_ok($$SELECT * FROM public.list_cbt_admin_question_page('e1900000-0000-4000-8000-000000000009',2,NULL,NULL,NULL,'draft',NULL,NULL,NULL)$$,'22023','Status soal CBT tidak valid','unsupported status is rejected');

SELECT ok(NOT has_function_privilege('anon','public.list_cbt_admin_question_page(uuid,integer,timestamp with time zone,uuid,text,text,uuid,uuid,uuid)','EXECUTE'),'anon cannot execute question page directly');
SELECT ok(NOT has_function_privilege('authenticated','public.list_cbt_admin_question_page(uuid,integer,timestamp with time zone,uuid,text,text,uuid,uuid,uuid)','EXECUTE'),'authenticated cannot execute question page directly');
SELECT ok(has_function_privilege('service_role','public.list_cbt_admin_question_page(uuid,integer,timestamp with time zone,uuid,text,text,uuid,uuid,uuid)','EXECUTE'),'backend can execute question page');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.list_cbt_admin_question_page(uuid,integer,timestamp with time zone,uuid,text,text,uuid,uuid,uuid)'::regprocedure),'question page uses invoker privileges');
SELECT ok(NOT has_function_privilege('anon','public.get_cbt_question_package_summary(uuid)','EXECUTE'),'anon cannot execute package summary directly');
SELECT ok(NOT has_function_privilege('authenticated','public.get_cbt_question_package_summary(uuid)','EXECUTE'),'authenticated cannot execute package summary directly');
SELECT ok(has_function_privilege('service_role','public.get_cbt_question_package_summary(uuid)','EXECUTE'),'backend can execute package summary');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.get_cbt_question_package_summary(uuid)'::regprocedure),'package summary uses invoker privileges');
SELECT ok(
  to_regclass('public.cbt_questions_tenant_created_page_idx') IS NOT NULL
  AND to_regclass('public.cbt_questions_tenant_subject_grade_active_page_idx') IS NOT NULL
  AND to_regclass('public.cbt_questions_tenant_template_created_page_idx') IS NOT NULL
  AND to_regclass('public.cbt_questions_search_trgm_idx') IS NOT NULL,
  'keyset and search indexes are present'
);

SELECT * FROM finish();
ROLLBACK;
