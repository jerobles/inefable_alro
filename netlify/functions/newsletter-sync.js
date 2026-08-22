import { sendBrevoEmail, upsertBrevoContact } from './lib/brevo.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.BREVO_API_KEY;
  const listId = process.env.BREVO_NEWSLETTER_LIST_ID;

  if (!apiKey || !listId) {
    console.error('[newsletter-sync] Falta BREVO_API_KEY o BREVO_NEWSLETTER_LIST_ID en las variables de entorno de Netlify');
    return { statusCode: 500, body: 'Missing Brevo configuration' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    console.error('[newsletter-sync] No se pudo parsear el body como JSON', err);
    return { statusCode: 400, body: 'Invalid payload' };
  }

  const data = body?.payload?.data || body?.data || {};
  const email = data.correo || data.email;

  if (!email) {
    console.error('[newsletter-sync] No se encontró el correo en el payload recibido:', JSON.stringify(body));
    return { statusCode: 400, body: 'Missing email' };
  }

  const nombre = data.nombre || '';

  try {
    await upsertBrevoContact({
      apiKey,
      listId,
      email,
      attributes: { NOMBRE: nombre },
    });
  } catch (err) {
    console.error('[newsletter-sync] Fallo al llamar a Brevo', err);
    return { statusCode: err.statusCode || 500, body: err.message };
  }

  await sendBrevoEmail({
    apiKey,
    recipients: [{ email, name: nombre || undefined }],
    subject: '¡Ya estás suscrito! — Inefable ALRO',
    htmlContent: `
      <p>Hola ${nombre || ''},</p>
      <p>Gracias por suscribirte. Te vamos a avisar por acá cuando abramos talleres nuevos y saquemos colecciones.</p>
      <p>¡Nos vemos pronto!</p>
    `,
  });

  return { statusCode: 200, body: 'ok' };
};
