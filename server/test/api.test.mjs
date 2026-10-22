import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { LEAD, OPEN_AVAILABILITY, api, createAdmin, pool, query, resetDb, resetRateLimits, startServer } from './helpers.mjs';

let base, server, adminToken;

before(async () => { ({ server, base } = await startServer()); });
after(async () => { server.close(); await pool.end(); });

beforeEach(async () => {
  await resetDb();
  await createAdmin();
  adminToken = (await api(base, 'POST', '/api/admin/login', { username: 'ana', password: 'clave-segura-123' })).body.token;
  await api(base, 'PUT', '/api/admin/settings/availability', { value: OPEN_AVAILABILITY }, adminToken);
  resetRateLimits();
});

const newLead = async (over = {}) => api(base, 'POST', '/api/leads', { ...LEAD, ...over });

describe('embudo público', () => {
  test('health', async () => {
    assert.equal((await api(base, 'GET', '/api/health')).status, 200);
  });

  test('sin disponibilidad configurada no se ofrecen horarios', async () => {
    await query(`DELETE FROM settings WHERE key = 'availability'`);
    const r = await api(base, 'GET', '/api/slots');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.slots, []);
  });

  test('flujo completo: prospecto → horario → reserva → gestión', async () => {
    const lead = await newLead();
    assert.equal(lead.status, 201);
    assert.ok(lead.body.bookingToken);
    const slots = (await api(base, 'GET', '/api/slots')).body.slots;
    assert.ok(slots.length > 10);
    const book = await api(base, 'POST', '/api/bookings', { token: lead.body.bookingToken, start: slots[0].start });
    assert.equal(book.status, 201);
    assert.equal(book.body.booking.start, slots[0].start);
    assert.equal(book.body.booking.name, 'María López');
    // Sin proveedores configurados, nunca se declara un mensaje como enviado.
    assert.deepEqual(book.body.notifications.map((n) => n.status), ['no_configurado', 'no_configurado']);
    assert.ok(book.body.manageUrl.includes('/book-demo/gestionar/#t='));

    // El horario reservado desaparece de la disponibilidad.
    const after = (await api(base, 'GET', '/api/slots')).body.slots.map((s) => s.start);
    assert.ok(!after.includes(slots[0].start));

    // El token de reserva ya no sirve para reservar otra vez.
    const again = await api(base, 'POST', '/api/bookings', { token: lead.body.bookingToken, start: slots[1].start });
    assert.equal(again.status, 401);

    const t = book.body.manageToken;
    const look = await api(base, 'POST', '/api/manage/lookup', { token: t });
    assert.equal(look.status, 200);
    assert.equal(look.body.canChange, true);

    const resch = await api(base, 'POST', '/api/manage/reschedule', { token: t, start: slots[3].start });
    assert.equal(resch.status, 200);
    assert.equal(resch.body.booking.start, slots[3].start);
    // El enlace anterior queda invalidado al reprogramar.
    assert.equal((await api(base, 'POST', '/api/manage/lookup', { token: t })).status, 404);

    const cancel = await api(base, 'POST', '/api/manage/cancel', { token: resch.body.manageToken, reason: 'Viaje' });
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.booking.status, 'cancelada');
    const again2 = await api(base, 'POST', '/api/manage/cancel', { token: resch.body.manageToken });
    assert.equal(again2.status, 409);

    const { rows } = await query('SELECT status FROM leads');
    assert.equal(rows[0].status, 'contactado');
  });

  test('no se puede reservar un horario inventado o fuera de disponibilidad', async () => {
    const lead = await newLead();
    const r = await api(base, 'POST', '/api/bookings', { token: lead.body.bookingToken, start: '2020-01-01T10:00:00.000Z' });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'slot_unavailable');
  });

  test('reservas simultáneas del mismo horario: solo una gana', async () => {
    const leads = await Promise.all([0, 1, 2, 3, 4].map((i) => newLead({ whatsapp: `+5350000${100 + i}`, sessionId: `sess_race_${i}x` })));
    const slot = (await api(base, 'GET', '/api/slots')).body.slots[2].start;
    const results = await Promise.all(leads.map((l) => api(base, 'POST', '/api/bookings', { token: l.body.bookingToken, start: slot })));
    const codes = results.map((r) => r.status).sort();
    assert.deepEqual(codes, [201, 409, 409, 409, 409]);
    const { rows } = await query(`SELECT count(*)::int AS n FROM bookings WHERE starts_at = $1 AND status = 'confirmada'`, [slot]);
    assert.equal(rows[0].n, 1);
  });

  test('validación del servidor y antispam', async () => {
    const bad = await newLead({ whatsapp: 'abc', consent: false });
    assert.equal(bad.status, 422);
    assert.ok(bad.body.fields.whatsapp && bad.body.fields.consent);
    assert.equal((await newLead({ website: 'http://spam' })).status, 400);
    assert.equal((await newLead({ elapsedMs: 200 })).status, 400);
  });

  test('límite de solicitudes por IP', async () => {
    const codes = [];
    for (let i = 0; i < 8; i++) codes.push((await newLead({ whatsapp: `+5351111${100 + i}` })).status);
    assert.deepEqual(codes.slice(0, 6), [201, 201, 201, 201, 201, 201]);
    assert.equal(codes[7], 429);
  });

  test('el mismo WhatsApp no modifica la ficha ni la reserva existentes', async () => {
    const first = await newLead();
    const slot = (await api(base, 'GET', '/api/slots')).body.slots[0].start;
    await api(base, 'POST', '/api/bookings', { token: first.body.bookingToken, start: slot });
    // Otra persona envía el formulario con ese WhatsApp: se crea otra ficha marcada como posible duplicado.
    const other = await newLead({ name: 'Intruso', email: 'otro@example.com', sessionId: 'sess_otro_9999' });
    const slot2 = (await api(base, 'GET', '/api/slots')).body.slots[0].start;
    assert.equal((await api(base, 'POST', '/api/bookings', { token: other.body.bookingToken, start: slot2 })).status, 201);
    const { rows } = await query('SELECT id, name, email FROM leads ORDER BY id');
    assert.deepEqual(rows.map((r) => r.name), ['María López', 'Intruso']);
    assert.equal(rows[0].email, 'maria@example.com');
    const { rows: b } = await query(`SELECT lead_id, starts_at FROM bookings WHERE status = 'confirmada' ORDER BY lead_id`);
    assert.equal(b[0].starts_at.toISOString(), slot);
    const { rows: ev } = await query(`SELECT detail FROM lead_events WHERE kind = 'posible_duplicado'`);
    assert.deepEqual(ev[0].detail.leads, [rows[0].id]);
  });

  test('el mismo visitante corrige sus datos antes de reservar sin duplicar la ficha', async () => {
    await newLead();
    const again = await newLead({ businessName: 'Café La Esquina 2' });
    assert.equal(again.status, 201);
    const { rows } = await query('SELECT business_name FROM leads');
    assert.deepEqual(rows, [{ business_name: 'Café La Esquina 2' }]);
  });

  test('eventos del embudo: solo nombres permitidos', async () => {
    await api(base, 'POST', '/api/events', JSON.stringify({ sid: 'sess_evt_0001', name: 'page_view', path: '/' }), null, { 'Content-Type': 'text/plain' });
    await api(base, 'POST', '/api/events', JSON.stringify({ sid: 'sess_evt_0001', name: 'drop_table' }), null, { 'Content-Type': 'text/plain' });
    const { rows } = await query('SELECT name FROM funnel_events');
    assert.deepEqual(rows.map((r) => r.name), ['page_view']);
  });

  test('CORS solo para orígenes permitidos', async () => {
    const ok = await api(base, 'GET', '/api/health', undefined, null, { Origin: 'https://avatarstark.github.io' });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://avatarstark.github.io');
    const no = await api(base, 'GET', '/api/health', undefined, null, { Origin: 'https://malicioso.example' });
    assert.equal(no.headers.get('access-control-allow-origin'), null);
  });
});

describe('panel administrativo', () => {
  test('rutas protegidas sin sesión o con token falso', async () => {
    assert.equal((await api(base, 'GET', '/api/admin/leads')).status, 401);
    assert.equal((await api(base, 'GET', '/api/admin/metrics', undefined, 'abc.def.ghi')).status, 401);
  });

  test('bloqueo tras intentos fallidos', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await api(base, 'POST', '/api/admin/login', { username: 'ana', password: 'mal' })).status, 401);
    assert.equal((await api(base, 'POST', '/api/admin/login', { username: 'ana', password: 'clave-segura-123' })).status, 423);
  });

  test('cerrar todas las sesiones invalida el token', async () => {
    assert.equal((await api(base, 'POST', '/api/admin/logout-all', {}, adminToken)).status, 204);
    assert.equal((await api(base, 'GET', '/api/admin/me', undefined, adminToken)).status, 401);
  });

  test('rol ventas no puede cambiar la configuración', async () => {
    await createAdmin('luis', 'clave-segura-456', 'ventas');
    const t = (await api(base, 'POST', '/api/admin/login', { username: 'luis', password: 'clave-segura-456' })).body.token;
    assert.equal((await api(base, 'GET', '/api/admin/leads', undefined, t)).status, 200);
    assert.equal((await api(base, 'PUT', '/api/admin/settings/availability', { value: OPEN_AVAILABILITY }, t)).status, 403);
  });

  test('gestión de prospectos, notas, historial y métricas', async () => {
    const l = await newLead();
    const slot = (await api(base, 'GET', '/api/slots')).body.slots[0].start;
    await api(base, 'POST', '/api/bookings', { token: l.body.bookingToken, start: slot, sessionId: LEAD.sessionId });
    await newLead({ whatsapp: '+5352222222', businessName: 'Taller Sur', timeline: 'investigando', employees: 'solo', businessType: 'otro', needs: ['otros'] });

    const list = await api(base, 'GET', '/api/admin/leads?q=esquina', undefined, adminToken);
    assert.equal(list.body.total, 1);
    const id = list.body.leads[0].id;
    assert.equal(list.body.leads[0].status, 'demo_programada');
    assert.equal(list.body.leads[0].priority, 'alta');
    assert.equal((await api(base, 'GET', '/api/admin/leads?priority=baja', undefined, adminToken)).body.total, 1);

    await api(base, 'POST', `/api/admin/leads/${id}/notes`, { body: 'Tiene 2 cajas' }, adminToken);
    const detail = (await api(base, 'GET', `/api/admin/leads/${id}`, undefined, adminToken)).body;
    assert.equal(detail.notes[0].body, 'Tiene 2 cajas');
    const bookingId = detail.bookings[0].id;
    const done = await api(base, 'POST', `/api/admin/bookings/${bookingId}/status`, { status: 'realizada' }, adminToken);
    assert.equal(done.body.lead.status, 'demo_realizada');
    const won = await api(base, 'PATCH', `/api/admin/leads/${id}`, { status: 'cliente' }, adminToken);
    assert.equal(won.body.lead.status, 'cliente');
    assert.ok(won.body.events.some((e) => e.kind === 'estado' && e.detail.to === 'cliente'));

    const m = (await api(base, 'GET', '/api/admin/metrics?days=30', undefined, adminToken)).body;
    assert.equal(m.totals.leads, 2);
    assert.equal(m.totals.with_booking, 1);
    assert.equal(m.totals.formToBooking, 50);
    assert.equal(m.totals.demos_done, 1);
    assert.equal(m.totals.clients, 1);
    assert.equal(m.totals.closeRate, 100);
    assert.equal(m.funnel.find((f) => f.key === 'reserva').sessions, 1);
  });

  test('reglas de puntuación configurables y recálculo', async () => {
    await newLead();
    const rules = (await api(base, 'GET', '/api/admin/settings/scoring', undefined, adminToken)).body.value;
    rules.thresholds = { alta: 250, media: 200 };
    assert.equal((await api(base, 'PUT', '/api/admin/settings/scoring', { value: rules }, adminToken)).status, 200);
    const rec = await api(base, 'POST', '/api/admin/settings/scoring/recalculate', {}, adminToken);
    assert.equal(rec.body.updated, 1);
    assert.equal((await query('SELECT priority FROM leads')).rows[0].priority, 'baja');
  });
});
