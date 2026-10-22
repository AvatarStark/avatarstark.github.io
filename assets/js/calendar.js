// Calendario de reservas: muestra solo los horarios libres que devuelve el servidor.
(() => {
  const TIMEZONES = [
    ['America/Havana', 'Cuba (La Habana)'],
    ['America/Mexico_City', 'México (Ciudad de México)'],
    ['America/Bogota', 'Colombia (Bogotá)'],
    ['America/Lima', 'Perú (Lima)'],
    ['America/Caracas', 'Venezuela (Caracas)'],
    ['America/Santo_Domingo', 'República Dominicana'],
    ['America/Puerto_Rico', 'Puerto Rico'],
    ['America/Panama', 'Panamá'],
    ['America/Guayaquil', 'Ecuador (Guayaquil)'],
    ['America/Costa_Rica', 'Costa Rica'],
    ['America/Guatemala', 'Guatemala'],
    ['America/El_Salvador', 'El Salvador'],
    ['America/Tegucigalpa', 'Honduras'],
    ['America/Managua', 'Nicaragua'],
    ['America/La_Paz', 'Bolivia (La Paz)'],
    ['America/Asuncion', 'Paraguay (Asunción)'],
    ['America/Santiago', 'Chile (Santiago)'],
    ['America/Argentina/Buenos_Aires', 'Argentina (Buenos Aires)'],
    ['America/Montevideo', 'Uruguay (Montevideo)'],
    ['America/New_York', 'EE. UU. (Miami, Nueva York)'],
    ['America/Chicago', 'EE. UU. (Chicago, Houston)'],
    ['America/Los_Angeles', 'EE. UU. (Los Ángeles)'],
    ['Europe/Madrid', 'España (península)'],
    ['Atlantic/Canary', 'España (Canarias)'],
  ];

  const detectTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'America/Havana'; } };

  function fillTimezones(select, selected) {
    const list = TIMEZONES.slice();
    const here = detectTz();
    if (here && !list.some(([v]) => v === here)) list.unshift([here, `Mi zona actual (${here.replace(/_/g, ' ')})`]);
    if (selected && !list.some(([v]) => v === selected)) list.unshift([selected, selected.replace(/_/g, ' ')]);
    select.replaceChildren(...list.map(([v, l]) => { const o = new Option(l, v); return o; }));
    select.value = selected || (list.some(([v]) => v === here) ? here : 'America/Havana');
  }
  const tzLabel = (tz) => (TIMEZONES.find(([v]) => v === tz) || [tz, tz.replace(/_/g, ' ')])[1];

  const fmt = (tz, opts) => new Intl.DateTimeFormat('es-ES', { timeZone: tz, ...opts });
  const dayKey = (iso, tz) => fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
    .reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
  const keyOf = (iso, tz) => { const p = dayKey(iso, tz); return `${p.year}-${p.month}-${p.day}`; };
  const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
  const toKey = (d) => d.toISOString().slice(0, 10);
  const addDays = (k, n) => { const d = fromKey(k); d.setUTCDate(d.getUTCDate() + n); return toKey(d); };
  const mondayOf = (k) => { const d = fromKey(k); const wd = (d.getUTCDay() + 6) % 7; return addDays(k, -wd); };
  const timeLabel = (iso, tz) => fmt(tz, { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
  const longLabel = (iso, tz) => fmt(tz, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
  const utcFmt = (opts) => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', ...opts });

  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    }
    n.append(...children.filter((c) => c != null && c !== false));
    return n;
  }

  function create(root, { timezone, confirmLabel = 'Confirmar demostración', onConfirm, onEmpty, track = () => {} }) {
    let tz = timezone;
    let slots = [];
    let byDay = new Map();
    let week = null;
    let day = null;
    let chosen = null;

    const tzSelect = el('select', { id: `cal-tz-${Math.random().toString(36).slice(2, 7)}`, class: 'cal-tz-select' });
    fillTimezones(tzSelect, tz);
    tzSelect.addEventListener('change', () => { tz = tzSelect.value; chosen = null; week = null; index(); render(); });
    const prev = el('button', { type: 'button', class: 'cal-nav', 'aria-label': 'Semana anterior' }, '‹');
    const next = el('button', { type: 'button', class: 'cal-nav', 'aria-label': 'Semana siguiente' }, '›');
    const weekLabel = el('span', { class: 'cal-week-label', 'aria-live': 'polite' });
    const days = el('div', { class: 'cal-days', role: 'group', 'aria-label': 'Días' });
    const slotsBox = el('div', { class: 'cal-slots', role: 'group', 'aria-label': 'Horarios disponibles' });
    const status = el('div', { class: 'cal-status', 'aria-live': 'polite' });
    const confirmText = el('p', { class: 'cal-chosen' });
    const confirmBtn = el('button', { type: 'button', class: 'btn btn-green btn-lg cal-confirm-btn' }, confirmLabel);
    const confirmBox = el('div', { class: 'cal-confirm', hidden: true }, confirmText, confirmBtn);
    const msg = el('p', { class: 'cal-msg', role: 'alert', hidden: true });

    root.replaceChildren(el('div', { class: 'cal' },
      el('div', { class: 'cal-tz' }, el('label', { for: tzSelect.id }, 'Horarios en'), tzSelect),
      el('div', { class: 'cal-week' }, prev, weekLabel, next),
      days, slotsBox, status, msg, confirmBox));

    prev.addEventListener('click', () => { week = addDays(week, -7); pickFirstDay(); render(); });
    next.addEventListener('click', () => { week = addDays(week, 7); pickFirstDay(); render(); });
    confirmBtn.addEventListener('click', async () => {
      if (!chosen) return;
      confirmBtn.disabled = true;
      confirmBtn.classList.add('loading');
      msg.hidden = true;
      try {
        await onConfirm(chosen, tz);
      } catch (err) {
        msg.textContent = err.message;
        msg.hidden = false;
        if (err.status === 409) { track('booking_conflict'); chosen = null; await load(); }
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('loading');
      }
    });

    function index() {
      byDay = new Map();
      for (const s of slots) {
        const k = keyOf(s.start, tz);
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k).push(s);
      }
    }
    const keys = () => [...byDay.keys()].sort();
    function pickFirstDay() {
      const inWeek = keys().filter((k) => k >= week && k < addDays(week, 7));
      day = inWeek[0] || null;
    }

    function render() {
      const all = keys();
      if (!all.length) return;
      if (!week) { day = all[0]; week = mondayOf(day); }
      prev.disabled = week <= mondayOf(all[0]);
      next.disabled = addDays(week, 7) > all[all.length - 1];
      const end = addDays(week, 6);
      weekLabel.textContent = `${utcFmt({ day: 'numeric', month: 'short' }).format(fromKey(week))} – ${utcFmt({ day: 'numeric', month: 'short' }).format(fromKey(end))}`;
      const today = keyOf(new Date().toISOString(), tz);
      days.replaceChildren(...Array.from({ length: 7 }, (_, i) => {
        const k = addDays(week, i);
        const count = (byDay.get(k) || []).length;
        const d = fromKey(k);
        const btn = el('button', {
          type: 'button', class: 'cal-day', 'aria-pressed': String(k === day), disabled: !count,
          'aria-label': `${utcFmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d)}${count ? `, ${count} horarios` : ', sin horarios'}`,
        },
        el('span', { class: 'cal-dow' }, utcFmt({ weekday: 'short' }).format(d).replace('.', '')),
        el('span', { class: 'cal-num' }, String(d.getUTCDate())),
        el('span', { class: 'cal-count' }, count ? (k === today ? 'Hoy' : `${count}`) : '—'));
        btn.addEventListener('click', () => { day = k; chosen = null; render(); });
        return btn;
      }));
      const list = byDay.get(day) || [];
      slotsBox.replaceChildren(
        el('p', { class: 'cal-day-title' }, day ? utcFmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(fromKey(day)) : 'No hay horarios libres esta semana'),
        el('div', { class: 'cal-times' }, ...list.map((s) => {
          const b = el('button', { type: 'button', class: 'cal-time', 'aria-pressed': String(chosen?.start === s.start) }, timeLabel(s.start, tz));
          b.addEventListener('click', () => { chosen = s; track('slot_selected'); render(); confirmBtn.focus({ preventScroll: true }); confirmBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
          return b;
        })));
      confirmBox.hidden = !chosen;
      if (chosen) confirmText.replaceChildren('Has elegido ', el('b', {}, longLabel(chosen.start, tz)), ` · ${tzLabel(tz)}`);
    }

    async function load() {
      root.querySelector('.cal').classList.add('is-loading');
      status.replaceChildren(el('div', { class: 'cal-sk', 'aria-hidden': 'true' },
        el('div', { class: 'cal-sk-days' }, ...Array.from({ length: 7 }, () => el('i'))),
        el('b'),
        el('div', { class: 'cal-skeleton' }, ...Array.from({ length: 9 }, () => el('i')))), el('span', { class: 'sr-only' }, 'Cargando horarios…'));
      try {
        const data = await window.NexoApi.request('GET', '/api/slots');
        slots = data.slots || [];
        status.replaceChildren();
        index();
        if (!slots.length) {
          root.querySelector('.cal').classList.add('is-empty');
          status.replaceChildren(onEmpty ? onEmpty() : el('p', {}, 'No hay horarios libres en los próximos días.'));
          return;
        }
        render();
      } catch (err) {
        status.replaceChildren(el('div', { class: 'cal-error' },
          el('p', {}, err.unavailable ? 'El calendario no está disponible ahora mismo.' : err.message),
          el('button', { type: 'button', class: 'btn btn-outline', onclick: load }, 'Reintentar')));
      } finally {
        root.querySelector('.cal').classList.remove('is-loading');
      }
    }

    load();
    return { reload: load };
  }

  window.NexoCalendar = { create, fillTimezones, tzLabel, longLabel, el, TIMEZONES };
})();
