import { query } from '../db.js';
import { DEFAULT_SCORING } from './scoring.js';

// Disponibilidad por defecto: vacía. No se ofrecen horarios hasta que el administrador los define.
export const DEFAULT_AVAILABILITY = {
  timezone: 'America/Havana',
  slotMinutes: 30,
  bufferMinutes: 0,
  minNoticeHours: 3,
  horizonDays: 21,
  weekly: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
  blockedDates: [],
};

const DEFAULTS = { scoring: DEFAULT_SCORING, availability: DEFAULT_AVAILABILITY };

export async function getSetting(key, db = { query }) {
  const { rows } = await db.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? structuredClone(DEFAULTS[key]);
}

export async function putSetting(key, value, adminId, db = { query }) {
  await db.query(
    `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), adminId],
  );
}
