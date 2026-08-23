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

  // Sin un documento HTML completo con <meta charset="utf-8">, los clientes de correo
  // asumen latin-1 y las tildes y eñes se ven como "Arom�tica" / "Maracuy�".
  // (Reportado en producción el 2026-08-22.)
  const htmlCompleto = /<html[\s>]/i.test(htmlContent)
    ? htmlContent
    : `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f4efe6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#201a12;line-height:1.6;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:6px;padding:28px;">
${htmlContent}
</div>
</body>
</html>`;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: recipients,
        ...(bcc && bcc.length > 0 ? { bcc } : {}),
        subject,
        htmlContent: htmlCompleto,
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

// Acumula un valor en una lista " | " CONTANDO las repeticiones: si alguien vuelve a
// pedir el mismo producto, eso es justamente el dato valioso (cuál le gusta más), así
// que queda como "Maracuyá x3 | Ramo de Flores". El "x1" no se escribe, para que se
// lea limpio.
//
// El campo no puede crecer sin límite (los atributos de texto de Brevo tienen tope),
// así que al pasarse se recortan primero los de MENOR conteo — nunca los favoritos —
// y jamás el que se acaba de agregar.
export function acumularValor(valorActual, nuevo, { maxItems = 12, maxLargo = 240 } = {}) {
  if (!nuevo) return valorActual || '';

  const items = String(valorActual || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*?)\s+x(\d+)$/);
      return m ? { nombre: m[1].trim(), conteo: Number(m[2]) } : { nombre: s, conteo: 1 };
    });

  const yaEstaba = items.find((i) => i.nombre === nuevo);
  if (yaEstaba) yaEstaba.conteo += 1;
  else items.push({ nombre: nuevo, conteo: 1 });

  const render = (lista) =>
    lista.map((i) => (i.conteo > 1 ? `${i.nombre} x${i.conteo}` : i.nombre)).join(' | ');

  let lista = items;
  while (lista.length > 1 && (lista.length > maxItems || render(lista).length > maxLargo)) {
    // Candidatos a salir: todos menos el recién tocado.
    let idx = -1;
    for (let i = 0; i < lista.length; i++) {
      if (lista[i].nombre === nuevo) continue;
      if (idx === -1 || lista[i].conteo < lista[idx].conteo) idx = i;
    }
    if (idx === -1) break;
    lista = lista.filter((_, i) => i !== idx);
  }

  return render(lista);
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

  // Deja constancia de lo que se envía: si un atributo queda vacío en Brevo pese a un
  // 200, comparar este log con lo que muestra el panel dice si el problema es el valor
  // que mandamos o el tipo con el que está creado el atributo del otro lado.
  console.log('[brevo] atributos enviados para', email, JSON.stringify(attributes));

  let response = await enviar(attributes);
  if (response.ok) return { camposOmitidos: [] };

  let errText = await response.text();

  // Brevo tiene atributos RESERVADOS (WHATSAPP, SMS…) que usa como identificadores
  // de contacto, aunque su tipo diga "Texto". Si el valor ya está en otro contacto,
  // rechaza el alta ENTERA con 400 duplicate_parameter y devuelve cuáles chocaron.
  // Por eso el teléfono se guarda en `CELULAR` (atributo propio, sin esa regla); esto
  // queda como red de seguridad por si algún día se vuelve a usar uno reservado.
  //
  // Preferimos guardar el contacto sin los campos que chocan antes que perder el
  // lead entero: los datos completos viajan igual en el correo de aviso interno.
  if (response.status === 400 && errText.includes('duplicate_parameter')) {
    let choques = [];
    try {
      choques = JSON.parse(errText)?.metadata?.duplicate_identifiers || [];
    } catch {
      /* si no viene el detalle, no hay nada que quitar */
    }
    const quitables = choques.filter((c) => c in (attributes || {}));

    if (quitables.length > 0) {
      const limpios = { ...attributes };
      quitables.forEach((c) => delete limpios[c]);
      response = await enviar(limpios);
      if (response.ok) {
        console.warn(
          `[brevo] ${quitables.join(', ')} de ${email} ya estaba(n) en otro contacto; se guardó sin ese(os) campo(s).`
        );
        return { camposOmitidos: quitables };
      }
      errText = await response.text();
    }
  }

  const err = new Error(`Brevo error ${response.status}: ${errText}`);
  err.statusCode = 502;
  throw err;
}
