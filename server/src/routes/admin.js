import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { BOOKING_STATUSES, BUSINESS_TYPES, EMPLOYEES, LEAD_STATUSES, NEEDS, TIMELINES } from '../lib/catalog.js';
import { rateLimit } from '../lib/rateLimit.js';
import { sanitizeScoring, scoreLead } from '../lib/scoring.js';
import { getSetting, putSetting } from '../lib/settings.js';
import { sanitizeAvailability } from '../lib/slots.js';
import { cleanText } from '../lib/validate.js';
import { HttpError } from './public.js';

export const adminRouter = express.Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const DUMMY_HASH = bcrypt.hashSync('nexopos-dummy-password', 10);
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

adminRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

adminRouter.post('/login', rateLimit({ name: 'login', max: 10, windowMs: 15 * 60_000 }), wrap(async (req, res) => {
  const username = cleanText(req.body?.username, 60).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password.slice(0, 200) : '';
  const { rows: [user] } = await query('SELECT * FROM admin_users WHERE username = $1', [username]);
  const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    throw new HttpError(423, 'Cuenta bloqueada temporalmente por intentos fallidos. Prueba más tarde.');
  }
  if (!user || !ok || !user.active) {
    if (user) {
      await query(
        `UPDATE admin_users SET failed_logins = failed_logins + 1,
           locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
         WHERE id = $1`,
        [user.id, MAX_FAILED, LOCK_MINUTES],
      );
    }
    throw new HttpError(401, 'Usuario o contraseña incorrectos.');
  }
  await query('UPDATE admin_users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
  const token = jwt.sign({ sub: user.id, tv: user.token_version }, config.jwtSecret, { expiresIn: '8h', algorithm: 'HS256' });
  res.json({ token, user: { username: user.username, displayName: user.display_name, role: user.role } });
}));

// Todas las rutas siguientes exigen una sesión válida.
adminRouter.use(wrap(async (req, _res, next) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  let payload;
  try { payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }); } catch { throw new HttpError(401, 'Sesión no válida o caducada.'); }
  const { rows: [user] } = await query('SELECT id, username, display_name, role, active, token_version FROM admin_users WHERE id = $1', [payload.sub]);
  if (!user || !user.active || user.token_version !== payload.tv) throw new HttpError(401, 'Sesión no válida o caducada.');
  req.admin = user;
  next();
}));

const requireRole = (role) => (req, _res, next) => (req.admin.role === role ? next() : next(new HttpError(403, 'No tienes permiso para esta acción.')));

adminRouter.get('/me', (req, res) => {
  res.json({ user: { username: req.admin.username, displayName: req.admin.display_name, role: req.admin.role } });
});

adminRouter.post('/logout-all', wrap(async (req, res) => {
  await query('UPDATE admin_users SET token_version = token_version + 1 WHERE id = $1', [req.admin.id]);
  res.status(204).end();
}));

adminRouter.get('/catalog', (_req, res) => {
  res.json({ businessTypes: BUSINESS_TYPES, needs: NEEDS, employees: EMPLOYEES, timelines: TIMELINES, leadStatuses: LEAD_STATUSES, bookingStatuses: BOOKING_STATUSES });
});

const pickEnum = (v, obj) => (typeof v === 'string' && Object.hasOwn(obj, v) ? v : null);

adminRouter.get('/leads', wrap(async (req, res) => {
  const q = req.query;
  const where = [];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  const status = pickEnum(q.status, LEAD_STATUSES);
  const priority = ['alta', 'media', 'baja'].includes(q.priority) ? q.priority : null;
  const business = pickEnum(q.business, BUSINESS_TYPES);
  if (status) add('l.status = ?', status);
  if (priority) add('l.priority = ?', priority);
  if (business) add('l.business_type = ?', business);
  const text = cleanText(q.q, 80);
  if (text) add(`(l.name ILIKE ? OR l.business_name ILIKE $${params.length + 1} OR l.whatsapp ILIKE $${params.length + 1} OR coalesce(l.email,'') ILIKE $${params.length + 1})`, `%${text.replace(/[%_\\]/g, '\\$&')}%`);
  const page = Math.max(1, Math.min(1000, parseInt(q.page, 10) || 1));
  const size = 25;
  const sql = `
    SELECT l.id, l.name, l.business_name, l.whatsapp, l.email, l.business_type, l.needs, l.employees, l.timeline,
           l.score, l.priority, l.status, l.created_at, l.updated_at,
           b.starts_at AS next_demo, b.status AS booking_status, count(*) OVER() AS total
    FROM leads l
    LEFT JOIN LATERAL (
      SELECT starts_at, status FROM bookings WHERE lead_id = l.id ORDER BY (status = 'confirmada') DESC, starts_at DESC LIMIT 1
    ) b ON true
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${q.sort === 'score' ? 'l.score DESC, l.created_at DESC' : q.sort === 'demo' ? 'b.starts_at ASC NULLS LAST' : 'l.created_at DESC'}
    LIMIT ${size} OFFSET ${(page - 1) * size}`;
  const { rows } = await query(sql, params);
  res.json({ leads: rows.map(({ total, ...r }) => r), total: Number(rows[0]?.total || 0), page, pageSize: size });
}));

async function loadLead(id) {
  const { rows: [lead] } = await query(
    `SELECT id, name, business_name, whatsapp, email, timezone, country, business_type, needs, needs_other, employees, timeline,
            score, priority, status, consent_at, consent_version, ab_variant, utm, created_at, updated_at FROM leads WHERE id = $1`, [id]);
  if (!lead) throw new HttpError(404, 'Prospecto no encontrado.');
  const [bookings, notes, events, notifications] = await Promise.all([
    query('SELECT id, starts_at, ends_at, status, lead_timezone, cancel_reason, reschedule_count, created_at FROM bookings WHERE lead_id = $1 ORDER BY starts_at DESC', [id]),
    query('SELECT n.id, n.body, n.created_at, a.display_name AS author FROM lead_notes n JOIN admin_users a ON a.id = n.author_id WHERE n.lead_id = $1 ORDER BY n.created_at DESC', [id]),
    query('SELECT e.id, e.actor, e.kind, e.detail, e.created_at, a.display_name AS admin FROM lead_events e LEFT JOIN admin_users a ON a.id = e.actor_id WHERE e.lead_id = $1 ORDER BY e.created_at DESC, e.id DESC LIMIT 200', [id]),
    query('SELECT channel, recipient, purpose, status, error, created_at FROM notifications WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 50', [id]),
  ]);
  const rules = await getSetting('scoring');
  const breakdown = scoreLead(lead, rules, { booked: bookings.rows.some((b) => b.status !== 'cancelada') }).parts;
  return { lead, breakdown, bookings: bookings.rows, notes: notes.rows, events: events.rows, notifications: notifications.rows };
}

const leadId = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'Prospecto no encontrado.');
  return id;
};

adminRouter.get('/leads/:id', wrap(async (req, res) => res.json(await loadLead(leadId(req)))));

adminRouter.patch('/leads/:id', wrap(async (req, res) => {
  const id = leadId(req);
  const status = pickEnum(req.body?.status, LEAD_STATUSES);
  if (!status) throw new HttpError(422, 'Estado no válido.');
  await tx(async (db) => {
    const { rows: [lead] } = await db.query('SELECT status FROM leads WHERE id = $1 FOR UPDATE', [id]);
    if (!lead) throw new HttpError(404, 'Prospecto no encontrado.');
    if (lead.status === status) return;
    await db.query('UPDATE leads SET status = $1, updated_at = now() WHERE id = $2', [status, id]);
    await db.query(`INSERT INTO lead_events (lead_id, actor, actor_id, kind, detail) VALUES ($1,'admin',$2,'estado',$3)`,
      [id, req.admin.id, JSON.stringify({ from: lead.status, to: status })]);
  });
  res.json(await loadLead(id));
}));

adminRouter.post('/leads/:id/notes', wrap(async (req, res) => {
  const id = leadId(req);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 4000) : '';
  if (!body) throw new HttpError(422, 'La nota está vacía.');
  await tx(async (db) => {
    const { rowCount } = await db.query('SELECT 1 FROM leads WHERE id = $1', [id]);
    if (!rowCount) throw new HttpError(404, 'Prospecto no encontrado.');
    await db.query('INSERT INTO lead_notes (lead_id, author_id, body) VALUES ($1,$2,$3)', [id, req.admin.id, body]);
    await db.query(`INSERT INTO lead_events (lead_id, actor, actor_id, kind) VALUES ($1,'admin',$2,'nota')`, [id, req.admin.id]);
  });
  res.status(201).json(await loadLead(id));
}));

adminRouter.post('/bookings/:id/status', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const status = pickEnum(req.body?.status, BOOKING_STATUSES);
  if (!Number.isInteger(id) || !status || status === 'confirmada') throw new HttpError(422, 'Estado no válido.');
  const lead = await tx(async (db) => {
    const { rows: [b] } = await db.query('SELECT b.*, l.status AS lead_status FROM bookings b JOIN leads l ON l.id = b.lead_id WHERE b.id = $1 FOR UPDATE OF b', [id]);
    if (!b) throw new HttpError(404, 'Reserva no encontrada.');
    if (b.status !== 'confirmada') throw new HttpError(409, 'Solo se pueden cambiar reservas confirmadas.');
    await db.query('UPDATE bookings SET status = $1, updated_at = now() WHERE id = $2', [status, id]);
    await db.query(`INSERT INTO lead_events (lead_id, actor, actor_id, kind, detail) VALUES ($1,'admin',$2,'reserva',$3)`,
      [b.lead_id, req.admin.id, JSON.stringify({ booking: id, to: status, start: b.starts_at })]);
    const next = status === 'realizada' && ['nuevo', 'contactado', 'demo_programada'].includes(b.lead_status) ? 'demo_realizada'
      : status !== 'realizada' && b.lead_status === 'demo_programada' ? 'contactado' : null;
    if (next) {
      await db.query('UPDATE leads SET status = $1, updated_at = now() WHERE id = $2', [next, b.lead_id]);
      await db.query(`INSERT INTO lead_events (lead_id, actor, actor_id, kind, detail) VALUES ($1,'admin',$2,'estado',$3)`,
        [b.lead_id, req.admin.id, JSON.stringify({ from: b.lead_status, to: next })]);
    }
    return b.lead_id;
  });
  res.json(await loadLead(lead));
}));

adminRouter.get('/bookings', wrap(async (req, res) => {
  const past = req.query.range === 'past';
  const { rows } = await query(
    `SELECT b.id, b.starts_at, b.ends_at, b.status, b.lead_timezone, l.id AS lead_id, l.name, l.business_name, l.whatsapp, l.priority, l.score, l.business_type
     FROM bookings b JOIN leads l ON l.id = b.lead_id
     WHERE ${past ? "b.starts_at < now()" : "b.starts_at >= now() - interval '2 hours' AND b.status = 'confirmada'"}
     ORDER BY b.starts_at ${past ? 'DESC' : 'ASC'} LIMIT 200`);
  res.json({ bookings: rows });
}));

const FUNNEL = [
  ['landing', `name = 'page_view' AND path = '/'`],
  ['cta', `name = 'cta_click'`],
  ['inicio', `name = 'funnel_start'`],
  ['negocio', `name = 'step_complete' AND step = 'negocio'`],
  ['necesidades', `name = 'step_complete' AND step = 'necesidades'`],
  ['equipo', `name = 'step_complete' AND step = 'equipo'`],
  ['plazo', `name = 'step_complete' AND step = 'plazo'`],
  ['contacto', `name = 'lead_created'`],
  ['reserva', `name = 'booking_created'`],
];

adminRouter.get('/metrics', wrap(async (req, res) => {
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const since = `now() - make_interval(days => ${days})`;
  const [{ rows: [totals] }, { rows: byPriority }, { rows: byBusiness }, { rows: byStatus }, { rows: funnelRows }, { rows: variants }, { rows: [upcoming] }] = await Promise.all([
    query(`
      SELECT count(*)::int AS leads,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM bookings b WHERE b.lead_id = l.id))::int AS with_booking,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM bookings b WHERE b.lead_id = l.id AND b.status = 'realizada'))::int AS demos_done,
             count(*) FILTER (WHERE l.status = 'cliente')::int AS clients,
             count(*) FILTER (WHERE l.status = 'cliente' AND EXISTS (SELECT 1 FROM bookings b WHERE b.lead_id = l.id AND b.status = 'realizada'))::int AS clients_after_demo,
             count(*) FILTER (WHERE l.status = 'perdido')::int AS lost
      FROM leads l WHERE l.created_at >= ${since}`),
    query(`SELECT priority AS key, count(*)::int AS n FROM leads WHERE created_at >= ${since} GROUP BY 1`),
    query(`SELECT business_type AS key, count(*)::int AS n FROM leads WHERE created_at >= ${since} GROUP BY 1 ORDER BY 2 DESC`),
    query(`SELECT status AS key, count(*)::int AS n FROM leads WHERE created_at >= ${since} GROUP BY 1`),
    query(`SELECT ${FUNNEL.map(([k, cond]) => `count(DISTINCT session_id) FILTER (WHERE ${cond})::int AS "${k}"`).join(', ')}
           FROM funnel_events WHERE created_at >= ${since}`),
    query(`SELECT variant,
             count(DISTINCT session_id) FILTER (WHERE name = 'page_view' AND path = '/')::int AS visits,
             count(DISTINCT session_id) FILTER (WHERE name = 'funnel_start')::int AS starts,
             count(DISTINCT session_id) FILTER (WHERE name = 'lead_created')::int AS leads,
             count(DISTINCT session_id) FILTER (WHERE name = 'booking_created')::int AS bookings
           FROM funnel_events WHERE created_at >= ${since} AND variant IS NOT NULL GROUP BY variant ORDER BY variant`),
    query(`SELECT count(*)::int AS n FROM bookings WHERE status = 'confirmada' AND starts_at >= now()`),
  ]);
  const rate = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  res.json({
    days,
    totals: {
      ...totals,
      upcoming: upcoming.n,
      formToBooking: rate(totals.with_booking, totals.leads),
      closeRate: rate(totals.clients_after_demo, totals.demos_done),
    },
    byPriority, byBusiness, byStatus,
    funnel: FUNNEL.map(([k]) => ({ key: k, sessions: funnelRows[0][k] })),
    variants,
  });
}));

adminRouter.get('/settings/:key(availability|scoring)', wrap(async (req, res) => res.json({ value: await getSetting(req.params.key) })));

adminRouter.put('/settings/:key(availability|scoring)', requireRole('admin'), wrap(async (req, res) => {
  const key = req.params.key;
  const { value, errors } = key === 'availability' ? sanitizeAvailability(req.body?.value) : sanitizeScoring(req.body?.value);
  if (errors.length) throw new HttpError(422, errors[0], { errors });
  await putSetting(key, value, req.admin.id);
  res.json({ value });
}));

// Recalcula la puntuación de todos los prospectos abiertos con las reglas actuales.
adminRouter.post('/settings/scoring/recalculate', requireRole('admin'), wrap(async (_req, res) => {
  const rules = await getSetting('scoring');
  const updated = await tx(async (db) => {
    const { rows } = await db.query(`
      SELECT l.*, EXISTS (SELECT 1 FROM bookings b WHERE b.lead_id = l.id AND b.status <> 'cancelada') AS booked
      FROM leads l WHERE l.status NOT IN ('cliente','perdido') FOR UPDATE OF l`);
    let n = 0;
    for (const l of rows) {
      const { score, priority } = scoreLead(l, rules, { booked: l.booked });
      if (score !== l.score || priority !== l.priority) {
        await db.query('UPDATE leads SET score = $1, priority = $2 WHERE id = $3', [score, priority, l.id]);
        n++;
      }
    }
    return n;
  });
  res.json({ updated });
}));
