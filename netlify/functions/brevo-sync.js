function toE164Colombia(phone) {
  if (!phone) return '';
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+57${digits}`;
}

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

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email,
        attributes: {
          NOMBRE: data.nombre || '',
          WHATSAPP: toE164Colombia(data.whatsapp),
          FECHA_PREFERENCIA: data.fecha || '',
          TURNO_PREFERENCIA: data.turno || '',
        },
        listIds: [Number(listId)],
        updateEnabled: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[brevo-sync] Brevo respondió con error', response.status, errText);
      return { statusCode: 502, body: `Brevo error ${response.status}: ${errText}` };
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('[brevo-sync] Fallo al llamar a Brevo', err);
    return { statusCode: 500, body: `Internal error: ${err.message}` };
  }
};
