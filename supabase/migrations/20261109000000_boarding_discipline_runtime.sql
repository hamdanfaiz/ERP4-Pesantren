-- Tenant-scoped boarding discipline incidents, audited writes, and legacy import.
BEGIN;

CREATE TABLE public.boarding_discipline_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL,
  room_id TEXT,
  room_category TEXT NOT NULL DEFAULT 'Kamar' CHECK (room_category = 'Kamar'),
  room_name_snapshot TEXT CHECK (room_name_snapshot IS NULL OR length(room_name_snapshot) <= 180),
  offense TEXT NOT NULL CHECK (length(btrim(offense)) BETWEEN 1 AND 1000),
  category TEXT NOT NULL CHECK (category IN ('Ringan', 'Sedang', 'Berat')),
  points INTEGER NOT NULL CHECK (points BETWEEN 1 AND 1000),
  incident_date DATE NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  photo_url TEXT CHECK (photo_url IS NULL OR (photo_url ~ '^https://' AND length(photo_url) <= 2000)),
  resolution TEXT CHECK (resolution IS NULL OR length(resolution) <= 2000),
  created_by_user_id UUID,
  client_request_id UUID NOT NULL DEFAULT gen_random_uuid(),
  source_system TEXT NOT NULL DEFAULT 'manual' CHECK (source_system IN ('manual', 'legacy_import')),
  source_record_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, room_id, room_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((source_system = 'manual' AND source_record_id IS NULL AND created_by_user_id IS NOT NULL)
    OR (source_system = 'legacy_import' AND source_record_id IS NOT NULL
      AND length(btrim(source_record_id)) BETWEEN 1 AND 1500))
);

CREATE INDEX boarding_discipline_tenant_student_date_idx
  ON public.boarding_discipline_incidents (tenant_id, student_id, incident_date DESC, created_at DESC);
CREATE INDEX boarding_discipline_tenant_status_date_idx
  ON public.boarding_discipline_incidents (tenant_id, resolved, incident_date DESC);
CREATE UNIQUE INDEX boarding_discipline_legacy_source_unique_idx
  ON public.boarding_discipline_incidents (tenant_id, source_record_id)
  WHERE source_system = 'legacy_import' AND source_record_id IS NOT NULL;

CREATE TABLE public.boarding_discipline_events (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'resolved', 'legacy_imported')),
  from_resolved BOOLEAN,
  to_resolved BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, incident_id)
    REFERENCES public.boarding_discipline_incidents (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.boarding_discipline_import_batches (
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

ALTER TABLE public.boarding_discipline_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_discipline_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_discipline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_discipline_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_discipline_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_discipline_import_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.boarding_discipline_incidents, public.boarding_discipline_events,
  public.boarding_discipline_import_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.boarding_discipline_incidents TO service_role;
GRANT SELECT, INSERT ON TABLE public.boarding_discipline_events,
  public.boarding_discipline_import_batches TO service_role;

CREATE OR REPLACE FUNCTION public.create_boarding_discipline_incident(
  p_tenant_id UUID,
  p_student_id UUID,
  p_offense TEXT,
  p_category TEXT,
  p_points INTEGER,
  p_incident_date DATE,
  p_photo_url TEXT,
  p_resolution TEXT,
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
  v_room_name TEXT;
  v_existing public.boarding_discipline_incidents%ROWTYPE;
  v_incident_id UUID;
  v_offense TEXT;
  v_resolution TEXT;
  v_photo_url TEXT;
BEGIN
  v_offense := NULLIF(btrim(COALESCE(p_offense, '')), '');
  v_resolution := NULLIF(btrim(COALESCE(p_resolution, '')), '');
  v_photo_url := NULLIF(btrim(COALESCE(p_photo_url, '')), '');
  IF p_tenant_id IS NULL OR p_student_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR v_offense IS NULL OR length(v_offense) > 1000
    OR p_category NOT IN ('Ringan', 'Sedang', 'Berat')
    OR p_points IS NULL OR p_points NOT BETWEEN 1 AND 1000 OR p_incident_date IS NULL
    OR (v_photo_url IS NOT NULL AND (v_photo_url !~ '^https://' OR length(v_photo_url) > 2000))
    OR length(COALESCE(p_resolution, '')) > 2000
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Data kedisiplinan tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_category IS NULL THEN RAISE EXCEPTION 'Kategori tidak valid' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role)) INTO v_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role <> lower(p_expected_role) OR v_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Role tidak dapat mencatat kedisiplinan pada tenant ini' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_student FROM public.students
  WHERE tenant_id = p_tenant_id AND id = p_student_id AND lower(COALESCE(status, '')) <> 'archived'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
  IF v_role = 'ustadz' AND NOT public.boarding_user_can_access_student(p_tenant_id, p_actor_user_id, p_student_id) THEN
    RAISE EXCEPTION 'Santri berada di luar penugasan petugas' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'boarding-discipline-create:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_existing FROM public.boarding_discipline_incidents
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.created_by_user_id IS DISTINCT FROM p_actor_user_id
      OR v_existing.student_id IS DISTINCT FROM p_student_id
      OR v_existing.offense IS DISTINCT FROM v_offense
      OR v_existing.category IS DISTINCT FROM p_category
      OR v_existing.points IS DISTINCT FROM p_points
      OR v_existing.incident_date IS DISTINCT FROM p_incident_date
      OR v_existing.photo_url IS DISTINCT FROM v_photo_url
      OR v_existing.resolution IS DISTINCT FROM v_resolution THEN
      RAISE EXCEPTION 'Kunci permintaan kedisiplinan telah digunakan untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'incidentId', v_existing.id);
  END IF;

  IF v_student.room_id IS NOT NULL THEN
    SELECT name INTO v_room_name FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_student.room_id;
  END IF;
  INSERT INTO public.boarding_discipline_incidents (
    tenant_id, student_id, room_id, room_name_snapshot, offense, category, points,
    incident_date, resolved, photo_url, resolution, created_by_user_id, client_request_id
  ) VALUES (
    p_tenant_id, p_student_id, v_student.room_id, v_room_name, v_offense, p_category, p_points,
    p_incident_date, false, v_photo_url, v_resolution, p_actor_user_id, p_client_request_id
  ) RETURNING id INTO v_incident_id;
  INSERT INTO public.boarding_discipline_events (
    tenant_id, incident_id, client_request_id, actor_user_id, event_type, from_resolved, to_resolved
  ) VALUES (p_tenant_id, v_incident_id, p_client_request_id, p_actor_user_id, 'created', NULL, false);
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'incidentId', v_incident_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_boarding_discipline_incident(
  p_tenant_id UUID,
  p_incident_id UUID,
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
  v_incident public.boarding_discipline_incidents%ROWTYPE;
  v_event public.boarding_discipline_events%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_incident_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Perubahan status kedisiplinan tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role)) INTO v_role
  FROM public.profiles WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role <> lower(p_expected_role) OR v_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Role tidak dapat menutup catatan kedisiplinan' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_incident FROM public.boarding_discipline_incidents
  WHERE tenant_id = p_tenant_id AND id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan kedisiplinan tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF v_role = 'ustadz' AND NOT public.boarding_user_can_access_student(p_tenant_id, p_actor_user_id, v_incident.student_id) THEN
    RAISE EXCEPTION 'Catatan berada di luar penugasan petugas' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'boarding-discipline-resolve:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_event FROM public.boarding_discipline_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_event.incident_id IS DISTINCT FROM p_incident_id OR v_event.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_event.event_type <> 'resolved' OR v_event.to_resolved IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Kunci permintaan resolusi telah digunakan untuk tindakan berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'incidentId', p_incident_id, 'resolved', true);
  END IF;
  IF v_incident.resolved THEN
    RAISE EXCEPTION 'Catatan sudah diselesaikan oleh perubahan lain' USING ERRCODE = '23514';
  END IF;
  UPDATE public.boarding_discipline_incidents SET resolved = true, updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_incident_id;
  INSERT INTO public.boarding_discipline_events (
    tenant_id, incident_id, client_request_id, actor_user_id, event_type, from_resolved, to_resolved
  ) VALUES (p_tenant_id, p_incident_id, p_client_request_id, p_actor_user_id, 'resolved', false, true);
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'incidentId', p_incident_id, 'resolved', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_legacy_boarding_discipline(
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
  v_room_name TEXT;
  v_offense TEXT;
  v_category TEXT;
  v_points INTEGER;
  v_incident_date DATE;
  v_resolved BOOLEAN;
  v_photo_url TEXT;
  v_resolution TEXT;
  v_created_at TIMESTAMPTZ;
  v_existing public.boarding_discipline_incidents%ROWTYPE;
  v_previous public.boarding_discipline_import_batches%ROWTYPE;
  v_imported INTEGER := 0;
  v_unchanged INTEGER := 0;
  v_seen INTEGER := 0;
  v_incident_id UUID;
  v_event_request_id UUID;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR p_source_fingerprint IS NULL OR p_source_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'Snapshot impor kedisiplinan tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role)) INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Hanya Admin aktif tenant yang dapat mengimpor kedisiplinan lama' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'boarding-discipline-import:' || p_tenant_id::text || ':' || p_source_fingerprint, 0
  ));
  SELECT * INTO v_previous FROM public.boarding_discipline_import_batches
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
    v_offense := NULLIF(btrim(COALESCE(v_item->>'offense', '')), '');
    v_category := NULLIF(btrim(COALESCE(v_item->>'category', '')), '');
    v_points := NULLIF(v_item->>'points', '')::INTEGER;
    v_incident_date := NULLIF(v_item->>'incidentDate', '')::DATE;
    v_resolved := COALESCE(NULLIF(v_item->>'resolved', '')::BOOLEAN, false);
    v_photo_url := NULLIF(btrim(COALESCE(v_item->>'photoUrl', '')), '');
    v_resolution := NULLIF(btrim(COALESCE(v_item->>'resolution', '')), '');
    v_created_at := COALESCE(NULLIF(v_item->>'createdAt', '')::TIMESTAMPTZ, now());
    IF v_source_id IS NULL OR length(v_source_id) > 1500 OR v_student_id IS NULL
      OR v_offense IS NULL OR length(v_offense) > 1000
      OR v_category IS NULL OR v_category NOT IN ('Ringan', 'Sedang', 'Berat')
      OR v_points IS NULL OR v_points NOT BETWEEN 1 AND 1000 OR v_incident_date IS NULL
      OR (v_photo_url IS NOT NULL AND (v_photo_url !~ '^https://' OR length(v_photo_url) > 2000))
      OR length(COALESCE(v_resolution, '')) > 2000 THEN
      RAISE EXCEPTION 'Record kedisiplinan legacy tidak valid: %', COALESCE(v_source_id, '(tanpa id)') USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.students WHERE tenant_id = p_tenant_id AND id = v_student_id) THEN
      RAISE EXCEPTION 'Santri catatan lama tidak ditemukan pada tenant' USING ERRCODE = '23503';
    END IF;
    IF v_room_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.master_data_records
      WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_room_id) THEN
      RAISE EXCEPTION 'Kamar catatan lama tidak ditemukan pada tenant' USING ERRCODE = '23503';
    END IF;
    SELECT * INTO v_existing FROM public.boarding_discipline_incidents
    WHERE tenant_id = p_tenant_id AND source_system = 'legacy_import' AND source_record_id = v_source_id
    FOR UPDATE;
    IF FOUND THEN
      IF v_existing.student_id IS DISTINCT FROM v_student_id OR v_existing.room_id IS DISTINCT FROM v_room_id
        OR v_existing.room_name_snapshot IS DISTINCT FROM v_room_name OR v_existing.offense IS DISTINCT FROM v_offense
        OR v_existing.category IS DISTINCT FROM v_category OR v_existing.points IS DISTINCT FROM v_points
        OR v_existing.incident_date IS DISTINCT FROM v_incident_date OR v_existing.resolved IS DISTINCT FROM v_resolved
        OR v_existing.photo_url IS DISTINCT FROM v_photo_url OR v_existing.resolution IS DISTINCT FROM v_resolution THEN
        RAISE EXCEPTION 'Record kedisiplinan legacy % berbeda dari impor sebelumnya', v_source_id USING ERRCODE = '23505';
      END IF;
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.boarding_discipline_incidents (
      tenant_id, student_id, room_id, room_name_snapshot, offense, category, points, incident_date,
      resolved, photo_url, resolution, created_by_user_id, source_system, source_record_id, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_student_id, v_room_id, v_room_name, v_offense, v_category, v_points, v_incident_date,
      v_resolved, v_photo_url, v_resolution, NULL, 'legacy_import', v_source_id, v_created_at, now()
    ) RETURNING id INTO v_incident_id;
    v_event_request_id := gen_random_uuid();
    INSERT INTO public.boarding_discipline_events (
      tenant_id, incident_id, client_request_id, actor_user_id, event_type, from_resolved, to_resolved, created_at
    ) VALUES (p_tenant_id, v_incident_id, v_event_request_id, p_actor_user_id, 'legacy_imported', NULL, v_resolved, now());
    v_imported := v_imported + 1;
  END LOOP;

  INSERT INTO public.boarding_discipline_import_batches (
    tenant_id, source_fingerprint, imported_by_user_id, source_count, imported_count, unchanged_count
  ) VALUES (p_tenant_id, p_source_fingerprint, p_actor_user_id, v_seen, v_imported, v_unchanged);
  RETURN jsonb_build_object('success', true, 'alreadyImported', false,
    'imported', v_imported, 'unchanged', v_unchanged, 'sourceCount', v_seen);
END;
$$;

REVOKE ALL ON FUNCTION public.create_boarding_discipline_incident(UUID, UUID, TEXT, TEXT, INTEGER, DATE, TEXT, TEXT, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_boarding_discipline_incident(UUID, UUID, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_legacy_boarding_discipline(UUID, UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_boarding_discipline_incident(UUID, UUID, TEXT, TEXT, INTEGER, DATE, TEXT, TEXT, UUID, TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_boarding_discipline_incident(UUID, UUID, UUID, TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.import_legacy_boarding_discipline(UUID, UUID, TEXT, JSONB)
  TO service_role;

COMMENT ON TABLE public.boarding_discipline_incidents IS
  'Tenant-scoped, auditable boarding discipline incidents with an explicit resolution workflow.';
COMMIT;
