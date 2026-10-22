-- Límites por IP compartidos entre instancias (Supabase Edge Functions o varias réplicas).
CREATE TABLE IF NOT EXISTS rate_limits (
  key      text PRIMARY KEY,
  reset_at timestamptz NOT NULL,
  count    integer NOT NULL
);

-- Seguridad por filas: en Supabase la API pública (PostgREST, clave anon) ve el esquema public.
-- Se activa RLS sin políticas en todas las tablas, así anon y authenticated no leen ni escriben nada.
-- Solo el backend, que se conecta con el rol propietario, accede a los datos.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admin_users', 'settings', 'leads', 'bookings', 'lead_events', 'lead_notes',
                           'notifications', 'funnel_events', 'rate_limits', 'schema_migrations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
