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

export async function sendBrevoEmail({ apiKey, recipients, subject, htmlContent, senderEmail, senderName }) {
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

export async function upsertBrevoContact({ apiKey, listId, email, attributes }) {
  const response = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      email,
      attributes,
      listIds: [Number(listId)],
      updateEnabled: true,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Brevo error ${response.status}: ${errText}`);
    err.statusCode = 502;
    throw err;
  }
}
