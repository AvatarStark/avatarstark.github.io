// Cliente mínimo de la API comercial. La URL base sale de config.js.
(() => {
  const cfg = window.NEXO_CONFIG || {};
  const base = (cfg.apiBase || '').replace(/\/$/, '');

  async function request(method, path, body, token) {
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch {
      const e = new Error('No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
      e.network = true;
      throw e;
    }
    let data = null;
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    if (isJson) { try { data = await res.json(); } catch { data = null; } }
    if (!res.ok || (!isJson && res.status !== 204)) {
      const e = new Error((data && data.error) || 'El servicio de reservas no está disponible en este momento.');
      e.status = res.status;
      e.data = data || {};
      // Sin respuesta JSON de la API (por ejemplo, la web sin backend configurado).
      e.unavailable = !isJson || res.status >= 500;
      throw e;
    }
    return data;
  }

  window.NexoApi = { request, base };
})();
