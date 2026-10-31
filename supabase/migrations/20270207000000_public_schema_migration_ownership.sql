-- Mark the application schema as managed by the repository migration history.
-- This metadata-only change is safe on a fresh staging database.
COMMENT ON SCHEMA public IS 'ERP4 Pesantren schema managed by versioned Supabase migrations.';
