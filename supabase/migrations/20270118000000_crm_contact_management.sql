-- Tenant CRM contacts and immutable interaction history.
-- Campaign delivery is intentionally not modeled as an operational send path
-- until a consent-aware email/WhatsApp provider is configured.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('parent', 'prospect', 'alumni', 'donor', 'partner')),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160 AND name !~ '[[:cntrl:]]'),
  organization_name TEXT CHECK (organization_name IS NULL OR (length(btrim(organization_name)) <= 200 AND organization_name !~ '[[:cntrl:]]')),
  email TEXT CHECK (email IS NULL OR (length(btrim(email)) <= 254 AND email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  phone TEXT CHECK (phone IS NULL OR (length(btrim(phone)) BETWEEN 5 AND 32 AND phone !~ '[[:cntrl:]]')),
  lifecycle_stage TEXT NOT NULL DEFAULT 'lead' CHECK (lifecycle_stage IN ('lead', 'qualified', 'engaged', 'active', 'lost')),
  marketing_consent TEXT NOT NULL DEFAULT 'unknown' CHECK (marketing_consent IN ('unknown', 'granted', 'revoked')),
  consent_source TEXT CHECK (consent_source IS NULL OR (length(btrim(consent_source)) BETWEEN 1 AND 120 AND consent_source !~ '[[:cntrl:]]')),
  consent_recorded_at TIMESTAMPTZ,
  created_by_user_id UUID NOT NULL,
  updated_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (
    (marketing_consent = 'unknown' AND consent_recorded_at IS NULL)
    OR (marketing_consent IN ('granted', 'revoked') AND consent_recorded_at IS NOT NULL)
  )
);

CREATE INDEX crm_contacts_tenant_page_idx
  ON public.crm_contacts (tenant_id, created_at DESC, id DESC);
CREATE INDEX crm_contacts_tenant_stage_page_idx
  ON public.crm_contacts (tenant_id, lifecycle_stage, created_at DESC, id DESC);
CREATE INDEX crm_contacts_tenant_type_page_idx
  ON public.crm_contacts (tenant_id, contact_type, created_at DESC, id DESC);
DO $migration$
DECLARE
  v_extension_schema name;
BEGIN
  SELECT namespace.nspname INTO v_extension_schema
  FROM pg_extension AS extension
  JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pg_trgm';
  IF v_extension_schema IS NULL THEN RAISE EXCEPTION 'pg_trgm extension is required for CRM search indexes'; END IF;
  EXECUTE format('CREATE INDEX crm_contacts_name_trgm_idx ON public.crm_contacts USING gin (lower(name) %I.gin_trgm_ops)', v_extension_schema);
  EXECUTE format('CREATE INDEX crm_contacts_email_trgm_idx ON public.crm_contacts USING gin (lower(email) %I.gin_trgm_ops) WHERE email IS NOT NULL', v_extension_schema);
  EXECUTE format('CREATE INDEX crm_contacts_org_trgm_idx ON public.crm_contacts USING gin (lower(organization_name) %I.gin_trgm_ops) WHERE organization_name IS NOT NULL', v_extension_schema);
END;
$migration$;
CREATE TRIGGER crm_contacts_set_updated_at
  BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.crm_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  contact_id UUID NOT NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('call', 'email', 'meeting', 'message', 'note')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  subject TEXT NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 200 AND subject !~ '[[:cntrl:]]'),
  summary TEXT CHECK (summary IS NULL OR (length(summary) <= 2000 AND summary !~ '[[:cntrl:]]')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, contact_id)
    REFERENCES public.crm_contacts (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX crm_interactions_tenant_contact_page_idx
  ON public.crm_interactions (tenant_id, contact_id, occurred_at DESC, id DESC);

CREATE TABLE public.crm_contact_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  contact_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'consent_changed', 'interaction_logged')),
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  interaction_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, contact_id)
    REFERENCES public.crm_contacts (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, interaction_id)
    REFERENCES public.crm_interactions (tenant_id, id) ON DELETE RESTRICT,
  CHECK (
    (event_type = 'interaction_logged' AND interaction_id IS NOT NULL)
    OR (event_type <> 'interaction_logged' AND interaction_id IS NULL)
  )
);
CREATE INDEX crm_contact_audit_tenant_contact_idx
  ON public.crm_contact_audit_events (tenant_id, contact_id, created_at DESC, id DESC);

CREATE TABLE public.crm_mutation_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('contact_create', 'contact_update', 'interaction_create')),
  payload_sha256 BYTEA NOT NULL CHECK (octet_length(payload_sha256) = 32),
  resource_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.reject_crm_immutable_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Riwayat CRM bersifat append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER crm_interactions_immutable
  BEFORE UPDATE OR DELETE ON public.crm_interactions
  FOR EACH ROW EXECUTE FUNCTION public.reject_crm_immutable_mutation();
CREATE TRIGGER crm_contact_audit_immutable
  BEFORE UPDATE OR DELETE ON public.crm_contact_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_crm_immutable_mutation();
CREATE TRIGGER crm_mutation_requests_immutable
  BEFORE UPDATE OR DELETE ON public.crm_mutation_requests
  FOR EACH ROW EXECUTE FUNCTION public.reject_crm_immutable_mutation();

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.crm_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_interactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contact_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contact_audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.crm_mutation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_mutation_requests FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.crm_contacts, public.crm_interactions,
  public.crm_contact_audit_events, public.crm_mutation_requests
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.crm_contacts TO service_role;
GRANT SELECT, INSERT ON TABLE public.crm_interactions TO service_role;
GRANT SELECT, INSERT ON TABLE public.crm_contact_audit_events TO service_role;
GRANT SELECT, INSERT ON TABLE public.crm_mutation_requests TO service_role;

CREATE OR REPLACE FUNCTION public.assert_tenant_crm_actor(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_expected_role TEXT := CASE
    WHEN regexp_replace(lower(btrim(COALESCE(p_expected_role,''))), '[^a-z]', '', 'g') = 'superadmin' THEN 'superadmin'
    WHEN regexp_replace(lower(btrim(COALESCE(p_expected_role,''))), '[^a-z]', '', 'g') = 'admin' THEN 'admin'
    ELSE NULL
  END;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR v_expected_role IS NULL THEN
    RAISE EXCEPTION 'Aktor CRM tidak valid' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant CRM tidak aktif' USING ERRCODE = '42501'; END IF;
  SELECT lower(btrim(profile.role)) INTO v_role
  FROM public.profiles AS profile
  WHERE profile.tenant_id = p_tenant_id AND profile.user_id = p_actor_user_id
    AND profile.status = 'active'
    AND regexp_replace(lower(btrim(profile.role)), '[^a-z]', '', 'g') = v_expected_role
    AND (
      regexp_replace(lower(btrim(profile.role)), '[^a-z]', '', 'g') = 'superadmin'
      OR CASE
        WHEN profile.module_permissions ? 'crm' THEN
          jsonb_typeof(profile.module_permissions -> 'crm') = 'boolean'
          AND profile.module_permissions ->> 'crm' = 'true'
        ELSE lower(btrim(profile.role)) = 'admin'
      END
    )
  FOR SHARE;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Akses aktif Admin ke CRM diperlukan' USING ERRCODE = '42501'; END IF;
  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_tenant_crm_contact(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_contact_id UUID,
  p_action TEXT,
  p_item JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_existing public.crm_mutation_requests%ROWTYPE;
  v_operation TEXT;
  v_hash BYTEA;
  v_type TEXT := lower(btrim(COALESCE(p_item ->> 'contactType', '')));
  v_name TEXT := btrim(COALESCE(p_item ->> 'name', ''));
  v_org TEXT := NULLIF(btrim(COALESCE(p_item ->> 'organizationName', '')), '');
  v_email TEXT := NULLIF(lower(btrim(COALESCE(p_item ->> 'email', ''))), '');
  v_phone TEXT := NULLIF(btrim(COALESCE(p_item ->> 'phone', '')), '');
  v_stage TEXT := lower(btrim(COALESCE(p_item ->> 'lifecycleStage', '')));
  v_consent TEXT := lower(btrim(COALESCE(p_item ->> 'marketingConsent', 'unknown')));
  v_consent_source TEXT := NULLIF(btrim(COALESCE(p_item ->> 'consentSource', '')), '');
  v_fields TEXT[] := ARRAY[]::TEXT[];
  v_old public.crm_contacts%ROWTYPE;
BEGIN
  PERFORM public.assert_tenant_crm_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  IF p_client_request_id IS NULL OR p_contact_id IS NULL OR p_action IS NULL OR p_action NOT IN ('create', 'update')
    OR p_item IS NULL OR jsonb_typeof(p_item) <> 'object'
    OR v_type NOT IN ('parent', 'prospect', 'alumni', 'donor', 'partner')
    OR length(v_name) NOT BETWEEN 2 AND 160 OR v_name ~ '[[:cntrl:]]'
    OR COALESCE(length(v_org), 0) > 200 OR COALESCE(v_org, '') ~ '[[:cntrl:]]'
    OR COALESCE(length(v_email), 0) > 254 OR (v_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    OR COALESCE(length(v_phone), 0) > 32 OR COALESCE(v_phone, '') ~ '[[:cntrl:]]'
    OR v_stage NOT IN ('lead', 'qualified', 'engaged', 'active', 'lost')
    OR v_consent NOT IN ('unknown', 'granted', 'revoked')
    OR COALESCE(length(v_consent_source), 0) > 120 OR COALESCE(v_consent_source, '') ~ '[[:cntrl:]]'
    OR (v_consent IN ('granted', 'revoked') AND v_consent_source IS NULL)
    OR (v_consent = 'unknown' AND v_consent_source IS NOT NULL) THEN
    RAISE EXCEPTION 'Data kontak CRM tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'create' AND p_contact_id IS NULL THEN
    RAISE EXCEPTION 'ID kontak CRM wajib diisi' USING ERRCODE = '22023';
  END IF;

  v_operation := CASE WHEN p_action = 'create' THEN 'contact_create' ELSE 'contact_update' END;
  v_hash := extensions.digest(convert_to(p_item::TEXT, 'UTF8'), 'sha256');
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'crm-mutation:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0
  ));
  SELECT * INTO v_existing FROM public.crm_mutation_requests
   WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.actor_user_id <> p_actor_user_id OR v_existing.operation <> v_operation
      OR v_existing.payload_sha256 <> v_hash THEN
      RAISE EXCEPTION 'ID permintaan CRM telah dipakai untuk payload berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('contactId', v_existing.resource_id, 'alreadyApplied', TRUE);
  END IF;

  IF p_action = 'create' THEN
    INSERT INTO public.crm_contacts (
      id, tenant_id, contact_type, name, organization_name, email, phone,
      lifecycle_stage, marketing_consent, consent_source, consent_recorded_at,
      created_by_user_id, updated_by_user_id
    ) VALUES (
      p_contact_id, p_tenant_id, v_type, v_name, v_org, v_email, v_phone,
      v_stage, v_consent, v_consent_source,
      CASE WHEN v_consent = 'unknown' THEN NULL ELSE now() END,
      p_actor_user_id, p_actor_user_id
    );
    v_fields := ARRAY['contact_type','name','organization_name','email','phone','lifecycle_stage','marketing_consent'];
    INSERT INTO public.crm_contact_audit_events (tenant_id, contact_id, actor_user_id, event_type, changed_fields)
      VALUES (p_tenant_id, p_contact_id, p_actor_user_id,
        CASE WHEN v_consent = 'unknown' THEN 'created' ELSE 'consent_changed' END, v_fields);
  ELSE
    SELECT * INTO v_old FROM public.crm_contacts
      WHERE tenant_id = p_tenant_id AND id = p_contact_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kontak CRM tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
    IF v_old.contact_type IS DISTINCT FROM v_type THEN v_fields := array_append(v_fields, 'contact_type'); END IF;
    IF v_old.name IS DISTINCT FROM v_name THEN v_fields := array_append(v_fields, 'name'); END IF;
    IF v_old.organization_name IS DISTINCT FROM v_org THEN v_fields := array_append(v_fields, 'organization_name'); END IF;
    IF v_old.email IS DISTINCT FROM v_email THEN v_fields := array_append(v_fields, 'email'); END IF;
    IF v_old.phone IS DISTINCT FROM v_phone THEN v_fields := array_append(v_fields, 'phone'); END IF;
    IF v_old.lifecycle_stage IS DISTINCT FROM v_stage THEN v_fields := array_append(v_fields, 'lifecycle_stage'); END IF;
    IF v_old.marketing_consent IS DISTINCT FROM v_consent OR v_old.consent_source IS DISTINCT FROM v_consent_source THEN
      v_fields := array_append(v_fields, 'marketing_consent');
    END IF;
    UPDATE public.crm_contacts SET
      contact_type = v_type, name = v_name, organization_name = v_org, email = v_email,
      phone = v_phone, lifecycle_stage = v_stage, marketing_consent = v_consent,
      consent_source = v_consent_source,
      consent_recorded_at = CASE
        WHEN v_old.marketing_consent IS DISTINCT FROM v_consent OR v_old.consent_source IS DISTINCT FROM v_consent_source
          THEN CASE WHEN v_consent = 'unknown' THEN NULL ELSE now() END
        ELSE v_old.consent_recorded_at
      END,
      updated_by_user_id = p_actor_user_id
    WHERE tenant_id = p_tenant_id AND id = p_contact_id;
    INSERT INTO public.crm_contact_audit_events (tenant_id, contact_id, actor_user_id, event_type, changed_fields)
      VALUES (p_tenant_id, p_contact_id, p_actor_user_id,
        CASE WHEN 'marketing_consent' = ANY(v_fields) THEN 'consent_changed' ELSE 'updated' END, v_fields);
  END IF;

  INSERT INTO public.crm_mutation_requests (tenant_id, client_request_id, actor_user_id, operation, payload_sha256, resource_id)
    VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, v_operation, v_hash, p_contact_id);
  RETURN jsonb_build_object('contactId', p_contact_id, 'alreadyApplied', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_tenant_crm_interaction(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_interaction_id UUID,
  p_item JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_existing public.crm_mutation_requests%ROWTYPE;
  v_hash BYTEA;
  v_contact_id UUID;
  v_type TEXT := lower(btrim(COALESCE(p_item ->> 'interactionType', '')));
  v_direction TEXT := lower(btrim(COALESCE(p_item ->> 'direction', '')));
  v_subject TEXT := btrim(COALESCE(p_item ->> 'subject', ''));
  v_summary TEXT := NULLIF(btrim(COALESCE(p_item ->> 'summary', '')), '');
BEGIN
  PERFORM public.assert_tenant_crm_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  BEGIN v_contact_id := NULLIF(p_item ->> 'contactId', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'ID kontak tidak valid' USING ERRCODE = '22023'; END;
  IF p_client_request_id IS NULL OR p_interaction_id IS NULL OR p_item IS NULL
    OR jsonb_typeof(p_item) <> 'object' OR v_contact_id IS NULL
    OR v_type NOT IN ('call', 'email', 'meeting', 'message', 'note')
    OR v_direction NOT IN ('inbound', 'outbound', 'internal')
    OR length(v_subject) NOT BETWEEN 1 AND 200 OR v_subject ~ '[[:cntrl:]]'
    OR COALESCE(length(v_summary), 0) > 2000 OR COALESCE(v_summary, '') ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Catatan interaksi CRM tidak valid' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.crm_contacts WHERE tenant_id = p_tenant_id AND id = v_contact_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kontak CRM tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
  v_hash := extensions.digest(convert_to(p_item::TEXT, 'UTF8'), 'sha256');
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'crm-mutation:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0
  ));
  SELECT * INTO v_existing FROM public.crm_mutation_requests
   WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.actor_user_id <> p_actor_user_id OR v_existing.operation <> 'interaction_create'
      OR v_existing.payload_sha256 <> v_hash THEN
      RAISE EXCEPTION 'ID permintaan interaksi telah dipakai untuk payload berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('interactionId', v_existing.resource_id, 'alreadyApplied', TRUE);
  END IF;

  INSERT INTO public.crm_interactions (
    id, tenant_id, contact_id, interaction_type, direction, subject, summary,
    created_by_user_id, client_request_id
  ) VALUES (
    p_interaction_id, p_tenant_id, v_contact_id, v_type, v_direction, v_subject, v_summary,
    p_actor_user_id, p_client_request_id
  );
  INSERT INTO public.crm_contact_audit_events (
    tenant_id, contact_id, actor_user_id, event_type, changed_fields, interaction_id
  ) VALUES (
    p_tenant_id, v_contact_id, p_actor_user_id, 'interaction_logged', ARRAY['interaction'], p_interaction_id
  );
  INSERT INTO public.crm_mutation_requests (tenant_id, client_request_id, actor_user_id, operation, payload_sha256, resource_id)
    VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, 'interaction_create', v_hash, p_interaction_id);
  RETURN jsonb_build_object('interactionId', p_interaction_id, 'alreadyApplied', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_tenant_crm_contacts_page(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_search TEXT DEFAULT NULL,
  p_contact_type TEXT DEFAULT NULL,
  p_lifecycle_stage TEXT DEFAULT NULL,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_page_size INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_search TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_contacts JSONB;
  v_total BIGINT;
  v_leads BIGINT;
  v_recent BIGINT;
  v_consented BIGINT;
  v_next_created_at TIMESTAMPTZ;
  v_next_id UUID;
  v_has_more BOOLEAN;
BEGIN
  PERFORM public.assert_tenant_crm_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR (p_cursor_created_at IS NULL) <> (p_cursor_id IS NULL)
    OR COALESCE(length(v_search), 0) > 100
    OR (v_search IS NOT NULL AND length(v_search) < 3)
    OR (p_contact_type IS NOT NULL AND p_contact_type NOT IN ('parent','prospect','alumni','donor','partner'))
    OR (p_lifecycle_stage IS NOT NULL AND p_lifecycle_stage NOT IN ('lead','qualified','engaged','active','lost')) THEN
    RAISE EXCEPTION 'Filter halaman CRM tidak valid' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_total FROM public.crm_contacts WHERE tenant_id = p_tenant_id;
  SELECT count(*) INTO v_leads FROM public.crm_contacts WHERE tenant_id = p_tenant_id AND lifecycle_stage IN ('lead','qualified');
  SELECT count(*) INTO v_consented FROM public.crm_contacts WHERE tenant_id = p_tenant_id AND marketing_consent = 'granted';
  SELECT count(*) INTO v_recent FROM public.crm_interactions
    WHERE tenant_id = p_tenant_id AND occurred_at >= now() - INTERVAL '30 days';

  WITH limited AS (
  SELECT c.id, c.contact_type, c.name, c.organization_name, c.email, c.phone,
      c.lifecycle_stage, c.marketing_consent, c.consent_source, c.consent_recorded_at, c.created_at, c.updated_at,
      (SELECT max(i.occurred_at) FROM public.crm_interactions i
        WHERE i.tenant_id = c.tenant_id AND i.contact_id = c.id) AS last_interaction_at,
      (SELECT count(*) FROM public.crm_interactions i
        WHERE i.tenant_id = c.tenant_id AND i.contact_id = c.id) AS interaction_count
    FROM public.crm_contacts c
    WHERE c.tenant_id = p_tenant_id
      AND (p_contact_type IS NULL OR c.contact_type = p_contact_type)
      AND (p_lifecycle_stage IS NULL OR c.lifecycle_stage = p_lifecycle_stage)
      AND (v_search IS NULL OR lower(c.name) LIKE '%' || lower(v_search) || '%'
        OR COALESCE(lower(c.organization_name),'') LIKE '%' || lower(v_search) || '%'
        OR COALESCE(lower(c.email),'') LIKE '%' || lower(v_search) || '%'
        OR COALESCE(lower(c.phone),'') LIKE '%' || lower(v_search) || '%')
      AND (p_cursor_created_at IS NULL OR (c.created_at,c.id) < (p_cursor_created_at,p_cursor_id))
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT p_page_size + 1
  ), page AS (
    SELECT * FROM limited ORDER BY created_at DESC, id DESC LIMIT p_page_size
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(page) ORDER BY created_at DESC, id DESC), '[]'::JSONB),
    (SELECT count(*) > p_page_size FROM limited)
  INTO v_contacts,v_has_more FROM page;
  IF v_has_more THEN
    SELECT created_at,id INTO v_next_created_at,v_next_id
    FROM jsonb_to_recordset(v_contacts) AS item(created_at TIMESTAMPTZ,id UUID)
    ORDER BY created_at ASC,id ASC LIMIT 1;
  END IF;
  RETURN jsonb_build_object(
    'contacts', v_contacts,
    'nextCursor', CASE WHEN v_has_more THEN jsonb_build_object('createdAt',v_next_created_at,'id',v_next_id) ELSE NULL END,
    'summary', jsonb_build_object('totalContacts',v_total,'openLeads',v_leads,'interactionsLast30Days',v_recent,'marketingConsentedContacts',v_consented)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_tenant_crm_interactions_page(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_contact_id UUID,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_page_size INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_interactions JSONB;
  v_has_more BOOLEAN;
  v_next_created_at TIMESTAMPTZ;
  v_next_id UUID;
BEGIN
  PERFORM public.assert_tenant_crm_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  IF p_contact_id IS NULL OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR (p_cursor_created_at IS NULL) <> (p_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'Filter halaman interaksi CRM tidak valid' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.crm_contacts WHERE tenant_id = p_tenant_id AND id = p_contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kontak CRM tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
  WITH limited AS (
    SELECT i.id,i.contact_id,i.interaction_type,i.direction,i.subject,i.summary,i.occurred_at,i.created_by_user_id,i.created_at
    FROM public.crm_interactions i
    WHERE i.tenant_id = p_tenant_id AND i.contact_id = p_contact_id
      AND (p_cursor_created_at IS NULL OR (i.occurred_at,i.id) < (p_cursor_created_at,p_cursor_id))
    ORDER BY i.occurred_at DESC,i.id DESC
    LIMIT p_page_size + 1
  ), page AS (
    SELECT * FROM limited ORDER BY occurred_at DESC,id DESC LIMIT p_page_size
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(page) ORDER BY occurred_at DESC,id DESC),'[]'::JSONB),
    (SELECT count(*) > p_page_size FROM limited)
  INTO v_interactions,v_has_more FROM page;
  IF v_has_more THEN
    SELECT occurred_at,id INTO v_next_created_at,v_next_id
    FROM jsonb_to_recordset(v_interactions) AS item(occurred_at TIMESTAMPTZ,id UUID)
    ORDER BY occurred_at ASC,id ASC LIMIT 1;
  END IF;
  RETURN jsonb_build_object(
    'interactions',v_interactions,
    'nextCursor',CASE WHEN v_has_more THEN jsonb_build_object('createdAt',v_next_created_at,'id',v_next_id) ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_crm_immutable_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_tenant_crm_actor(UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.manage_tenant_crm_contact(UUID,UUID,TEXT,UUID,UUID,TEXT,JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_tenant_crm_interaction(UUID,UUID,TEXT,UUID,UUID,JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_tenant_crm_contacts_page(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID,INTEGER) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_tenant_crm_interactions_page(UUID,UUID,TEXT,UUID,TIMESTAMPTZ,UUID,INTEGER) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_tenant_crm_actor(UUID,UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.manage_tenant_crm_contact(UUID,UUID,TEXT,UUID,UUID,TEXT,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_tenant_crm_interaction(UUID,UUID,TEXT,UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_tenant_crm_contacts_page(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID,INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_tenant_crm_interactions_page(UUID,UUID,TEXT,UUID,TIMESTAMPTZ,UUID,INTEGER) TO service_role;

COMMENT ON TABLE public.crm_contacts IS 'Tenant-scoped contact directory; server-only API access, not a marketing consent substitute.';
COMMENT ON TABLE public.crm_interactions IS 'Append-only tenant CRM interaction notes; use only for relevant operational context.';
COMMENT ON TABLE public.crm_contact_audit_events IS 'Append-only CRM audit metadata; never stores contact values or interaction summaries.';
COMMENT ON TABLE public.crm_mutation_requests IS 'Payload-fingerprinted idempotency ledger for CRM contact and interaction mutations.';
COMMENT ON FUNCTION public.manage_tenant_crm_contact(UUID,UUID,TEXT,UUID,UUID,TEXT,JSONB)
  IS 'Idempotently creates or updates a contact after rechecking active Admin, tenant, and CRM permission.';
COMMENT ON FUNCTION public.record_tenant_crm_interaction(UUID,UUID,TEXT,UUID,UUID,JSONB)
  IS 'Idempotently appends a tenant contact interaction and audit event.';

COMMIT;
