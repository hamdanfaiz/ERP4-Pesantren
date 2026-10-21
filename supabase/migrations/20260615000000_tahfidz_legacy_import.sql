-- Idempotent, tenant-scoped import of legacy Tahfidz halaqahs and current student assignments.
-- Source records come from the tenant's existing Firebase snapshot; this migration is not applied automatically.
BEGIN;

ALTER TABLE public.tahfidz_halaqahs
  ADD COLUMN source_system TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN source_record_id TEXT;
ALTER TABLE public.tahfidz_halaqahs
  ADD CONSTRAINT tahfidz_halaqahs_source_origin_check
  CHECK (
    (source_system = 'manual' AND source_record_id IS NULL)
    OR (source_system = 'legacy_import' AND source_record_id IS NOT NULL
      AND length(btrim(source_record_id)) BETWEEN 1 AND 1500)
  );
CREATE UNIQUE INDEX tahfidz_halaqahs_source_record_tenant_uq
  ON public.tahfidz_halaqahs (tenant_id, source_system, source_record_id)
  WHERE source_record_id IS NOT NULL;

ALTER TABLE public.tahfidz_memberships
  ADD COLUMN source_system TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN source_record_id TEXT;
ALTER TABLE public.tahfidz_memberships
  ADD CONSTRAINT tahfidz_memberships_source_origin_check
  CHECK (
    (source_system = 'manual' AND source_record_id IS NULL)
    OR (source_system = 'legacy_import' AND source_record_id IS NOT NULL
      AND length(btrim(source_record_id)) BETWEEN 1 AND 1500)
  );
CREATE UNIQUE INDEX tahfidz_memberships_source_record_tenant_uq
  ON public.tahfidz_memberships (tenant_id, source_system, source_record_id)
  WHERE source_record_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.import_legacy_tahfidz_configuration(
  p_tenant_id UUID,
  p_halaqahs JSONB,
  p_memberships JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_halaqah JSONB;
  v_membership JSONB;
  v_halaqah_map JSONB := '{}'::jsonb;
  v_source_id TEXT;
  v_name TEXT;
  v_ustadz_name TEXT;
  v_schedule TEXT;
  v_room TEXT;
  v_target NUMERIC(6,2);
  v_status TEXT;
  v_halaqah_id UUID;
  v_student_id UUID;
  v_halaqah_source_id TEXT;
  v_starts_on DATE;
  v_existing_halaqah public.tahfidz_halaqahs%ROWTYPE;
  v_existing_membership public.tahfidz_memberships%ROWTYPE;
  v_conflicting_membership public.tahfidz_memberships%ROWTYPE;
  v_halaqahs_written INTEGER := 0;
  v_halaqahs_unchanged INTEGER := 0;
  v_memberships_written INTEGER := 0;
  v_memberships_unchanged INTEGER := 0;
BEGIN
  IF p_tenant_id IS NULL
    OR jsonb_typeof(p_halaqahs) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_memberships) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_halaqahs) > 2000
    OR jsonb_array_length(p_memberships) > 10000 THEN
    RAISE EXCEPTION 'Snapshot Tahfidz tidak valid atau melebihi batas impor' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_halaqahs) AS item
    GROUP BY NULLIF(btrim(item->>'sourceRecordId'), '')
    HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_memberships) AS item
    GROUP BY NULLIF(btrim(item->>'sourceRecordId'), '')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'ID sumber duplikat dalam snapshot Tahfidz' USING ERRCODE = '23505';
  END IF;

  FOR v_halaqah IN SELECT value FROM jsonb_array_elements(p_halaqahs) LOOP
    v_source_id := NULLIF(btrim(v_halaqah->>'sourceRecordId'), '');
    v_name := NULLIF(btrim(v_halaqah->>'name'), '');
    v_ustadz_name := NULLIF(btrim(v_halaqah->>'ustadzName'), '');
    v_schedule := NULLIF(btrim(v_halaqah->>'scheduleText'), '');
    v_room := NULLIF(btrim(v_halaqah->>'roomText'), '');
    v_status := COALESCE(NULLIF(btrim(v_halaqah->>'status'), ''), 'active');
    IF v_source_id IS NULL OR length(v_source_id) > 1500
      OR v_name IS NULL OR length(v_name) > 120
      OR v_ustadz_name IS NULL OR length(v_ustadz_name) > 180
      OR length(COALESCE(v_schedule, '')) > 500
      OR length(COALESCE(v_room, '')) > 180
      OR v_status NOT IN ('active', 'inactive', 'archived')
      OR COALESCE(v_halaqah->>'dailyTargetPages', '') !~ '^[0-9]+([.][0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Data halaqah legacy tidak valid' USING ERRCODE = '22023';
    END IF;
    v_target := (v_halaqah->>'dailyTargetPages')::numeric;
    IF v_target < 0 OR v_target > 100 THEN
      RAISE EXCEPTION 'Target harian halaqah di luar batas' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'legacy-tahfidz-halaqah:' || p_tenant_id::text || ':' || v_source_id, 0
    ));
    SELECT * INTO v_existing_halaqah
    FROM public.tahfidz_halaqahs
    WHERE tenant_id = p_tenant_id
      AND source_system = 'legacy_import'
      AND source_record_id = v_source_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing_halaqah.name IS DISTINCT FROM v_name
        OR v_existing_halaqah.ustadz_name IS DISTINCT FROM v_ustadz_name
        OR v_existing_halaqah.schedule_text IS DISTINCT FROM v_schedule
        OR v_existing_halaqah.room_text IS DISTINCT FROM v_room
        OR v_existing_halaqah.daily_target_pages IS DISTINCT FROM v_target
        OR v_existing_halaqah.status IS DISTINCT FROM v_status THEN
        RAISE EXCEPTION 'Halaqah legacy berubah sejak impor; perlu rekonsiliasi manual' USING ERRCODE = '23505';
      END IF;
      v_halaqah_id := v_existing_halaqah.id;
      v_halaqahs_unchanged := v_halaqahs_unchanged + 1;
    ELSE
      IF v_status = 'active' AND EXISTS (
        SELECT 1 FROM public.tahfidz_halaqahs
        WHERE tenant_id = p_tenant_id AND status = 'active'
          AND lower(btrim(name)) = lower(v_name)
      ) THEN
        RAISE EXCEPTION 'Nama halaqah legacy bertabrakan dengan record yang sudah ada' USING ERRCODE = '23505';
      END IF;
      INSERT INTO public.tahfidz_halaqahs (
        tenant_id, name, ustadz_name, schedule_text, room_text, daily_target_pages,
        status, source_system, source_record_id
      ) VALUES (
        p_tenant_id, v_name, v_ustadz_name, v_schedule, v_room, v_target,
        v_status, 'legacy_import', v_source_id
      ) RETURNING id INTO v_halaqah_id;
      v_halaqahs_written := v_halaqahs_written + 1;
    END IF;
    v_halaqah_map := jsonb_set(v_halaqah_map, ARRAY[v_source_id], to_jsonb(v_halaqah_id::text), true);
  END LOOP;

  FOR v_membership IN SELECT value FROM jsonb_array_elements(p_memberships) LOOP
    v_source_id := NULLIF(btrim(v_membership->>'sourceRecordId'), '');
    v_halaqah_source_id := NULLIF(btrim(v_membership->>'halaqahSourceRecordId'), '');
    v_student_id := NULL;
    BEGIN
      v_student_id := (v_membership->>'studentId')::uuid;
      v_starts_on := (v_membership->>'startsOn')::date;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Relasi santri atau tanggal mulai halaqah tidak valid' USING ERRCODE = '22023';
    END;
    IF v_source_id IS NULL OR length(v_source_id) > 1500
      OR v_halaqah_source_id IS NULL OR v_student_id IS NULL OR v_starts_on IS NULL THEN
      RAISE EXCEPTION 'Relasi halaqah legacy tidak valid' USING ERRCODE = '22023';
    END IF;
    v_halaqah_id := NULLIF(v_halaqah_map->>v_halaqah_source_id, '')::uuid;
    IF v_halaqah_id IS NULL THEN
      SELECT id INTO v_halaqah_id
      FROM public.tahfidz_halaqahs
      WHERE tenant_id = p_tenant_id AND source_system = 'legacy_import'
        AND source_record_id = v_halaqah_source_id;
    END IF;
    IF v_halaqah_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.tahfidz_halaqahs
      WHERE tenant_id = p_tenant_id AND id = v_halaqah_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Halaqah aktif tujuan tidak ditemukan pada tenant' USING ERRCODE = '23503';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.students
      WHERE tenant_id = p_tenant_id AND id = v_student_id AND lower(status) <> 'archived'
    ) THEN
      RAISE EXCEPTION 'Santri tujuan tidak ditemukan atau telah diarsipkan pada tenant' USING ERRCODE = '23503';
    END IF;

    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'legacy-tahfidz-membership:' || p_tenant_id::text || ':' || v_source_id, 0
    ));
    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'legacy-tahfidz-student-membership:' || p_tenant_id::text || ':' || v_student_id::text, 0
    ));
    SELECT * INTO v_existing_membership
    FROM public.tahfidz_memberships
    WHERE tenant_id = p_tenant_id AND source_system = 'legacy_import'
      AND source_record_id = v_source_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing_membership.student_id IS DISTINCT FROM v_student_id
        OR v_existing_membership.halaqah_id IS DISTINCT FROM v_halaqah_id
        OR v_existing_membership.starts_on IS DISTINCT FROM v_starts_on
        OR v_existing_membership.ends_on IS NOT NULL
        OR v_existing_membership.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Keanggotaan legacy berubah sejak impor; perlu rekonsiliasi manual' USING ERRCODE = '23505';
      END IF;
      v_memberships_unchanged := v_memberships_unchanged + 1;
    ELSE
      SELECT * INTO v_conflicting_membership
      FROM public.tahfidz_memberships
      WHERE tenant_id = p_tenant_id AND student_id = v_student_id AND status = 'active'
      FOR UPDATE;
      IF FOUND THEN
        RAISE EXCEPTION 'Santri sudah memiliki keanggotaan aktif; perlu rekonsiliasi manual' USING ERRCODE = '23505';
      END IF;
      INSERT INTO public.tahfidz_memberships (
        tenant_id, halaqah_id, student_id, starts_on, status, source_system, source_record_id
      ) VALUES (
        p_tenant_id, v_halaqah_id, v_student_id, v_starts_on, 'active', 'legacy_import', v_source_id
      );
      v_memberships_written := v_memberships_written + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'halaqahsImported', v_halaqahs_written,
    'halaqahsUnchanged', v_halaqahs_unchanged,
    'membershipsImported', v_memberships_written,
    'membershipsUnchanged', v_memberships_unchanged
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_legacy_tahfidz_configuration(UUID, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_tahfidz_configuration(UUID, JSONB, JSONB)
  TO service_role;

COMMENT ON FUNCTION public.import_legacy_tahfidz_configuration(UUID, JSONB, JSONB) IS
  'Atomically and idempotently imports a tenant-scoped Firebase Tahfidz snapshot. It preserves source IDs and refuses conflicting edits or active memberships.';

COMMIT;
