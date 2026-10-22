import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeSlots, sanitizeAvailability } from '../src/lib/slots.js';
import { DEFAULT_SCORING, sanitizeScoring, scoreLead } from '../src/lib/scoring.js';
import { zonedToUtc } from '../src/lib/time.js';
import { normalizeWhatsapp, validateLead } from '../src/lib/validate.js';

test('zonedToUtc respeta la zona y el horario de verano', () => {
  assert.equal(zonedToUtc(2026, 1, 15, 9, 0, 'America/Havana').toISOString(), '2026-01-15T14:00:00.000Z');
  assert.equal(zonedToUtc(2026, 7, 15, 9, 0, 'America/Havana').toISOString(), '2026-07-15T13:00:00.000Z');
  assert.equal(zonedToUtc(2026, 7, 15, 9, 0, 'Europe/Madrid').toISOString(), '2026-07-15T07:00:00.000Z');
});

test('sin franjas configuradas no hay horarios', () => {
  const a = sanitizeAvailability({ timezone: 'America/Havana', slotMinutes: 30, bufferMinutes: 0, minNoticeHours: 0, horizonDays: 14, weekly: {}, blockedDates: [] }).value;
  assert.deepEqual(computeSlots(a, []), []);
});

test('los horarios excluyen reservas, fechas bloqueadas y antelación mínima', () => {
  const now = new Date('2026-10-19T12:00:00Z'); // lunes 08:00 en La Habana
  const a = sanitizeAvailability({
    timezone: 'America/Havana', slotMinutes: 30, bufferMinutes: 0, minNoticeHours: 2, horizonDays: 2,
    weekly: { 1: [{ start: '09:00', end: '11:00' }], 2: [{ start: '09:00', end: '10:00' }], 3: [{ start: '09:00', end: '10:00' }] },
    blockedDates: ['2026-10-21'],
  }).value;
  const busy = [{ starts_at: '2026-10-19T14:30:00Z', ends_at: '2026-10-19T15:00:00Z' }];
  const slots = computeSlots(a, busy, now).map((s) => s.start);
  // lunes: 09:00 queda antes de la antelación de 2 h; 10:30 reservado → 10:00 y 10:30 (10:30 ocupado) → 10:00, 10:30 fuera
  assert.deepEqual(slots, ['2026-10-19T14:00:00.000Z', '2026-10-20T13:00:00.000Z', '2026-10-20T13:30:00.000Z']);
});

test('validación de franjas solapadas y zona horaria', () => {
  const { errors } = sanitizeAvailability({ timezone: 'Marte/Base', slotMinutes: 31, bufferMinutes: 0, minNoticeHours: 0, horizonDays: 5, weekly: { 1: [{ start: '09:00', end: '12:00' }, { start: '11:00', end: '13:00' }] } });
  assert.ok(errors.some((e) => e.includes('Zona')));
  assert.ok(errors.some((e) => e.includes('duración')));
  assert.ok(errors.some((e) => e.includes('solapadas')));
});

test('puntuación y prioridad', () => {
  const lead = { business_type: 'cafeteria', needs: ['inventario', 'ventas', 'ganancias'], employees: '6-15', timeline: 'inmediato' };
  const r = scoreLead(lead, DEFAULT_SCORING);
  assert.equal(r.score, 25 + 25 + 20 + 30);
  assert.equal(r.priority, 'alta');
  const low = scoreLead({ business_type: 'otro', needs: ['otros'], employees: 'solo', timeline: 'investigando' }, DEFAULT_SCORING);
  assert.equal(low.priority, 'baja');
  assert.equal(scoreLead({ ...lead, timeline: 'investigando', employees: 'solo' }, DEFAULT_SCORING, { booked: true }).priority, 'media');
});

test('sanitizeScoring rechaza umbrales incoherentes', () => {
  const bad = structuredClone(DEFAULT_SCORING);
  bad.thresholds = { alta: 30, media: 50 };
  assert.ok(sanitizeScoring(bad).errors.length);
  assert.deepEqual(sanitizeScoring(DEFAULT_SCORING).errors, []);
});

test('validación de prospectos', () => {
  assert.equal(normalizeWhatsapp('+53 5 123-4567'), '+5351234567');
  assert.equal(normalizeWhatsapp('0034 600 000 000'), '+34600000000');
  assert.equal(normalizeWhatsapp('123'), '');
  const { errors } = validateLead({ businessType: 'nave', needs: [], employees: 'x', timeline: 'y', name: 'A', businessName: '', whatsapp: '1', email: 'no', timezone: 'Nada', consent: false });
  assert.deepEqual(Object.keys(errors).sort(), ['businessName', 'businessType', 'consent', 'email', 'employees', 'name', 'needs', 'timeline', 'timezone', 'whatsapp']);
});
