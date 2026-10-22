BEGIN;

CREATE TABLE public.communication_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 12000),
  target_audience TEXT NOT NULL CHECK (
    target_audience IN (
      'Semua Wali Santri',
      'Guru & Musyrif',
      'Semua Santri',
      'Wali Santri Kelas VII - A'
    )
  ),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'scheduled', 'sent')),
  is_urgent BOOLEAN NOT NULL DEFAULT false,
  read_count INTEGER NOT NULL DEFAULT 0 CHECK (read_count >= 0),
  legacy_read_count INTEGER NOT NULL DEFAULT 0 CHECK (legacy_read_count >= 0),
  legacy_source_id TEXT CHECK (legacy_source_id IS NULL OR length(btrim(legacy_source_id)) BETWEEN 1 AND 1800),
  scheduled_at TIMESTAMPTZ,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, legacy_source_id),
  CHECK (status <> 'scheduled' OR scheduled_at IS NOT NULL),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX communication_announcements_tenant_created_idx
  ON public.communication_announcements (tenant_id, created_at DESC, id DESC);
CREATE INDEX communication_announcements_tenant_status_idx
  ON public.communication_announcements (tenant_id, status, created_at DESC);

CREATE TABLE public.communication_announcement_reads (
  tenant_id UUID NOT NULL,
  announcement_id UUID NOT NULL,
  user_id UUID NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, announcement_id, user_id),
  FOREIGN KEY (tenant_id, announcement_id)
    REFERENCES public.communication_announcements (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE CASCADE
);

CREATE INDEX communication_announcement_reads_tenant_user_idx
  ON public.communication_announcement_reads (tenant_id, user_id, read_at DESC);

CREATE TABLE public.communication_announcement_import_state (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT,
  imported_by_user_id UUID NOT NULL,
  source_fingerprint TEXT NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  rows_scanned INTEGER NOT NULL CHECK (rows_scanned >= 0),
  rows_imported INTEGER NOT NULL CHECK (rows_imported >= 0),
  rows_already_imported INTEGER NOT NULL CHECK (rows_already_imported >= 0),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, imported_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.increment_communication_announcement_read_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.communication_announcements
  SET read_count = read_count + 1, updated_at = now()
  WHERE tenant_id = NEW.tenant_id AND id = NEW.announcement_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER communication_announcement_read_count_after_insert
  AFTER INSERT ON public.communication_announcement_reads
  FOR EACH ROW EXECUTE FUNCTION public.increment_communication_announcement_read_count();

REVOKE ALL ON FUNCTION public.increment_communication_announcement_read_count() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.import_communication_announcements(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_rows JSONB,
  p_source_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row JSONB;
  v_source_id TEXT;
  v_title TEXT;
  v_body TEXT;
  v_target TEXT;
  v_status TEXT;
  v_is_urgent BOOLEAN;
  v_legacy_read_count INTEGER;
  v_announcement_id UUID;
  v_ack_user_id UUID;
  v_imported INTEGER := 0;
  v_already_imported INTEGER := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_rows IS NULL OR p_source_fingerprint IS NULL
    OR jsonb_typeof(p_rows) <> 'array'
    OR jsonb_array_length(p_rows) > 500
    OR p_source_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Snapshot impor pengumuman tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id
      AND status = 'active' AND role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Aktor impor bukan Admin tenant aktif' USING ERRCODE = '42501';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_source_id := btrim(COALESCE(v_row->>'legacy_source_id', ''));
    v_title := btrim(COALESCE(v_row->>'title', ''));
    v_body := btrim(COALESCE(v_row->>'body', ''));
    v_target := COALESCE(v_row->>'target_audience', '');
    v_status := COALESCE(v_row->>'status', '');
    v_is_urgent := COALESCE((v_row->>'is_urgent')::BOOLEAN, false);
    v_legacy_read_count := COALESCE((v_row->>'legacy_read_count')::INTEGER, 0);
    IF length(v_source_id) NOT BETWEEN 1 AND 1800
      OR length(v_title) NOT BETWEEN 1 AND 180
      OR length(v_body) NOT BETWEEN 1 AND 12000
      OR v_target NOT IN ('Semua Wali Santri', 'Guru & Musyrif', 'Semua Santri', 'Wali Santri Kelas VII - A')
      OR v_status NOT IN ('draft', 'scheduled', 'sent')
      OR v_legacy_read_count < 0
      OR v_row->'acknowledged_user_ids' IS NULL
      OR jsonb_typeof(v_row->'acknowledged_user_ids') <> 'array' THEN
      RAISE EXCEPTION 'Baris impor pengumuman tidak valid' USING ERRCODE = '22023';
    END IF;

    v_announcement_id := NULL;
    INSERT INTO public.communication_announcements (
      tenant_id, title, body, target_audience, status, is_urgent,
      legacy_read_count, legacy_source_id, scheduled_at, created_by_user_id, created_at
    ) VALUES (
      p_tenant_id, v_title, v_body, v_target, v_status, v_is_urgent,
      v_legacy_read_count, v_source_id,
      NULLIF(v_row->>'scheduled_at', '')::TIMESTAMPTZ,
      p_actor_user_id,
      COALESCE(NULLIF(v_row->>'created_at', '')::TIMESTAMPTZ, now())
    )
    ON CONFLICT (tenant_id, legacy_source_id) DO NOTHING
    RETURNING id INTO v_announcement_id;

    IF v_announcement_id IS NULL THEN
      v_already_imported := v_already_imported + 1;
      CONTINUE;
    END IF;
    v_imported := v_imported + 1;

    FOR v_ack_user_id IN
      SELECT value::UUID FROM jsonb_array_elements_text(v_row->'acknowledged_user_ids')
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles AS p
        WHERE p.tenant_id = p_tenant_id AND p.user_id = v_ack_user_id
          AND p.status = 'active' AND p.role = 'wali_santri'
          AND (
            v_target = 'Semua Wali Santri'
            OR (v_target = 'Wali Santri Kelas VII - A'
              AND lower(btrim(COALESCE(p.linked_santri_class, ''))) = 'vii - a')
          )
      ) THEN
        RAISE EXCEPTION 'Konfirmasi baca legacy tidak cocok dengan wali aktif pada audiens ini' USING ERRCODE = '23514';
      END IF;
      INSERT INTO public.communication_announcement_reads (tenant_id, announcement_id, user_id)
      VALUES (p_tenant_id, v_announcement_id, v_ack_user_id)
      ON CONFLICT (tenant_id, announcement_id, user_id) DO NOTHING;
    END LOOP;
  END LOOP;
  INSERT INTO public.communication_announcement_import_state (
    tenant_id, imported_by_user_id, source_fingerprint, rows_scanned,
    rows_imported, rows_already_imported, imported_at
  ) VALUES (
    p_tenant_id, p_actor_user_id, p_source_fingerprint, jsonb_array_length(p_rows),
    v_imported, v_already_imported, now()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    imported_by_user_id = EXCLUDED.imported_by_user_id,
    source_fingerprint = EXCLUDED.source_fingerprint,
    rows_scanned = EXCLUDED.rows_scanned,
    rows_imported = EXCLUDED.rows_imported,
    rows_already_imported = EXCLUDED.rows_already_imported,
    imported_at = EXCLUDED.imported_at;
  RETURN jsonb_build_object('imported', v_imported, 'alreadyImported', v_already_imported,
    'rowsScanned', jsonb_array_length(p_rows));
END;
$$;

REVOKE ALL ON FUNCTION public.import_communication_announcements(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_communication_announcements(UUID, UUID, JSONB, TEXT)
  TO service_role;

ALTER TABLE public.communication_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_announcements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.communication_announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_announcement_reads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.communication_announcement_import_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_announcement_import_state FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.communication_announcements,
  public.communication_announcement_reads,
  public.communication_announcement_import_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.communication_announcements,
  public.communication_announcement_reads,
  public.communication_announcement_import_state TO service_role;

COMMENT ON TABLE public.communication_announcements IS
  'Tenant-scoped announcements; all reads and writes go through the authenticated server API.';
COMMENT ON TABLE public.communication_announcement_reads IS
  'Idempotent per-user acknowledgement receipts for tenant announcements.';
COMMENT ON TABLE public.communication_announcement_import_state IS
  'Records the reviewed legacy announcement snapshot so runtime cutover fails closed until import is acknowledged.';
COMMENT ON FUNCTION public.import_communication_announcements(UUID, UUID, JSONB, TEXT) IS
  'Atomically imports a reviewed, server-fingerprinted legacy announcement snapshot, records import completion including an empty snapshot, and never overwrites previously imported rows.';

COMMIT;
