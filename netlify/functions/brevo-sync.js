import {
  toE164Colombia,
  parseRecipients,
  sendBrevoEmail,
  upsertBrevoContact,
  getBrevoContact,
  acumularValor,
  hoyISO,
} from './lib/brevo.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.BREVO_API_KEY;
  const listId = process.env.BREVO_LIST_ID;

  if (!apiKey || !listId) {
    console.error('[brevo-sync] Falta BREVO_API_KEY o BREVO_LIST_ID en las variables de entorno de Netlify');
    return { statusCode: 500, body: 'Missing Brevo configuration' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    console.error('[brevo-sync] No se pudo parsear el body como JSON', err);
    return { statusCode: 400, body: 'Invalid payload' };
  }

  const data = body?.payload?.data || body?.data || {};
  const email = data.correo || data.email;

  if (!email) {
    console.error('[brevo-sync] No se encontró el correo en el payload recibido:', JSON.stringify(body));
    return { statusCode: 400, body: 'Missing email' };
  }

  const nombre = data.nombre || '';
  const taller = data.fecha || 'nuestro taller';
  const whatsappLead = toE164Colombia(data.whatsapp);

  // Ver la nota en producto-sync.js: el CRM no puede ser un punto único de falla.
  // Si Brevo rechaza el contacto y cortáramos acá, no saldría ningún correo y además
  // Netlify desactivaría el webhook tras 6 fallos, perdiendo las inscripciones
  // siguientes en silencio.
  // Ver la nota en producto-sync.js: se lee antes de escribir para acumular el
  // historial de talleres en vez de sobrescribir el anterior.
  const existente = await getBrevoContact({ apiKey, email });
  const attrsPrevios = existente?.attributes || {};

  let errorContacto = null;
  try {
    await upsertBrevoContact({
      apiKey,
      listId,
      email,
      attributes: {
        NOMBRE: nombre,
        CELULAR: whatsappLead,
        TALLER: acumularValor(attrsPrevios.TALLER, taller),
        TURNO_PREFERENCIA: data.turno || '',
        ULTIMO_PEDIDO: hoyISO(),
      },
    });
  } catch (err) {
    errorContacto = err;
    console.error('[brevo-sync] No se pudo guardar el contacto en Brevo, se continúa con los correos', err);
  }

  await sendBrevoEmail({
    apiKey,
    recipients: [{ email, name: nombre || undefined }],
    bcc: parseRecipients(process.env.BUSINESS_NOTIFY_EMAIL),
    subject: '¡Recibimos tu inscripción! — Inefable ALRO',
    htmlContent: `
      <p>Hola ${nombre || ''},</p>
      <p>Recibimos tu pre-inscripción para <strong>${taller}</strong>. En breve te escribimos por WhatsApp para confirmar tu cupo.</p>
      <p>¡Gracias por escoger Inefable ALRO!</p>
    `,
  });

  const notifyRecipients = parseRecipients(process.env.BUSINESS_NOTIFY_EMAIL);
  if (notifyRecipients.length > 0) {
    const waLink = whatsappLead
      ? `https://wa.me/${whatsappLead.replace('+', '')}?text=${encodeURIComponent(
          `¡Hola ${nombre}! Te escribo de Inefable ALRO por tu inscripción a ${taller}.`
        )}`
      : null;

    await sendBrevoEmail({
      apiKey,
      recipients: notifyRecipients,
      // Remitente propio: el correo interno no le llega a clientes, así que no
      // hace falta esperar el correo corporativo para activarlo (puede ser el
      // personal). El de confirmación al cliente sigue usando BREVO_SENDER_EMAIL.
      senderEmail: process.env.BREVO_SENDER_EMAIL_INTERNO || process.env.BREVO_SENDER_EMAIL,
      senderName: process.env.BREVO_SENDER_NAME_INTERNO || process.env.BREVO_SENDER_NAME,
      subject: `Nueva inscripción: ${nombre || 'Sin nombre'} — ${taller}`,
      htmlContent: `
        <p><strong>Nombre:</strong> ${nombre}</p>
        <p><strong>Taller:</strong> ${taller}</p>
        <p><strong>Turno:</strong> ${data.turno || ''}</p>
        <p><strong>Correo:</strong> ${email}</p>
        <p><strong>WhatsApp:</strong> ${whatsappLead}</p>
        ${waLink ? `<p><a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Escríbele por WhatsApp →</a></p>` : ''}
        ${errorContacto ? `<p style="margin-top:20px;padding:12px;background:#fff4e5;border-left:3px solid #c98a45;font-size:13px;">⚠️ Esta inscripción <strong>no se pudo guardar en Brevo</strong>, así que no aparecerá en la lista de contactos. Los datos de arriba son la única copia — agrégala a mano si la necesitas. Motivo: ${errorContacto.message}</p>` : ''}
      `,
    });
  } else {
    console.warn('[brevo-sync] BUSINESS_NOTIFY_EMAIL no configurado, se omite el correo de notificación a la empresa');
  }

  // Ver la nota de arriba: siempre 200 para no provocar la desactivación del webhook.
  return { statusCode: 200, body: errorContacto ? 'ok (contacto no guardado en Brevo)' : 'ok' };
};
