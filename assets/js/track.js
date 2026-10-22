// Analítica propia del embudo: anónima, sin cookies y sin datos personales.
(() => {
  const cfg = window.NEXO_CONFIG || {};
  const optOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  const enabled = cfg.analytics !== false && !optOut;
  let sid = null;
  try {
    sid = sessionStorage.getItem('nexo_sid');
    if (!sid) {
      sid = 's' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem('nexo_sid', sid);
    }
  } catch { sid = null; }
  const ab = window.NEXO_AB || {};
  const variant = Object.entries(ab).map(([k, v]) => `${k}:${v}`).join(',') || null;
  const url = (cfg.apiBase || '') + '/api/events';
  const path = location.pathname.replace(/index\.html$/, '');

  function track(name, data = {}) {
    if (!enabled || !sid) return;
    const body = JSON.stringify({ sid, name, variant, path, ...data });
    try {
      const blob = new Blob([body], { type: 'text/plain' });
      if (!(navigator.sendBeacon && navigator.sendBeacon(url, blob))) {
        fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, keepalive: true }).catch(() => {});
      }
    } catch { /* la analítica nunca debe romper la página */ }
  }

  window.nexoTrack = track;
  window.NEXO_SESSION = sid;
  window.NEXO_VARIANT = variant;
  track('page_view');
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-cta]');
    if (el) track('cta_click', { label: el.dataset.cta });
    const wa = e.target.closest('a[href*="wa.me"]');
    if (wa) track('whatsapp_click', { label: wa.dataset.cta || 'whatsapp' });
  });
})();
