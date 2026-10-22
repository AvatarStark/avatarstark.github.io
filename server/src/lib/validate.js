import { BUSINESS_TYPES, EMPLOYEES, NEEDS, TIMELINES } from './catalog.js';
import { isValidTimeZone } from './time.js';

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export function normalizeWhatsapp(v) {
  if (typeof v !== 'string') return '';
  const digits = v.replace(/[^\d+]/g, '');
  const plain = digits.replace(/^\+/, '').replace(/^00/, '');
  if (!/^\d{8,15}$/.test(plain)) return '';
  return `+${plain}`;
}

export const CONSENT_VERSION = '2026-10-22';

export function validateLead(body) {
  const errors = {};
  const b = body || {};
  const lead = {
    business_type: b.businessType,
    needs: Array.isArray(b.needs) ? [...new Set(b.needs)].filter((n) => typeof n === 'string') : [],
    needs_other: clean(b.needsOther, 200) || null,
    employees: b.employees,
    timeline: b.timeline,
    name: clean(b.name, 80),
    business_name: clean(b.businessName, 120),
    whatsapp: normalizeWhatsapp(b.whatsapp),
    email: clean(b.email, 254).toLowerCase() || null,
    timezone: b.timezone,
    country: clean(b.country, 60) || null,
  };
  if (!Object.hasOwn(BUSINESS_TYPES, lead.business_type)) errors.businessType = 'Elige el tipo de negocio';
  if (!lead.needs.length || lead.needs.some((n) => !Object.hasOwn(NEEDS, n))) errors.needs = 'Elige al menos una opción';
  if (!lead.needs.includes('otros')) lead.needs_other = null;
  if (!Object.hasOwn(EMPLOYEES, lead.employees)) errors.employees = 'Elige una opción';
  if (!Object.hasOwn(TIMELINES, lead.timeline)) errors.timeline = 'Elige una opción';
  if (lead.name.length < 2) errors.name = 'Escribe tu nombre';
  if (lead.business_name.length < 2) errors.businessName = 'Escribe el nombre del negocio';
  if (!lead.whatsapp) errors.whatsapp = 'Escribe un número de WhatsApp válido con código de país';
  if (lead.email && !EMAIL.test(lead.email)) errors.email = 'Revisa el correo electrónico';
  if (!isValidTimeZone(lead.timezone)) errors.timezone = 'Elige tu zona horaria';
  if (b.consent !== true) errors.consent = 'Necesitamos tu permiso para contactarte';
  return { lead, errors };
}

export function cleanUtm(u) {
  if (!u || typeof u !== 'object') return null;
  const out = {};
  for (const k of ['source', 'medium', 'campaign', 'content', 'term']) {
    const v = clean(u[k], 80);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export const cleanText = clean;
