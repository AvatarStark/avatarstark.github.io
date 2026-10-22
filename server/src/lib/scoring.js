import { BUSINESS_TYPES, EMPLOYEES, NEEDS, TIMELINES } from './catalog.js';

// Reglas por defecto. El administrador puede cambiarlas desde el panel; se guardan en settings.scoring.
// La puntuación orienta al equipo comercial: nunca impide reservar.
export const DEFAULT_SCORING = {
  businessType: { cafeteria: 25, tienda: 25, fregadora: 25, otro: 5 },
  needs: { inventario: 10, ventas: 10, ganancias: 10, administracion: 8, reportes: 6, otros: 2 },
  needsCap: 25,
  employees: { solo: 5, '2-5': 15, '6-15': 20, '15+': 20 },
  timeline: { inmediato: 30, este_mes: 22, tres_meses: 10, investigando: 0 },
  emailBonus: 0,
  bookingBonus: 10,
  thresholds: { alta: 70, media: 40 },
};

const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// Valida y normaliza una configuración enviada desde el panel.
export function sanitizeScoring(input) {
  const errors = [];
  const out = {};
  const group = (name, keys) => {
    const src = input?.[name];
    out[name] = {};
    for (const key of Object.keys(keys)) {
      const v = src?.[key];
      if (!int(v, -100, 100)) errors.push(`${name}.${key} debe ser un entero entre -100 y 100`);
      out[name][key] = v;
    }
  };
  group('businessType', BUSINESS_TYPES);
  group('needs', NEEDS);
  group('employees', EMPLOYEES);
  group('timeline', TIMELINES);
  for (const k of ['needsCap', 'emailBonus', 'bookingBonus']) {
    if (!int(input?.[k], 0, 100)) errors.push(`${k} debe ser un entero entre 0 y 100`);
    out[k] = input?.[k];
  }
  const t = input?.thresholds;
  if (!int(t?.alta, 1, 300) || !int(t?.media, 0, 300) || t.media >= t.alta) {
    errors.push('Los umbrales deben ser enteros y el de prioridad media menor que el de alta');
  }
  out.thresholds = { alta: t?.alta, media: t?.media };
  return { value: out, errors };
}

export function scoreLead(lead, rules = DEFAULT_SCORING, { booked = false } = {}) {
  const parts = [];
  const add = (label, points) => { if (points) parts.push({ label, points }); };
  add(`Negocio: ${BUSINESS_TYPES[lead.business_type] || lead.business_type}`, rules.businessType[lead.business_type] || 0);
  const needs = (lead.needs || []).reduce((sum, n) => sum + (rules.needs[n] || 0), 0);
  add('Necesidades', Math.min(needs, rules.needsCap));
  add(`Equipo: ${EMPLOYEES[lead.employees] || lead.employees}`, rules.employees[lead.employees] || 0);
  add(`Plazo: ${TIMELINES[lead.timeline] || lead.timeline}`, rules.timeline[lead.timeline] || 0);
  if (lead.email) add('Dejó correo', rules.emailBonus);
  if (booked) add('Reservó demostración', rules.bookingBonus);
  const score = parts.reduce((s, p) => s + p.points, 0);
  const priority = score >= rules.thresholds.alta ? 'alta' : score >= rules.thresholds.media ? 'media' : 'baja';
  return { score, priority, parts };
}
