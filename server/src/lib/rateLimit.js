import process from 'node:process';
import { config } from '../config.js';
import { query } from '../db.js';

// Límite de peticiones por IP y ruta. En memoria basta con una sola instancia de Node;
// con varias instancias o en Supabase Edge Functions se guarda en PostgreSQL (RATE_LIMIT_STORE=db).
const buckets = new Map();
// Solo para pruebas automáticas: multiplica los límites (no usar en producción).
const SCALE = Math.max(1, Number(process.env.RATE_LIMIT_SCALE) || 1);

const timer = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000);
// En Node el temporizador no debe mantener vivo el proceso; en Deno setInterval devuelve un número.
if (typeof timer === 'object' && timer.unref) timer.unref();

function hitMemory(id, windowMs) {
  const now = Date.now();
  let b = buckets.get(id);
  if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(id, b); }
  b.count++;
  return { count: b.count, reset: b.reset };
}

async function hitDb(id, windowMs) {
  const { rows: [r] } = await query(
    `INSERT INTO rate_limits (key, reset_at, count) VALUES ($1, now() + make_interval(secs => $2::double precision / 1000), 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < now() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
     RETURNING count, reset_at`,
    [id, windowMs],
  );
  if (Math.random() < 0.02) query('DELETE FROM rate_limits WHERE reset_at < now()').catch(() => {});
  return { count: r.count, reset: new Date(r.reset_at).getTime() };
}

export function rateLimit({ name, max, windowMs, key = (req) => req.ip }) {
  return async (req, res, next) => {
    try {
      const id = `${name}:${key(req)}`;
      const { count, reset } = config.rateLimitStore === 'db' ? await hitDb(id, windowMs) : hitMemory(id, windowMs);
      if (count > max * SCALE) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))));
        return res.status(429).json({ error: 'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const resetRateLimits = async () => {
  buckets.clear();
  if (config.rateLimitStore === 'db') await query('DELETE FROM rate_limits');
};
