import { config } from '../config.js';
import { formatForPeople } from './time.js';

// Envío de avisos. Un aviso solo se registra como "enviado" cuando el proveedor
// responde con éxito y devuelve un identificador del mensaje.

const TIMEOUT = 8000;

async function sendEmail({ to, subject, text }) {
  if (!config.resendKey || !config.emailFrom) return { status: 'no_configurado', provider: 'resend' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.emailFrom, to: [to], subject, text }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok && body.id) return { status: 'enviado', provider: 'resend', id: body.id };
    return { status: 'fallido', provider: 'resend', error: `HTTP ${r.status}` };
  } catch (err) {
    return { status: 'fallido', provider: 'resend', error: err.name === 'TimeoutError' ? 'Tiempo de espera agotado' : 'Error de red' };
  }
}

async function sendWhatsApp({ to, params }) {
  if (!config.whatsappToken || !config.whatsappPhoneId || !config.whatsappTemplate) return { status: 'no_configurado', provider: 'whatsapp_cloud' };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(config.whatsappPhoneId)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.whatsappToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: config.whatsappTemplate,
          language: { code: config.whatsappLang },
          components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const body = await r.json().catch(() => ({}));
    const id = body?.messages?.[0]?.id;
    if (r.ok && id) return { status: 'enviado', provider: 'whatsapp_cloud', id };
    return { status: 'fallido', provider: 'whatsapp_cloud', error: `HTTP ${r.status}` };
  } catch (err) {
    return { status: 'fallido', provider: 'whatsapp_cloud', error: err.name === 'TimeoutError' ? 'Tiempo de espera agotado' : 'Error de red' };
  }
}

const COPY = {
  confirmada: { subject: 'Tu demostración de NexoPOS está confirmada', intro: 'tu demostración de NexoPOS está confirmada' },
  reprogramada: { subject: 'Cambiamos la hora de tu demostración de NexoPOS', intro: 'tu demostración de NexoPOS tiene nueva fecha' },
  cancelada: { subject: 'Tu demostración de NexoPOS fue cancelada', intro: 'cancelamos tu demostración de NexoPOS como pediste' },
};

// Envía los avisos de una reserva y los registra. Devuelve el resultado por canal.
export async function notifyBooking(db, { purpose, lead, booking, manageUrl }) {
  const when = formatForPeople(new Date(booking.starts_at), lead.timezone);
  const copy = COPY[purpose];
  const lines = [
    `Hola, ${lead.name}: ${copy.intro}.`,
    '',
    purpose === 'cancelada' ? `Fecha cancelada: ${when} (${lead.timezone})` : `Fecha: ${when} (${lead.timezone})`,
    `Negocio: ${lead.business_name}`,
    '',
    purpose === 'cancelada'
      ? `Si quieres elegir otro día, puedes reservar de nuevo en ${config.publicSiteUrl}/book-demo/`
      : `Te contactaremos por WhatsApp al ${lead.whatsapp} a la hora acordada. Para cambiar la hora o cancelar: ${manageUrl}`,
    '',
    'Equipo NexoPOS',
  ];
  const tasks = [];
  const record = async (channel, recipient, result) => {
    await db.query(
      `INSERT INTO notifications (booking_id, lead_id, channel, recipient, purpose, status, provider, provider_message_id, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [booking.id, lead.id, channel, recipient, purpose, result.status, result.provider || null, result.id || null, result.error || null],
    );
    return { channel, status: result.status };
  };

  if (lead.email) {
    tasks.push(sendEmail({ to: lead.email, subject: copy.subject, text: lines.join('\n') }).then((r) => record('email', lead.email, r)));
  } else {
    tasks.push(record('email', '', { status: 'sin_destinatario' }));
  }
  tasks.push(sendWhatsApp({ to: lead.whatsapp, params: [lead.name, when, purpose === 'cancelada' ? `${config.publicSiteUrl}/book-demo/` : manageUrl] })
    .then((r) => record('whatsapp', lead.whatsapp, r)));
  if (config.salesEmail) {
    const text = [`Demostración ${purpose}: ${lead.name} (${lead.business_name})`, `Fecha: ${when} (${lead.timezone})`, `WhatsApp: ${lead.whatsapp}`, `Prioridad: ${lead.priority} (${lead.score} puntos)`].join('\n');
    tasks.push(sendEmail({ to: config.salesEmail, subject: `[NexoPOS] Demo ${purpose}: ${lead.business_name}`, text }).then((r) => record('email_equipo', config.salesEmail, r)));
  }
  const results = await Promise.all(tasks);
  return results.filter((r) => r.channel !== 'email_equipo');
}
