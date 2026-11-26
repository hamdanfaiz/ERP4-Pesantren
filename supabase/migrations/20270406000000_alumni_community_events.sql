-- Persist Alumni community events per tenant and expose writes only through
-- actor-validated service-role procedures.
BEGIN;

CREATE TABLE public.alumni_community_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  event_type TEXT NOT NULL CHECK (event_type IN ('reunion','webinar','religious','community','career','other')),
  starts_at TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL CHECK (length(btrim(location)) BETWEEN 1 AND 180),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed')),
  client_request_id UUID NOT NULL,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_request_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX alumni_community_events_tenant_schedule_idx
  ON public.alumni_community_events (tenant_id, starts_at, id);

ALTER TABLE public.alumni_community_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alumni_community_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.alumni_community_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.alumni_community_events TO service_role;

CREATE OR REPLACE FUNCTION public.create_alumni_community_event(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_title TEXT,
  p_event_type TEXT,
  p_starts_at TIMESTAMPTZ,
  p_location TEXT,
  p_description TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_existing public.alumni_community_events%ROWTYPE;
  v_event_id UUID;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin','super_admin')
    OR length(btrim(COALESCE(p_title,''))) NOT BETWEEN 1 AND 180
    OR p_event_type IS NULL OR p_event_type NOT IN ('reunion','webinar','religious','community','career','other')
    OR p_starts_at IS NULL
    OR length(btrim(COALESCE(p_location,''))) NOT BETWEEN 1 AND 180
    OR length(COALESCE(p_description,'')) > 2000 THEN
    RAISE EXCEPTION 'Data kegiatan komunitas tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role::text)) INTO v_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('admin','super_admin') OR v_role <> p_expected_role THEN
    RAISE EXCEPTION 'Hanya Admin aktif pada tenant yang dapat mengelola kegiatan Alumni' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'alumni-event:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_existing
  FROM public.alumni_community_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.created_by_user_id IS DISTINCT FROM p_actor_user_id
      OR v_existing.title IS DISTINCT FROM btrim(p_title)
      OR v_existing.event_type IS DISTINCT FROM p_event_type
      OR v_existing.starts_at IS DISTINCT FROM p_starts_at
      OR v_existing.location IS DISTINCT FROM btrim(p_location)
      OR v_existing.description IS DISTINCT FROM btrim(COALESCE(p_description,'')) THEN
      RAISE EXCEPTION 'Kunci permintaan kegiatan telah digunakan untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'eventId', v_existing.id);
  END IF;

  INSERT INTO public.alumni_community_events (
    tenant_id, title, event_type, starts_at, location, description,
    client_request_id, created_by_user_id
  ) VALUES (
    p_tenant_id, btrim(p_title), p_event_type, p_starts_at, btrim(p_location),
    btrim(COALESCE(p_description,'')), p_client_request_id, p_actor_user_id
  ) RETURNING id INTO v_event_id;
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'eventId', v_event_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_alumni_community_event_status(
  p_tenant_id UUID,
  p_event_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_event public.alumni_community_events%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_event_id IS NULL OR p_actor_user_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin','super_admin')
    OR p_status IS NULL OR p_status NOT IN ('cancelled','completed') THEN
    RAISE EXCEPTION 'Status kegiatan tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role::text)) INTO v_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('admin','super_admin') OR v_role <> p_expected_role THEN
    RAISE EXCEPTION 'Hanya Admin aktif pada tenant yang dapat mengelola kegiatan Alumni' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_event
  FROM public.alumni_community_events
  WHERE tenant_id = p_tenant_id AND id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kegiatan tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF p_status = 'completed' AND v_event.starts_at > now() THEN
    RAISE EXCEPTION 'Kegiatan yang belum dimulai belum dapat ditandai selesai' USING ERRCODE = '23514';
  END IF;
  IF v_event.status = p_status THEN
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'eventId', v_event.id, 'status', v_event.status);
  END IF;
  IF v_event.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Status kegiatan yang sudah ditutup tidak dapat diubah' USING ERRCODE = '23514';
  END IF;
  UPDATE public.alumni_community_events
  SET status = p_status, updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_event_id;
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'eventId', p_event_id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.create_alumni_community_event(UUID, UUID, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_alumni_community_event_status(UUID, UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_alumni_community_event(UUID, UUID, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_alumni_community_event_status(UUID, UUID, UUID, TEXT, TEXT)
  TO service_role;

COMMENT ON TABLE public.alumni_community_events IS
  'Tenant-scoped Alumni community events. All writes pass through actor-validated, idempotent procedures.';
COMMENT ON FUNCTION public.create_alumni_community_event(UUID, UUID, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) IS
  'Creates one tenant Alumni event and safely replays identical client retries.';
COMMENT ON FUNCTION public.set_alumni_community_event_status(UUID, UUID, UUID, TEXT, TEXT) IS
  'Atomically cancels or completes an open Alumni community event in the actor tenant.';

COMMIT;
