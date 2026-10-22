import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import { adminRouter } from './routes/admin.js';
import { publicRouter } from './routes/public.js';

// SITE_ROOT permite servir la web cuando el código se ejecuta desde otra carpeta (Edge Function).
const siteRoot = process.env.SITE_ROOT ? path.resolve(process.env.SITE_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Solo se publican las partes de la web; nunca el código del servidor ni archivos ocultos.
const STATIC_DIRS = ['assets', 'book-demo', 'admin', 'privacidad'];
const STATIC_FILES = ['index.html', '404.html', 'robots.txt', 'sitemap.xml'];

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
    if (config.production) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // CORS restringido a los orígenes configurados (la web en GitHub Pages, por ejemplo).
  app.use('/api', (req, res, next) => {
    const origin = req.get('origin');
    if (origin && config.allowedOrigins.includes(origin)) {
      res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS', 'Access-Control-Max-Age': '600' });
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  app.use('/api', express.json({ limit: '20kb' }));
  app.use('/api', publicRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'No encontrado.' }));

  if (config.serveStatic) {
    const turnstile = config.turnstileSecret ? ' https://challenges.cloudflare.com' : '';
    const csp = [
      "default-src 'self'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "object-src 'none'",
      `script-src 'self'${turnstile}`, `frame-src 'self'${turnstile}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
      "font-src 'self'", "connect-src 'self'", "media-src 'self'",
    ].join('; ');
    const opts = { dotfiles: 'deny', index: 'index.html', maxAge: config.production ? '1h' : 0, setHeaders: (res, file) => { if (file.endsWith('.html')) res.set('Content-Security-Policy', csp); } };
    for (const dir of STATIC_DIRS) app.use(`/${dir}`, express.static(path.join(siteRoot, dir), opts));
    for (const file of STATIC_FILES) app.get(`/${file === 'index.html' ? '' : file}`, (_req, res) => { res.set('Content-Security-Policy', csp); res.sendFile(path.join(siteRoot, file)); });
    app.use((_req, res) => { res.set('Content-Security-Policy', csp); res.status(404).sendFile(path.join(siteRoot, '404.html')); });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return res.status(400).json({ error: 'Solicitud no válida.' });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err);
    res.status(500).json({ error: 'Error interno. Inténtalo de nuevo en unos minutos.' });
  });
  return app;
}
