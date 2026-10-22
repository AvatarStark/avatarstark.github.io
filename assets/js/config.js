// Configuración pública de la web. No poner aquí claves privadas: este archivo lo ve cualquiera.
window.NEXO_CONFIG = {
  // URL del backend (carpeta server/). Vacío = mismo dominio que la web.
  // Ejemplo tras desplegarlo: 'https://api.tu-dominio.com'
  apiBase: '',
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
