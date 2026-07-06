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

  let data;
  try {
    const body = JSON.parse(event.body);
    data = body?.payload?.data || {};
  } catch (err) {
    console.error('[brevo-sync] No se pudo leer el payload del formulario', err);
    return { statusCode: 400, body: 'Invalid payload' };
  }

  const email = data.correo;
  if (!email) {
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
          WHATSAPP: data.whatsapp || '',
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
      return { statusCode: 502, body: 'Brevo error' };
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('[brevo-sync] Fallo al llamar a Brevo', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
