-- Synthetic pgTAP coverage for immutable tenant-scoped room placement history.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(68);

INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('d4600000-0000-4000-8000-000000000001','room-history-a','Room History A','active'),
  ('d4600000-0000-4000-8000-000000000002','room-history-b','Room History B','active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('d4600000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','room-admin-a@test.invalid','',now(),
   '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('d4600000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','room-admin-b@test.invalid','',now(),
   '{"provider":"email","providers":["email"]}','{}',now(),now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES
  ('d4600000-0000-4000-8000-000000000011','d4600000-0000-4000-8000-000000000001',
   'room-admin-a@test.invalid','Admin Asrama A','admin','active','{"boarding":true,"master-data":true,"ppdb":true}'),
  ('d4600000-0000-4000-8000-000000000012','d4600000-0000-4000-8000-000000000002',
   'room-admin-b@test.invalid','Admin Asrama B','admin','active','{"boarding":true,"master-data":true,"ppdb":true}');

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES (
  'd4600000-0000-4000-8000-000000000101','d4600000-0000-4000-8000-000000000001',
  'RH-A-001','Santri Uji Riwayat',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex')
);

INSERT INTO public.master_data_records (tenant_id, category, id, name, gender_code)
VALUES ('d4600000-0000-4000-8000-000000000001','Gedung','RH-G1','Gedung Utara','L');
INSERT INTO public.master_data_records (tenant_id, category, id, name, parent_id, capacity, occupied, gender_code)
VALUES
  ('d4600000-0000-4000-8000-000000000001','Kamar','RH-R1','Kamar Utara','RH-G1',2,1,'L'),
  ('d4600000-0000-4000-8000-000000000001','Kamar','RH-R2','Kamar Selatan','RH-G1',2,0,'L');
INSERT INTO public.master_data_records (tenant_id, category, id, name)
VALUES ('d4600000-0000-4000-8000-000000000001','Kelas','RH-C1','Kelas Uji');
INSERT INTO public.candidates (
  id, tenant_id, registration_id, name, grade, gender, stage, nik_ciphertext, nik_fingerprint
) VALUES (
  'd4600000-0000-4000-8000-000000000102','d4600000-0000-4000-8000-000000000001',
  'RH-A-002','Santri PPDB Uji','SMP','L','Accepted',decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex')
);
INSERT INTO public.identity_claims (tenant_id, identity_type, fingerprint, entity_type, entity_id)
VALUES ('d4600000-0000-4000-8000-000000000001','nik',decode(repeat('56',32),'hex'),'candidate',
  'd4600000-0000-4000-8000-000000000102');

INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, class_id, room_id, building_id, status
) VALUES (
  'd4600000-0000-4000-8000-000000000201','d4600000-0000-4000-8000-000000000001',
  'd4600000-0000-4000-8000-000000000101','9460000001','Santri Uji Riwayat','L','VII',
  decode(repeat('ef',44),'hex'),decode(repeat('12',32),'hex'),'RH-C1','RH-R1','RH-G1','Active'
);

SELECT is((SELECT count(*)::INTEGER FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'),
  1,'initial room placement creates one history event');
SELECT is((SELECT event_type FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'),
  'initial_assignment','initial placement has an explicit event type');
SELECT is((SELECT room_name FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'),
  'Kamar Utara','history preserves the room name snapshot');

SELECT is(public.backfill_student_room_assignment_history_baseline(), 1,
  'baseline backfill captures an assigned student at cutover');
SELECT is((SELECT event_type FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'
    AND event_type='baseline_snapshot'),
  'baseline_snapshot','cutover state has a distinct baseline event type');
SELECT is((SELECT change_source FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'
    AND event_type='baseline_snapshot'),
  'migration_baseline','cutover state identifies the migration as its source');
SELECT is((SELECT room_name FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'
    AND event_type='baseline_snapshot'),
  'Kamar Utara','baseline preserves the room name at cutover');
SELECT is((SELECT building_name FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'
    AND event_type='baseline_snapshot'),
  'Gedung Utara','baseline preserves the building name at cutover');
SELECT ok((SELECT changed_by IS NULL AND changed_at IS NOT NULL FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'
    AND event_type='baseline_snapshot'),
  'baseline does not invent a historical actor and has a cutover timestamp');
SELECT is((SELECT count(*)::INTEGER FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
    AND student_id='d4600000-0000-4000-8000-000000000201' AND event_type='initial_assignment'),
  1,'baseline backfill preserves the existing initial assignment event');
SELECT is(public.backfill_student_room_assignment_history_baseline(), 0,
  'replaying the baseline backfill does not duplicate snapshots');
SELECT is((SELECT count(*)::INTEGER FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'),
  2,'baseline replay preserves the baseline and original event');
SELECT ok(NOT has_function_privilege('service_role','public.backfill_student_room_assignment_history_baseline()','EXECUTE'),
  'service role cannot invoke the one-time migration backfill');

SELECT ok((SELECT relrowsecurity FROM pg_class
  WHERE oid='public.student_room_assignment_history'::regclass),'history enables RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_class
  WHERE oid='public.student_room_assignment_history'::regclass),'history forces RLS');
SELECT ok(NOT has_table_privilege('anon','public.student_room_assignment_history','SELECT'),
  'anonymous users cannot read room history');
SELECT ok(NOT has_table_privilege('authenticated','public.student_room_assignment_history','SELECT'),
  'authenticated users cannot query room history directly');

SELECT ok(NOT has_table_privilege('service_role','public.student_room_assignment_history','UPDATE'),
  'service role cannot rewrite room history events');
SELECT ok(NOT has_table_privilege('service_role','public.student_room_assignment_history','DELETE'),
  'service role cannot delete room history events');
SELECT ok(NOT has_table_privilege('service_role','public.student_room_assignment_history','TRUNCATE'),
  'service role cannot truncate room history events');

SELECT ok(has_function_privilege('service_role','public.onboard_accepted_ppdb_candidate_with_room_history_actor(uuid,uuid,uuid,text,text,text,text,text,text,uuid)','EXECUTE'),
  'service role can call the audited PPDB onboarding wrapper');
SELECT ok(NOT has_function_privilege('anon','public.onboard_accepted_ppdb_candidate_with_room_history_actor(uuid,uuid,uuid,text,text,text,text,text,text,uuid)','EXECUTE'),
  'anonymous users cannot call the audited PPDB onboarding wrapper');
SELECT ok(NOT has_function_privilege('authenticated','public.onboard_accepted_ppdb_candidate_with_room_history_actor(uuid,uuid,uuid,text,text,text,text,text,text,uuid)','EXECUTE'),
  'authenticated users cannot call the audited PPDB onboarding wrapper');

SET LOCAL ROLE service_role;

SELECT is(public.assign_student_to_room_audited(
  'd4600000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000201',
  'RH-R2','RH-G1','d4600000-0000-4000-8000-000000000011'
)->>'success','true','Admin can move a student within their tenant');
SELECT is((SELECT count(*)::INTEGER FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'),
  3,'room move appends rather than replaces history');
SELECT is((SELECT event_type FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'
  ORDER BY id DESC LIMIT 1),'moved','room change is recorded as a move');
SELECT is((SELECT previous_room_name FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'
  ORDER BY id DESC LIMIT 1),'Kamar Utara','move preserves prior room name');
SELECT is((SELECT room_name FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'
  ORDER BY id DESC LIMIT 1),'Kamar Selatan','move preserves new room name');
SELECT is((SELECT changed_by::TEXT FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'
  ORDER BY id DESC LIMIT 1),'d4600000-0000-4000-8000-000000000011','history attributes the Admin actor');
SELECT is((SELECT change_source FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'
  ORDER BY id DESC LIMIT 1),'boarding_runtime','history records its source');
SELECT is((SELECT occupied::INTEGER FROM public.master_data_records
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND category='Kamar' AND id='RH-R1'),
  0,'move decrements the prior room occupancy');
SELECT is((SELECT occupied::INTEGER FROM public.master_data_records
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND category='Kamar' AND id='RH-R2'),
  1,'move increments the new room occupancy');

SELECT is(public.assign_student_to_room_audited(
  'd4600000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000201',
  'RH-R2','RH-G1','d4600000-0000-4000-8000-000000000011'
)->>'alreadyAssigned','true','identical placement replay is acknowledged');
SELECT is((SELECT count(*)::INTEGER FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'),
  3,'identical placement does not append a duplicate history event');

SELECT is(public.assign_student_to_room_audited(
  'd4600000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000201',
  NULL,NULL,'d4600000-0000-4000-8000-000000000011'
)->>'success','true','Admin can unassign a student');
SELECT is((SELECT count(*)::INTEGER FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'),
  4,'unassignment is appended to the audit history');
SELECT is((SELECT event_type FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'
  ORDER BY id DESC LIMIT 1),'unassigned','unassignment has an explicit event type');
SELECT is((SELECT occupied::INTEGER FROM public.master_data_records
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND category='Kamar' AND id='RH-R2'),
  0,'unassignment decrements room occupancy');
SELECT is((SELECT room_id FROM public.students
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND id='d4600000-0000-4000-8000-000000000201'),
  NULL::TEXT,'unassignment clears the current room');

SELECT is(public.assign_student_to_room_audited(
  'd4600000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000201',
  'RH-R2','RH-G1','d4600000-0000-4000-8000-000000000011'
)->>'success','true','Admin can assign the student again after unassignment');
SELECT is((SELECT count(*)::INTEGER FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'),
  5,'reassignment appends another history event');
SELECT is(public.archive_master_data_student_with_actor(
  'd4600000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000201',
  NULL,'d4600000-0000-4000-8000-000000000011'
)->>'success','true','Admin archive unassigns through the audited Master Data wrapper');
SELECT is((SELECT count(*)::INTEGER FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'),
  6,'archiving an assigned student appends an unassignment event');
SELECT is((SELECT event_type FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'
  ORDER BY id DESC LIMIT 1),'unassigned','archive history records the room removal');
SELECT is((SELECT changed_by::TEXT FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'
  ORDER BY id DESC LIMIT 1),'d4600000-0000-4000-8000-000000000011','archive history retains the Admin actor');
SELECT is((SELECT change_source FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND student_id='d4600000-0000-4000-8000-000000000201'
  ORDER BY id DESC LIMIT 1),'master_data','archive history identifies Master Data as its source');

SELECT is(public.onboard_accepted_ppdb_candidate_with_room_history_actor(
  'd4600000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000011',
  'd4600000-0000-4000-8000-000000000102','2026020001','RH-C1','RH-R1','RH-G1',
  'Wali Uji','0812345678','d4600000-0000-4000-8000-000000000099'
)->>'success','true','Admin can onboard an accepted PPDB candidate through the audited wrapper');
SELECT is((SELECT master_student_id FROM public.candidates
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND id='d4600000-0000-4000-8000-000000000102'),
  (SELECT id FROM public.students WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
    AND source_candidate_id='d4600000-0000-4000-8000-000000000102'),
  'PPDB candidate points to the canonical student created by onboarding');
SELECT is((SELECT source_candidate_id FROM public.students
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
    AND source_candidate_id='d4600000-0000-4000-8000-000000000102'),
  'd4600000-0000-4000-8000-000000000102'::UUID,
  'canonical student retains the source candidate relationship');
SELECT is((SELECT master_guardian_id FROM public.candidates
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND id='d4600000-0000-4000-8000-000000000102'),
  (SELECT id FROM public.guardians WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
    AND source_candidate_id='d4600000-0000-4000-8000-000000000102'),
  'PPDB candidate points to the canonical guardian created by onboarding');
SELECT is((SELECT source_candidate_id FROM public.guardians
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
    AND source_candidate_id='d4600000-0000-4000-8000-000000000102'),
  'd4600000-0000-4000-8000-000000000102'::UUID,
  'canonical guardian retains the source candidate relationship');
SELECT is((SELECT count(*)::INTEGER FROM public.guardian_students gs
  JOIN public.students s ON s.tenant_id=gs.tenant_id AND s.id=gs.student_id
  JOIN public.guardians g ON g.tenant_id=gs.tenant_id AND g.id=gs.guardian_id
  WHERE gs.tenant_id='d4600000-0000-4000-8000-000000000001'
    AND s.source_candidate_id='d4600000-0000-4000-8000-000000000102'
    AND g.source_candidate_id='d4600000-0000-4000-8000-000000000102'),
  1,'onboarding creates one tenant-consistent guardian-to-student relationship');
SELECT is((SELECT count(*)::INTEGER FROM public.nis_reservations n
  JOIN public.students s ON s.tenant_id=n.tenant_id AND s.id=n.student_id
  WHERE n.tenant_id='d4600000-0000-4000-8000-000000000001'
    AND n.nis='2026020001' AND n.candidate_id='d4600000-0000-4000-8000-000000000102'
    AND s.source_candidate_id=n.candidate_id AND n.source='ppdb_onboarding'),
  1,'NIS reservation, candidate and canonical student commit as one relation');
SELECT is((SELECT count(*)::INTEGER FROM public.identity_claims
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
    AND identity_type='nik' AND fingerprint=decode(repeat('56',32),'hex')
    AND entity_type='santri'
    AND entity_id=(SELECT id FROM public.students WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
      AND source_candidate_id='d4600000-0000-4000-8000-000000000102')),
  1,'NIK uniqueness claim moves atomically from candidate to canonical student');
SELECT is((SELECT onboarding_status FROM public.candidates
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND id='d4600000-0000-4000-8000-000000000102'),
  'Completed','candidate status is completed after onboarding');
SELECT ok((SELECT sync_to_master_data AND nis='2026020001' AND class_id='RH-C1'
    AND room_id='RH-R1' AND dormitory_id='RH-G1'
  FROM public.candidates WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
    AND id='d4600000-0000-4000-8000-000000000102'),
  'candidate compatibility fields match the canonical enrollment and placement');
SELECT is((SELECT occupied FROM public.master_data_records
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND category='Kamar' AND id='RH-R1'),
  1,'onboarding increments the selected empty room occupancy in the same transaction');
SELECT is(public.onboard_accepted_ppdb_candidate_with_room_history_actor(
  'd4600000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000011',
  'd4600000-0000-4000-8000-000000000102','2026020001','RH-C1','RH-R1','RH-G1',
  'Wali Uji','0812345678','d4600000-0000-4000-8000-000000000099'
)->>'alreadyOnboarded','true','retry with the same onboarding request returns the committed result');
SELECT is(public.onboard_accepted_ppdb_candidate_with_room_history_actor(
  'd4600000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000011',
  'd4600000-0000-4000-8000-000000000102','2026020001','RH-C1','RH-R1','RH-G1',
  'Wali Uji','0812345678','d4600000-0000-4000-8000-000000000099'
)->>'replayed','true','same request ID is recognized as an idempotent replay');
SELECT is((SELECT count(*)::INTEGER FROM public.students
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
    AND source_candidate_id='d4600000-0000-4000-8000-000000000102'),
  1,'onboarding retry does not create a duplicate student');
SELECT is((SELECT count(*)::INTEGER FROM public.guardians
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
    AND source_candidate_id='d4600000-0000-4000-8000-000000000102'),
  1,'onboarding retry does not create a duplicate guardian');
SELECT is((SELECT count(*)::INTEGER FROM public.nis_reservations
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
    AND nis='2026020001' AND candidate_id='d4600000-0000-4000-8000-000000000102'),
  1,'onboarding retry does not duplicate the NIS reservation');
SELECT is((SELECT occupied FROM public.master_data_records
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001' AND category='Kamar' AND id='RH-R1'),
  1,'onboarding retry does not increment room occupancy twice');
SELECT is((SELECT event_type FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
    AND student_id=(SELECT id FROM public.students WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
      AND source_candidate_id='d4600000-0000-4000-8000-000000000102')),
  'initial_assignment','PPDB onboarding records the initial room placement');
SELECT is((SELECT changed_by::TEXT FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
    AND student_id=(SELECT id FROM public.students WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
      AND source_candidate_id='d4600000-0000-4000-8000-000000000102')),
  'd4600000-0000-4000-8000-000000000011','PPDB room history attributes the Admin actor');
SELECT is((SELECT change_source FROM public.student_room_assignment_history
  WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
    AND student_id=(SELECT id FROM public.students WHERE tenant_id='d4600000-0000-4000-8000-000000000001'
      AND source_candidate_id='d4600000-0000-4000-8000-000000000102')),
  'ppdb_onboarding','PPDB room history records its source');
SELECT throws_ok(
  $q$SELECT public.assign_student_to_room_audited(
    'd4600000-0000-4000-8000-000000000002','d4600000-0000-4000-8000-000000000201',
    NULL,NULL,'d4600000-0000-4000-8000-000000000012'
  )$q$,'P0002','Santri tidak ditemukan pada tenant ini',
  'a tenant administrator cannot place a student owned by another tenant');
SELECT throws_ok(
  $q$SELECT public.assign_student_to_room_audited(
    'd4600000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000201',
    NULL,NULL,'d4600000-0000-4000-8000-000000000012'
  )$q$,'42501','Aktor Admin aktif tidak ditemukan pada tenant ini',
  'an Admin from another tenant cannot act on this tenant history');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
