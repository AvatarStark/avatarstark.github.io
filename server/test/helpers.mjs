// Entorno de pruebas: base PostgreSQL desechable (TEST_DATABASE_URL), nunca una base real.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://nexo_web:devpass@localhost:5432/nexo_web_test';
process.env.ADMIN_JWT_SECRET = 'x'.repeat(48);
process.env.PUBLIC_SITE_URL = 'http://localhost:8787';
process.env.ALLOWED_ORIGINS = 'https://avatarstark.github.io';

const { pool, migrate, query } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { resetRateLimits } = await import('../src/lib/rateLimit.js');
const bcrypt = (await import('bcryptjs')).default;

export { pool, query, resetRateLimits };

export async function resetDb() {
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(() => {});
  await resetRateLimits();
}

export async function startServer() {
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}

export async function api(base, method, path, body, token, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

export async function createAdmin(username = 'ana', password = 'clave-segura-123', role = 'admin') {
  await query('INSERT INTO admin_users (username, display_name, password_hash, role) VALUES ($1,$2,$3,$4)', [username, 'Ana', await bcrypt.hash(password, 4), role]);
}

// Lunes a domingo de 00:00 a 23:30: siempre hay horarios disponibles para las pruebas.
export const OPEN_AVAILABILITY = {
  timezone: 'America/Havana', slotMinutes: 30, bufferMinutes: 0, minNoticeHours: 1, horizonDays: 7,
  weekly: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, [{ start: '00:00', end: '23:30' }]])),
  blockedDates: [],
};

export const LEAD = {
  businessType: 'cafeteria', needs: ['inventario', 'ventas'], employees: '2-5', timeline: 'inmediato',
  name: 'María López', businessName: 'Café La Esquina', whatsapp: '+53 5 123 4567', email: 'maria@example.com',
  timezone: 'America/Havana', country: 'Cuba', consent: true, elapsedMs: 9000, sessionId: 'sess_test_0001',
};
