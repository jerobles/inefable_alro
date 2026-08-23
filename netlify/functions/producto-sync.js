import { toE164Colombia, parseRecipients, sendBrevoEmail, upsertBrevoContact } from './lib/brevo.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.BREVO_API_KEY;
  const listId = process.env.BREVO_PRODUCTOS_LIST_ID;

  if (!apiKey || !listId) {
    console.error('[producto-sync] Falta BREVO_API_KEY o BREVO_PRODUCTOS_LIST_ID en las variables de entorno de Netlify');
    return { statusCode: 500, body: 'Missing Brevo configuration' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    console.error('[producto-sync] No se pudo parsear el body como JSON', err);
    return { statusCode: 400, body: 'Invalid payload' };
  }

  const data = body?.payload?.data || body?.data || {};
  const email = data.correo || data.email;

  if (!email) {
    console.error('[producto-sync] No se encontró el correo en el payload recibido:', JSON.stringify(body));
    return { statusCode: 400, body: 'Missing email' };
  }

  const nombre = data.nombre || '';
  const producto = data.producto || 'un producto del catálogo';
  const cantidad = data.cantidad || '';
  const whatsappLead = toE164Colombia(data.whatsapp);
  const presentacion = data.presentacion || '';
  const direccion = data.direccion || '';
  const entregaLabel =
    { 'bogota-norte': 'Norte de Bogotá (envío gratis)', 'bogota-resto': 'Resto de Bogotá (domicilio con costo)' }[
      data.entrega
    ] || 'Otra ciudad — a coordinar por WhatsApp';

  // El registro en el CRM se intenta, pero NO puede ser un punto único de falla: si
  // Brevo rechaza el contacto y cortáramos acá, no se enviaría ningún correo y el
  // negocio no se enteraría del pedido. Peor aún, devolver error hace que Netlify
  // desactive el webhook tras 6 fallos seguidos y se pierdan TODOS los pedidos
  // siguientes en silencio — que fue justo lo que pasó el 2026-08-22.
  let errorContacto = null;
  try {
    await upsertBrevoContact({
      apiKey,
      listId,
      email,
      attributes: {
        NOMBRE: nombre,
        WHATSAPP: whatsappLead,
        PRODUCTO_INTERES: producto,
      },
    });
  } catch (err) {
    errorContacto = err;
    console.error('[producto-sync] No se pudo guardar el contacto en Brevo, se continúa con los correos', err);
  }

  await sendBrevoEmail({
    apiKey,
    recipients: [{ email, name: nombre || undefined }],
    bcc: parseRecipients(process.env.BUSINESS_NOTIFY_EMAIL),
    subject: '¡Recibimos tu pedido! — Inefable ALRO',
    htmlContent: `
      <p>Hola ${nombre || ''},</p>
      <p>Recibimos tu interés en <strong>${producto}</strong>. En breve te escribimos por WhatsApp para confirmar disponibilidad, cantidades y coordinar el pago y la entrega.</p>
      <p>¡Gracias por escoger Inefable ALRO!</p>
    `,
  });

  const notifyRecipients = parseRecipients(process.env.BUSINESS_NOTIFY_EMAIL);
  if (notifyRecipients.length > 0) {
    const waLink = whatsappLead
      ? `https://wa.me/${whatsappLead.replace('+', '')}?text=${encodeURIComponent(
          `¡Hola ${nombre}! Te escribo de Inefable ALRO por tu pedido de ${producto}.`
        )}`
      : null;

    await sendBrevoEmail({
      apiKey,
      recipients: notifyRecipients,
      senderEmail: process.env.BREVO_SENDER_EMAIL_INTERNO || process.env.BREVO_SENDER_EMAIL,
      senderName: process.env.BREVO_SENDER_NAME_INTERNO || process.env.BREVO_SENDER_NAME,
      subject: `Nuevo pedido: ${nombre || 'Sin nombre'} — ${producto}`,
      htmlContent: `
        <p><strong>Nombre:</strong> ${nombre}</p>
        <p><strong>Producto:</strong> ${producto}${presentacion ? ` — ${presentacion}` : ''}</p>
        <p><strong>Cantidad:</strong> ${cantidad}</p>
        <p><strong>Entrega:</strong> ${entregaLabel}</p>
        ${direccion ? `<p><strong>Dirección:</strong> ${direccion}</p>` : ''}
        <p><strong>Correo:</strong> ${email}</p>
        <p><strong>WhatsApp:</strong> ${whatsappLead}</p>
        ${waLink ? `<p><a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Escríbele por WhatsApp →</a></p>` : ''}
        ${errorContacto ? `<p style="margin-top:20px;padding:12px;background:#fff4e5;border-left:3px solid #c98a45;font-size:13px;">⚠️ Este pedido <strong>no se pudo guardar en Brevo</strong>, así que no aparecerá en la lista de contactos. Los datos de arriba son la única copia — agrégalo a mano si lo necesitas. Motivo: ${errorContacto.message}</p>` : ''}
      `,
    });
  } else {
    console.warn('[producto-sync] BUSINESS_NOTIFY_EMAIL no configurado, se omite el correo de notificación a la empresa');
  }

  // Siempre 200: los correos ya salieron y el negocio está enterado. Devolver error
  // acá solo lograría que Netlify desactive el webhook y se pierdan los pedidos
  // siguientes. El fallo del CRM queda en los logs y avisado dentro del correo.
  return { statusCode: 200, body: errorContacto ? 'ok (contacto no guardado en Brevo)' : 'ok' };
};
