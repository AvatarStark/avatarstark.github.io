// Panel comercial: prospectos, agenda, métricas, disponibilidad y reglas de puntuación.
// Todo el contenido que viene del servidor se inserta como texto (nunca como HTML).
(() => {
  const app = document.getElementById('app');
  const TOKEN_KEY = 'nexo_admin_token';
  const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const setToken = (t) => { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* sin almacenamiento */ } };
  let token = getToken();
  let me = null;
  let catalog = null;

  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k in n && typeof v !== 'string') n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    n.append(...children.flat().filter((c) => c != null && c !== false).map((c) => (typeof c === 'number' ? String(c) : c)));
    return n;
  }

  async function api(method, path, body) {
    try {
      return await window.NexoApi.request(method, `/api/admin${path}`, body, token);
    } catch (err) {
      if (err.status === 401 && path !== '/login') { setToken(null); token = null; renderLogin('Tu sesión caducó. Vuelve a entrar.'); }
      throw err;
    }
  }

  const fmtDate = (iso, opts = {}) => (iso ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', ...opts }).format(new Date(iso)) : '—');
  const fmtDay = (iso) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
  const label = (group, key) => (catalog && catalog[group] && catalog[group][key]) || key;
  const prio = (p, score) => el('span', { class: `adm-prio adm-prio-${p}` }, p === 'alta' ? 'Alta' : p === 'media' ? 'Media' : 'Baja', score != null ? el('small', {}, ` ${score}`) : null);
  const statusPill = (s) => el('span', { class: `adm-status adm-st-${s}` }, label('leadStatuses', s));
  const waLink = (num) => `https://wa.me/${String(num).replace(/\D/g, '')}`;
  const toast = (text, bad) => {
    const t = el('div', { class: `adm-toast${bad ? ' bad' : ''}`, role: 'status' }, text);
    // Dentro del panel lateral abierto, para que el aviso no quede detrás del modal.
    (dialog && dialog.open ? dialog : document.body).append(t);
    setTimeout(() => t.remove(), 3500);
  };

  // ---------- Acceso ----------
  function renderLogin(message) {
    const user = el('input', { id: 'u', name: 'username', autocomplete: 'username', required: true, maxlength: '60' });
    const pass = el('input', { id: 'p', name: 'password', type: 'password', autocomplete: 'current-password', required: true, maxlength: '200' });
    const err = el('p', { class: 'adm-error', role: 'alert', hidden: !message }, message || '');
    const btn = el('button', { class: 'btn btn-dark', type: 'submit' }, 'Entrar');
    const form = el('form', { class: 'adm-login-card', novalidate: true },
      el('img', { src: '../assets/brand/nexopos-logo.svg', alt: 'NexoPOS', width: '150', height: '37' }),
      el('h1', {}, 'Panel comercial'),
      el('p', { class: 'adm-muted' }, 'Prospectos y demostraciones de la web.'),
      el('label', { for: 'u' }, 'Usuario'), user,
      el('label', { for: 'p' }, 'Contraseña'), pass,
      err, btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      btn.classList.add('loading');
      btn.disabled = true;
      try {
        const res = await window.NexoApi.request('POST', '/api/admin/login', { username: user.value, password: pass.value });
        token = res.token;
        setToken(token);
        me = res.user;
        await boot();
      } catch (ex) {
        err.textContent = ex.network || ex.unavailable ? 'No se pudo conectar con el servidor.' : ex.message;
        err.hidden = false;
        pass.value = '';
        pass.focus();
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });
    app.replaceChildren(el('main', { class: 'adm-login' }, form));
    user.focus();
  }

  // ---------- Estructura ----------
  const VIEWS = [
    ['resumen', 'Resumen'], ['prospectos', 'Prospectos'], ['agenda', 'Agenda'], ['disponibilidad', 'Disponibilidad'], ['puntuacion', 'Puntuación'],
  ];
  let main;
  // Vista principal; ignora las piezas condicionales vacías.
  const put = (...nodes) => main.replaceChildren(...nodes.filter((x) => x != null && x !== false));

  function shell() {
    const nav = el('nav', { class: 'adm-nav', 'aria-label': 'Secciones' }, ...VIEWS.map(([k, t]) => el('a', { href: `#${k}`, 'data-view': k }, t)));
    main = el('main', { class: 'adm-main', id: 'adm-main', tabindex: '-1' });
    app.replaceChildren(
      el('header', { class: 'adm-top' },
        el('img', { src: '../assets/brand/nexopos-logo-blanco.svg', alt: 'NexoPOS', width: '120', height: '30' }),
        el('span', { class: 'adm-top-title' }, 'Panel comercial'),
        el('span', { class: 'adm-user' }, me.displayName, el('small', {}, me.role === 'admin' ? ' · Administración' : ' · Ventas')),
        el('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: logout }, 'Salir')),
      el('div', { class: 'adm-body' }, nav, main));
  }

  function logout() {
    setToken(null);
    token = null;
    renderLogin();
  }

  // Esqueleto con la forma de cada vista mientras llegan los datos.
  function skeletonFor(view) {
    const sk = (cls, style) => el('span', { class: `sk-block ${cls || ''}`, style, 'aria-hidden': 'true' });
    const lines = (n) => Array.from({ length: n }, (_, i) => sk('sk-line', `width:${90 - (i % 3) * 15}%`));
    const card = (n) => el('div', { class: 'adm-card' }, sk('sk-line', 'width:35%;height:18px'), ...lines(n));
    const head = el('div', { class: 'adm-head' }, sk('sk-title'));
    const label = el('span', { class: 'sr-only' }, 'Cargando…');
    if (view === 'resumen' || !view) {
      return el('div', { class: 'adm-sk' }, label, head,
        el('div', { class: 'adm-kpis' }, ...Array.from({ length: 5 }, () => el('div', { class: 'adm-kpi' }, sk('sk-line', 'width:60%'), sk('', 'height:34px;width:45%'), sk('sk-line', 'width:70%')))),
        el('div', { class: 'adm-grid2', style: 'margin-top:28px' }, card(9), card(5)));
    }
    if (view === 'prospectos') {
      return el('div', { class: 'adm-sk' }, label, head, sk('', 'height:46px;margin-bottom:14px'),
        el('div', { class: 'adm-card' }, ...Array.from({ length: 8 }, () => el('div', { class: 'adm-sk-row' }, sk('sk-line'), sk('sk-line'), sk('sk-line'), sk('sk-line')))));
    }
    return el('div', { class: 'adm-sk' }, label, head, card(4), card(6));
  }

  function route() {
    if (!token || !main) return;
    const view = (location.hash.slice(1).split('/')[0]) || 'resumen';
    app.querySelectorAll('.adm-nav a').forEach((a) => { if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const fn = { resumen: viewMetrics, prospectos: viewLeads, agenda: viewAgenda, disponibilidad: viewAvailability, puntuacion: viewScoring }[view] || viewMetrics;
    put(skeletonFor(view));
    fn().catch((err) => put(el('p', { class: 'adm-error' }, err.message)));
  }
  window.addEventListener('hashchange', route);

  // ---------- Resumen ----------
  let days = 30;
  async function viewMetrics() {
    const m = await api('GET', `/metrics?days=${days}`);
    const t = m.totals;
    const pct = (v) => (v == null ? '—' : `${v}%`);
    const range = el('div', { class: 'adm-seg', role: 'group', 'aria-label': 'Período' }, ...[7, 30, 90, 365].map((d) => el('button', { type: 'button', 'aria-pressed': String(d === days), onclick: () => { days = d; route(); } }, d === 365 ? '1 año' : `${d} días`)));
    const kpi = (title, value, sub) => el('div', { class: 'adm-kpi' }, el('span', {}, title), el('b', {}, value), sub ? el('small', {}, sub) : null);
    const max = Math.max(1, ...m.funnel.map((f) => f.sessions));
    const FUNNEL_LABELS = { landing: 'Visitas a la página', cta: 'Clic en un CTA', inicio: 'Abren el formulario', negocio: 'Tipo de negocio', necesidades: 'Necesidades', equipo: 'Tamaño del equipo', plazo: 'Plazo', contacto: 'Dejan sus datos', reserva: 'Reservan demostración' };
    const funnel = el('ol', { class: 'adm-funnel' }, ...m.funnel.map((f, i) => {
      const prev = i ? m.funnel[i - 1].sessions : null;
      const drop = prev ? Math.round((1 - f.sessions / prev) * 100) : null;
      return el('li', {},
        el('span', { class: 'adm-funnel-l' }, FUNNEL_LABELS[f.key] || f.key),
        el('span', { class: 'adm-funnel-bar' }, el('i', { style: 'width:0', 'data-w': `${(f.sessions / max) * 100}%` })),
        el('b', {}, f.sessions),
        el('small', {}, drop != null && prev ? (drop > 0 ? `−${drop}%` : '0%') : ''));
    }));
    const listOf = (rows, group) => el('ul', { class: 'adm-bars' }, ...(rows.length ? rows : [{ key: '—', n: 0 }]).map((r) => el('li', {}, el('span', {}, group ? label(group, r.key) : r.key), el('b', {}, r.n))));
    const prioRows = ['alta', 'media', 'baja'].map((p) => ({ key: p, n: (m.byPriority.find((r) => r.key === p) || { n: 0 }).n }));
    put(
      el('div', { class: 'adm-head' }, el('h1', {}, 'Resumen comercial'), range),
      el('div', { class: 'adm-kpis' },
        kpi('Prospectos', t.leads, `${t.lost} perdidos`),
        kpi('Formulario → reserva', pct(t.formToBooking), `${t.with_booking} con reserva`),
        kpi('Demos realizadas', t.demos_done, `${t.upcoming} próximas`),
        kpi('Clientes', t.clients),
        kpi('Tasa de cierre', pct(t.closeRate), 'clientes / demos realizadas')),
      el('p', { class: 'adm-muted adm-note' }, 'Prospectos creados en el período elegido. Las métricas se calculan con los datos registrados; el embudo cuenta sesiones anónimas (no incluye visitantes que activaron "No rastrear").'),
      el('div', { class: 'adm-grid2' },
        el('section', { class: 'adm-card' }, el('h2', {}, 'Embudo y abandono por paso'), funnel),
        el('div', { class: 'adm-stack' },
          el('section', { class: 'adm-card' }, el('h2', {}, 'Por prioridad'), el('ul', { class: 'adm-bars' }, ...prioRows.map((r) => el('li', {}, prio(r.key), el('b', {}, r.n))))),
          el('section', { class: 'adm-card' }, el('h2', {}, 'Por tipo de negocio'), listOf(m.byBusiness, 'businessTypes')),
          el('section', { class: 'adm-card' }, el('h2', {}, 'Prueba A/B'),
            m.variants.length ? el('table', { class: 'adm-table adm-table-sm' },
              el('thead', {}, el('tr', {}, el('th', {}, 'Variante'), el('th', {}, 'Visitas'), el('th', {}, 'Formulario'), el('th', {}, 'Datos'), el('th', {}, 'Reservas'))),
              el('tbody', {}, ...m.variants.map((v) => el('tr', {}, el('td', {}, v.variant), el('td', {}, v.visits), el('td', {}, v.starts), el('td', {}, v.leads), el('td', {}, `${v.bookings}${v.visits ? ` (${Math.round((v.bookings / v.visits) * 1000) / 10}%)` : ''}`)))))
              : el('p', { class: 'adm-muted' }, 'Aún no hay datos de variantes.')))));
    animateMetrics();
  }

  // Indicadores de progreso: las barras crecen hasta su valor y las cifras cuentan hasta el dato real.
  function animateMetrics() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      main.querySelectorAll('[data-w]').forEach((b) => { b.style.width = b.dataset.w; });
      if (window.NexoFx) main.querySelectorAll('.adm-kpi b').forEach((b) => window.NexoFx.countUp(b));
    }));
  }

  // ---------- Prospectos ----------
  const filters = { q: '', status: '', priority: '', business: '', sort: '', page: 1 };
  async function viewLeads() {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const data = await api('GET', `/leads?${qs}`);
    const select = (name, options, all) => el('select', { 'aria-label': all, onchange: (e) => { filters[name] = e.target.value; filters.page = 1; route(); } },
      el('option', { value: '' }, all), ...Object.entries(options).map(([k, v]) => el('option', { value: k, selected: filters[name] === k }, v)));
    const search = el('input', { type: 'search', placeholder: 'Buscar nombre, negocio, WhatsApp o correo', value: filters.q, 'aria-label': 'Buscar' });
    let tmr;
    search.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => { filters.q = search.value; filters.page = 1; route(); }, 350); });
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    const rows = data.leads.map((l) => el('tr', { tabindex: '0', onclick: () => openLead(l.id), onkeydown: (e) => { if (e.key === 'Enter') openLead(l.id); } },
      el('td', {}, el('b', {}, l.name), el('small', {}, l.business_name)),
      el('td', {}, label('businessTypes', l.business_type)),
      el('td', {}, prio(l.priority, l.score)),
      el('td', {}, statusPill(l.status)),
      el('td', {}, l.next_demo ? el('span', { class: l.booking_status === 'confirmada' ? '' : 'adm-muted' }, fmtDate(l.next_demo), l.booking_status !== 'confirmada' ? el('small', {}, label('bookingStatuses', l.booking_status)) : null) : el('span', { class: 'adm-muted' }, 'Sin reserva')),
      el('td', {}, fmtDate(l.created_at))));
    put(
      el('div', { class: 'adm-head' }, el('h1', {}, 'Prospectos'), el('span', { class: 'adm-muted' }, `${data.total} en total`)),
      el('div', { class: 'adm-filters' }, search,
        select('status', catalog.leadStatuses, 'Todos los estados'),
        select('priority', { alta: 'Prioridad alta', media: 'Prioridad media', baja: 'Prioridad baja' }, 'Todas las prioridades'),
        select('business', catalog.businessTypes, 'Todos los negocios'),
        select('sort', { score: 'Mayor puntuación', demo: 'Próxima demo' }, 'Más recientes')),
      data.leads.length
        ? el('div', { class: 'adm-table-wrap' }, el('table', { class: 'adm-table adm-leads' },
          el('thead', {}, el('tr', {}, el('th', {}, 'Contacto'), el('th', {}, 'Negocio'), el('th', {}, 'Prioridad'), el('th', {}, 'Estado'), el('th', {}, 'Demostración'), el('th', {}, 'Recibido'))),
          el('tbody', {}, ...rows)))
        : el('p', { class: 'adm-empty' }, 'No hay prospectos con estos filtros.'),
      pages > 1 ? el('div', { class: 'adm-pager' },
        el('button', { class: 'btn btn-sm btn-outline-d', disabled: filters.page <= 1, onclick: () => { filters.page--; route(); } }, 'Anterior'),
        el('span', {}, `Página ${filters.page} de ${pages}`),
        el('button', { class: 'btn btn-sm btn-outline-d', disabled: filters.page >= pages, onclick: () => { filters.page++; route(); } }, 'Siguiente')) : null);
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  }

  const EVENT_TEXT = {
    creado: 'Envió el formulario', formulario_reenviado: 'Volvió a enviar el formulario', demo_reservada: 'Reservó demostración',
    demo_reprogramada: 'Reprogramó la demostración', demo_cancelada: 'Canceló la demostración', nota: 'Añadió una nota',
  };
  function eventText(e) {
    if (e.kind === 'estado') return `Estado: ${label('leadStatuses', e.detail.from)} → ${label('leadStatuses', e.detail.to)}`;
    if (e.kind === 'reserva') return `Demostración del ${fmtDate(e.detail.start)}: ${label('bookingStatuses', e.detail.to)}`;
    const base = EVENT_TEXT[e.kind] || e.kind;
    if (e.detail && e.detail.start && e.kind.startsWith('demo_')) return `${base} (${fmtDate(e.detail.start)})`;
    return base;
  }

  let dialog = null;
  async function openLead(id) {
    const data = await api('GET', `/leads/${id}`);
    if (!dialog) {
      dialog = el('dialog', { class: 'adm-drawer', 'aria-labelledby': 'drawer-title' });
      dialog.addEventListener('close', () => { if (location.hash.startsWith('#prospectos')) route(); });
      dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
      document.body.append(dialog);
    }
    renderLead(data);
    if (!dialog.open) dialog.showModal();
  }

  function renderLead({ lead: l, breakdown, bookings, notes, events, notifications }) {
    const statusSel = el('select', { id: 'lead-status', onchange: async (e) => {
      try { renderLead(await api('PATCH', `/leads/${l.id}`, { status: e.target.value })); toast('Estado actualizado'); } catch (err) { toast(err.message, true); }
    } }, ...Object.entries(catalog.leadStatuses).map(([k, v]) => el('option', { value: k, selected: k === l.status }, v)));
    const note = el('textarea', { id: 'note', maxlength: '4000', placeholder: 'Ej.: Tiene dos cajas y quiere empezar el lunes' });
    const addNote = async (e) => {
      e.preventDefault();
      if (!note.value.trim()) return;
      try { renderLead(await api('POST', `/leads/${l.id}/notes`, { body: note.value })); toast('Nota guardada'); } catch (err) { toast(err.message, true); }
    };
    const bookingActions = (b) => (b.status === 'confirmada' ? el('div', { class: 'adm-row-actions' },
      ...[['realizada', 'Marcar realizada'], ['no_asistio', 'No asistió'], ['cancelada', 'Cancelar']].map(([s, t]) => el('button', {
        type: 'button', class: 'btn btn-sm btn-outline-d', onclick: async () => {
          if (s === 'cancelada' && !window.confirm('¿Cancelar esta demostración? El horario quedará libre.')) return;
          try { renderLead(await api('POST', `/bookings/${b.id}/status`, { status: s })); toast('Demostración actualizada'); } catch (err) { toast(err.message, true); }
        },
      }, t))) : null);
    const dl = (pairs) => el('dl', { class: 'adm-dl' }, ...pairs.filter(Boolean).map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v))));
    dialog.replaceChildren(el('div', { class: 'adm-drawer-in' },
      el('div', { class: 'adm-drawer-head' },
        el('div', {}, el('h2', { id: 'drawer-title' }, l.name), el('p', { class: 'adm-muted' }, l.business_name)),
        el('button', { type: 'button', class: 'adm-close', 'aria-label': 'Cerrar', onclick: () => dialog.close() }, '×')),
      el('div', { class: 'adm-drawer-tags' }, prio(l.priority, `${l.score} pts`), statusPill(l.status)),
      el('div', { class: 'adm-field' }, el('label', { for: 'lead-status' }, 'Estado del prospecto'), statusSel),
      el('section', {}, el('h3', {}, 'Contacto'), dl([
        ['WhatsApp', el('a', { href: waLink(l.whatsapp), target: '_blank', rel: 'noopener' }, l.whatsapp)],
        l.email && ['Correo', el('a', { href: `mailto:${l.email}` }, l.email)],
        ['Zona horaria', l.timezone + (l.country ? ` · ${l.country}` : '')],
        ['Consentimiento', `${fmtDate(l.consent_at, { year: 'numeric' })} (texto ${l.consent_version})`],
        l.utm && ['Origen', Object.entries(l.utm).map(([k, v]) => `${k}: ${v}`).join(' · ')],
        l.ab_variant && ['Variante', l.ab_variant],
      ])),
      el('section', {}, el('h3', {}, 'Respuestas'), dl([
        ['Negocio', label('businessTypes', l.business_type)],
        ['Necesita', l.needs.map((n) => label('needs', n)).join(', ') + (l.needs_other ? ` — «${l.needs_other}»` : '')],
        ['Personas', label('employees', l.employees)],
        ['Plazo', label('timelines', l.timeline)],
      ])),
      el('section', {}, el('h3', {}, 'Puntuación'), el('ul', { class: 'adm-bars' }, ...breakdown.map((p) => el('li', {}, el('span', {}, p.label), el('b', {}, p.points > 0 ? `+${p.points}` : p.points))))),
      el('section', {}, el('h3', {}, 'Demostraciones'), bookings.length ? el('ul', { class: 'adm-list' }, ...bookings.map((b) => el('li', {},
        el('div', {}, el('b', {}, fmtDate(b.starts_at, { weekday: 'short', year: 'numeric' })), ' ', el('span', { class: `adm-bst adm-bst-${b.status}` }, label('bookingStatuses', b.status)),
          b.reschedule_count ? el('small', {}, ` · reprogramada ${b.reschedule_count}×`) : null, b.cancel_reason ? el('small', {}, ` · motivo: ${b.cancel_reason}`) : null),
        bookingActions(b)))) : el('p', { class: 'adm-muted' }, 'Todavía no ha reservado.')),
      el('section', {}, el('h3', {}, 'Notas internas'),
        el('form', { class: 'adm-note-form', onsubmit: addNote }, el('label', { for: 'note', class: 'sr-only' }, 'Nueva nota'), note, el('button', { class: 'btn btn-sm btn-dark', type: 'submit' }, 'Guardar nota')),
        notes.length ? el('ul', { class: 'adm-list' }, ...notes.map((n) => el('li', {}, el('p', { class: 'adm-note-body' }, n.body), el('small', {}, `${n.author} · ${fmtDate(n.created_at)}`)))) : null),
      notifications.length ? el('section', {}, el('h3', {}, 'Avisos'), el('ul', { class: 'adm-list' }, ...notifications.map((n) => el('li', {},
        el('span', {}, `${n.channel === 'email' ? 'Correo' : n.channel === 'whatsapp' ? 'WhatsApp' : n.channel} · ${n.purpose}`), ' ',
        el('span', { class: `adm-ntf adm-ntf-${n.status}` }, { enviado: 'Enviado', no_configurado: 'Proveedor sin configurar', fallido: `Falló${n.error ? ` (${n.error})` : ''}`, sin_destinatario: 'Sin destinatario' }[n.status] || n.status),
        el('small', {}, ` ${fmtDate(n.created_at)}`))))) : null,
      el('section', {}, el('h3', {}, 'Historial'), el('ol', { class: 'adm-timeline' }, ...events.map((e) => el('li', {},
        el('span', {}, eventText(e)), el('small', {}, `${e.admin || (e.actor === 'visitante' ? 'Visitante' : 'Sistema')} · ${fmtDate(e.created_at)}`)))))));
  }

  // ---------- Agenda ----------
  let agendaPast = false;
  async function viewAgenda() {
    const { bookings } = await api('GET', `/bookings${agendaPast ? '?range=past' : ''}`);
    const groups = new Map();
    for (const b of bookings) {
      const k = new Date(b.starts_at).toDateString();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(b);
    }
    put(
      el('div', { class: 'adm-head' }, el('h1', {}, 'Agenda de demostraciones'),
        el('div', { class: 'adm-seg', role: 'group', 'aria-label': 'Rango' },
          el('button', { type: 'button', 'aria-pressed': String(!agendaPast), onclick: () => { agendaPast = false; route(); } }, 'Próximas'),
          el('button', { type: 'button', 'aria-pressed': String(agendaPast), onclick: () => { agendaPast = true; route(); } }, 'Pasadas'))),
      el('p', { class: 'adm-muted adm-note' }, `Horas en la zona de este equipo (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`),
      bookings.length ? el('div', { class: 'adm-agenda' }, ...[...groups.values()].map((list) => el('section', { class: 'adm-card' },
        el('h2', { class: 'adm-day' }, fmtDay(list[0].starts_at)),
        el('ul', { class: 'adm-list' }, ...list.map((b) => el('li', { class: 'adm-agenda-item' },
          el('b', { class: 'adm-time' }, new Intl.DateTimeFormat('es-ES', { hour: 'numeric', minute: '2-digit' }).format(new Date(b.starts_at))),
          el('button', { type: 'button', class: 'linklike', onclick: () => openLead(b.lead_id) }, `${b.name} · ${b.business_name}`),
          prio(b.priority, b.score),
          el('span', { class: `adm-bst adm-bst-${b.status}` }, label('bookingStatuses', b.status)),
          el('a', { href: waLink(b.whatsapp), target: '_blank', rel: 'noopener' }, 'WhatsApp'))))))) : el('p', { class: 'adm-empty' }, agendaPast ? 'No hay demostraciones pasadas.' : 'No hay demostraciones programadas.'));
  }

  // ---------- Disponibilidad ----------
  const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  async function viewAvailability() {
    const { value: a } = await api('GET', '/settings/availability');
    const canEdit = me.role === 'admin';
    const num = (key, opts, lbl, help) => el('div', { class: 'adm-field' }, el('label', { for: `av-${key}` }, lbl),
      opts ? el('select', { id: `av-${key}`, disabled: !canEdit, onchange: (e) => { a[key] = Number(e.target.value); } }, ...opts.map((o) => el('option', { value: o, selected: a[key] === o }, `${o} min`)))
        : el('input', { id: `av-${key}`, type: 'number', min: '0', value: a[key], disabled: !canEdit, oninput: (e) => { a[key] = parseInt(e.target.value, 10); } }),
      help ? el('small', { class: 'adm-muted' }, help) : null);
    const weekBox = el('div', { class: 'adm-week' });
    const renderWeek = () => weekBox.replaceChildren(...[1, 2, 3, 4, 5, 6, 0].map((d) => {
      const ranges = a.weekly[d] || (a.weekly[d] = []);
      return el('div', { class: 'adm-weekday' },
        el('b', {}, DAY_NAMES[d]),
        el('div', { class: 'adm-ranges' }, ranges.length ? ranges.map((r, i) => el('span', { class: 'adm-range' },
          el('input', { type: 'time', value: r.start, 'aria-label': `${DAY_NAMES[d]} desde`, disabled: !canEdit, onchange: (e) => { r.start = e.target.value; } }), '–',
          el('input', { type: 'time', value: r.end, 'aria-label': `${DAY_NAMES[d]} hasta`, disabled: !canEdit, onchange: (e) => { r.end = e.target.value; } }),
          canEdit ? el('button', { type: 'button', class: 'adm-x', 'aria-label': 'Quitar franja', onclick: () => { ranges.splice(i, 1); renderWeek(); } }, '×') : null))
          : el('span', { class: 'adm-muted' }, 'Sin horario')),
        canEdit ? el('button', { type: 'button', class: 'btn btn-sm btn-outline-d', onclick: () => { ranges.push({ start: '09:00', end: '17:00' }); renderWeek(); } }, '+ Franja') : null);
    }));
    renderWeek();
    const blocked = el('ul', { class: 'adm-chips' });
    const renderBlocked = () => blocked.replaceChildren(...a.blockedDates.map((d, i) => el('li', {}, d, canEdit ? el('button', { type: 'button', class: 'adm-x', 'aria-label': `Quitar ${d}`, onclick: () => { a.blockedDates.splice(i, 1); renderBlocked(); } }, '×') : null)));
    renderBlocked();
    const newDate = el('input', { type: 'date', 'aria-label': 'Fecha a bloquear', disabled: !canEdit });
    const preview = el('p', { class: 'adm-muted' });
    const refreshPreview = async () => {
      try {
        const s = await window.NexoApi.request('GET', '/api/slots');
        preview.textContent = s.slots.length ? `Ahora mismo la web ofrece ${s.slots.length} horarios libres en los próximos ${a.horizonDays} días.` : 'Ahora mismo la web no ofrece ningún horario: configura al menos una franja.';
      } catch { preview.textContent = ''; }
    };
    refreshPreview();
    const tz = el('input', { id: 'av-tz', value: a.timezone, disabled: !canEdit, list: 'tzlist', oninput: (e) => { a.timezone = e.target.value.trim(); } });
    const save = el('button', { type: 'button', class: 'btn btn-dark', hidden: !canEdit, onclick: async () => {
      save.classList.add('loading');
      try { await api('PUT', '/settings/availability', { value: a }); toast('Disponibilidad guardada'); refreshPreview(); } catch (err) { toast(err.message, true); } finally { save.classList.remove('loading'); }
    } }, 'Guardar disponibilidad');
    put(
      el('div', { class: 'adm-head' }, el('h1', {}, 'Disponibilidad para demostraciones')),
      !canEdit ? el('p', { class: 'adm-note adm-muted' }, 'Solo un usuario con rol de administración puede cambiar estos valores.') : null,
      preview,
      el('section', { class: 'adm-card' }, el('h2', {}, 'Reglas'),
        el('div', { class: 'adm-form-grid' },
          el('div', { class: 'adm-field' }, el('label', { for: 'av-tz' }, 'Zona horaria del equipo'), tz,
            el('datalist', { id: 'tzlist' }, ...['America/Havana', 'America/Mexico_City', 'America/Bogota', 'America/New_York', 'Europe/Madrid'].map((z) => el('option', { value: z })))),
          num('slotMinutes', [15, 20, 30, 45, 60, 90], 'Duración de cada demo'),
          num('bufferMinutes', null, 'Margen entre demos (min)'),
          num('minNoticeHours', null, 'Antelación mínima (horas)', 'No se ofrecen horarios más cercanos que esto.'),
          num('horizonDays', null, 'Días hacia adelante', 'Hasta cuántos días se puede reservar.'))),
      el('section', { class: 'adm-card' }, el('h2', {}, 'Horario semanal'), weekBox),
      el('section', { class: 'adm-card' }, el('h2', {}, 'Días bloqueados'), el('p', { class: 'adm-muted' }, 'Festivos o días sin demostraciones.'), blocked,
        canEdit ? el('div', { class: 'adm-inline' }, newDate, el('button', { type: 'button', class: 'btn btn-sm btn-outline-d', onclick: () => { if (newDate.value && !a.blockedDates.includes(newDate.value)) { a.blockedDates.push(newDate.value); a.blockedDates.sort(); renderBlocked(); } } }, 'Bloquear día')) : null),
      el('div', { class: 'adm-save' }, save));
  }

  // ---------- Puntuación ----------
  async function viewScoring() {
    const { value: r } = await api('GET', '/settings/scoring');
    const canEdit = me.role === 'admin';
    const input = (obj, key, aria) => el('input', { type: 'number', min: '-100', max: '300', value: obj[key], 'aria-label': aria, disabled: !canEdit, oninput: (e) => { obj[key] = parseInt(e.target.value, 10); } });
    const group = (title, key, cat) => el('section', { class: 'adm-card' }, el('h2', {}, title),
      el('ul', { class: 'adm-score' }, ...Object.entries(catalog[cat]).map(([k, v]) => el('li', {}, el('span', {}, v), input(r[key], k, `${title}: ${v}`)))));
    const save = el('button', { type: 'button', class: 'btn btn-dark', hidden: !canEdit, onclick: async () => {
      try { await api('PUT', '/settings/scoring', { value: r }); toast('Reglas guardadas'); } catch (err) { toast(err.message, true); }
    } }, 'Guardar reglas');
    const recalc = el('button', { type: 'button', class: 'btn btn-outline-d', hidden: !canEdit, onclick: async () => {
      if (!window.confirm('¿Recalcular la puntuación de todos los prospectos abiertos con las reglas guardadas?')) return;
      try { const res = await api('POST', '/settings/scoring/recalculate', {}); toast(`${res.updated} prospectos actualizados`); } catch (err) { toast(err.message, true); }
    } }, 'Recalcular prospectos');
    put(
      el('div', { class: 'adm-head' }, el('h1', {}, 'Reglas de puntuación')),
      el('p', { class: 'adm-note adm-muted' }, 'La puntuación orienta al equipo: no impide que nadie reserve. Se suma el valor de cada respuesta y se compara con los umbrales.'),
      el('div', { class: 'adm-grid3' },
        group('Tipo de negocio', 'businessType', 'businessTypes'),
        group('Necesidades', 'needs', 'needs'),
        group('Personas', 'employees', 'employees'),
        group('Plazo', 'timeline', 'timelines'),
        el('section', { class: 'adm-card' }, el('h2', {}, 'Otros'), el('ul', { class: 'adm-score' },
          el('li', {}, el('span', {}, 'Máximo por necesidades'), input(r, 'needsCap', 'Máximo por necesidades')),
          el('li', {}, el('span', {}, 'Dejó correo'), input(r, 'emailBonus', 'Bono por correo')),
          el('li', {}, el('span', {}, 'Reservó demostración'), input(r, 'bookingBonus', 'Bono por reserva')))),
        el('section', { class: 'adm-card' }, el('h2', {}, 'Umbrales'), el('ul', { class: 'adm-score' },
          el('li', {}, el('span', {}, 'Prioridad alta desde'), input(r.thresholds, 'alta', 'Umbral alta')),
          el('li', {}, el('span', {}, 'Prioridad media desde'), input(r.thresholds, 'media', 'Umbral media'))))),
      el('div', { class: 'adm-save' }, recalc, save));
  }

  async function boot() {
    try {
      if (!me) me = (await api('GET', '/me')).user;
      catalog = await api('GET', '/catalog');
    } catch (err) {
      if (token) renderLogin(err.network || err.unavailable ? 'No se pudo conectar con el servidor.' : err.message);
      return;
    }
    shell();
    route();
  }

  if (token) boot(); else renderLogin();
})();
