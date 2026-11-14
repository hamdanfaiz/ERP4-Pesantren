-- Helpdesk tickets, direct messages, and communication templates for tenant ops.
-- Status transitions only; no hard-delete from application flows.
BEGIN;

CREATE TABLE public.communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  content TEXT NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 12000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by_user_id UUID NOT NULL,
  updated_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX communication_templates_tenant_status_idx
  ON public.communication_templates (tenant_id, status, updated_at DESC, id DESC);

CREATE TABLE public.communication_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  subject TEXT NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 2 AND 180),
  category TEXT NOT NULL CHECK (category IN ('Teknis', 'Akademik', 'Asrama', 'Keuangan', 'Lainnya')),
  description TEXT NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 4000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  requested_by_user_id UUID NOT NULL,
  requested_by_name TEXT NOT NULL CHECK (char_length(btrim(requested_by_name)) BETWEEN 1 AND 180),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, requested_by_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((status IN ('resolved', 'closed')) = (resolved_at IS NOT NULL))
);
CREATE INDEX communication_tickets_tenant_status_idx
  ON public.communication_tickets (tenant_id, status, created_at DESC, id DESC);
CREATE INDEX communication_tickets_tenant_requester_idx
  ON public.communication_tickets (tenant_id, requested_by_user_id, created_at DESC);

CREATE TABLE public.communication_ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ticket_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'status_changed')),
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES public.communication_tickets(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX communication_ticket_events_tenant_time_idx
  ON public.communication_ticket_events (tenant_id, created_at DESC, id DESC);

CREATE TABLE public.communication_direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  from_user_id UUID NOT NULL,
  from_name TEXT NOT NULL CHECK (char_length(btrim(from_name)) BETWEEN 1 AND 180),
  to_user_id UUID NOT NULL,
  to_name TEXT NOT NULL CHECK (char_length(btrim(to_name)) BETWEEN 1 AND 180),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'read', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, from_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, to_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (from_user_id <> to_user_id)
);
CREATE INDEX communication_direct_messages_tenant_to_idx
  ON public.communication_direct_messages (tenant_id, to_user_id, created_at DESC, id DESC);
CREATE INDEX communication_direct_messages_tenant_from_idx
  ON public.communication_direct_messages (tenant_id, from_user_id, created_at DESC, id DESC);

CREATE TABLE public.communication_direct_message_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  message_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'status_changed')),
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, message_id) REFERENCES public.communication_direct_messages(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT
);

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'communication_templates',
    'communication_tickets',
    'communication_ticket_events',
    'communication_direct_messages',
    'communication_direct_message_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.assert_tenant_communication_actor(
  p_tenant_id UUID,
  p_actor_user_id UUID
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Tenant and actor required' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE = '42501'; END IF;
  SELECT role INTO v_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Actor unavailable' USING ERRCODE = '42501'; END IF;
  RETURN v_role;
END $$;

CREATE OR REPLACE FUNCTION public.create_communication_ticket(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_subject TEXT,
  p_category TEXT,
  p_description TEXT,
  p_requested_by_name TEXT,
  p_client_request_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_ticket_id UUID;
  v_existing UUID;
BEGIN
  v_role := public.assert_tenant_communication_actor(p_tenant_id, p_actor_user_id);
  IF p_client_request_id IS NULL OR p_subject IS NULL OR p_category IS NULL OR p_description IS NULL OR p_requested_by_name IS NULL THEN
    RAISE EXCEPTION 'Invalid ticket payload' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('communication-ticket:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT ticket_id INTO v_existing
  FROM public.communication_ticket_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing, 'alreadyApplied', true);
  END IF;
  v_ticket_id := gen_random_uuid();
  INSERT INTO public.communication_tickets (
    id, tenant_id, subject, category, description, status, requested_by_user_id, requested_by_name
  ) VALUES (
    v_ticket_id, p_tenant_id, btrim(p_subject), p_category, btrim(p_description), 'open', p_actor_user_id, btrim(p_requested_by_name)
  );
  INSERT INTO public.communication_ticket_events (
    tenant_id, ticket_id, event_type, client_request_id, actor_user_id, details
  ) VALUES (
    p_tenant_id, v_ticket_id, 'created', p_client_request_id, p_actor_user_id,
    jsonb_build_object('status', 'open', 'role', v_role)
  );
  RETURN jsonb_build_object('id', v_ticket_id, 'alreadyApplied', false);
END $$;

CREATE OR REPLACE FUNCTION public.transition_communication_ticket(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_ticket_id UUID,
  p_next_status TEXT,
  p_client_request_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_ticket public.communication_tickets%ROWTYPE;
  v_existing UUID;
  v_allowed BOOLEAN := false;
BEGIN
  v_role := public.assert_tenant_communication_actor(p_tenant_id, p_actor_user_id);
  IF v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Admin required for ticket transition' USING ERRCODE = '42501';
  END IF;
  IF p_ticket_id IS NULL OR p_client_request_id IS NULL OR p_next_status NOT IN ('in_progress', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'Invalid ticket transition' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('communication-ticket:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT ticket_id INTO v_existing
  FROM public.communication_ticket_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF v_existing IS NOT NULL THEN
    IF v_existing <> p_ticket_id THEN RAISE EXCEPTION 'Request ID reused' USING ERRCODE = '23514'; END IF;
    RETURN jsonb_build_object('id', v_existing, 'alreadyApplied', true);
  END IF;
  SELECT * INTO v_ticket
  FROM public.communication_tickets
  WHERE tenant_id = p_tenant_id AND id = p_ticket_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002'; END IF;
  IF v_ticket.status = 'open' AND p_next_status IN ('in_progress', 'resolved', 'closed') THEN v_allowed := true; END IF;
  IF v_ticket.status = 'in_progress' AND p_next_status IN ('resolved', 'closed') THEN v_allowed := true; END IF;
  IF v_ticket.status = 'resolved' AND p_next_status = 'closed' THEN v_allowed := true; END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Ticket transition not allowed' USING ERRCODE = '22023'; END IF;
  UPDATE public.communication_tickets
  SET status = p_next_status,
      resolved_at = CASE WHEN p_next_status IN ('resolved', 'closed') THEN COALESCE(resolved_at, now()) ELSE NULL END,
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_ticket_id;
  INSERT INTO public.communication_ticket_events (
    tenant_id, ticket_id, event_type, client_request_id, actor_user_id, details
  ) VALUES (
    p_tenant_id, p_ticket_id, 'status_changed', p_client_request_id, p_actor_user_id,
    jsonb_build_object('from', v_ticket.status, 'to', p_next_status)
  );
  RETURN jsonb_build_object('id', p_ticket_id, 'status', p_next_status, 'alreadyApplied', false);
END $$;

CREATE OR REPLACE FUNCTION public.create_communication_direct_message(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_to_user_id UUID,
  p_from_name TEXT,
  p_to_name TEXT,
  p_body TEXT,
  p_client_request_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_message_id UUID;
  v_existing UUID;
  v_to_role TEXT;
BEGIN
  v_role := public.assert_tenant_communication_actor(p_tenant_id, p_actor_user_id);
  IF p_to_user_id IS NULL OR p_client_request_id IS NULL OR p_body IS NULL THEN
    RAISE EXCEPTION 'Invalid message payload' USING ERRCODE = '22023';
  END IF;
  SELECT role INTO v_to_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_to_user_id AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recipient not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('communication-message:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT message_id INTO v_existing
  FROM public.communication_direct_message_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing, 'alreadyApplied', true);
  END IF;
  v_message_id := gen_random_uuid();
  INSERT INTO public.communication_direct_messages (
    id, tenant_id, from_user_id, from_name, to_user_id, to_name, body, status
  ) VALUES (
    v_message_id, p_tenant_id, p_actor_user_id, btrim(p_from_name), p_to_user_id, btrim(p_to_name), btrim(p_body), 'sent'
  );
  INSERT INTO public.communication_direct_message_events (
    tenant_id, message_id, event_type, client_request_id, actor_user_id, details
  ) VALUES (
    p_tenant_id, v_message_id, 'created', p_client_request_id, p_actor_user_id,
    jsonb_build_object('toUserId', p_to_user_id, 'fromRole', v_role, 'toRole', v_to_role)
  );
  RETURN jsonb_build_object('id', v_message_id, 'alreadyApplied', false);
END $$;

CREATE OR REPLACE FUNCTION public.transition_communication_direct_message(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_message_id UUID,
  p_next_status TEXT,
  p_client_request_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_message public.communication_direct_messages%ROWTYPE;
  v_existing UUID;
BEGIN
  PERFORM public.assert_tenant_communication_actor(p_tenant_id, p_actor_user_id);
  IF p_message_id IS NULL OR p_client_request_id IS NULL OR p_next_status NOT IN ('read', 'archived') THEN
    RAISE EXCEPTION 'Invalid message transition' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('communication-message:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT message_id INTO v_existing
  FROM public.communication_direct_message_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF v_existing IS NOT NULL THEN
    IF v_existing <> p_message_id THEN RAISE EXCEPTION 'Request ID reused' USING ERRCODE = '23514'; END IF;
    RETURN jsonb_build_object('id', v_existing, 'alreadyApplied', true);
  END IF;
  SELECT * INTO v_message
  FROM public.communication_direct_messages
  WHERE tenant_id = p_tenant_id AND id = p_message_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Message not found' USING ERRCODE = 'P0002'; END IF;
  IF p_next_status = 'read' AND v_message.to_user_id <> p_actor_user_id THEN
    RAISE EXCEPTION 'Only recipient can mark read' USING ERRCODE = '42501';
  END IF;
  IF p_next_status = 'archived'
    AND v_message.from_user_id <> p_actor_user_id
    AND v_message.to_user_id <> p_actor_user_id THEN
    RAISE EXCEPTION 'Only participants can archive' USING ERRCODE = '42501';
  END IF;
  IF v_message.status = 'archived' THEN
    RETURN jsonb_build_object('id', p_message_id, 'status', 'archived', 'alreadyApplied', true);
  END IF;
  IF p_next_status = 'read' AND v_message.status <> 'sent' THEN
    RETURN jsonb_build_object('id', p_message_id, 'status', v_message.status, 'alreadyApplied', true);
  END IF;
  UPDATE public.communication_direct_messages
  SET status = p_next_status, updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_message_id;
  INSERT INTO public.communication_direct_message_events (
    tenant_id, message_id, event_type, client_request_id, actor_user_id, details
  ) VALUES (
    p_tenant_id, p_message_id, 'status_changed', p_client_request_id, p_actor_user_id,
    jsonb_build_object('from', v_message.status, 'to', p_next_status)
  );
  RETURN jsonb_build_object('id', p_message_id, 'status', p_next_status, 'alreadyApplied', false);
END $$;

CREATE OR REPLACE FUNCTION public.upsert_communication_template(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_template_id UUID,
  p_name TEXT,
  p_content TEXT,
  p_status TEXT,
  p_client_request_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_id UUID;
BEGIN
  v_role := public.assert_tenant_communication_actor(p_tenant_id, p_actor_user_id);
  IF v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Admin required for templates' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR p_content IS NULL OR p_status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'Invalid template payload' USING ERRCODE = '22023';
  END IF;
  IF p_template_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO public.communication_templates (
      id, tenant_id, name, content, status, created_by_user_id, updated_by_user_id
    ) VALUES (
      v_id, p_tenant_id, btrim(p_name), btrim(p_content), p_status, p_actor_user_id, p_actor_user_id
    );
  ELSE
    v_id := p_template_id;
    UPDATE public.communication_templates
    SET name = btrim(p_name),
        content = btrim(p_content),
        status = p_status,
        updated_by_user_id = p_actor_user_id,
        updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_template_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Template not found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN jsonb_build_object('id', v_id, 'status', p_status, 'alreadyApplied', false, 'clientRequestId', p_client_request_id);
END $$;

REVOKE ALL ON FUNCTION public.assert_tenant_communication_actor(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_communication_ticket(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_communication_ticket(UUID, UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_communication_direct_message(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_communication_direct_message(UUID, UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_communication_template(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_tenant_communication_actor(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_communication_ticket(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_communication_ticket(UUID, UUID, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_communication_direct_message(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_communication_direct_message(UUID, UUID, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_communication_template(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID) TO service_role;

COMMIT;
