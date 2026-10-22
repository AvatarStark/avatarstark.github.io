import process from 'node:process';

const env = process.env;
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  port: Number(env.PORT || 8787),
  production: env.NODE_ENV === 'production',
  // Número de proxies delante, o 'true' para confiar en X-Forwarded-For (Supabase Edge Functions).
  trustProxy: env.TRUST_PROXY === 'true' ? true : Number(env.TRUST_PROXY || 0),
  allowedOrigins: list(env.ALLOWED_ORIGINS),
  publicSiteUrl: (env.PUBLIC_SITE_URL || 'http://localhost:8787').replace(/\/$/, ''),
  serveStatic: env.SERVE_STATIC === '1',
  // En Supabase Edge Functions la conexión llega en SUPABASE_DB_URL.
  databaseUrl: env.DATABASE_URL || env.SUPABASE_DB_URL,
  databaseSsl: env.DATABASE_SSL === '1' || (!env.DATABASE_URL && !!env.SUPABASE_DB_URL),
  // 'db' guarda los límites por IP en PostgreSQL (necesario con varias instancias o Edge Functions).
  rateLimitStore: env.RATE_LIMIT_STORE === 'db' || (!env.DATABASE_URL && !!env.SUPABASE_DB_URL) ? 'db' : 'memory',
  jwtSecret: env.ADMIN_JWT_SECRET || '',
  turnstileSecret: env.TURNSTILE_SECRET || '',
  resendKey: env.RESEND_API_KEY || '',
  emailFrom: env.EMAIL_FROM || '',
  salesEmail: env.SALES_NOTIFY_EMAIL || '',
  whatsappToken: env.WHATSAPP_TOKEN || '',
  whatsappPhoneId: env.WHATSAPP_PHONE_NUMBER_ID || '',
  whatsappTemplate: env.WHATSAPP_TEMPLATE_NAME || '',
  whatsappLang: env.WHATSAPP_TEMPLATE_LANG || 'es',
};

export function assertConfig() {
  const problems = [];
  if (!config.databaseUrl) problems.push('DATABASE_URL no está definida.');
  if (config.jwtSecret.length < 32) problems.push('ADMIN_JWT_SECRET debe tener al menos 32 caracteres.');
  if (config.production && !config.allowedOrigins.length && !config.serveStatic) {
    problems.push('ALLOWED_ORIGINS es obligatorio en producción cuando la web se sirve desde otro dominio.');
  }
  if (problems.length) {
    throw new Error(`Configuración incompleta:\n- ${problems.join('\n- ')}`);
  }
}
