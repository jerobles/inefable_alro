import {
  toE164Colombia,
  parseRecipients,
  sendBrevoEmail,
  upsertBrevoContact,
  getBrevoContact,
  acumularValor,
  hoyISO,
} from './lib/brevo.js';
import { comoLista, resolverPedido, tablaPedidoHtml, resumenTexto, formatCOP } from './lib/pedido.js';
import { envioDeEntrega, textoEntrega, nombreTipoLugar, nombreLocalidad } from './lib/zonas.js';
import { registrarEnHoja } from './lib/hoja.js';
import productosRaw from './data/productos.cjs';

const NOMBRE = 'producto-sync';
const productos = comoLista(productosRaw, NOMBRE);

const ENVIO_BOGOTA_NORTE_COP = Number(process.env.ENVIO_BOGOTA_NORTE_COP) || 0;
const ENVIO_BOGOTA_RESTO_COP = Number(process.env.ENVIO_BOGOTA_RESTO_COP) || 15000;

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
  const whatsappLead = toE164Colombia(data.whatsapp);
  const notas = data.notas || '';
  const numeroPedido = data['numero-pedido'] || data.numeroPedido || '';

  // Datos de entrega. El formulario nuevo manda ciudad + localidad y los campos de
  // dirección por separado; el viejo mandaba un solo campo `entrega` con la zona.
  // Se leen los dos: una página cacheada puede seguir enviando el formato viejo.
  const ciudad = data.ciudad || (data.entrega && data.entrega !== 'otra' ? 'bogota' : '');
  const localidad = data.localidad || '';
  const ciudadOtra = data['ciudad-otra'] || '';
  const barrio = data.barrio || '';
  const direccion = data.direccion || '';
  const tipoLugar = data['tipo-lugar'] || '';
  const unidad = data.unidad || '';
  const indicaciones = data.indicaciones || '';
  const recibe = data.recibe || '';

  // La dirección completa, en una sola cadena legible para el correo y la hoja.
  const direccionCompleta = [
    direccion,
    unidad,
    barrio ? `Barrio ${barrio}` : '',
    nombreTipoLugar(tipoLugar),
    indicaciones ? `(${indicaciones})` : '',
    recibe ? `Recibe: ${recibe}` : '',
  ].filter(Boolean).join(' · ');

  // El pedido llega como una lista (el carrito). Se sigue aceptando el formato viejo
  // de un producto suelto porque el formulario que lo enviaba se retiró el 2026-09-06
  // y una página cacheada en el navegador de alguien puede seguir mandándolo un rato;
  // perder ese pedido por no leerlo sería absurdo.
  // En los dos casos el nombre, el precio y la foto salen del CATÁLOGO DEL SERVIDOR,
  // no del navegador: así el correo nunca muestra algo distinto de lo que se cobró.
  const crudo = data.pedido
    ? data.pedido
    : data.producto
      ? [{ s: data.producto_slug || '', p: data.presentacion, c: data.cantidad }]
      : null;

  const { lineas, subtotal, hayCotizacion } = crudo
    ? resolverPedido(crudo, productos)
    : { lineas: [], subtotal: 0, hayCotizacion: false };

  // Si no se pudo resolver contra el catálogo (formulario viejo sin slug, producto
  // retirado…), se cae al texto que mandó el formulario para no perder el pedido.
  const descripcionCorta = lineas.length > 0
    ? resumenTexto(lineas)
    : `${data.producto || 'un producto del catálogo'}${data.presentacion ? ` (${data.presentacion})` : ''}`;

  // Mismo cálculo que pago-producto.js, desde la misma lista: así el correo nunca
  // puede mostrar un envío distinto del que se cobró.
  let envio = envioDeEntrega({
    ciudad,
    localidad,
    tarifaBogota: ENVIO_BOGOTA_RESTO_COP,
    tarifaGratis: ENVIO_BOGOTA_NORTE_COP,
  });
  // Formato viejo (página cacheada): la zona venía en `entrega`, sin localidad.
  if (envio === null && !localidad && data.entrega) {
    if (data.entrega === 'bogota-norte') envio = ENVIO_BOGOTA_NORTE_COP;
    else if (data.entrega === 'bogota-resto') envio = ENVIO_BOGOTA_RESTO_COP;
  }
  const total = subtotal + (envio || 0);
  const entregaTexto = textoEntrega({ ciudad, localidad, ciudadOtra });
  // Un pedido se cierra solo si es en Bogotá y todo tiene precio: ahí ya pagó en línea
  // y no hay nada que coordinar. Lo demás sí necesita que alguien escriba.
  const necesitaCoordinar = envio === null || hayCotizacion;

  const existente = await getBrevoContact({ apiKey, email });
  const attrsPrevios = existente?.attributes || {};

  // Cada producto del pedido entra al historial por separado, con su conteo. Un
  // pedido de 3 velas distintas debe verse como 3 productos comprados, no como uno.
  let historial = attrsPrevios.PRODUCTO_INTERES;
  if (lineas.length > 0) {
    for (const l of lineas) {
      for (let i = 0; i < l.cantidad; i++) {
        historial = acumularValor(historial, `${l.nombre}${l.presentacion ? ` (${l.presentacion})` : ''}`);
      }
    }
  } else {
    historial = acumularValor(historial, descripcionCorta);
  }

  let errorContacto = null;
  try {
    await upsertBrevoContact({
      apiKey,
      listId,
      email,
      attributes: {
        NOMBRE: nombre,
        CELULAR: whatsappLead,
        // Se intenta llenar tambien el campo reservado de Brevo para no perder sus
        // funciones de WhatsApp. Si el numero ya esta en otro contacto, Brevo lo
        // rechaza y upsertBrevoContact reintenta quitando SOLO ese campo: CELULAR
        // conserva el numero igual, asi que nunca se pierde el dato ni el contacto.
        WHATSAPP: whatsappLead,
        PRODUCTO_INTERES: historial,
        // Un pedido cuenta como uno, aunque lleve varios productos.
        PEDIDOS_TOTAL: (Number(attrsPrevios.PEDIDOS_TOTAL) || 0) + 1,
        ULTIMO_PEDIDO: hoyISO(),
        // Dónde vive el cliente, para poder segmentar después ("vecinos de Usaquén",
        // dónde se concentran los pedidos, si vale la pena ampliar el envío propio).
        // La dirección exacta NO va a Brevo a propósito: un solo valor por campo se
        // sobrescribe en cada pedido, y un envío a casa de la mamá quedaría como "su"
        // dirección. El historial real de direcciones vive en la hoja, con su fecha.
        // Si el campo llega vacío no se pisa el que ya estaba.
        ...(ciudad ? { CIUDAD: ciudad === 'bogota' ? 'Bogotá' : ciudadOtra || 'Otra ciudad' } : {}),
        ...(localidad ? { LOCALIDAD: nombreLocalidad(localidad) } : {}),
        ...(barrio ? { BARRIO: barrio } : {}),
      },
    });
  } catch (err) {
    errorContacto = err;
    console.error('[producto-sync] No se pudo guardar el contacto en Brevo, se continúa con los correos', err);
  }

  // La hoja de cálculo: el registro que el usuario mira para saber qué producir y
  // despachar, y que puede compartir con su cliente. Si falla, NO se corta nada: el
  // pedido ya está en Netlify, en el CRM y en los correos. El aviso interno lo dice.
  const errorHoja = await registrarEnHoja({
    fecha: new Date().toISOString(),
    numeroPedido,
    estado: 'Nuevo',
    cliente: nombre,
    whatsapp: whatsappLead || '',
    correo: email,
    productos: descripcionCorta,
    subtotal,
    envio: envio === null ? '' : envio,
    total: envio !== null && !hayCotizacion ? total : '',
    zona: entregaTexto,
    direccion: direccionCompleta,
    notas,
    pago: envio !== null && !hayCotizacion ? 'En línea (confirmar en Mercado Pago)' : 'Por coordinar',
    // Los mismos datos, pero cada uno en su columna, para poder filtrar y ordenar
    // ("todos los de Suba", "cuántos pedidos van a Cedritos"). La columna Dirección
    // de arriba sigue llevando todo junto, que es lo que se lee para despachar.
    // ⚠️ Estas columnas van DESPUÉS de Pago (la 14) a propósito: el webhook escribe
    // en COL_PAGO = 14 y meterlas antes lo rompería en silencio.
    ciudad: ciudad === 'bogota' ? 'Bogotá' : ciudadOtra || (ciudad ? 'Otra ciudad' : ''),
    localidad: nombreLocalidad(localidad),
    barrio,
    tipoLugar: nombreTipoLugar(tipoLugar),
    unidad,
    indicaciones,
    recibe,
  });

  const tabla = lineas.length > 0
    ? tablaPedidoHtml({ lineas, subtotal, envio, total, entrega: entregaTexto, hayCotizacion })
    : `<p style="font-size:14px;color:#201a12;">${descripcionCorta}</p>`;

  const encabezadoPedido = numeroPedido
    ? `<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7a6c53;">Pedido ${numeroPedido}</p>`
    : '';

  // Correo al cliente. Ojo con el tono: esto se envía al ENVIAR el formulario, o sea
  // ANTES de que Mercado Pago confirme el pago, así que no puede decir "recibimos tu
  // pago" — todavía no lo sabemos. (Saberlo requiere el webhook de Mercado Pago, que
  // no está hecho.) Dice lo que sí es cierto: recibimos el pedido, este es el detalle.
  await sendBrevoEmail({
    apiKey,
    recipients: [{ email, name: nombre || undefined }],
    bcc: parseRecipients(process.env.BUSINESS_NOTIFY_EMAIL),
    subject: numeroPedido ? `Tu pedido ${numeroPedido} — Inefable ALRO` : '¡Recibimos tu pedido! — Inefable ALRO',
    htmlContent: `
      ${encabezadoPedido}
      <p style="font-size:15px;color:#201a12;">Hola ${nombre || ''},</p>
      <p style="font-size:15px;color:#201a12;">Recibimos tu pedido. Este es el detalle de lo que llevas:</p>
      ${tabla}
      ${
        necesitaCoordinar
          ? '<p style="font-size:14px;color:#201a12;">Te escribimos por WhatsApp para confirmar el valor final y coordinar la entrega.</p>'
          : // Este correo sale al ENVIAR el formulario, o sea ANTES de que la persona
            // termine de pagar. Antes decía "ya lo estamos preparando", y eso le llegaba
            // igual a quien abandonaba el checkout: prometía algo que no estaba pasando.
            // Ahora dice la verdad y sirve de recordatorio para volver a terminarlo.
            // Cuando el pago se aprueba, el webhook manda el correo de "Pago confirmado".
            `<p style="font-size:14px;color:#201a12;">Falta un último paso: <strong>completar el pago</strong>. Apenas se confirme te llega otro correo y ahí sí entra a producción.</p>
             <p style="font-size:14px;color:#201a12;">¿Se te interrumpió el pago o cerraste la ventana sin querer? Escríbenos por WhatsApp con el número de tu pedido y lo terminamos contigo.</p>`
      }
      <p style="font-size:14px;color:#201a12;">¡Gracias por escoger Inefable ALRO! 🕯️</p>
      <p style="font-size:12px;color:#7a6c53;">Si algo del pedido no está bien, respóndenos este correo y lo ajustamos.</p>
    `,
  });

  const notifyRecipients = parseRecipients(process.env.BUSINESS_NOTIFY_EMAIL);
  if (notifyRecipients.length > 0) {
    const waLink = whatsappLead
      ? `https://wa.me/${whatsappLead.replace('+', '')}?text=${encodeURIComponent(
          `¡Hola ${nombre}! Te escribo de Inefable ALRO por tu pedido${numeroPedido ? ` ${numeroPedido}` : ''}.`
        )}`
      : null;

    await sendBrevoEmail({
      apiKey,
      recipients: notifyRecipients,
      senderEmail: process.env.BREVO_SENDER_EMAIL_INTERNO || process.env.BREVO_SENDER_EMAIL,
      senderName: process.env.BREVO_SENDER_NAME_INTERNO || process.env.BREVO_SENDER_NAME,
      subject: `Pedido ${numeroPedido || 'nuevo'}: ${nombre || 'Sin nombre'} — ${envio !== null && !hayCotizacion ? formatCOP(total) : 'a cotizar'}`,
      htmlContent: `
        ${encabezadoPedido}
        <p style="font-size:15px;"><strong>${nombre}</strong> — ${entregaTexto}</p>
        ${tabla}
        <p style="font-size:14px;"><strong>Correo:</strong> ${email}<br />
        <strong>WhatsApp:</strong> ${whatsappLead || 'no dejó'}</p>
        ${direccionCompleta ? `<p style="font-size:14px;"><strong>Dirección:</strong> ${direccionCompleta}</p>` : ''}
        ${notas ? `<p style="font-size:14px;"><strong>Notas:</strong> ${notas}</p>` : ''}
        ${
          envio !== null && !hayCotizacion
            // Ya no manda a confirmar a mano en Mercado Pago: desde que el webhook
            // funciona (validado el 2026-10-12), la columna Pago de la hoja pasa sola
            // a "Pagado ✓". Si sigue diciendo "En línea (confirmar…)", es que esa
            // persona no terminó de pagar — que es justo lo que antes no se podía saber.
            ? '<p style="font-size:13px;color:#7a6c53;">Pedido de Bogotá con precio cerrado. <strong>Revisa la columna Pago de la hoja antes de despachar:</strong> pasa sola a “Pagado ✓” cuando Mercado Pago confirma. Si sigue en “En línea (confirmar…)”, el pago no se completó.</p>'
            : '<p style="font-size:13px;color:#a86a2e;">Este pedido NO se cobró en línea: hay que cotizar y coordinar por WhatsApp.</p>'
        }
        ${waLink ? `<p><a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Escríbele por WhatsApp →</a></p>` : ''}
        ${errorHoja ? `<p style="margin-top:16px;padding:12px;background:#fff4e5;border-left:3px solid #c98a45;font-size:13px;">⚠️ Este pedido <strong>no quedó en la hoja de cálculo</strong> (${errorHoja}). Agrégalo a mano cuando puedas — los datos de arriba son la referencia.</p>` : ''}
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
