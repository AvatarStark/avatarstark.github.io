(() => {
  const track = (name, data) => window.nexoTrack && window.nexoTrack(name, data);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 10);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const toggle = document.getElementById('navToggle');
  const setMenu = (open) => {
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  };
  toggle.addEventListener('click', () => setMenu(!document.body.classList.contains('nav-open')));
  document.querySelectorAll('#menu a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach((el) => io.observe(el));
  } else {
    items.forEach((el) => el.classList.add('in'));
  }

  // Pestañas accesibles (flechas, Inicio y Fin). onSelect permite reaccionar al cambio.
  function tablist(list, onSelect) {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        panel.hidden = !on;
        panel.classList.toggle('active', on);
      });
      if (focus) tab.focus();
      if (onSelect) onSelect(tabs.indexOf(tab));
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        const map = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 };
        if (!(e.key in map)) return;
        e.preventDefault();
        select(tabs[(map[e.key] + tabs.length) % tabs.length], true);
      });
    });
    return { tabs, select };
  }

  document.querySelectorAll('[data-tabs]').forEach((list) => tablist(list));

  // Recorrido del producto: avanza solo mientras está visible y hasta que la persona interactúa.
  const tour = document.querySelector('[data-tour]');
  if (tour) {
    const ms = 7000;
    tour.style.setProperty('--tour-ms', `${ms}ms`);
    let timer = null;
    let userTook = false;
    let visible = false;
    let current = 0;
    const api = tablist(tour.querySelector('[role="tablist"]'), (i) => {
      current = i;
      track('tour_view', { label: api.tabs[i].id.replace('tt-', '') });
    });
    const stop = () => { clearTimeout(timer); tour.classList.remove('playing'); };
    const schedule = () => {
      stop();
      if (userTook || !visible || reduced) return;
      // Reinicia la animación de la barra de progreso.
      void tour.offsetWidth;
      tour.classList.add('playing');
      timer = setTimeout(() => {
        const next = api.tabs[(current + 1) % api.tabs.length];
        api.select(next);
        schedule();
      }, ms);
    };
    api.tabs.forEach((t) => {
      t.addEventListener('click', () => { userTook = true; stop(); });
      t.addEventListener('keydown', () => { userTook = true; stop(); });
    });
    tour.addEventListener('mouseenter', stop);
    tour.addEventListener('mouseleave', schedule);
    tour.addEventListener('focusin', stop);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? schedule() : stop(); }, { threshold: 0.35 }).observe(tour);
  }

  // Demostración: video si está configurado; si no, recorrido con capturas reales.
  const player = document.querySelector('[data-player]');
  if (player) {
    const cfg = window.NEXO_CONFIG || {};
    const slides = [...player.querySelectorAll('.player-slide')];
    const dots = [...player.querySelectorAll('.player-dots button')];
    const btn = player.querySelector('[data-player-toggle]');
    const ms = 5500;
    player.style.setProperty('--tour-ms', `${ms}ms`);
    if (cfg.demoVideoUrl) {
      const box = player.querySelector('.player-video');
      const video = document.createElement('video');
      video.controls = true;
      video.preload = 'none';
      video.playsInline = true;
      video.poster = 'assets/capturas/04-panel-admin-claro-1600.webp';
      video.src = cfg.demoVideoUrl;
      video.setAttribute('aria-label', 'Video de demostración de NexoPOS');
      box.append(video);
      box.hidden = false;
      player.querySelector('.player-slides').hidden = true;
      player.querySelector('.player-bar').hidden = true;
    } else {
      let i = 0;
      let timer = null;
      let paused = reduced;
      let visible = false;
      const show = (n) => {
        i = (n + slides.length) % slides.length;
        slides.forEach((s, k) => s.classList.toggle('is-on', k === i));
        dots.forEach((d, k) => {
          d.parentElement.classList.toggle('done', k < i);
          if (k === i) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
        });
      };
      const run = () => {
        clearTimeout(timer);
        player.classList.toggle('paused', paused);
        btn.setAttribute('aria-label', paused ? 'Reproducir recorrido' : 'Pausar recorrido');
        if (paused || !visible) return;
        // Reinicia la barra del paso actual.
        const cur = dots[i].querySelector('i');
        cur.style.animation = 'none'; void cur.offsetWidth; cur.style.animation = '';
        timer = setTimeout(() => { show(i + 1); run(); }, ms);
      };
      btn.addEventListener('click', () => { paused = !paused; run(); });
      dots.forEach((d, k) => d.addEventListener('click', () => { show(k); run(); }));
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); }, { threshold: 0.4 }).observe(player);
      show(0);
      run();
    }
  }

  // CTA fija en móvil: aparece después del hero y se oculta cerca del CTA final.
  const sticky = document.getElementById('stickyCta');
  const hero = document.querySelector('.hero');
  const finalCta = document.getElementById('contacto');
  if (sticky && hero && finalCta && 'IntersectionObserver' in window) {
    let pastHero = false;
    let nearEnd = false;
    const link = sticky.querySelector('a');
    const update = () => {
      const show = pastHero && !nearEnd;
      sticky.classList.toggle('show', show);
      sticky.setAttribute('aria-hidden', String(!show));
      link.tabIndex = show ? 0 : -1;
    };
    new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting && e.boundingClientRect.top < 0; update(); }).observe(hero);
    new IntersectionObserver(([e]) => { nearEnd = e.isIntersecting; update(); }).observe(finalCta);
  }

  document.querySelectorAll('.faq details').forEach((d) => {
    d.addEventListener('toggle', () => { if (d.open) track('faq_open', { label: d.querySelector('summary').textContent.slice(0, 80) }); });
  });
})();
