// Se carga en <head> antes de pintar: marca JS activo y asigna la variante A/B sin saltos de diseño.
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const cfg = window.NEXO_CONFIG || {};
  const store = (() => { try { return window.sessionStorage; } catch { return null; } })();
  const get = (k) => { try { return store && store.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { if (store) store.setItem(k, v); } catch { /* sin almacenamiento */ } };
  const variants = {};
  for (const [name, exp] of Object.entries(cfg.experiments || {})) {
    let v = exp.enabled ? get(`nexo_ab_${name}`) : null;
    if (!v || !exp.variants.includes(v)) {
      v = exp.enabled ? exp.variants[Math.floor(Math.random() * exp.variants.length)] : exp.variants[0];
      if (exp.enabled) set(`nexo_ab_${name}`, v);
    }
    variants[name] = v;
    root.setAttribute(`data-ab-${name}`, v);
  }
  window.NEXO_AB = variants;
})();
