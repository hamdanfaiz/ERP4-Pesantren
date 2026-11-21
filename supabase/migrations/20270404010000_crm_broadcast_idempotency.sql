-- Durable, tenant-scoped idempotency for outbound CRM broadcasts.
-- The body/message is deliberately not stored; only its SHA-256 fingerprint and
-- per-recipient delivery state are persisted. Ambiguous delivery is never retried.
BEGIN;

CREATE TABLE public.crm_broadcast_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  payload_sha256 BYTEA NOT NULL CHECK (octet_length(payload_sha256) = 32),
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'uncertain')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((status = 'processing' AND completed_at IS NULL)
    OR (status IN ('completed', 'uncertain') AND completed_at IS NOT NULL))
);

CREATE TABLE public.crm_broadcast_recipients (
  tenant_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 50),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'unknown')),
  message_id TEXT CHECK (message_id IS NULL OR (length(message_id) <= 200 AND message_id !~ '[[:cntrl:]]')),
  error_code TEXT CHECK (error_code IS NULL OR error_code IN (
    'consent_revoked', 'invalid_recipient', 'provider_rejected', 'provider_unavailable', 'delivery_unknown'
  )),
  interaction_logged_at TIMESTAMPTZ,
  interaction_error_code TEXT CHECK (interaction_error_code IS NULL OR interaction_error_code = 'interaction_log_failed'),
  attempted_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, client_request_id, contact_id),
  UNIQUE (tenant_id, client_request_id, position),
  FOREIGN KEY (tenant_id, client_request_id)
    REFERENCES public.crm_broadcast_requests (tenant_id, client_request_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, contact_id)
    REFERENCES public.crm_contacts (tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status IN ('pending', 'sending') AND finished_at IS NULL)
    OR (status IN ('sent', 'failed', 'unknown') AND finished_at IS NOT NULL)),
  CHECK ((status = 'sent' AND error_code IS NULL)
    OR (status IN ('pending', 'sending') AND error_code IS NULL)
    OR (status IN ('failed', 'unknown') AND error_code IS NOT NULL)),
  CHECK ((interaction_logged_at IS NULL) OR status = 'sent'),
  CHECK ((interaction_error_code IS NULL) OR (status = 'sent' AND interaction_logged_at IS NULL))
);

CREATE INDEX crm_broadcast_requests_tenant_created_idx
  ON public.crm_broadcast_requests (tenant_id, created_at DESC);
CREATE INDEX crm_broadcast_recipients_contact_idx
  ON public.crm_broadcast_recipients (tenant_id, contact_id, status);

CREATE OR REPLACE FUNCTION public.reject_crm_broadcast_request_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Riwayat siaran CRM tidak dapat dihapus' USING ERRCODE = '55000';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
    OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
    OR NEW.payload_sha256 IS DISTINCT FROM OLD.payload_sha256
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NOT (OLD.status = 'processing' AND NEW.status IN ('completed', 'uncertain')) THEN
    RAISE EXCEPTION 'Permintaan siaran CRM bersifat tetap' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_crm_broadcast_recipient_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Riwayat penerima siaran CRM tidak dapat dihapus' USING ERRCODE = '55000';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
    OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
    OR NEW.position IS DISTINCT FROM OLD.position THEN
    RAISE EXCEPTION 'Identitas penerima siaran CRM bersifat tetap' USING ERRCODE = '55000';
  END IF;
  IF (OLD.status = 'pending' AND NEW.status IN ('sending', 'failed'))
    OR (OLD.status = 'sending' AND NEW.status IN ('sent', 'failed', 'unknown')) THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'sent' AND NEW.status = 'sent'
    AND OLD.message_id IS NOT DISTINCT FROM NEW.message_id
    AND OLD.error_code IS NOT DISTINCT FROM NEW.error_code
    AND OLD.attempted_at IS NOT DISTINCT FROM NEW.attempted_at
    AND OLD.finished_at IS NOT DISTINCT FROM NEW.finished_at
    AND OLD.interaction_logged_at IS NULL
    AND NEW.interaction_logged_at IS NOT NULL
    AND NEW.interaction_error_code IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'sent' AND NEW.status = 'sent'
    AND OLD.message_id IS NOT DISTINCT FROM NEW.message_id
    AND OLD.error_code IS NOT DISTINCT FROM NEW.error_code
    AND OLD.attempted_at IS NOT DISTINCT FROM NEW.attempted_at
    AND OLD.finished_at IS NOT DISTINCT FROM NEW.finished_at
    AND OLD.interaction_logged_at IS NULL
    AND NEW.interaction_logged_at IS NULL
    AND NEW.interaction_error_code = 'interaction_log_failed' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Perubahan status penerima siaran CRM tidak valid' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER crm_broadcast_requests_immutable
  BEFORE UPDATE OR DELETE ON public.crm_broadcast_requests
  FOR EACH ROW EXECUTE FUNCTION public.reject_crm_broadcast_request_mutation();
CREATE TRIGGER crm_broadcast_recipients_immutable
  BEFORE UPDATE OR DELETE ON public.crm_broadcast_recipients
  FOR EACH ROW EXECUTE FUNCTION public.reject_crm_broadcast_recipient_mutation();

CREATE OR REPLACE FUNCTION public.reserve_tenant_crm_broadcast(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_payload_sha256 BYTEA,
  p_contact_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.crm_broadcast_requests%ROWTYPE;
  v_unique_count BIGINT;
  v_eligible_count BIGINT;
BEGIN
  PERFORM public.assert_tenant_crm_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  IF p_client_request_id IS NULL OR p_payload_sha256 IS NULL OR octet_length(p_payload_sha256) <> 32
    OR p_contact_ids IS NULL OR cardinality(p_contact_ids) NOT BETWEEN 1 AND 50
    OR array_position(p_contact_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Permintaan siaran CRM tidak valid' USING ERRCODE = '22023';
  END IF;
  SELECT count(DISTINCT item.contact_id) INTO v_unique_count
  FROM unnest(p_contact_ids) AS item(contact_id);
  IF v_unique_count <> cardinality(p_contact_ids) THEN
    RAISE EXCEPTION 'Penerima siaran CRM duplikat' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'crm-broadcast:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0
  ));
  SELECT * INTO v_existing
  FROM public.crm_broadcast_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id <> p_actor_user_id OR v_existing.payload_sha256 <> p_payload_sha256 THEN
      RAISE EXCEPTION 'ID permintaan siaran telah dipakai untuk payload berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('created', FALSE, 'status', v_existing.status);
  END IF;

  SELECT count(*) INTO v_eligible_count
  FROM public.crm_contacts AS contact
  WHERE contact.tenant_id = p_tenant_id
    AND contact.id = ANY(p_contact_ids)
    AND contact.marketing_consent = 'granted';
  IF v_eligible_count <> cardinality(p_contact_ids) THEN
    RAISE EXCEPTION 'Sebagian kontak tidak berada pada tenant ini atau tidak menyetujui pemasaran' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.crm_broadcast_requests (
    tenant_id, client_request_id, actor_user_id, payload_sha256
  ) VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, p_payload_sha256);
  INSERT INTO public.crm_broadcast_recipients (
    tenant_id, client_request_id, contact_id, position
  )
  SELECT p_tenant_id, p_client_request_id, item.contact_id, item.ordinality::SMALLINT
  FROM unnest(p_contact_ids) WITH ORDINALITY AS item(contact_id, ordinality);
  RETURN jsonb_build_object('created', TRUE, 'status', 'processing');
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_tenant_crm_broadcast_recipient(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_contact_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.crm_broadcast_requests%ROWTYPE;
  v_recipient public.crm_broadcast_recipients%ROWTYPE;
BEGIN
  PERFORM public.assert_tenant_crm_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  SELECT * INTO v_request FROM public.crm_broadcast_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.actor_user_id <> p_actor_user_id THEN
    RAISE EXCEPTION 'Permintaan siaran CRM tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_recipient FROM public.crm_broadcast_recipients
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id AND contact_id = p_contact_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penerima siaran CRM tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF v_request.status <> 'processing' OR v_recipient.status <> 'pending' THEN
    RETURN jsonb_build_object('claimed', FALSE, 'status', v_recipient.status);
  END IF;
  PERFORM 1 FROM public.crm_contacts
  WHERE tenant_id = p_tenant_id AND id = p_contact_id AND marketing_consent = 'granted'
  FOR SHARE;
  IF NOT FOUND THEN
    UPDATE public.crm_broadcast_recipients
    SET status = 'failed', error_code = 'consent_revoked', finished_at = now()
    WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id AND contact_id = p_contact_id;
    RETURN jsonb_build_object('claimed', FALSE, 'status', 'failed');
  END IF;
  UPDATE public.crm_broadcast_recipients
  SET status = 'sending', attempted_at = now()
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id AND contact_id = p_contact_id;
  RETURN jsonb_build_object('claimed', TRUE, 'status', 'sending');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_tenant_crm_broadcast_delivery(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_contact_id UUID,
  p_status TEXT,
  p_message_id TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.crm_broadcast_requests%ROWTYPE;
  v_recipient public.crm_broadcast_recipients%ROWTYPE;
BEGIN
  PERFORM public.assert_tenant_crm_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed', 'unknown')
    OR (p_message_id IS NOT NULL AND (length(p_message_id) > 200 OR p_message_id ~ '[[:cntrl:]]'))
    OR (p_status = 'sent' AND p_error_code IS NOT NULL)
    OR (p_status = 'failed' AND (p_error_code IS NULL OR p_error_code NOT IN ('invalid_recipient', 'provider_rejected', 'provider_unavailable')))
    OR (p_status = 'unknown' AND p_error_code IS DISTINCT FROM 'delivery_unknown') THEN
    RAISE EXCEPTION 'Hasil pengiriman siaran CRM tidak valid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_request FROM public.crm_broadcast_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.actor_user_id <> p_actor_user_id THEN
    RAISE EXCEPTION 'Permintaan siaran CRM tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_recipient FROM public.crm_broadcast_recipients
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id AND contact_id = p_contact_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penerima siaran CRM tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF v_recipient.status = p_status THEN
    IF v_recipient.message_id IS DISTINCT FROM p_message_id OR v_recipient.error_code IS DISTINCT FROM p_error_code THEN
      RAISE EXCEPTION 'Hasil pengiriman siaran CRM bertentangan' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('alreadyApplied', TRUE, 'status', v_recipient.status);
  END IF;
  IF v_recipient.status <> 'sending' OR v_request.status <> 'processing' THEN
    RAISE EXCEPTION 'Penerima siaran CRM tidak sedang diproses' USING ERRCODE = '55000';
  END IF;
  UPDATE public.crm_broadcast_recipients
  SET status = p_status, message_id = p_message_id, error_code = p_error_code, finished_at = now()
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id AND contact_id = p_contact_id;
  RETURN jsonb_build_object('alreadyApplied', FALSE, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_tenant_crm_broadcast_interaction_logged(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_contact_id UUID,
  p_logged BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.crm_broadcast_requests%ROWTYPE;
  v_recipient public.crm_broadcast_recipients%ROWTYPE;
BEGIN
  PERFORM public.assert_tenant_crm_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  SELECT * INTO v_request FROM public.crm_broadcast_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.actor_user_id <> p_actor_user_id THEN
    RAISE EXCEPTION 'Permintaan siaran CRM tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_recipient FROM public.crm_broadcast_recipients
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id AND contact_id = p_contact_id
  FOR UPDATE;
  IF NOT FOUND OR v_recipient.status <> 'sent' THEN
    RAISE EXCEPTION 'Pesan terkirim tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;
  IF p_logged THEN
    UPDATE public.crm_broadcast_recipients
    SET interaction_logged_at = COALESCE(interaction_logged_at, now()), interaction_error_code = NULL
    WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id AND contact_id = p_contact_id;
  ELSE
    UPDATE public.crm_broadcast_recipients
    SET interaction_error_code = 'interaction_log_failed'
    WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id AND contact_id = p_contact_id;
  END IF;
  RETURN jsonb_build_object('interactionLogged', p_logged);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_tenant_crm_broadcast(
  p_tenant_id UUID,
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
  v_request public.crm_broadcast_requests%ROWTYPE;
  v_pending BIGINT;
  v_unknown BIGINT;
  v_status TEXT;
BEGIN
  PERFORM public.assert_tenant_crm_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  SELECT * INTO v_request FROM public.crm_broadcast_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.actor_user_id <> p_actor_user_id THEN
    RAISE EXCEPTION 'Permintaan siaran CRM tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status <> 'processing' THEN
    RETURN jsonb_build_object('status', v_request.status, 'alreadyApplied', TRUE);
  END IF;
  SELECT count(*) FILTER (WHERE status IN ('pending', 'sending')),
         count(*) FILTER (WHERE status = 'unknown')
    INTO v_pending, v_unknown
  FROM public.crm_broadcast_recipients
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF v_pending > 0 THEN
    RETURN jsonb_build_object('status', 'processing', 'alreadyApplied', TRUE);
  END IF;
  v_status := CASE WHEN v_unknown > 0 THEN 'uncertain' ELSE 'completed' END;
  UPDATE public.crm_broadcast_requests
  SET status = v_status, updated_at = now(), completed_at = now()
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  RETURN jsonb_build_object('status', v_status, 'alreadyApplied', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_crm_broadcast_status(
  p_tenant_id UUID,
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
  v_request public.crm_broadcast_requests%ROWTYPE;
  v_results JSONB;
  v_sent BIGINT;
  v_failed BIGINT;
  v_unknown BIGINT;
  v_pending BIGINT;
BEGIN
  PERFORM public.assert_tenant_crm_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  SELECT * INTO v_request FROM public.crm_broadcast_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF NOT FOUND OR v_request.actor_user_id <> p_actor_user_id THEN
    RAISE EXCEPTION 'Permintaan siaran CRM tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'contactId', recipient.contact_id,
      'name', contact.name,
      'phone', COALESCE(contact.phone, ''),
      'status', recipient.status,
      'messageId', recipient.message_id,
      'errorCode', COALESCE(recipient.error_code, recipient.interaction_error_code),
      'interactionLogged', recipient.interaction_logged_at IS NOT NULL
    ) ORDER BY recipient.position), '[]'::JSONB),
    count(*) FILTER (WHERE recipient.status = 'sent'),
    count(*) FILTER (WHERE recipient.status = 'failed'),
    count(*) FILTER (WHERE recipient.status = 'unknown'),
    count(*) FILTER (WHERE recipient.status IN ('pending', 'sending'))
  INTO v_results, v_sent, v_failed, v_unknown, v_pending
  FROM public.crm_broadcast_recipients AS recipient
  JOIN public.crm_contacts AS contact
    ON contact.tenant_id = recipient.tenant_id AND contact.id = recipient.contact_id
  WHERE recipient.tenant_id = p_tenant_id AND recipient.client_request_id = p_client_request_id;
  RETURN jsonb_build_object(
    'clientRequestId', p_client_request_id,
    'status', v_request.status,
    'sent', v_sent,
    'failed', v_failed,
    'unknown', v_unknown,
    'pending', v_pending,
    'results', v_results
  );
END;
$$;

ALTER TABLE public.crm_broadcast_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_broadcast_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.crm_broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_broadcast_recipients FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crm_broadcast_requests, public.crm_broadcast_recipients
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.crm_broadcast_requests, public.crm_broadcast_recipients TO service_role;

REVOKE ALL ON FUNCTION public.reserve_tenant_crm_broadcast(UUID,UUID,TEXT,UUID,BYTEA,UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_tenant_crm_broadcast_recipient(UUID,UUID,TEXT,UUID,UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_tenant_crm_broadcast_delivery(UUID,UUID,TEXT,UUID,UUID,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_tenant_crm_broadcast_interaction_logged(UUID,UUID,TEXT,UUID,UUID,BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_tenant_crm_broadcast(UUID,UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_tenant_crm_broadcast_status(UUID,UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tenant_crm_broadcast(UUID,UUID,TEXT,UUID,BYTEA,UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_tenant_crm_broadcast_recipient(UUID,UUID,TEXT,UUID,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_tenant_crm_broadcast_delivery(UUID,UUID,TEXT,UUID,UUID,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_tenant_crm_broadcast_interaction_logged(UUID,UUID,TEXT,UUID,UUID,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_tenant_crm_broadcast(UUID,UUID,TEXT,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_crm_broadcast_status(UUID,UUID,TEXT,UUID) TO service_role;

COMMENT ON TABLE public.crm_broadcast_requests IS
  'Tenant-scoped idempotency reservations for outbound CRM messaging; message content is not persisted.';
COMMENT ON TABLE public.crm_broadcast_recipients IS
  'Per-contact outbound delivery state. Ambiguous outcomes are marked unknown and are never resent automatically.';

COMMIT;
