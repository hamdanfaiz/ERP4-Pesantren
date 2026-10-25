-- Keep tenant user directory filtering, stable ordering, and substring search bounded as profiles grow.
-- Apply this migration during a maintenance window on installations with a large existing profiles table:
-- ordinary CREATE INDEX permits reads but blocks writes to profiles while each index is built.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS profiles_tenant_created_user_idx
  ON public.profiles (tenant_id, created_at DESC NULLS LAST, user_id ASC);

DO $migration$
DECLARE
  v_extension_schema name;
BEGIN
  SELECT namespace.nspname
  INTO v_extension_schema
  FROM pg_extension AS extension
  JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pg_trgm';

  IF v_extension_schema IS NULL THEN
    RAISE EXCEPTION 'pg_trgm extension is required for user directory search indexes';
  END IF;

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS profiles_display_name_trgm_idx
       ON public.profiles USING gin (display_name %I.gin_trgm_ops)
       WHERE display_name IS NOT NULL',
    v_extension_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS profiles_email_trgm_idx
       ON public.profiles USING gin (email %I.gin_trgm_ops)
       WHERE email IS NOT NULL',
    v_extension_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS profiles_username_trgm_idx
       ON public.profiles USING gin (username %I.gin_trgm_ops)
       WHERE username IS NOT NULL',
    v_extension_schema
  );
END;
$migration$;
