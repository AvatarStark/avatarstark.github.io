import { addDays, isValidTimeZone, ymd, zonedParts, zonedToUtc } from './time.js';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export function sanitizeAvailability(input) {
  const errors = [];
  const a = input || {};
  const out = {
    timezone: a.timezone,
    slotMinutes: a.slotMinutes,
    bufferMinutes: a.bufferMinutes,
    minNoticeHours: a.minNoticeHours,
    horizonDays: a.horizonDays,
    weekly: {},
    blockedDates: [],
  };
  if (!isValidTimeZone(a.timezone)) errors.push('Zona horaria no válida');
  if (![15, 20, 30, 45, 60, 90].includes(a.slotMinutes)) errors.push('La duración debe ser 15, 20, 30, 45, 60 o 90 minutos');
  if (!Number.isInteger(a.bufferMinutes) || a.bufferMinutes < 0 || a.bufferMinutes > 60) errors.push('El margen entre demos debe estar entre 0 y 60 minutos');
  if (!Number.isInteger(a.minNoticeHours) || a.minNoticeHours < 0 || a.minNoticeHours > 168) errors.push('La antelación mínima debe estar entre 0 y 168 horas');
  if (!Number.isInteger(a.horizonDays) || a.horizonDays < 1 || a.horizonDays > 90) errors.push('El horizonte debe estar entre 1 y 90 días');
  for (let d = 0; d < 7; d++) {
    const ranges = Array.isArray(a.weekly?.[d]) ? a.weekly[d] : [];
    if (ranges.length > 6) errors.push('Máximo 6 franjas por día');
    const clean = [];
    for (const r of ranges.slice(0, 6)) {
      if (!HHMM.test(r?.start || '') || !HHMM.test(r?.end || '') || toMin(r.end) <= toMin(r.start)) {
        errors.push(`Franja no válida el día ${d}`);
        continue;
      }
      clean.push({ start: r.start, end: r.end });
    }
    clean.sort((x, y) => toMin(x.start) - toMin(y.start));
    for (let i = 1; i < clean.length; i++) {
      if (toMin(clean[i].start) < toMin(clean[i - 1].end)) errors.push(`Franjas solapadas el día ${d}`);
    }
    out.weekly[d] = clean;
  }
  const dates = Array.isArray(a.blockedDates) ? a.blockedDates : [];
  for (const d of dates.slice(0, 200)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out.blockedDates.push(d); else errors.push(`Fecha bloqueada no válida: ${d}`);
  }
  out.blockedDates = [...new Set(out.blockedDates)].sort();
  return { value: out, errors };
}

// Calcula los horarios libres reales: franjas configuradas, menos fechas bloqueadas,
// menos antelación mínima, menos demostraciones confirmadas que se solapen.
export function computeSlots(availability, busy, now = new Date()) {
  const { timezone: tz, slotMinutes, bufferMinutes, minNoticeHours, horizonDays, weekly, blockedDates } = availability;
  const blocked = new Set(blockedDates);
  const earliest = now.getTime() + minNoticeHours * 3600_000;
  const today = zonedParts(now, tz);
  const busyRanges = busy.map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()]);
  const step = slotMinutes + bufferMinutes;
  const slots = [];
  for (let i = 0; i <= horizonDays; i++) {
    const day = addDays(today.year, today.month, today.day, i);
    if (blocked.has(ymd(day))) continue;
    for (const r of weekly[day.weekday] || []) {
      for (let m = toMin(r.start); m + slotMinutes <= toMin(r.end); m += step) {
        const start = zonedToUtc(day.year, day.month, day.day, Math.floor(m / 60), m % 60, tz).getTime();
        const end = start + slotMinutes * 60_000;
        if (start < earliest) continue;
        if (busyRanges.some(([bs, be]) => bs < end + bufferMinutes * 60_000 && be + bufferMinutes * 60_000 > start)) continue;
        slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
      }
    }
  }
  // Un cambio de hora puede producir duplicados; se eliminan.
  return slots.filter((s, i) => i === 0 || s.start !== slots[i - 1].start);
}
