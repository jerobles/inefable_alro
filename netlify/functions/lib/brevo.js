export function toE164Colombia(phone) {
  if (!phone) return '';
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+57${digits}`;
}

// Convierte "correo1@x.com, correo2@y.com" en [{email:'correo1@x.com'}, {email:'correo2@y.com'}]
export function parseRecipients(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
}

export async function sendBrevoEmail({ apiKey, recipients, subject, htmlContent, senderEmail, senderName, bcc }) {
  senderEmail = senderEmail || process.env.BREVO_SENDER_EMAIL;
  senderName = senderName || process.env.BREVO_SENDER_NAME || 'Inefable ALRO';

  if (!senderEmail) {
    console.warn('[brevo] BREVO_SENDER_EMAIL no configurado todavía, se omite el correo a', recipients);
    return;
  }
  if (!recipients || recipients.length === 0) return;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: recipients,
        ...(bcc && bcc.length > 0 ? { bcc } : {}),
        subject,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[brevo] Brevo (correo) respondió con error para', recipients, response.status, errText);
    }
  } catch (err) {
    // Un correo que falla nunca debe tumbar el webhook completo (evita que Netlify lo desactive).
    console.error('[brevo] Fallo al enviar correo a', recipients, err);
  }
}

// Busca un contacto por correo (el correo ES la identidad en Brevo). Devuelve null si
// no existe todavía. Se usa para leer el historial antes de escribirlo: sin esto, cada
// pedido SOBRESCRIBE el anterior y se pierde el rastro de qué ha comprado la persona.
export async function getBrevoContact({ apiKey, email }) {
  try {
    const response = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
      headers: { 'api-key': apiKey, Accept: 'application/json' },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      console.warn('[brevo] No se pudo leer el contacto', email, response.status);
      return null;
    }
    return await response.json();
  } catch (err) {
    // Nunca romper el flujo por no poder leer el historial: se sigue sin él.
    console.warn('[brevo] Fallo al leer el contacto', email, err);
    return null;
  }
}

// Agrega un valor a una lista separada por " | ", sin repetirlo y sin crecer sin
// límite (los atributos de texto de Brevo tienen tope de tamaño). El más reciente
// queda al final.
export function acumularValor(valorActual, nuevo, { maxItems = 12, maxLargo = 240 } = {}) {
  if (!nuevo) return valorActual || '';
  const previos = String(valorActual || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s !== nuevo);

  let lista = [...previos, nuevo].slice(-maxItems);
  while (lista.length > 1 && lista.join(' | ').length > maxLargo) lista = lista.slice(1);
  return lista.join(' | ');
}

// Fecha de hoy en formato YYYY-MM-DD, que es lo que esperan los atributos de tipo
// fecha de Brevo.
export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function upsertBrevoContact({ apiKey, listId, email, attributes }) {
  const enviar = (attrs) =>
    fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email,
        attributes: attrs,
        listIds: [Number(listId)],
        updateEnabled: true,
      }),
    });

  let response = await enviar(attributes);
  if (response.ok) return { telefonoOmitido: false };

  let errText = await response.text();

  // Brevo trata los atributos de tipo teléfono (WHATSAPP) como identificadores
  // ÚNICOS: si ese número ya está en otro contacto, rechaza el alta entera con
  // 400 duplicate_parameter. Pasa de verdad — por ejemplo, alguien que se inscribió
  // a un taller y luego pide un producto con otro correo, o dos personas de una
  // misma familia que comparten número.
  // Preferimos guardar el contacto SIN el teléfono antes que perder el lead: el
  // número igual viaja en el correo de aviso interno, con su botón de WhatsApp.
  if (response.status === 400 && errText.includes('duplicate_parameter') && attributes?.WHATSAPP) {
    const { WHATSAPP, ...sinTelefono } = attributes;
    response = await enviar(sinTelefono);
    if (response.ok) {
      console.warn(
        `[brevo] El WhatsApp de ${email} ya estaba en otro contacto; se guardó sin ese campo (el número va igual en el correo de aviso).`
      );
      return { telefonoOmitido: true };
    }
    errText = await response.text();
  }

  const err = new Error(`Brevo error ${response.status}: ${errText}`);
  err.statusCode = 502;
  throw err;
}
