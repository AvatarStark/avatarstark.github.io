// Límite de peticiones en memoria por IP y ruta. Suficiente para una sola instancia;
// con varias instancias conviene moverlo a Redis o al proxy.
const buckets = new Map();
// Solo para pruebas automáticas: multiplica los límites (no usar en producción).
const SCALE = Math.max(1, Number(process.env.RATE_LIMIT_SCALE) || 1);

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();

export function rateLimit({ name, max, windowMs, key = (req) => req.ip }) {
  return (req, res, next) => {
    const id = `${name}:${key(req)}`;
    const now = Date.now();
    let b = buckets.get(id);
    if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(id, b); }
    b.count++;
    if (b.count > max * SCALE) {
      res.set('Retry-After', String(Math.ceil((b.reset - now) / 1000)));
      return res.status(429).json({ error: 'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.' });
    }
    next();
  };
}

export const resetRateLimits = () => buckets.clear();
