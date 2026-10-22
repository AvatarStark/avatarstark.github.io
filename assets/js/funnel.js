// Embudo "Solicitar demostración": preguntas de cualificación, datos de contacto, calendario y confirmación.
(() => {
  const cfg = window.NEXO_CONFIG || {};
  const track = (name, data) => window.nexoTrack && window.nexoTrack(name, data);
  const { el, longLabel, tzLabel } = window.NexoCalendar;
  const STEPS = ['negocio', 'necesidades', 'equipo', 'plazo', 'contacto', 'horario'];
  const KEY = 'nexo_funnel';
  const DONE_KEY = 'nexo_funnel_done';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const form = document.querySelector('[data-form]');
  const live = document.querySelector('[data-live]');
  const backBtn = document.querySelector('[data-back]');
  const nextBtn = document.querySelector('[data-next]');
  const actions = document.querySelector('[data-actions]');
  const notice = document.querySelector('[data-notice]');
  const progressLabel = document.querySelector('[data-progress-label]');
  const progressFill = document.querySelector('[data-progress-fill]');
  const progressBar = document.querySelector('[role="progressbar"]');
  const done = document.querySelector('[data-done]');
  const stepEls = Object.fromEntries(STEPS.map((s) => [s, form.querySelector(`[data-step="${s}"]`)]));

  const storage = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento: el formulario sigue funcionando */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch { /* idem */ } },
  };

  let state = storage.get(KEY) || {};
  state.answers = state.answers || {};
  if (!state.startedAt) state.startedAt = Date.now();
  if (state.tokenExp && state.tokenExp < Date.now()) { delete state.bookingToken; delete state.tokenExp; if (state.step === 'horario') state.step = 'contacto'; }
  let step = STEPS.includes(state.step) ? state.step : 'negocio';
  if (step === 'horario' && !state.bookingToken) step = 'contacto';
  const save = () => storage.set(KEY, { ...state, step });

  // Origen y parámetros de campaña.
  const params = new URLSearchParams(location.search);
  const presetBusiness = params.get('negocio');
  if (presetBusiness && !state.answers.businessType && ['cafeteria', 'tienda', 'fregadora', 'otro'].includes(presetBusiness)) state.answers.businessType = presetBusiness;
  if (!state.utm) {
    const utm = {};
    for (const k of ['source', 'medium', 'campaign', 'content', 'term']) if (params.get(`utm_${k}`)) utm[k] = params.get(`utm_${k}`).slice(0, 80);
    if (params.get('origen')) utm.content = utm.content || `origen:${params.get('origen').slice(0, 40)}`;
    state.utm = Object.keys(utm).length ? utm : null;
  }

  // Zona horaria del contacto.
  window.NexoCalendar.fillTimezones(form.elements.timezone, state.answers.timezone);

  // Restaura respuestas guardadas.
  function restore() {
    const a = state.answers;
    for (const [name, value] of Object.entries(a)) {
      const field = form.elements[name];
      if (!field) continue;
      if (name === 'needs') {
        form.querySelectorAll('input[name="needs"]').forEach((c) => { c.checked = value.includes(c.value); });
      } else if (field instanceof RadioNodeList || field.type === 'radio') {
        form.querySelectorAll(`input[name="${name}"]`).forEach((r) => { r.checked = r.value === value; });
      } else if (field.type === 'checkbox') {
        field.checked = !!value;
      } else {
        field.value = value;
      }
    }
    toggleOther();
  }

  function collect() {
    const f = form.elements;
    const radio = (n) => (form.querySelector(`input[name="${n}"]:checked`) || {}).value;
    state.answers = {
      businessType: radio('businessType'),
      needs: [...form.querySelectorAll('input[name="needs"]:checked')].map((c) => c.value),
      needsOther: f.needsOther.value.trim(),
      employees: radio('employees'),
      timeline: radio('timeline'),
      name: f.name.value.trim(),
      businessName: f.businessName.value.trim(),
      whatsapp: f.whatsapp.value.trim(),
      email: f.email.value.trim(),
      timezone: f.timezone.value,
      consent: f.consent.checked,
    };
    save();
    return state.answers;
  }

  function toggleOther() {
    const other = form.querySelector('input[name="needs"][value="otros"]');
    form.querySelector('[data-other]').hidden = !other.checked;
  }
  form.addEventListener('change', (e) => {
    if (e.target.name === 'needs') toggleOther();
    clearError(e.target.name);
    collect();
  });
  form.addEventListener('input', (e) => { if (e.target.matches('input[type="text"],input[type="tel"],input[type="email"]')) { clearError(e.target.name); collect(); } });

  // Errores de validación, junto al campo.
  function showError(name, text) {
    const p = form.querySelector(`[data-error="${name}"]`);
    if (!p) return;
    p.textContent = text;
    p.hidden = false;
    const input = form.elements[name];
    if (input && input.setAttribute && !(input instanceof RadioNodeList)) input.setAttribute('aria-invalid', 'true');
  }
  function clearError(name) {
    const p = form.querySelector(`[data-error="${name}"]`);
    if (p) p.hidden = true;
    const input = form.elements[name];
    if (input && input.removeAttribute && !(input instanceof RadioNodeList)) input.removeAttribute('aria-invalid');
  }
  const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
  const phoneOk = (v) => /^\d{8,15}$/.test(v.replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, ''));

  function validate(s) {
    const a = collect();
    const errs = {};
    if (s === 'negocio' && !a.businessType) errs.businessType = 'Elige una opción para continuar.';
    if (s === 'necesidades' && !a.needs.length) errs.needs = 'Elige al menos una opción.';
    if (s === 'equipo' && !a.employees) errs.employees = 'Elige una opción para continuar.';
    if (s === 'plazo' && !a.timeline) errs.timeline = 'Elige una opción para continuar.';
    if (s === 'contacto') {
      if (a.name.length < 2) errs.name = 'Escribe tu nombre.';
      if (a.businessName.length < 2) errs.businessName = 'Escribe el nombre de tu negocio.';
      if (!phoneOk(a.whatsapp)) errs.whatsapp = 'Escribe el número con código de país, por ejemplo +53 5 123 4567.';
      if (a.email && !EMAIL.test(a.email)) errs.email = 'Revisa el correo o déjalo vacío.';
      if (!a.timezone) errs.timezone = 'Elige tu país o zona horaria.';
      if (!a.consent) errs.consent = 'Necesitamos tu permiso para contactarte sobre la demostración.';
    }
    Object.entries(errs).forEach(([k, v]) => showError(k, v));
    const first = Object.keys(errs)[0];
    if (first) {
      const target = form.elements[first];
      const focusable = target instanceof RadioNodeList ? target[0] : target && target.focus ? target : form.querySelector(`input[name="${first}"]`);
      if (focusable) focusable.focus();
    }
    return !first;
  }

  function hideNotice() { notice.hidden = true; notice.replaceChildren(); }

  function go(target, { focus = true } = {}) {
    hideNotice();
    const prevIndex = STEPS.indexOf(step);
    step = target;
    save();
    const i = STEPS.indexOf(step);
    STEPS.forEach((s) => {
      const on = s === step;
      stepEls[s].hidden = !on;
      if (on && !reduced) stepEls[s].classList.remove('enter-back', 'enter');
      if (on && !reduced) { void stepEls[s].offsetWidth; stepEls[s].classList.add(i < prevIndex ? 'enter-back' : 'enter'); }
    });
    progressLabel.textContent = `Paso ${i + 1} de ${STEPS.length}`;
    progressFill.style.transform = `scaleX(${(i + 1) / STEPS.length})`;
    progressBar.setAttribute('aria-valuenow', String(i + 1));
    document.querySelectorAll('[data-stepper] li').forEach((li, k) => { li.classList.toggle('done', k < i); li.classList.toggle('current', k === i); });
    backBtn.hidden = i === 0;
    actions.hidden = step === 'horario';
    nextBtn.firstChild.textContent = step === 'contacto' ? 'Ver horarios disponibles ' : 'Continuar ';
    const h = stepEls[step].querySelector('h2');
    live.textContent = `Paso ${i + 1} de ${STEPS.length}: ${h.textContent}`;
    if (focus) h.focus({ preventScroll: true });
    if (focus && window.innerWidth < 980) document.querySelector('.fcard').scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    track('step_view', { step });
    if (step === 'horario') startCalendar();
    if (step === 'contacto') mountTurnstile();
  }

  backBtn.addEventListener('click', () => {
    const i = STEPS.indexOf(step);
    // Desde el calendario se vuelve a los datos de contacto: al reenviarlos el servidor corrige la misma ficha.
    if (i > 0) go(STEPS[i - 1]);
  });

  // Elegir una opción con el ratón o el dedo avanza solo; con teclado se confirma con Enter o Continuar.
  let pointerAt = 0;
  form.addEventListener('pointerdown', (e) => { if (e.target.closest('.opt')) pointerAt = Date.now(); });
  form.addEventListener('change', (e) => {
    if (e.target.type !== 'radio' || Date.now() - pointerAt > 800) return;
    const s = step;
    setTimeout(() => { if (step === s) advance(); }, reduced ? 0 : 260);
  });

  form.addEventListener('submit', (e) => { e.preventDefault(); advance(); });

  let busy = false;
  async function advance() {
    if (busy || !validate(step)) return;
    if (step === 'contacto') return submitLead();
    track('step_complete', { step });
    go(STEPS[STEPS.indexOf(step) + 1]);
  }

  // --- Antispam opcional: Cloudflare Turnstile ---
  let turnstileId = null;
  function mountTurnstile() {
    if (!cfg.turnstileSiteKey || turnstileId !== null) return;
    const box = form.querySelector('[data-turnstile]');
    box.hidden = false;
    const render = () => { turnstileId = window.turnstile.render(box, { sitekey: cfg.turnstileSiteKey, language: 'es' }); };
    if (window.turnstile) return render();
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = render;
    document.head.append(s);
  }

  function whatsappFallback() {
    const a = state.answers;
    const L = {
      businessType: { cafeteria: 'Cafetería, restaurante o bar', tienda: 'Tienda, mini o bodega', fregadora: 'Fregadora', otro: 'Otro' },
      needs: { inventario: 'inventario', ventas: 'registro de ventas', ganancias: 'ganancias', administracion: 'administración', reportes: 'reportes', otros: 'otros' },
      employees: { solo: 'solo yo', '2-5': '2 a 5', '6-15': '6 a 15', '15+': 'más de 15' },
      timeline: { inmediato: 'inmediatamente', este_mes: 'este mes', tres_meses: 'próximos tres meses', investigando: 'solo investigando' },
    };
    const text = [
      'Hola, quiero una demostración de NexoPOS.',
      `Nombre: ${a.name || '-'}`, `Negocio: ${a.businessName || '-'} (${L.businessType[a.businessType] || '-'})`,
      `Necesito mejorar: ${(a.needs || []).map((n) => L.needs[n]).join(', ') || '-'}`,
      `Personas: ${L.employees[a.employees] || '-'}`, `Plazo: ${L.timeline[a.timeline] || '-'}`,
      `Zona horaria: ${a.timezone ? tzLabel(a.timezone) : '-'}`,
    ].join('\n');
    return `https://wa.me/${cfg.whatsapp || '5363715593'}?text=${encodeURIComponent(text)}`;
  }

  function showUnavailable() {
    notice.replaceChildren(
      el('p', {}, el('b', {}, 'No pudimos conectar con el sistema de reservas.'), ' Tus respuestas siguen guardadas en esta página. Puedes intentarlo de nuevo en unos minutos o enviárnoslas por WhatsApp y acordamos la hora contigo.'),
      el('div', { class: 'fnotice-actions' },
        el('a', { class: 'btn btn-green', href: whatsappFallback(), target: '_blank', rel: 'noopener', 'data-cta': 'funnel-fallback' }, 'Enviar por WhatsApp'),
        el('button', { type: 'button', class: 'btn btn-outline', onclick: () => advance() }, 'Reintentar')));
    notice.hidden = false;
    notice.focus?.();
  }

  async function submitLead() {
    busy = true;
    nextBtn.disabled = true;
    nextBtn.classList.add('loading');
    hideNotice();
    const a = state.answers;
    const country = (window.NexoCalendar.TIMEZONES.find(([v]) => v === a.timezone) || [, ''])[1].replace(/\s*\(.*\)$/, '');
    try {
      const res = await window.NexoApi.request('POST', '/api/leads', {
        ...a,
        email: a.email || null,
        needsOther: a.needs.includes('otros') ? a.needsOther : '',
        country,
        website: form.elements.website.value,
        elapsedMs: Date.now() - state.startedAt,
        sessionId: window.NEXO_SESSION,
        variant: window.NEXO_VARIANT,
        utm: state.utm,
        turnstileToken: turnstileId !== null && window.turnstile ? window.turnstile.getResponse(turnstileId) : undefined,
      });
      state.bookingToken = res.bookingToken;
      state.tokenExp = Date.now() + 23 * 3600 * 1000;
      track('step_complete', { step: 'contacto' });
      go('horario');
    } catch (err) {
      if (err.status === 422 && err.data.fields) {
        Object.entries(err.data.fields).forEach(([k, v]) => showError(k, v));
        const first = Object.keys(err.data.fields)[0];
        const stepOf = { businessType: 'negocio', needs: 'necesidades', employees: 'equipo', timeline: 'plazo' }[first];
        if (stepOf) { go(stepOf); showError(first, err.data.fields[first]); }
      } else if (err.network || err.unavailable) {
        showUnavailable();
      } else {
        notice.replaceChildren(el('p', {}, err.message));
        notice.hidden = false;
      }
      if (turnstileId !== null && window.turnstile) window.turnstile.reset(turnstileId);
    } finally {
      busy = false;
      nextBtn.disabled = false;
      nextBtn.classList.remove('loading');
    }
  }

  // --- Calendario ---
  let calendar = null;
  function startCalendar() {
    const greet = stepEls.horario.querySelector('[data-greeting]');
    const first = (state.answers.name || '').split(' ')[0];
    greet.textContent = `Gracias, ${first}. Solo mostramos horarios que de verdad están libres.`;
    calendar = window.NexoCalendar.create(stepEls.horario.querySelector('[data-calendar]'), {
      timezone: state.answers.timezone,
      track,
      onEmpty: () => el('div', { class: 'cal-empty' },
        el('p', {}, el('b', {}, 'Ahora mismo no hay horarios libres en los próximos días.')),
        el('p', {}, 'Ya recibimos tus datos y te escribiremos por WhatsApp para acordar una hora. Si lo prefieres, escríbenos tú.'),
        el('a', { class: 'btn btn-green', href: `https://wa.me/${cfg.whatsapp || '5363715593'}`, target: '_blank', rel: 'noopener', 'data-cta': 'funnel-noslots' }, 'Escribir por WhatsApp')),
      onConfirm: async (slot, tz) => {
        try {
          const res = await window.NexoApi.request('POST', '/api/bookings', { token: state.bookingToken, start: slot.start, sessionId: window.NEXO_SESSION });
          finish(res, tz);
        } catch (err) {
          if (err.status === 401) {
            delete state.bookingToken;
            save();
            go('contacto');
            notice.replaceChildren(el('p', {}, err.message));
            notice.hidden = false;
            return;
          }
          if (err.network || err.unavailable) throw new Error('No pudimos confirmar la reserva por un problema de conexión. Inténtalo de nuevo.');
          throw err;
        }
      },
    });
  }

  // --- Confirmación ---
  function finish(res, displayTz) {
    const data = { booking: res.booking, manageUrl: res.manageUrl, notifications: res.notifications, displayTz };
    storage.del(KEY);
    storage.set(DONE_KEY, data);
    renderDone(data);
  }

  function icsFor(b, manageUrl) {
    const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (s) => String(s).replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NexoPOS//Demostraciones//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', `UID:nexopos-demo-${b.id}-${stamp(b.start)}@nexopos`, `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(b.start)}`, `DTEND:${stamp(b.end)}`, 'SUMMARY:Demostración de NexoPOS',
      `DESCRIPTION:${esc(`Te contactaremos por WhatsApp al ${b.whatsapp}.\nPara cambiar la hora o cancelar: ${manageUrl}`)}`,
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Demostración de NexoPOS', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n');
  }

  function renderDone({ booking: b, manageUrl, notifications, displayTz }) {
    const tz = displayTz || b.timezone;
    document.querySelector('[data-progress]').hidden = true;
    form.hidden = true;
    done.hidden = false;
    done.querySelector('[data-done-title]').textContent = `¡Listo, ${b.name.split(' ')[0]}! Tu demostración está confirmada.`;
    done.querySelector('[data-sum="when"]').textContent = `${longLabel(b.start, tz)} · ${tzLabel(tz)}`;
    done.querySelector('[data-sum="contact"]').textContent = `WhatsApp ${b.whatsapp}`;
    done.querySelector('[data-sum="business"]').textContent = b.businessName;
    if (b.email) { done.querySelector('[data-sum-email-row]').hidden = false; done.querySelector('[data-sum="email"]').textContent = b.email; }

    // Solo se afirma un envío cuando el servidor confirma que el proveedor lo aceptó.
    const list = done.querySelector('[data-notify]');
    const sent = (notifications || []).filter((n) => n.status === 'enviado');
    const items = [];
    if (sent.some((n) => n.channel === 'email')) items.push(`Te enviamos la confirmación a ${b.email}.`);
    if (sent.some((n) => n.channel === 'whatsapp')) items.push('Te enviamos la confirmación por WhatsApp.');
    if (!sent.length) items.push('Guarda esta confirmación: añádela a tu calendario o copia el enlace para gestionar tu reserva.');
    items.push('A la hora acordada te escribimos por WhatsApp para empezar la demostración.');
    list.replaceChildren(...items.map((t) => el('li', {}, t)));

    const manage = done.querySelector('[data-manage]');
    manage.href = manageUrl;
    done.querySelector('[data-ics]').onclick = () => {
      const blob = new Blob([icsFor(b, manageUrl)], { type: 'text/calendar;charset=utf-8' });
      const a = el('a', { href: URL.createObjectURL(blob), download: 'demostracion-nexopos.ics' });
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
    done.querySelector('[data-copy]').onclick = async () => {
      try { await navigator.clipboard.writeText(manageUrl); done.querySelector('[data-copied]').hidden = false; } catch { window.prompt('Copia este enlace:', manageUrl); }
    };
    const h = done.querySelector('h2');
    h.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    document.title = 'Demostración confirmada | NexoPOS';
  }

  // Inicio
  const finished = storage.get(DONE_KEY);
  if (finished && !state.answers.businessType) {
    renderDone(finished);
    return;
  }
  storage.del(DONE_KEY);
  restore();
  try {
    if (!sessionStorage.getItem('nexo_funnel_started')) { sessionStorage.setItem('nexo_funnel_started', '1'); track('funnel_start'); }
  } catch { track('funnel_start'); }
  go(step, { focus: false });
})();
