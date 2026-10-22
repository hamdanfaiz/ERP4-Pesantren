-- Tenant-scoped Boarding permit workflow for the Supabase runtime.
-- Browser roles receive no direct table access; writes are performed by the trusted API.
BEGIN;

CREATE TABLE public.boarding_permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL,
  room_id TEXT,
  room_category TEXT NOT NULL DEFAULT 'Kamar' CHECK (room_category = 'Kamar'),
  room_name_snapshot TEXT CHECK (room_name_snapshot IS NULL OR length(room_name_snapshot) <= 180),
  permit_type TEXT NOT NULL CHECK (permit_type IN ('Pulang', 'Keluar Area', 'Kegiatan Eksternal', 'Izin Walisantri (Parental Leave)')),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending Musyrif'
    CHECK (status IN ('Pending Musyrif', 'Pending Keamanan', 'Approved', 'Rejected', 'Active', 'Returned')),
  requested_by_user_id UUID,
  client_request_id UUID NOT NULL DEFAULT gen_random_uuid(),
  source_system TEXT NOT NULL DEFAULT 'manual' CHECK (source_system IN ('manual', 'legacy_import')),
  source_record_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  CHECK (end_date >= start_date),
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, room_id, room_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, requested_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((source_system = 'manual' AND source_record_id IS NULL AND requested_by_user_id IS NOT NULL)
    OR (source_system = 'legacy_import' AND source_record_id IS NOT NULL
      AND length(btrim(source_record_id)) BETWEEN 1 AND 1500))
);

CREATE INDEX boarding_permits_tenant_status_date_idx
  ON public.boarding_permits (tenant_id, status, start_date DESC, created_at DESC);
CREATE INDEX boarding_permits_tenant_student_date_idx
  ON public.boarding_permits (tenant_id, student_id, created_at DESC);
CREATE UNIQUE INDEX boarding_permits_legacy_source_unique_idx
  ON public.boarding_permits (tenant_id, source_record_id)
  WHERE source_system = 'legacy_import' AND source_record_id IS NOT NULL;

CREATE TABLE public.boarding_permit_events (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  permit_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('requested', 'status_changed', 'legacy_imported')),
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('Pending Musyrif', 'Pending Keamanan', 'Approved', 'Rejected', 'Active', 'Returned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_status IS NULL OR from_status IN ('Pending Musyrif', 'Pending Keamanan', 'Approved', 'Rejected', 'Active', 'Returned')),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, permit_id)
    REFERENCES public.boarding_permits (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

ALTER TABLE public.boarding_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_permits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_permit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_permit_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.boarding_permits, public.boarding_permit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.boarding_permits TO service_role;
GRANT SELECT, INSERT ON TABLE public.boarding_permit_events TO service_role;

CREATE TABLE public.boarding_permit_import_batches (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  source_fingerprint TEXT NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  imported_by_user_id UUID NOT NULL,
  source_count INTEGER NOT NULL CHECK (source_count BETWEEN 0 AND 1000),
  imported_count INTEGER NOT NULL CHECK (imported_count BETWEEN 0 AND source_count),
  unchanged_count INTEGER NOT NULL CHECK (unchanged_count BETWEEN 0 AND source_count),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, source_fingerprint),
  FOREIGN KEY (tenant_id, imported_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);
ALTER TABLE public.boarding_permit_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_permit_import_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.boarding_permit_import_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.boarding_permit_import_batches TO service_role;

CREATE OR REPLACE FUNCTION public.request_boarding_permit(
  p_tenant_id UUID,
  p_student_id UUID,
  p_permit_type TEXT,
  p_reason TEXT,
  p_start_date DATE,
  p_end_date DATE,
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
  v_linked_student_id TEXT;
  v_student public.students%ROWTYPE;
  v_existing public.boarding_permits%ROWTYPE;
  v_permit_id UUID;
  v_room_name TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_student_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date
    OR p_permit_type IS NULL
    OR p_permit_type NOT IN ('Pulang', 'Keluar Area', 'Kegiatan Eksternal', 'Izin Walisantri (Parental Leave)')
    OR p_reason IS NULL OR NULLIF(btrim(p_reason), '') IS NULL OR length(p_reason) > 1000
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin', 'ustadz', 'santri', 'wali_santri') THEN
    RAISE EXCEPTION 'Data izin asrama tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(role)), linked_santri_id
  INTO v_role, v_linked_student_id
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role <> lower(p_expected_role) THEN
    RAISE EXCEPTION 'Profil akun asrama tidak aktif atau role tidak cocok' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('admin', 'super_admin', 'ustadz', 'santri', 'wali_santri') THEN
    RAISE EXCEPTION 'Role tidak dapat mengajukan izin asrama' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_student
  FROM public.students
  WHERE tenant_id = p_tenant_id AND id = p_student_id
    AND lower(COALESCE(status, '')) <> 'archived'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF v_role IN ('santri', 'wali_santri') AND (
    v_linked_student_id IS NULL
    OR (v_linked_student_id <> v_student.id::text
      AND v_linked_student_id IS DISTINCT FROM v_student.source_record_id)
  ) THEN
    RAISE EXCEPTION 'Profil belum tertaut ke santri yang dapat diajukan izinnya' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'ustadz' AND NOT public.boarding_user_can_access_student(p_tenant_id, p_actor_user_id, p_student_id) THEN
    RAISE EXCEPTION 'Santri berada di luar penugasan petugas' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'boarding-permit-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_existing
  FROM public.boarding_permits
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.requested_by_user_id IS DISTINCT FROM p_actor_user_id
      OR v_existing.student_id IS DISTINCT FROM p_student_id
      OR v_existing.permit_type IS DISTINCT FROM p_permit_type
      OR v_existing.reason IS DISTINCT FROM btrim(p_reason)
      OR v_existing.start_date IS DISTINCT FROM p_start_date
      OR v_existing.end_date IS DISTINCT FROM p_end_date THEN
      RAISE EXCEPTION 'Kunci permintaan izin sudah digunakan untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'permitId', v_existing.id);
  END IF;

  IF v_student.room_id IS NOT NULL THEN
    SELECT name INTO v_room_name
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_student.room_id;
  END IF;

  INSERT INTO public.boarding_permits (
    tenant_id, student_id, room_id, room_name_snapshot, permit_type, reason, start_date, end_date,
    status, requested_by_user_id, client_request_id
  ) VALUES (
    p_tenant_id, v_student.id, v_student.room_id, v_room_name, p_permit_type, btrim(p_reason), p_start_date, p_end_date,
    'Pending Musyrif', p_actor_user_id, p_client_request_id
  ) RETURNING id INTO v_permit_id;

  INSERT INTO public.boarding_permit_events (
    tenant_id, permit_id, client_request_id, actor_user_id, event_type, from_status, to_status
  ) VALUES (
    p_tenant_id, v_permit_id, p_client_request_id, p_actor_user_id, 'requested', NULL, 'Pending Musyrif'
  );
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'permitId', v_permit_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_boarding_permit(
  p_tenant_id UUID,
  p_permit_id UUID,
  p_to_status TEXT,
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
  v_permit public.boarding_permits%ROWTYPE;
  v_event public.boarding_permit_events%ROWTYPE;
  v_allowed BOOLEAN := false;
BEGIN
  IF p_tenant_id IS NULL OR p_permit_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_to_status IS NULL OR p_to_status NOT IN ('Pending Keamanan', 'Approved', 'Rejected', 'Active', 'Returned')
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Perubahan status izin tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role)) INTO v_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role <> lower(p_expected_role) OR v_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Role tidak dapat memproses izin asrama' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_permit
  FROM public.boarding_permits
  WHERE tenant_id = p_tenant_id AND id = p_permit_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Izin tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF v_role = 'ustadz' AND NOT public.boarding_user_can_access_student(p_tenant_id, p_actor_user_id, v_permit.student_id) THEN
    RAISE EXCEPTION 'Izin berada di luar penugasan petugas' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'boarding-permit-transition:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_event
  FROM public.boarding_permit_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_event.permit_id IS DISTINCT FROM p_permit_id
      OR v_event.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_event.to_status IS DISTINCT FROM p_to_status
      OR v_event.event_type <> 'status_changed' THEN
      RAISE EXCEPTION 'Kunci perubahan izin telah digunakan untuk tindakan berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'permitId', p_permit_id, 'status', v_event.to_status);
  END IF;

  v_allowed :=
    (v_permit.status = 'Pending Musyrif' AND p_to_status IN ('Pending Keamanan', 'Rejected') AND v_role IN ('admin', 'super_admin', 'ustadz'))
    OR (v_permit.status = 'Pending Keamanan' AND p_to_status IN ('Approved', 'Rejected') AND v_role IN ('admin', 'super_admin', 'ustadz'))
    OR (v_permit.status = 'Approved' AND p_to_status = 'Active' AND v_role IN ('admin', 'super_admin'))
    OR (v_permit.status = 'Active' AND p_to_status = 'Returned' AND v_role IN ('admin', 'super_admin'));
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Perubahan status izin tidak sesuai alur atau status sudah berubah' USING ERRCODE = '23514';
  END IF;

  UPDATE public.boarding_permits
  SET status = p_to_status, updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_permit_id;
  INSERT INTO public.boarding_permit_events (
    tenant_id, permit_id, client_request_id, actor_user_id, event_type, from_status, to_status
  ) VALUES (
    p_tenant_id, p_permit_id, p_client_request_id, p_actor_user_id, 'status_changed', v_permit.status, p_to_status
  );
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'permitId', p_permit_id, 'status', p_to_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_legacy_boarding_permits(
  p_tenant_id UUID,
  p_actor_user_id UUID,
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
  v_permit_type TEXT;
  v_reason TEXT;
  v_start DATE;
  v_end DATE;
  v_status TEXT;
  v_room_name TEXT;
  v_created_at TIMESTAMPTZ;
  v_existing public.boarding_permits%ROWTYPE;
  v_imported INTEGER := 0;
  v_unchanged INTEGER := 0;
  v_seen INTEGER := 0;
  v_previous public.boarding_permit_import_batches%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR p_source_fingerprint IS NULL OR p_source_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'Snapshot impor izin tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role)) INTO v_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Hanya Admin aktif tenant yang dapat mengimpor izin lama' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'boarding-permit-import:' || p_tenant_id::text || ':' || p_source_fingerprint, 0
  ));
  SELECT * INTO v_previous FROM public.boarding_permit_import_batches
  WHERE tenant_id = p_tenant_id AND source_fingerprint = p_source_fingerprint;
  IF FOUND THEN
    IF v_previous.source_count <> jsonb_array_length(p_rows) THEN
      RAISE EXCEPTION 'Fingerprint impor telah digunakan untuk snapshot berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyImported', true,
      'imported', v_previous.imported_count, 'unchanged', v_previous.unchanged_count,
      'sourceCount', v_previous.source_count);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_seen := v_seen + 1;
    v_source_id := NULLIF(btrim(COALESCE(v_item->>'sourceRecordId', '')), '');
    v_student_id := NULLIF(v_item->>'studentId', '')::UUID;
    v_room_id := NULLIF(btrim(COALESCE(v_item->>'roomId', '')), '');
    v_room_name := NULLIF(btrim(COALESCE(v_item->>'roomName', '')), '');
    v_permit_type := NULLIF(btrim(COALESCE(v_item->>'type', '')), '');
    v_reason := NULLIF(btrim(COALESCE(v_item->>'reason', '')), '');
    v_start := NULLIF(v_item->>'startDate', '')::DATE;
    v_end := NULLIF(v_item->>'endDate', '')::DATE;
    v_status := NULLIF(btrim(COALESCE(v_item->>'status', '')), '');
    v_created_at := COALESCE(NULLIF(v_item->>'createdAt', '')::TIMESTAMPTZ, now());
    IF v_source_id IS NULL OR length(v_source_id) > 1500 OR v_student_id IS NULL
      OR v_permit_type IS NULL
      OR v_permit_type NOT IN ('Pulang', 'Keluar Area', 'Kegiatan Eksternal', 'Izin Walisantri (Parental Leave)')
      OR v_reason IS NULL OR length(v_reason) > 1000 OR v_start IS NULL OR v_end IS NULL OR v_end < v_start
      OR v_status IS NULL OR v_status NOT IN ('Pending Musyrif', 'Pending Keamanan', 'Approved', 'Rejected', 'Active', 'Returned')
      OR (v_room_name IS NOT NULL AND length(v_room_name) > 180) THEN
      RAISE EXCEPTION 'Record izin legacy tidak valid: %', COALESCE(v_source_id, '(tanpa id)') USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.students WHERE tenant_id = p_tenant_id AND id = v_student_id) THEN
      RAISE EXCEPTION 'Santri izin legacy tidak ditemukan pada tenant' USING ERRCODE = '23503';
    END IF;
    IF v_room_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.master_data_records
      WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_room_id
    ) THEN
      RAISE EXCEPTION 'Kamar izin legacy tidak ditemukan pada tenant' USING ERRCODE = '23503';
    END IF;

    SELECT * INTO v_existing FROM public.boarding_permits
    WHERE tenant_id = p_tenant_id AND source_system = 'legacy_import' AND source_record_id = v_source_id
    FOR UPDATE;
    IF FOUND THEN
      IF v_existing.student_id IS DISTINCT FROM v_student_id
        OR v_existing.room_id IS DISTINCT FROM v_room_id
        OR v_existing.room_name_snapshot IS DISTINCT FROM v_room_name
        OR v_existing.permit_type IS DISTINCT FROM v_permit_type
        OR v_existing.reason IS DISTINCT FROM v_reason
        OR v_existing.start_date IS DISTINCT FROM v_start
        OR v_existing.end_date IS DISTINCT FROM v_end
        OR v_existing.status IS DISTINCT FROM v_status THEN
        RAISE EXCEPTION 'Record izin legacy % berbeda dari impor sebelumnya; rekonsiliasi diperlukan', v_source_id USING ERRCODE = '23505';
      END IF;
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.boarding_permits (
      tenant_id, student_id, room_id, room_name_snapshot, permit_type, reason,
      start_date, end_date, status, requested_by_user_id, source_system, source_record_id, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_student_id, v_room_id, v_room_name, v_permit_type, v_reason,
      v_start, v_end, v_status, NULL, 'legacy_import', v_source_id, v_created_at, now()
    ) RETURNING * INTO v_existing;
    INSERT INTO public.boarding_permit_events (
      tenant_id, permit_id, client_request_id, actor_user_id, event_type, from_status, to_status, created_at
    ) VALUES (
      p_tenant_id, v_existing.id, gen_random_uuid(), p_actor_user_id, 'legacy_imported', NULL, v_status, now()
    );
    v_imported := v_imported + 1;
  END LOOP;

  INSERT INTO public.boarding_permit_import_batches (
    tenant_id, source_fingerprint, imported_by_user_id, source_count, imported_count, unchanged_count
  ) VALUES (p_tenant_id, p_source_fingerprint, p_actor_user_id, v_seen, v_imported, v_unchanged);
  RETURN jsonb_build_object('success', true, 'alreadyImported', false,
    'imported', v_imported, 'unchanged', v_unchanged, 'sourceCount', v_seen);
END;
$$;

REVOKE ALL ON FUNCTION public.request_boarding_permit(UUID, UUID, TEXT, TEXT, DATE, DATE, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_boarding_permit(UUID, UUID, TEXT, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_legacy_boarding_permits(UUID, UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_boarding_permit(UUID, UUID, TEXT, TEXT, DATE, DATE, UUID, TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_boarding_permit(UUID, UUID, TEXT, UUID, TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.import_legacy_boarding_permits(UUID, UUID, TEXT, JSONB)
  TO service_role;

COMMENT ON TABLE public.boarding_permits IS
  'Tenant-scoped student leave requests with a transactional, auditable status workflow.';
COMMENT ON TABLE public.boarding_permit_events IS
  'Private idempotent audit ledger for boarding leave requests and status transitions.';

COMMIT;
