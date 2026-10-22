-- Backend comercial de la web de NexoPOS (prospectos y demostraciones).
-- No forma parte del producto NexoPOS ni de su base local.

CREATE TABLE admin_users (
  id            serial PRIMARY KEY,
  username      text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'ventas' CHECK (role IN ('admin', 'ventas')),
  token_version integer NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by integer REFERENCES admin_users(id)
);

CREATE TABLE leads (
  id                 serial PRIMARY KEY,
  name               text NOT NULL,
  business_name      text NOT NULL,
  whatsapp           text NOT NULL,
  email              text,
  timezone           text NOT NULL,
  country            text,
  business_type      text NOT NULL,
  needs              text[] NOT NULL DEFAULT '{}',
  needs_other        text,
  employees          text NOT NULL,
  timeline           text NOT NULL,
  score              integer NOT NULL DEFAULT 0,
  priority           text NOT NULL CHECK (priority IN ('alta', 'media', 'baja')),
  status             text NOT NULL DEFAULT 'nuevo'
                     CHECK (status IN ('nuevo', 'contactado', 'demo_programada', 'demo_realizada', 'negociacion', 'cliente', 'perdido')),
  consent_at         timestamptz NOT NULL,
  consent_version    text NOT NULL,
  booking_token_hash text,
  booking_token_exp  timestamptz,
  source_session     text,
  ab_variant         text,
  utm                jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_created_idx ON leads (created_at DESC);
CREATE INDEX leads_whatsapp_idx ON leads (whatsapp);
CREATE UNIQUE INDEX leads_booking_token_idx ON leads (booking_token_hash) WHERE booking_token_hash IS NOT NULL;

CREATE TABLE bookings (
  id                serial PRIMARY KEY,
  lead_id           integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'confirmada'
                    CHECK (status IN ('confirmada', 'cancelada', 'realizada', 'no_asistio')),
  manage_token_hash text NOT NULL UNIQUE,
  lead_timezone     text NOT NULL,
  cancel_reason     text,
  reschedule_count  integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
-- Un mismo horario no puede tener dos demostraciones confirmadas, aunque lleguen a la vez.
CREATE UNIQUE INDEX bookings_slot_unique ON bookings (starts_at) WHERE status = 'confirmada';
-- Cada prospecto tiene como mucho una demostración confirmada.
CREATE UNIQUE INDEX bookings_lead_unique ON bookings (lead_id) WHERE status = 'confirmada';
CREATE INDEX bookings_starts_idx ON bookings (starts_at);

CREATE TABLE lead_events (
  id         bigserial PRIMARY KEY,
  lead_id    integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  actor_id   integer REFERENCES admin_users(id),
  actor      text NOT NULL,
  kind       text NOT NULL,
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_events_lead_idx ON lead_events (lead_id, created_at DESC);

CREATE TABLE lead_notes (
  id         serial PRIMARY KEY,
  lead_id    integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_id  integer NOT NULL REFERENCES admin_users(id),
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id                  serial PRIMARY KEY,
  booking_id          integer REFERENCES bookings(id) ON DELETE CASCADE,
  lead_id             integer REFERENCES leads(id) ON DELETE CASCADE,
  channel             text NOT NULL,
  recipient           text NOT NULL,
  purpose             text NOT NULL,
  status              text NOT NULL CHECK (status IN ('enviado', 'no_configurado', 'fallido', 'sin_destinatario')),
  provider            text,
  provider_message_id text,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Analítica propia y anónima del embudo (sin cookies ni datos personales).
CREATE TABLE funnel_events (
  id         bigserial PRIMARY KEY,
  session_id text NOT NULL,
  name       text NOT NULL,
  step       text,
  label      text,
  variant    text,
  path       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX funnel_events_created_idx ON funnel_events (created_at);
CREATE INDEX funnel_events_name_idx ON funnel_events (name, created_at);
