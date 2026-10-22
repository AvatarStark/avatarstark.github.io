import express from 'express';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { notifyBooking } from '../lib/notify.js';
import { rateLimit } from '../lib/rateLimit.js';
import { scoreLead } from '../lib/scoring.js';
import { getSetting } from '../lib/settings.js';
import { computeSlots } from '../lib/slots.js';
import { hashToken, looksLikeToken, newToken } from '../lib/tokens.js';
import { CONSENT_VERSION, cleanText, cleanUtm, validateLead } from '../lib/validate.js';

export const publicRouter = express.Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const sid = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null);
const variant = (v) => (typeof v === 'string' && /^[a-z0-9_:-]{1,40}$/i.test(v) ? v : null);
const LOCK_BOOKINGS = 7310442; // pg_advisory_xact_lock: serializa la escritura de reservas.

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

async function verifyTurnstile(token, ip) {
  if (!config.turnstileSecret) return true;
  if (typeof token !== 'string' || !token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: config.turnstileSecret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(6000),
    });
    return (await r.json()).success === true;
  } catch {
    return false;
  }
}

async function busyBookings(db, excludeId = null) {
  const { rows } = await db.query(
    `SELECT id, starts_at, ends_at FROM bookings WHERE status = 'confirmada' AND ends_at > now() - interval '1 day' AND ($1::int IS NULL OR id <> $1)`,
    [excludeId],
  );
  return rows;
}

const manageUrl = (token) => `${config.publicSiteUrl}/book-demo/gestionar/#t=${token}`;

const bookingView = (b, lead) => ({
  id: b.id,
  start: new Date(b.starts_at).toISOString(),
  end: new Date(b.ends_at).toISOString(),
  status: b.status,
  timezone: lead.timezone,
  name: lead.name,
  businessName: lead.business_name,
  whatsapp: lead.whatsapp,
  email: lead.email,
});

publicRouter.get('/health', wrap(async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
}));

publicRouter.get('/slots', rateLimit({ name: 'slots', max: 60, windowMs: 60_000 }), wrap(async (_req, res) => {
  const availability = await getSetting('availability');
  const slots = computeSlots(availability, await busyBookings({ query }));
  res.set('Cache-Control', 'no-store');
  res.json({ timezone: availability.timezone, slotMinutes: availability.slotMinutes, slots });
}));

publicRouter.post('/leads', rateLimit({ name: 'leads', max: 6, windowMs: 10 * 60_000 }), wrap(async (req, res) => {
  const b = req.body || {};
  // Antispam: campo trampa invisible y tiempo mínimo para completar el formulario.
  if (b.website) throw new HttpError(400, 'No pudimos procesar la solicitud.');
  if (!Number.isFinite(b.elapsedMs) || b.elapsedMs < 3000) throw new HttpError(400, 'No pudimos procesar la solicitud. Inténtalo de nuevo.');
  if (!(await verifyTurnstile(b.turnstileToken, req.ip))) throw new HttpError(400, 'No pudimos verificar que no eres un robot. Inténtalo de nuevo.');

  const { lead, errors } = validateLead(b);
  if (Object.keys(errors).length) throw new HttpError(422, 'Revisa los datos marcados.', { fields: errors });

  const rules = await getSetting('scoring');
  const token = newToken();
  const session = sid(b.sessionId);

  const result = await tx(async (db) => {
    // Otra sesión nunca modifica una ficha existente: así nadie puede modificar la ficha ni la reserva de otra
    // persona conociendo su WhatsApp. Las coincidencias se marcan para que el equipo las una.
    const { rows: same } = await db.query(
      `SELECT id FROM leads WHERE whatsapp = $1 AND status NOT IN ('cliente','perdido') AND created_at > now() - interval '90 days'
         AND source_session IS DISTINCT FROM $2 ORDER BY created_at DESC LIMIT 5`,
      [lead.whatsapp, session],
    );
    const { score, priority, parts } = scoreLead(lead, rules);
    const values = [lead.name, lead.business_name, lead.whatsapp, lead.email, lead.timezone, lead.country, lead.business_type,
      lead.needs, lead.needs_other, lead.employees, lead.timeline, score, priority, CONSENT_VERSION, hashToken(token), session,
      variant(b.variant), JSON.stringify(cleanUtm(b.utm))];
    // Si el mismo visitante (misma sesión anónima) vuelve atrás y reenvía antes de reservar, se corrige su ficha.
    const { rows: [mine] } = session ? await db.query(
      `SELECT l.id FROM leads l WHERE l.source_session = $1 AND l.created_at > now() - interval '1 day'
         AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.lead_id = l.id) ORDER BY l.created_at DESC LIMIT 1 FOR UPDATE`, [session]) : { rows: [] };
    let row;
    if (mine) {
      ({ rows: [row] } = await db.query(
        `UPDATE leads SET name=$1, business_name=$2, whatsapp=$3, email=$4, timezone=$5, country=$6, business_type=$7, needs=$8,
           needs_other=$9, employees=$10, timeline=$11, score=$12, priority=$13, consent_at=now(), consent_version=$14,
           booking_token_hash=$15, booking_token_exp=now() + interval '24 hours', ab_variant=COALESCE($17, ab_variant),
           utm=COALESCE($18::jsonb, utm), updated_at=now()
         WHERE id=$19 AND source_session=$16 RETURNING *`, [...values, mine.id]));
      await db.query(`INSERT INTO lead_events (lead_id, actor, kind, detail) VALUES ($1,'visitante','formulario_reenviado',$2)`,
        [row.id, JSON.stringify({ score, priority, parts })]);
    } else {
      ({ rows: [row] } = await db.query(
        `INSERT INTO leads (name, business_name, whatsapp, email, timezone, country, business_type, needs, needs_other, employees,
           timeline, score, priority, consent_at, consent_version, booking_token_hash, booking_token_exp, source_session, ab_variant, utm)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14,$15,now() + interval '24 hours',$16,$17,$18::jsonb) RETURNING *`, values));
      await db.query(`INSERT INTO lead_events (lead_id, actor, kind, detail) VALUES ($1,'visitante','creado',$2)`,
        [row.id, JSON.stringify({ score, priority, parts })]);
    }
    if (same.length) {
      await db.query(`INSERT INTO lead_events (lead_id, actor, kind, detail) VALUES ($1,'sistema','posible_duplicado',$2)`,
        [row.id, JSON.stringify({ leads: same.map((r) => r.id) })]);
    }
    if (session) {
      await db.query(`INSERT INTO funnel_events (session_id, name, variant, path) VALUES ($1,'lead_created',$2,'/book-demo/')`, [session, variant(b.variant)]);
    }
    return { row };
  });

  res.status(201).json({ bookingToken: token, name: result.row.name });
}));

async function leadByBookingToken(db, token) {
  if (!looksLikeToken(token)) return null;
  const { rows } = await db.query(
    `SELECT * FROM leads WHERE booking_token_hash = $1 AND booking_token_exp > now() FOR UPDATE`,
    [hashToken(token)],
  );
  return rows[0] || null;
}

// Reserva o reprograma dentro de una transacción serializada y comprueba que el horario sigue libre.
async function placeBooking(db, { lead, start, existing }) {
  await db.query('SELECT pg_advisory_xact_lock($1)', [LOCK_BOOKINGS]);
  const availability = await getSetting('availability', db);
  const slots = computeSlots(availability, await busyBookings(db, existing?.id ?? null));
  const slot = slots.find((s) => s.start === start);
  if (!slot) throw new HttpError(409, 'Ese horario ya no está disponible. Elige otro.', { code: 'slot_unavailable' });
  const token = newToken();
  let booking;
  try {
    if (existing) {
      ({ rows: [booking] } = await db.query(
        `UPDATE bookings SET starts_at=$1, ends_at=$2, manage_token_hash=$3, lead_timezone=$4, reschedule_count=reschedule_count+1, updated_at=now()
         WHERE id=$5 RETURNING *`,
        [slot.start, slot.end, hashToken(token), lead.timezone, existing.id],
      ));
    } else {
      ({ rows: [booking] } = await db.query(
        `INSERT INTO bookings (lead_id, starts_at, ends_at, manage_token_hash, lead_timezone) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [lead.id, slot.start, slot.end, hashToken(token), lead.timezone],
      ));
    }
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'Ese horario se acaba de ocupar. Elige otro.', { code: 'slot_unavailable' });
    throw err;
  }
  return { booking, token };
}

publicRouter.post('/bookings', rateLimit({ name: 'bookings', max: 12, windowMs: 10 * 60_000 }), wrap(async (req, res) => {
  const { token, start, sessionId } = req.body || {};
  if (typeof start !== 'string' || Number.isNaN(Date.parse(start))) throw new HttpError(422, 'Elige un horario.');
  const startIso = new Date(start).toISOString();
  const rules = await getSetting('scoring');

  const { lead, booking, manageToken, purpose } = await tx(async (db) => {
    const lead = await leadByBookingToken(db, token);
    if (!lead) throw new HttpError(401, 'Tu solicitud caducó. Vuelve a completar el formulario.', { code: 'token_expired' });
    const { rows: [existing] } = await db.query(`SELECT * FROM bookings WHERE lead_id=$1 AND status='confirmada' FOR UPDATE`, [lead.id]);
    const { booking, token: manageToken } = await placeBooking(db, { lead, start: startIso, existing });
    const { score, priority } = scoreLead(lead, rules, { booked: true });
    const nextStatus = ['nuevo', 'contactado'].includes(lead.status) ? 'demo_programada' : lead.status;
    await db.query(`UPDATE leads SET score=$1, priority=$2, status=$3, booking_token_hash=NULL, booking_token_exp=NULL, updated_at=now() WHERE id=$4`,
      [score, priority, nextStatus, lead.id]);
    await db.query(`INSERT INTO lead_events (lead_id, actor, kind, detail) VALUES ($1,'visitante',$2,$3)`,
      [lead.id, existing ? 'demo_reprogramada' : 'demo_reservada', JSON.stringify({ start: booking.starts_at, previous: existing?.starts_at ?? null })]);
    if (nextStatus !== lead.status) {
      await db.query(`INSERT INTO lead_events (lead_id, actor, kind, detail) VALUES ($1,'sistema','estado',$2)`,
        [lead.id, JSON.stringify({ from: lead.status, to: nextStatus })]);
    }
    if (sid(sessionId)) {
      await db.query(`INSERT INTO funnel_events (session_id, name, variant, path) VALUES ($1,'booking_created',$2,'/book-demo/')`, [sessionId, lead.ab_variant]);
    }
    return { lead: { ...lead, score, priority }, booking, manageToken, purpose: existing ? 'reprogramada' : 'confirmada' };
  });

  const link = manageUrl(manageToken);
  const notifications = await notifyBooking({ query }, { purpose, lead, booking, manageUrl: link });
  res.status(201).json({ booking: bookingView(booking, lead), manageUrl: link, manageToken, notifications });
}));

async function bookingByManageToken(db, token, lock = false) {
  if (!looksLikeToken(token)) return null;
  const { rows } = await db.query(
    `SELECT b.*, row_to_json(l.*) AS lead FROM bookings b JOIN leads l ON l.id = b.lead_id WHERE b.manage_token_hash = $1 ${lock ? 'FOR UPDATE OF b' : ''}`,
    [hashToken(token)],
  );
  return rows[0] || null;
}

const manageLimiter = rateLimit({ name: 'manage', max: 30, windowMs: 10 * 60_000 });

publicRouter.post('/manage/lookup', manageLimiter, wrap(async (req, res) => {
  const b = await bookingByManageToken({ query }, req.body?.token);
  if (!b) throw new HttpError(404, 'No encontramos esta reserva. Revisa el enlace.');
  res.json({ booking: bookingView(b, b.lead), canChange: b.status === 'confirmada' && new Date(b.starts_at) > new Date() });
}));

function assertChangeable(b) {
  if (!b) throw new HttpError(404, 'No encontramos esta reserva. Revisa el enlace.');
  if (b.status !== 'confirmada') throw new HttpError(409, 'Esta reserva ya no está activa.');
  if (new Date(b.starts_at) <= new Date()) throw new HttpError(409, 'Esta demostración ya empezó o terminó.');
}

publicRouter.post('/manage/cancel', manageLimiter, wrap(async (req, res) => {
  const reason = cleanText(req.body?.reason, 300) || null;
  const { booking, lead } = await tx(async (db) => {
    const b = await bookingByManageToken(db, req.body?.token, true);
    assertChangeable(b);
    const { rows: [booking] } = await db.query(
      `UPDATE bookings SET status='cancelada', cancel_reason=$1, updated_at=now() WHERE id=$2 RETURNING *`, [reason, b.id]);
    await db.query(`INSERT INTO lead_events (lead_id, actor, kind, detail) VALUES ($1,'visitante','demo_cancelada',$2)`,
      [b.lead_id, JSON.stringify({ start: b.starts_at, reason })]);
    if (b.lead.status === 'demo_programada') {
      await db.query(`UPDATE leads SET status='contactado', updated_at=now() WHERE id=$1`, [b.lead_id]);
      await db.query(`INSERT INTO lead_events (lead_id, actor, kind, detail) VALUES ($1,'sistema','estado',$2)`,
        [b.lead_id, JSON.stringify({ from: 'demo_programada', to: 'contactado' })]);
    }
    return { booking, lead: b.lead };
  });
  const notifications = await notifyBooking({ query }, { purpose: 'cancelada', lead, booking, manageUrl: null });
  res.json({ booking: bookingView(booking, lead), notifications });
}));

publicRouter.post('/manage/reschedule', manageLimiter, wrap(async (req, res) => {
  const start = req.body?.start;
  if (typeof start !== 'string' || Number.isNaN(Date.parse(start))) throw new HttpError(422, 'Elige un horario.');
  const { booking, lead, manageToken } = await tx(async (db) => {
    const b = await bookingByManageToken(db, req.body?.token, true);
    assertChangeable(b);
    const { booking, token } = await placeBooking(db, { lead: b.lead, start: new Date(start).toISOString(), existing: b });
    await db.query(`INSERT INTO lead_events (lead_id, actor, kind, detail) VALUES ($1,'visitante','demo_reprogramada',$2)`,
      [b.lead_id, JSON.stringify({ start: booking.starts_at, previous: b.starts_at })]);
    return { booking, lead: b.lead, manageToken: token };
  });
  const link = manageUrl(manageToken);
  const notifications = await notifyBooking({ query }, { purpose: 'reprogramada', lead, booking, manageUrl: link });
  res.json({ booking: bookingView(booking, lead), manageUrl: link, manageToken, notifications });
}));

const EVENT_NAMES = new Set(['page_view', 'cta_click', 'funnel_start', 'step_view', 'step_complete', 'slot_selected', 'booking_conflict', 'tour_view', 'faq_open', 'whatsapp_click']);

publicRouter.post('/events', express.text({ type: '*/*', limit: '2kb' }), rateLimit({ name: 'events', max: 120, windowMs: 60_000 }), wrap(async (req, res) => {
  let e;
  try { e = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(204).end(); }
  const session = sid(e?.sid);
  if (!session || !EVENT_NAMES.has(e?.name)) return res.status(204).end();
  await query(`INSERT INTO funnel_events (session_id, name, step, label, variant, path) VALUES ($1,$2,$3,$4,$5,$6)`, [
    session, e.name, cleanText(e.step, 40) || null, cleanText(e.label, 80) || null, variant(e.variant), cleanText(e.path, 120) || null,
  ]);
  res.status(204).end();
}));

export { HttpError };
