-- Preventive schema invariants for every application table in public.
-- These checks run after every migration in the isolated Supabase CI database.
-- Extension-owned relations are excluded; all test data is synthetic.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(7);

WITH app_tables AS (
  SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_depend AS d
      WHERE d.classid = 'pg_class'::regclass
        AND d.objid = c.oid
        AND d.deptype = 'e'
    )
)
SELECT is(
  (SELECT count(*)::int FROM app_tables WHERE NOT relrowsecurity),
  0,
  'every application table has RLS enabled'
);

WITH app_tables AS (
  SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_depend AS d
      WHERE d.classid = 'pg_class'::regclass
        AND d.objid = c.oid
        AND d.deptype = 'e'
    )
)
SELECT is(
  (SELECT count(*)::int FROM app_tables WHERE NOT relforcerowsecurity),
  0,
  'every application table forces RLS'
);

WITH app_tables AS (
  SELECT c.oid, c.relname
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relname <> 'tenants'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_depend AS d
      WHERE d.classid = 'pg_class'::regclass
        AND d.objid = c.oid
        AND d.deptype = 'e'
    )
)
SELECT is(
  (
    SELECT count(*)::int
    FROM app_tables AS t
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_attribute AS a
      WHERE a.attrelid = t.oid
        AND a.attname = 'tenant_id'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND a.attnotnull
    )
  ),
  0,
  'every non-root application table has a non-null tenant_id'
);

WITH app_tables AS (
  SELECT c.oid
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_depend AS d
      WHERE d.classid = 'pg_class'::regclass
        AND d.objid = c.oid
        AND d.deptype = 'e'
    )
)
SELECT is(
  (
    SELECT count(*)::int
    FROM app_tables AS t
    WHERE has_table_privilege('anon', t.oid, 'SELECT')
       OR has_table_privilege('anon', t.oid, 'INSERT')
       OR has_table_privilege('anon', t.oid, 'UPDATE')
       OR has_table_privilege('anon', t.oid, 'DELETE')
  ),
  0,
  'anon has no direct privileges on application tables'
);

WITH app_tables AS (
  SELECT c.oid
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_depend AS d
      WHERE d.classid = 'pg_class'::regclass
        AND d.objid = c.oid
        AND d.deptype = 'e'
    )
)
SELECT is(
  (
    SELECT count(*)::int
    FROM app_tables AS t
    WHERE has_table_privilege('authenticated', t.oid, 'INSERT')
       OR has_table_privilege('authenticated', t.oid, 'UPDATE')
       OR has_table_privilege('authenticated', t.oid, 'DELETE')
  ),
  0,
  'authenticated users cannot write application tables directly'
);

SELECT is(
  (
    SELECT count(*)::int
    FROM pg_policy AS p
    JOIN pg_class AS c ON c.oid = p.polrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL unnest(p.polroles) AS policy_role(role_oid)
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND (policy_role.role_oid = 0::oid OR policy_role.role_oid = 'anon'::regrole::oid)
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS d
        WHERE d.classid = 'pg_class'::regclass
          AND d.objid = c.oid
          AND d.deptype = 'e'
      )
  ),
  0,
  'no application RLS policy is granted to PUBLIC or anon'
);

SELECT is(
  (
    SELECT count(*)::int
    FROM pg_policy AS p
    JOIN pg_class AS c ON c.oid = p.polrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS d
        WHERE d.classid = 'pg_class'::regclass
          AND d.objid = c.oid
          AND d.deptype = 'e'
      )
      AND (
        (
          p.polcmd IN ('r', 'w', 'd', '*')
          AND (
            p.polqual IS NULL
            OR btrim(pg_get_expr(p.polqual, p.polrelid), '() ') = 'true'
          )
        )
        OR (
          p.polcmd = 'a'
          AND (
            p.polwithcheck IS NULL
            OR btrim(pg_get_expr(p.polwithcheck, p.polrelid), '() ') = 'true'
          )
        )
        OR (
          p.polcmd IN ('w', '*')
          AND p.polwithcheck IS NOT NULL
          AND btrim(pg_get_expr(p.polwithcheck, p.polrelid), '() ') = 'true'
        )
      )
  ),
  0,
  'application policies cannot allow unconditional row access'
);

SELECT * FROM finish();
ROLLBACK;
