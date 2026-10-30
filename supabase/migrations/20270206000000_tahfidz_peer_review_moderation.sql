-- Tenant-scoped, text-only peer feedback for Tahfidz recitations.
-- Students may review records only inside their active halaqah. Assigned Ustadz
-- must moderate every review before it becomes visible to other students.
BEGIN;

CREATE TABLE public.tahfidz_peer_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  halaqah_id UUID NOT NULL,
  record_id UUID NOT NULL REFERENCES public.tahfidz_records(id) ON DELETE RESTRICT,
  reviewer_user_id UUID NOT NULL,
  reviewer_student_id UUID NOT NULL,
  review_text TEXT NOT NULL CHECK (length(btrim(review_text)) BETWEEN 10 AND 1200),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  client_request_id UUID NOT NULL,
  moderated_by_user_id UUID,
  moderated_at TIMESTAMPTZ,
  moderation_note TEXT CHECK (moderation_note IS NULL OR length(btrim(moderation_note)) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  UNIQUE (tenant_id, record_id, reviewer_student_id),
  FOREIGN KEY (tenant_id, halaqah_id)
    REFERENCES public.tahfidz_halaqahs (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, reviewer_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, reviewer_student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, moderated_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (
    (status = 'pending' AND moderated_by_user_id IS NULL AND moderated_at IS NULL AND moderation_note IS NULL)
    OR (status IN ('approved', 'rejected') AND moderated_by_user_id IS NOT NULL AND moderated_at IS NOT NULL)
  ),
  CHECK (status <> 'rejected' OR length(btrim(COALESCE(moderation_note, ''))) BETWEEN 5 AND 500)
);

CREATE INDEX tahfidz_peer_reviews_halaqah_status_created_idx
  ON public.tahfidz_peer_reviews (tenant_id, halaqah_id, status, created_at DESC, id DESC);
CREATE INDEX tahfidz_peer_reviews_reviewer_created_idx
  ON public.tahfidz_peer_reviews (tenant_id, reviewer_student_id, created_at DESC, id DESC);

ALTER TABLE public.tahfidz_peer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_peer_reviews FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tahfidz_peer_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tahfidz_peer_reviews TO service_role;

CREATE OR REPLACE FUNCTION public.get_tenant_tahfidz_peer_review_snapshot(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_role TEXT;
  v_student_id UUID;
  v_halaqah_ids UUID[] := ARRAY[]::UUID[];
  v_reviewable_records JSONB := '[]'::JSONB;
  v_reviews JSONB := '[]'::JSONB;
  v_student_count INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('santri', 'ustadz') THEN
    RAISE EXCEPTION 'Role atau konteks penilaian tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF NOT FOUND OR lower(v_profile.role) <> lower(p_expected_role) THEN
    RAISE EXCEPTION 'Akun tidak cocok dengan profil Tahfidz aktif pada tenant ini' USING ERRCODE = '42501';
  END IF;
  IF v_profile.module_permissions ? 'tahfidz' AND (
    jsonb_typeof(v_profile.module_permissions -> 'tahfidz') <> 'boolean'
    OR (v_profile.module_permissions ->> 'tahfidz')::BOOLEAN IS DISTINCT FROM TRUE
  ) THEN
    RAISE EXCEPTION 'Akses modul Tahfidz tidak diberikan kepada akun ini' USING ERRCODE = '42501';
  END IF;

  v_role := lower(v_profile.role);
  IF v_role = 'santri' THEN
    SELECT count(DISTINCT s.id), min(s.id::TEXT)::UUID
    INTO v_student_count, v_student_id
    FROM public.students s
    WHERE s.tenant_id = p_tenant_id
      AND lower(COALESCE(s.status, '')) NOT IN ('archived', 'arsip')
      AND (s.id::TEXT = v_profile.linked_santri_id OR s.source_record_id = v_profile.linked_santri_id);
    IF v_student_count <> 1 THEN
      RAISE EXCEPTION 'Profil santri belum tertaut ke satu data santri yang aktif' USING ERRCODE = '42501';
    END IF;
    SELECT COALESCE(array_agg(DISTINCT h.id ORDER BY h.id), ARRAY[]::UUID[])
    INTO v_halaqah_ids
    FROM public.tahfidz_memberships m
    JOIN public.tahfidz_halaqahs h ON h.tenant_id = m.tenant_id AND h.id = m.halaqah_id
    WHERE m.tenant_id = p_tenant_id AND m.student_id = v_student_id
      AND m.status = 'active' AND h.status = 'active';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'recordId', q.record_id, 'studentName', q.student_name,
      'halaqahName', q.halaqah_name, 'activityType', q.activity_type,
      'surahName', q.surah_name, 'ayahStart', q.ayah_start,
      'ayahEnd', q.ayah_end, 'performedAt', q.performed_at
    ) ORDER BY q.performed_at DESC, q.record_id DESC), '[]'::JSONB)
    INTO v_reviewable_records
    FROM (
      SELECT r.id AS record_id, s.name AS student_name, h.name AS halaqah_name,
        r.activity_type, r.surah_name, r.ayah_start, r.ayah_end, r.performed_at
      FROM public.tahfidz_records r
      JOIN public.students s ON s.tenant_id = r.tenant_id AND s.id = r.student_id
      JOIN public.tahfidz_halaqahs h ON h.tenant_id = r.tenant_id AND h.id = r.halaqah_id
      JOIN public.tahfidz_memberships target_membership
        ON target_membership.tenant_id = r.tenant_id AND target_membership.student_id = r.student_id
        AND target_membership.halaqah_id = r.halaqah_id AND target_membership.status = 'active'
      WHERE r.tenant_id = p_tenant_id AND r.halaqah_id = ANY(v_halaqah_ids)
        AND r.student_id <> v_student_id AND h.status = 'active'
        AND lower(COALESCE(s.status, '')) NOT IN ('archived', 'arsip')
        AND NOT EXISTS (
          SELECT 1 FROM public.tahfidz_peer_reviews existing
          WHERE existing.tenant_id = p_tenant_id AND existing.record_id = r.id
            AND existing.reviewer_student_id = v_student_id
        )
      ORDER BY r.performed_at DESC, r.id DESC
      LIMIT 100
    ) q;
  ELSE
    SELECT COALESCE(array_agg(h.id ORDER BY h.id), ARRAY[]::UUID[])
    INTO v_halaqah_ids
    FROM public.tahfidz_halaqahs h
    WHERE h.tenant_id = p_tenant_id AND h.ustadz_user_id = p_actor_user_id AND h.status = 'active';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', q.id, 'recordId', q.record_id, 'halaqahId', q.halaqah_id,
    'halaqahName', q.halaqah_name, 'studentName', q.student_name,
    'reviewerName', q.reviewer_name, 'reviewText', q.review_text,
    'status', q.status, 'createdAt', q.created_at,
    'moderationNote', q.moderation_note, 'surahName', q.surah_name,
    'ayahStart', q.ayah_start, 'ayahEnd', q.ayah_end,
    'activityType', q.activity_type
  ) ORDER BY q.created_at DESC, q.id DESC), '[]'::JSONB)
  INTO v_reviews
  FROM (
    SELECT review.id, review.record_id, review.halaqah_id, h.name AS halaqah_name,
      target.name AS student_name, reviewer.display_name AS reviewer_name,
      review.review_text, review.status, review.created_at,
      CASE WHEN v_role = 'santri' AND review.reviewer_student_id = v_student_id
        AND review.status = 'rejected' THEN review.moderation_note ELSE NULL END AS moderation_note,
      record.surah_name, record.ayah_start, record.ayah_end, record.activity_type
    FROM public.tahfidz_peer_reviews review
    JOIN public.tahfidz_records record
      ON record.tenant_id = review.tenant_id AND record.id = review.record_id
    JOIN public.tahfidz_halaqahs h
      ON h.tenant_id = review.tenant_id AND h.id = review.halaqah_id
    JOIN public.students target
      ON target.tenant_id = review.tenant_id AND target.id = record.student_id
    JOIN public.profiles reviewer
      ON reviewer.tenant_id = review.tenant_id AND reviewer.user_id = review.reviewer_user_id
    WHERE review.tenant_id = p_tenant_id AND review.halaqah_id = ANY(v_halaqah_ids)
      AND (
        (v_role = 'ustadz' AND h.ustadz_user_id = p_actor_user_id)
        OR (v_role = 'santri' AND (
          review.status = 'approved' OR review.reviewer_student_id = v_student_id
        ))
      )
    ORDER BY review.created_at DESC, review.id DESC
    LIMIT 100
  ) q;

  RETURN jsonb_build_object(
    'canSubmit', v_role = 'santri' AND cardinality(v_halaqah_ids) > 0,
    'canModerate', v_role = 'ustadz' AND cardinality(v_halaqah_ids) > 0,
    'reviewableRecords', v_reviewable_records,
    'reviews', v_reviews
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_tenant_tahfidz_peer_review(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_record_id UUID,
  p_review_text TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_student_id UUID;
  v_student_count INTEGER;
  v_target_student_id UUID;
  v_halaqah_id UUID;
  v_text TEXT;
  v_existing public.tahfidz_peer_reviews%ROWTYPE;
  v_review_id UUID;
BEGIN
  v_text := btrim(COALESCE(p_review_text, ''));
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_record_id IS NULL
    OR p_client_request_id IS NULL OR lower(COALESCE(p_expected_role, '')) <> 'santri'
    OR length(v_text) < 10 OR length(v_text) > 1200 THEN
    RAISE EXCEPTION 'Isi penilaian tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF NOT FOUND OR v_profile.role <> 'santri'
    OR (v_profile.module_permissions ? 'tahfidz' AND (
      jsonb_typeof(v_profile.module_permissions -> 'tahfidz') <> 'boolean'
      OR (v_profile.module_permissions ->> 'tahfidz')::BOOLEAN IS DISTINCT FROM TRUE
    )) THEN
    RAISE EXCEPTION 'Akun tidak memiliki akses santri Tahfidz pada tenant ini' USING ERRCODE = '42501';
  END IF;

  SELECT count(DISTINCT s.id), min(s.id::TEXT)::UUID
  INTO v_student_count, v_student_id
  FROM public.students s
  WHERE s.tenant_id = p_tenant_id
    AND lower(COALESCE(s.status, '')) NOT IN ('archived', 'arsip')
    AND (s.id::TEXT = v_profile.linked_santri_id OR s.source_record_id = v_profile.linked_santri_id);
  IF v_student_count <> 1 THEN
    RAISE EXCEPTION 'Profil santri belum tertaut ke satu data santri yang aktif' USING ERRCODE = '42501';
  END IF;

  SELECT record.student_id, record.halaqah_id
  INTO v_target_student_id, v_halaqah_id
  FROM public.tahfidz_records record
  JOIN public.tahfidz_halaqahs h
    ON h.tenant_id = record.tenant_id AND h.id = record.halaqah_id AND h.status = 'active'
  WHERE record.tenant_id = p_tenant_id AND record.id = p_record_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Setoran tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
  IF v_target_student_id = v_student_id THEN
    RAISE EXCEPTION 'Santri tidak dapat menilai setoran sendiri' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tahfidz_memberships m
    WHERE m.tenant_id = p_tenant_id AND m.halaqah_id = v_halaqah_id
      AND m.student_id = v_student_id AND m.status = 'active'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.tahfidz_memberships m
    WHERE m.tenant_id = p_tenant_id AND m.halaqah_id = v_halaqah_id
      AND m.student_id = v_target_student_id AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Penilaian hanya dapat dikirim dalam halaqah aktif yang sama' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tahfidz-peer-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0
  ));
  SELECT * INTO v_existing FROM public.tahfidz_peer_reviews
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.reviewer_user_id IS DISTINCT FROM p_actor_user_id
      OR v_existing.record_id IS DISTINCT FROM p_record_id
      OR v_existing.review_text IS DISTINCT FROM v_text THEN
      RAISE EXCEPTION 'Kunci permintaan penilaian telah dipakai untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'reviewId', v_existing.id);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tahfidz-peer-target:' || p_tenant_id::TEXT || ':' || p_record_id::TEXT || ':' || v_student_id::TEXT, 0
  ));
  SELECT * INTO v_existing FROM public.tahfidz_peer_reviews
  WHERE tenant_id = p_tenant_id AND record_id = p_record_id AND reviewer_student_id = v_student_id;
  IF FOUND THEN
    IF v_existing.reviewer_user_id = p_actor_user_id AND v_existing.review_text = v_text THEN
      RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'reviewId', v_existing.id);
    END IF;
    RAISE EXCEPTION 'Santri sudah mengirim penilaian untuk setoran ini' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.tahfidz_peer_reviews (
    tenant_id, halaqah_id, record_id, reviewer_user_id, reviewer_student_id,
    review_text, client_request_id
  ) VALUES (
    p_tenant_id, v_halaqah_id, p_record_id, p_actor_user_id, v_student_id,
    v_text, p_client_request_id
  ) RETURNING id INTO v_review_id;
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'reviewId', v_review_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.moderate_tenant_tahfidz_peer_review(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_review_id UUID,
  p_decision TEXT,
  p_moderation_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_review public.tahfidz_peer_reviews%ROWTYPE;
  v_note TEXT := NULLIF(btrim(COALESCE(p_moderation_note, '')), '');
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_review_id IS NULL
    OR lower(COALESCE(p_expected_role, '')) <> 'ustadz'
    OR lower(COALESCE(p_decision, '')) NOT IN ('approved', 'rejected')
    OR length(COALESCE(v_note, '')) > 500
    OR (lower(p_decision) = 'rejected' AND length(COALESCE(v_note, '')) < 5) THEN
    RAISE EXCEPTION 'Keputusan moderasi tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF NOT FOUND OR v_profile.role <> 'ustadz'
    OR (v_profile.module_permissions ? 'tahfidz' AND (
      jsonb_typeof(v_profile.module_permissions -> 'tahfidz') <> 'boolean'
      OR (v_profile.module_permissions ->> 'tahfidz')::BOOLEAN IS DISTINCT FROM TRUE
    )) THEN
    RAISE EXCEPTION 'Hanya Ustadz aktif dengan akses Tahfidz yang dapat memoderasi' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_review FROM public.tahfidz_peer_reviews
  WHERE tenant_id = p_tenant_id AND id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penilaian tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tahfidz_halaqahs h
    WHERE h.tenant_id = p_tenant_id AND h.id = v_review.halaqah_id
      AND h.ustadz_user_id = p_actor_user_id AND h.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Ustadz hanya dapat memoderasi halaqah tugasnya' USING ERRCODE = '42501';
  END IF;
  IF v_review.status <> 'pending' THEN
    IF v_review.status = lower(p_decision)
      AND v_review.moderated_by_user_id = p_actor_user_id
      AND v_review.moderation_note IS NOT DISTINCT FROM v_note THEN
      RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'reviewId', v_review.id, 'status', v_review.status);
    END IF;
    RAISE EXCEPTION 'Penilaian sudah dimoderasi dan tidak dapat diubah' USING ERRCODE = '23514';
  END IF;

  UPDATE public.tahfidz_peer_reviews
  SET status = lower(p_decision), moderated_by_user_id = p_actor_user_id,
      moderated_at = now(), moderation_note = v_note
  WHERE tenant_id = p_tenant_id AND id = p_review_id;
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'reviewId', p_review_id, 'status', lower(p_decision));
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_tahfidz_peer_review_snapshot(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_tenant_tahfidz_peer_review(UUID, UUID, TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderate_tenant_tahfidz_peer_review(UUID, UUID, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_tahfidz_peer_review_snapshot(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_tenant_tahfidz_peer_review(UUID, UUID, TEXT, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.moderate_tenant_tahfidz_peer_review(UUID, UUID, TEXT, UUID, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.tahfidz_peer_reviews IS
  'Text-only, tenant- and halaqah-scoped feedback on Tahfidz records; pending reviews are visible only to their reviewer and assigned Ustadz.';
COMMENT ON FUNCTION public.submit_tenant_tahfidz_peer_review(UUID, UUID, TEXT, UUID, TEXT, UUID) IS
  'Accepts one idempotent text review from an active Santri for a different active member’s record in the same tenant halaqah; Ustadz moderation is required before group visibility.';
COMMENT ON FUNCTION public.moderate_tenant_tahfidz_peer_review(UUID, UUID, TEXT, UUID, TEXT, TEXT) IS
  'Allows only the assigned active Ustadz to approve or reject one pending peer review; final decisions cannot be changed.';

COMMIT;
