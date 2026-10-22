// Configuración pública de la web. No poner aquí claves privadas: este archivo lo ve cualquiera.
window.NEXO_CONFIG = {
  // URL del backend. En la web publicada es la Edge Function de Supabase; en local (o si el
  // servidor Node sirve también la web) se usa el mismo dominio.
  apiBase: location.hostname === 'avatarstark.github.io' ? 'https://svrvfhspdcgkdrmxizku.supabase.co/functions/v1' : '',
  // WhatsApp comercial, solo dígitos con código de país.
  whatsapp: '5363715593',
  // Video de demostración (MP4/WebM en assets/video/ o URL). Vacío = recorrido con capturas reales.
  demoVideoUrl: '',
  // Clave pública de Cloudflare Turnstile (opcional, va junto a TURNSTILE_SECRET en el servidor).
  turnstileSiteKey: '',
  // Analítica propia y anónima del embudo. Respeta "Do Not Track" y Global Privacy Control.
  analytics: true,
  // Pruebas A/B: cada visitante ve una variante durante su sesión. enabled:false muestra siempre la primera.
  experiments: {
    hero: { enabled: true, variants: ['a', 'b'] },
  },
};
