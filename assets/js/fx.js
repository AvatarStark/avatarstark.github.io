// Efectos visuales compartidos: esqueletos de carga, microinteracciones, animaciones de scroll,
// tarjetas que reaccionan al puntero e indicadores de progreso. Todo respeta "reducir movimiento"
// y solo usa transform/opacity para no provocar saltos de diseño.
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const raf = (fn) => { let queued = false; return (...a) => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; fn(...a); }); }; };

  // ---------- 1. Esqueletos de carga en imágenes ----------
  // Mientras una captura descarga se ve un brillo animado en su hueco (el tamaño ya está reservado).
  function skeleton(img) {
    if (img.complete && img.naturalWidth) return;
    img.classList.add('sk');
    const done = () => {
      img.classList.remove('sk');
      if (!img.hasAttribute('fetchpriority') && !reduced) img.classList.add('sk-in');
    };
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', () => img.classList.remove('sk'), { once: true });
  }
  document.querySelectorAll('main img').forEach(skeleton);
  window.NexoFx = { skeleton };

  // ---------- 2. Microinteracciones: onda al pulsar ----------
  // Botones: la onda nace en el pointerdown. Opciones y chips del formulario son <label>: insertar
  // nodos durante su pointerdown hace que el navegador pierda ese primer clic, así que ahí nace en el click.
  const RIPPLE = '.btn, .tab, .tour-tab, .cal-time, .cal-day, .player-btn, .fback, .adm-seg button, .adm-nav a';
  const LABEL_RIPPLE = '.opt, .chip';
  function ripple(host, x, y) {
    if (!host || host.disabled || reduced) return;
    const target = host.matches('.chip') ? host.querySelector(':scope > span') : host;
    const r = target.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const px = x == null ? r.width / 2 : x - r.left;
    const py = y == null ? r.height / 2 : y - r.top;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.cssText = `width:${size}px;height:${size}px;left:${px - size / 2}px;top:${py - size / 2}px`;
    target.append(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
  }
  document.addEventListener('pointerdown', (e) => ripple(e.target.closest(RIPPLE), e.clientX, e.clientY), { passive: true });
  document.addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT') return; // el clic reenviado al input no repite la onda
    const host = e.target.closest(LABEL_RIPPLE);
    if (host) ripple(host, e.detail ? e.clientX : null, e.detail ? e.clientY : null);
  });

  // ---------- 3. Animaciones al hacer scroll ----------
  // Escalonado automático de los elementos de una misma rejilla.
  document.querySelectorAll('[data-stagger]').forEach((group) => {
    [...group.children].forEach((child, i) => child.style.setProperty('--i', i));
  });

  const hero = document.querySelector('.hero-stage');
  const device = hero && hero.querySelector('.device');
  const floats = hero ? [...hero.querySelectorAll('.float, .phone')] : [];
  const stepsBox = document.querySelector('[data-steps-progress]');
  const steps = stepsBox ? [...stepsBox.querySelectorAll('.step')] : [];

  // ---------- 5. Indicador de progreso de lectura ----------
  let bar = null;
  if (document.body.dataset.scrollProgress !== undefined) {
    bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    bar.append(document.createElement('i'));
    document.body.prepend(bar);
  }

  const onScroll = raf(() => {
    const y = window.scrollY;
    const vh = window.innerHeight;
    if (bar) {
      const max = document.documentElement.scrollHeight - vh;
      bar.firstChild.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    }
    if (reduced) return;
    // El equipo del hero se endereza al bajar y las tarjetas flotan a distinta velocidad.
    if (device && y < vh * 1.5) {
      const p = Math.min(1, y / (vh * 0.7));
      device.style.setProperty('--tilt', `${10 - p * 10}deg`);
      device.style.setProperty('--lift', `${1 + p * 0.03}`);
      floats.forEach((f, i) => f.style.setProperty('--py', `${-y * (0.06 + i * 0.035)}px`));
    }
    // Línea que se rellena al recorrer "Cómo funciona" y enciende cada paso.
    if (stepsBox) {
      const r = stepsBox.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (vh * 0.75 - r.top) / (r.height + vh * 0.25)));
      stepsBox.style.setProperty('--p', p.toFixed(3));
      steps.forEach((s, i) => s.classList.toggle('on', p >= (i + 0.35) / steps.length));
    }
  });
  if (bar || device || stepsBox) {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }
  if (reduced && stepsBox) steps.forEach((s) => s.classList.add('on'));

  // ---------- 4. Tarjetas que reaccionan al puntero ----------
  // Inclinación 3D suave y un foco de luz que sigue al cursor; en táctil, respuesta al pulsar.
  const TILT = '.pain, .trust li, .step, .mods li, .facts li, .opt, .adm-kpi, .tour-stage';
  function bindTilt(card) {
    if (card.dataset.tilt) return;
    card.dataset.tilt = '1';
    card.classList.add('tilt');
    if (!finePointer || reduced) return;
    const max = card.classList.contains('tour-stage') ? 2.5 : 6;
    const move = raf((e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', `${x * 100}%`);
      card.style.setProperty('--my', `${y * 100}%`);
      card.style.setProperty('--ry', `${(x - 0.5) * max * 2}deg`);
      card.style.setProperty('--rx', `${(0.5 - y) * max * 2}deg`);
    });
    card.addEventListener('pointerenter', () => card.classList.add('tilting'));
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerleave', () => {
      card.classList.remove('tilting');
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  }
  const scanTilt = (root = document) => root.querySelectorAll(TILT).forEach(bindTilt);
  scanTilt();
  // El panel y el calendario crean tarjetas después: se enlazan al aparecer.
  new MutationObserver(raf(() => scanTilt())).observe(document.body, { childList: true, subtree: true });

  // Cifras reales que cuentan hasta su valor cuando entran en pantalla (panel comercial).
  window.NexoFx.countUp = (el) => {
    const m = /^(\d+)(.*)$/.exec(el.textContent.trim());
    if (!m || reduced) return;
    const target = Number(m[1]);
    const rest = m[2];
    if (target < 2) return;
    const t0 = performance.now();
    const dur = Math.min(900, 300 + target * 20);
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = `${Math.round(target * (1 - Math.pow(1 - k, 3)))}${rest}`;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
})();
