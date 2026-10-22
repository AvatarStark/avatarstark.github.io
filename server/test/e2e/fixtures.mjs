import { test as base, expect } from '@playwright/test';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const DB = process.env.TEST_DATABASE_URL || 'postgres://nexo_web:devpass@localhost:5432/nexo_web_test';
export const ADMIN = { username: 'equipo', password: 'clave-de-prueba-123' };

export async function sql(text, params) {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

export async function resetData({ hours = true } = {}) {
  await sql('TRUNCATE notifications, lead_notes, lead_events, bookings, leads, funnel_events, settings, admin_users RESTART IDENTITY CASCADE');
  await sql(`INSERT INTO admin_users (username, display_name, password_hash, role) VALUES ($1, 'Equipo NexoPOS', $2, 'admin')`, [ADMIN.username, await bcrypt.hash(ADMIN.password, 4)]);
  if (hours) {
    const weekly = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, [{ start: '08:00', end: '20:00' }]]));
    await sql(`INSERT INTO settings (key, value) VALUES ('availability', $1)`, [JSON.stringify({ timezone: 'America/Havana', slotMinutes: 30, bufferMinutes: 0, minNoticeHours: 1, horizonDays: 10, weekly, blockedDates: [] })]);
  }
}

// Recoge errores de consola y de página para que cada prueba falle si aparecen.
export const test = base.extend({
  consoleErrors: async ({ page }, use) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of (4\d\d|503)/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await use(errors);
  },
});
export { expect };

export async function noHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'sin desbordamiento horizontal').toBeLessThanOrEqual(0);
}

// Completa las preguntas 1-5 del embudo con el ratón.
export async function fillFunnel(page, { whatsapp = '+53 5 123 4567', name = 'María López', business = 'Café La Esquina', email = 'maria@example.com' } = {}) {
  await page.goto('/book-demo/');
  await page.getByText('Cafetería, restaurante o bar').click();
  await expect(page.getByRole('heading', { name: '¿Qué necesitas mejorar?' })).toBeVisible();
  await page.getByText('Control de inventario').click();
  await page.getByText('Control de ganancias').click();
  await page.getByRole('button', { name: /Continuar/ }).click();
  await page.getByText('2 a 5').click();
  await page.getByText('Inmediatamente').click();
  await expect(page.getByRole('heading', { name: '¿Dónde te contactamos?' })).toBeVisible();
  await page.getByLabel('Tu nombre').fill(name);
  await page.getByLabel('Nombre del negocio').fill(business);
  await page.getByLabel('WhatsApp', { exact: true }).fill(whatsapp);
  if (email) await page.getByLabel(/Correo electrónico/).fill(email);
  await page.getByLabel('País o zona horaria').selectOption('America/Havana');
  await page.getByRole('checkbox', { name: /Acepto que NexoPOS/ }).check();
  // El servidor exige un tiempo mínimo de cumplimentación (antispam).
  await page.waitForTimeout(3100);
  await page.getByRole('button', { name: /Ver horarios disponibles/ }).click();
  await expect(page.getByRole('heading', { name: 'Elige día y hora' })).toBeVisible();
}
