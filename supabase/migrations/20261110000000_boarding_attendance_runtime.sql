-- Tenant-scoped nightly attendance, auditable status changes, and explicit-date legacy import.
BEGIN;

CREATE TABLE public.boarding_attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  attendance_date DATE NOT NULL,
  session_type TEXT NOT NULL DEFAULT 'nightly_curfew' CHECK (session_type = 'nightly_curfew'),
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, attendance_date, session_type),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.boarding_attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL,
  student_id UUID NOT NULL,
  room_id TEXT,
  room_category TEXT NOT NULL DEFAULT 'Kamar' CHECK (room_category = 'Kamar'),
  room_name_snapshot TEXT CHECK (room_name_snapshot IS NULL OR length(room_name_snapshot) <= 180),
  status TEXT NOT NULL CHECK (status IN ('Hadir', 'Ghaib')),
  marked_by_user_id UUID,
  source_system TEXT NOT NULL DEFAULT 'manual' CHECK (source_system IN ('manual', 'legacy_import')),
  source_record_id TEXT,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, session_id, student_id),
  FOREIGN KEY (tenant_id, session_id)
    REFERENCES public.boarding_attendance_sessions (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, room_id, room_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, marked_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((source_system = 'manual' AND source_record_id IS NULL AND marked_by_user_id IS NOT NULL)
    OR (source_system = 'legacy_import' AND source_record_id IS NOT NULL
      AND length(btrim(source_record_id)) BETWEEN 1 AND 1500))
);

CREATE UNIQUE INDEX boarding_attendance_legacy_source_unique_idx
  ON public.boarding_attendance_records (tenant_id, source_record_id)
  WHERE source_system = 'legacy_import' AND source_record_id IS NOT NULL;
CREATE INDEX boarding_attendance_session_status_idx
  ON public.boarding_attendance_records (tenant_id, session_id, status, student_id);

CREATE TABLE public.boarding_attendance_events (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL,
  session_id UUID NOT NULL,
  student_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('marked', 'status_changed', 'legacy_imported')),
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('Hadir', 'Ghaib')),
  to_status TEXT NOT NULL CHECK (to_status IN ('Hadir', 'Ghaib')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, record_id)
    REFERENCES public.boarding_attendance_records (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, session_id)
    REFERENCES public.boarding_attendance_sessions (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.boarding_attendance_import_batches (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  source_fingerprint TEXT NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  attendance_date DATE NOT NULL,
  imported_by_user_id UUID NOT NULL,
  source_count INTEGER NOT NULL CHECK (source_count BETWEEN 0 AND 1000),
  imported_count INTEGER NOT NULL CHECK (imported_count BETWEEN 0 AND source_count),
  unchanged_count INTEGER NOT NULL CHECK (unchanged_count BETWEEN 0 AND source_count),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, source_fingerprint),
  FOREIGN KEY (tenant_id, imported_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

ALTER TABLE public.boarding_attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_attendance_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_attendance_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_attendance_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_attendance_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_attendance_import_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.boarding_attendance_sessions, public.boarding_attendance_records,
  public.boarding_attendance_events, public.boarding_attendance_import_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.boarding_attendance_sessions,
  public.boarding_attendance_records TO service_role;
GRANT SELECT, INSERT ON TABLE public.boarding_attendance_events,
  public.boarding_attendance_import_batches TO service_role;

CREATE OR REPLACE FUNCTION public.set_boarding_attendance_status(
  p_tenant_id UUID,
  p_student_id UUID,
  p_attendance_date DATE,
  p_status TEXT,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_student public.students%ROWTYPE;
  v_session_id UUID;
  v_record public.boarding_attendance_records%ROWTYPE;
  v_record_id UUID;
  v_event public.boarding_attendance_events%ROWTYPE;
  v_room_name TEXT;
  v_event_type TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_student_id IS NULL OR p_attendance_date IS NULL
    OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_status NOT IN ('Hadir', 'Ghaib')
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Status kehadiran tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL THEN RAISE EXCEPTION 'Status kehadiran wajib diisi' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role)) INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role <> lower(p_expected_role) OR v_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Role tidak dapat mengubah kehadiran pada tenant ini' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_student FROM public.students
  WHERE tenant_id = p_tenant_id AND id = p_student_id AND lower(COALESCE(status, '')) <> 'archived'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
  IF v_role = 'ustadz' AND NOT public.boarding_user_can_access_student(p_tenant_id, p_actor_user_id, p_student_id) THEN
    RAISE EXCEPTION 'Santri berada di luar penugasan petugas' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'boarding-attendance:' || p_tenant_id::text || ':' || p_attendance_date::text || ':nightly_curfew', 0
  ));
  SELECT * INTO v_event FROM public.boarding_attendance_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_event.student_id IS DISTINCT FROM p_student_id OR v_event.to_status IS DISTINCT FROM p_status
      OR v_event.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_event.event_type NOT IN ('marked', 'status_changed') THEN
      RAISE EXCEPTION 'Kunci permintaan kehadiran digunakan untuk tindakan berbeda' USING ERRCODE = '23505';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.boarding_attendance_sessions
      WHERE tenant_id = p_tenant_id AND id = v_event.session_id AND attendance_date = p_attendance_date) THEN
      RAISE EXCEPTION 'Kunci permintaan kehadiran digunakan pada tanggal berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'recordId', v_event.record_id, 'status', v_event.to_status);
  END IF;

  IF v_student.room_id IS NOT NULL THEN
    SELECT name INTO v_room_name FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND id = v_student.room_id AND category = 'Kamar';
  END IF;
  INSERT INTO public.boarding_attendance_sessions (tenant_id, attendance_date, session_type, created_by_user_id)
  VALUES (p_tenant_id, p_attendance_date, 'nightly_curfew', p_actor_user_id)
  ON CONFLICT (tenant_id, attendance_date, session_type) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_session_id;

  SELECT * INTO v_record FROM public.boarding_attendance_records
  WHERE tenant_id = p_tenant_id AND session_id = v_session_id AND student_id = p_student_id FOR UPDATE;
  IF FOUND THEN
    v_event_type := CASE WHEN v_record.status = p_status THEN 'marked' ELSE 'status_changed' END;
    UPDATE public.boarding_attendance_records SET status = p_status, room_id = v_student.room_id,
      room_name_snapshot = COALESCE(v_room_name, room_name_snapshot), marked_by_user_id = p_actor_user_id,
      marked_at = now(), updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = v_record.id RETURNING id INTO v_record_id;
  ELSE
    v_event_type := 'marked';
    INSERT INTO public.boarding_attendance_records (
      tenant_id, session_id, student_id, room_id, room_name_snapshot, status, marked_by_user_id
    ) VALUES (p_tenant_id, v_session_id, p_student_id, v_student.room_id, v_room_name, p_status, p_actor_user_id)
    RETURNING id INTO v_record_id;
  END IF;
  INSERT INTO public.boarding_attendance_events (
    tenant_id, record_id, session_id, student_id, client_request_id, actor_user_id, event_type, from_status, to_status
  ) VALUES (p_tenant_id, v_record_id, v_session_id, p_student_id, p_client_request_id, p_actor_user_id,
    v_event_type, CASE WHEN v_record.id IS NULL THEN NULL ELSE v_record.status END, p_status);
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'recordId', v_record_id, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_legacy_boarding_attendance(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_attendance_date DATE,
  p_source_fingerprint TEXT,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_item JSONB;
  v_source_id TEXT;
  v_student_id UUID;
  v_room_id TEXT;
  v_room_name TEXT;
  v_status TEXT;
  v_session_id UUID;
  v_existing public.boarding_attendance_records%ROWTYPE;
  v_previous public.boarding_attendance_import_batches%ROWTYPE;
  v_record_id UUID;
  v_event_id UUID;
  v_imported INTEGER := 0;
  v_unchanged INTEGER := 0;
  v_seen INTEGER := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_attendance_date IS NULL
    OR p_source_fingerprint IS NULL OR p_source_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'Snapshot impor kehadiran tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role)) INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Hanya Admin aktif tenant yang dapat mengimpor kehadiran lama' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'boarding-attendance:' || p_tenant_id::text || ':' || p_attendance_date::text || ':nightly_curfew', 0
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'boarding-attendance-import:' || p_tenant_id::text || ':' || p_source_fingerprint, 0
  ));
  SELECT * INTO v_previous FROM public.boarding_attendance_import_batches
  WHERE tenant_id = p_tenant_id AND source_fingerprint = p_source_fingerprint;
  IF FOUND THEN
    IF v_previous.attendance_date IS DISTINCT FROM p_attendance_date OR v_previous.source_count <> jsonb_array_length(p_rows) THEN
      RAISE EXCEPTION 'Fingerprint impor kehadiran dipakai untuk snapshot berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyImported', true,
      'imported', v_previous.imported_count, 'unchanged', v_previous.unchanged_count, 'sourceCount', v_previous.source_count);
  END IF;
  INSERT INTO public.boarding_attendance_sessions (tenant_id, attendance_date, session_type, created_by_user_id)
  VALUES (p_tenant_id, p_attendance_date, 'nightly_curfew', p_actor_user_id)
  ON CONFLICT (tenant_id, attendance_date, session_type) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_session_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_seen := v_seen + 1;
    v_source_id := NULLIF(btrim(COALESCE(v_item->>'sourceRecordId', '')), '');
    v_student_id := NULLIF(v_item->>'studentId', '')::UUID;
    v_room_id := NULLIF(btrim(COALESCE(v_item->>'roomId', '')), '');
    v_room_name := NULLIF(btrim(COALESCE(v_item->>'roomName', '')), '');
    v_status := NULLIF(btrim(COALESCE(v_item->>'status', '')), '');
    IF v_source_id IS NULL OR length(v_source_id) > 1500 OR v_student_id IS NULL
      OR v_status NOT IN ('Hadir', 'Ghaib') OR v_status IS NULL OR length(COALESCE(v_room_name, '')) > 180 THEN
      RAISE EXCEPTION 'Record kehadiran legacy tidak valid: %', COALESCE(v_source_id, '(tanpa id)') USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.students WHERE tenant_id = p_tenant_id AND id = v_student_id
      AND lower(COALESCE(status, '')) <> 'archived') THEN
      RAISE EXCEPTION 'Santri kehadiran lama tidak ditemukan pada tenant' USING ERRCODE = '23503';
    END IF;
    IF v_room_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.master_data_records
      WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_room_id) THEN
      RAISE EXCEPTION 'Kamar kehadiran lama tidak ditemukan pada tenant' USING ERRCODE = '23503';
    END IF;
    SELECT * INTO v_existing FROM public.boarding_attendance_records
    WHERE tenant_id = p_tenant_id AND source_system = 'legacy_import' AND source_record_id = v_source_id FOR UPDATE;
    IF FOUND THEN
      IF v_existing.session_id IS DISTINCT FROM v_session_id OR v_existing.student_id IS DISTINCT FROM v_student_id
        OR v_existing.room_id IS DISTINCT FROM v_room_id OR v_existing.room_name_snapshot IS DISTINCT FROM v_room_name
        OR v_existing.status IS DISTINCT FROM v_status THEN
        RAISE EXCEPTION 'Record kehadiran legacy % berbeda dari impor sebelumnya', v_source_id USING ERRCODE = '23505';
      END IF;
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.boarding_attendance_records (
      tenant_id, session_id, student_id, room_id, room_name_snapshot, status,
      marked_by_user_id, source_system, source_record_id
    ) VALUES (p_tenant_id, v_session_id, v_student_id, v_room_id, v_room_name, v_status,
      NULL, 'legacy_import', v_source_id) RETURNING id INTO v_record_id;
    v_event_id := gen_random_uuid();
    INSERT INTO public.boarding_attendance_events (
      tenant_id, record_id, session_id, student_id, client_request_id, actor_user_id, event_type, from_status, to_status
    ) VALUES (p_tenant_id, v_record_id, v_session_id, v_student_id, v_event_id, p_actor_user_id, 'legacy_imported', NULL, v_status);
    v_imported := v_imported + 1;
  END LOOP;
  INSERT INTO public.boarding_attendance_import_batches (
    tenant_id, source_fingerprint, attendance_date, imported_by_user_id, source_count, imported_count, unchanged_count
  ) VALUES (p_tenant_id, p_source_fingerprint, p_attendance_date, p_actor_user_id, v_seen, v_imported, v_unchanged);
  RETURN jsonb_build_object('success', true, 'alreadyImported', false,
    'imported', v_imported, 'unchanged', v_unchanged, 'sourceCount', v_seen);
END;
$$;

REVOKE ALL ON FUNCTION public.set_boarding_attendance_status(UUID, UUID, DATE, TEXT, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_legacy_boarding_attendance(UUID, UUID, DATE, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_boarding_attendance_status(UUID, UUID, DATE, TEXT, UUID, TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.import_legacy_boarding_attendance(UUID, UUID, DATE, TEXT, JSONB)
  TO service_role;

COMMENT ON TABLE public.boarding_attendance_records IS
  'Tenant-scoped nightly curfew attendance tied to a dated session and canonical student identity.';
COMMIT;
