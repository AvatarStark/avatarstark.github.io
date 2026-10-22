// Gestión de una reserva con el enlace secreto (#t=...). El token nunca viaja en la URL al servidor web.
(() => {
  const { el, longLabel, tzLabel } = window.NexoCalendar;
  const track = (name, data) => window.nexoTrack && window.nexoTrack(name, data);
  const root = document.querySelector('[data-manage-root]');
  const token = new URLSearchParams(location.hash.slice(1)).get('t') || '';
  let tz = null;

  const heading = (text) => el('h2', { tabindex: '-1', class: 'manage-h' }, text);
  const focusHeading = () => root.querySelector('h2')?.focus();

  function summary(b) {
    return el('dl', { class: 'fsummary' },
      el('div', {}, el('dt', {}, 'Fecha y hora'), el('dd', {}, `${longLabel(b.start, tz)} · ${tzLabel(tz)}`)),
      el('div', {}, el('dt', {}, 'Te contactamos por'), el('dd', {}, `WhatsApp ${b.whatsapp}`)),
      el('div', {}, el('dt', {}, 'Negocio'), el('dd', {}, b.businessName)));
  }

  function fail(text) {
    root.replaceChildren(heading('No pudimos abrir tu reserva'), el('p', { class: 'fhint' }, text),
      el('div', { class: 'manage-actions' }, el('a', { class: 'btn btn-dark', href: '../' }, 'Reservar una demostración'),
        el('a', { class: 'btn btn-outline', href: 'https://wa.me/5363715593', target: '_blank', rel: 'noopener' }, 'Escribir por WhatsApp')));
    focusHeading();
  }

  function show(b, canChange, note) {
    tz = tz || b.timezone;
    const status = { confirmada: 'Tu demostración está confirmada', cancelada: 'Esta demostración está cancelada', realizada: 'Esta demostración ya se realizó', no_asistio: 'Esta demostración ya pasó' }[b.status];
    const nodes = [heading(note || status), summary(b)];
    if (canChange) {
      nodes.push(el('div', { class: 'manage-actions' },
        el('button', { type: 'button', class: 'btn btn-dark', onclick: () => reschedule(b) }, 'Cambiar fecha u hora'),
        el('button', { type: 'button', class: 'btn btn-danger', onclick: () => cancel(b) }, 'Cancelar demostración')));
    } else if (b.status === 'cancelada') {
      nodes.push(el('div', { class: 'manage-actions' }, el('a', { class: 'btn btn-dark', href: '../' }, 'Reservar otra demostración')));
    }
    root.replaceChildren(...nodes);
    focusHeading();
  }

  function reschedule(b) {
    const box = el('div');
    root.replaceChildren(heading('Elige el nuevo día y hora'), el('p', { class: 'fhint' }, `Ahora: ${longLabel(b.start, tz)}. Solo mostramos horarios libres.`), box,
      el('div', { class: 'manage-actions' }, el('button', { type: 'button', class: 'btn btn-outline', onclick: () => show(b, true) }, 'Volver')));
    focusHeading();
    window.NexoCalendar.create(box, {
      timezone: tz,
      track,
      confirmLabel: 'Cambiar a este horario',
      onConfirm: async (slot, chosenTz) => {
        try {
          const res = await window.NexoApi.request('POST', '/api/manage/reschedule', { token: current, start: slot.start });
          tz = chosenTz;
          current = res.manageToken;
          history.replaceState(null, '', `#t=${current}`); // replaceState no dispara hashchange
          track('step_complete', { step: 'reprogramar' });
          show(res.booking, true, 'Listo, cambiamos tu demostración');
          root.append(el('p', { class: 'fsmall', style: 'margin-top:14px' }, 'Este enlace se actualizó. Si guardaste el anterior, usa el de esta página a partir de ahora.'));
        } catch (err) {
          if (err.network || err.unavailable) throw new Error('No pudimos guardar el cambio por un problema de conexión. Inténtalo de nuevo.');
          throw err;
        }
      },
    });
  }

  function cancel(b) {
    const reason = el('textarea', { id: 'reason', maxlength: '300' });
    const msg = el('p', { class: 'cal-msg', role: 'alert', hidden: true });
    const confirmBtn = el('button', { type: 'button', class: 'btn btn-danger' }, 'Sí, cancelar');
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.classList.add('loading');
      confirmBtn.disabled = true;
      try {
        const res = await window.NexoApi.request('POST', '/api/manage/cancel', { token: current, reason: reason.value });
        track('step_complete', { step: 'cancelar' });
        show(res.booking, false, 'Cancelamos tu demostración');
      } catch (err) {
        msg.textContent = err.network || err.unavailable ? 'No pudimos cancelar por un problema de conexión. Inténtalo de nuevo.' : err.message;
        msg.hidden = false;
        confirmBtn.classList.remove('loading');
        confirmBtn.disabled = false;
      }
    });
    root.replaceChildren(heading('¿Cancelar la demostración?'), summary(b),
      el('div', { class: 'fform' }, el('div', { class: 'field' }, el('label', { for: 'reason' }, 'Motivo ', el('span', { class: 'opt-label' }, '(opcional)')), reason)),
      msg,
      el('div', { class: 'manage-actions' }, confirmBtn, el('button', { type: 'button', class: 'btn btn-outline', onclick: () => show(b, true) }, 'No, mantenerla')));
    focusHeading();
  }

  // Abrir otro enlace en la misma pestaña solo cambia el #: se recarga para leer la nueva reserva.
  window.addEventListener('hashchange', () => location.reload());
  let current = token;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return fail('El enlace no es válido. Ábrelo de nuevo desde tu confirmación.');
  window.NexoApi.request('POST', '/api/manage/lookup', { token })
    .then((res) => show(res.booking, res.canChange))
    .catch((err) => fail(err.network || err.unavailable ? 'El sistema de reservas no está disponible ahora mismo. Inténtalo en unos minutos.' : err.message));
})();
