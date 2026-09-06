import {
  toE164Colombia,
  parseRecipients,
  sendBrevoEmail,
  upsertBrevoContact,
  getBrevoContact,
  acumularValor,
  hoyISO,
} from './lib/brevo.js';
import { comoLista, resolverPedido, tablaPedidoHtml, resumenTexto, formatCOP, ENTREGA_LABEL } from './lib/pedido.js';
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
  const direccion = data.direccion || '';
  const notas = data.notas || '';
  const entrega = data.entrega || 'otra';
  const numeroPedido = data['numero-pedido'] || data.numeroPedido || '';

  // El pedido puede venir del carrito (una lista) o del formulario viejo de la página
  // de producto (un producto suelto). Se normalizan a lo mismo, y en ambos casos el
  // nombre, el precio y la foto salen del CATÁLOGO DEL SERVIDOR, no del navegador:
  // así el correo nunca puede mostrar algo distinto de lo que se cobró.
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

  const esBogota = entrega === 'bogota-norte' || entrega === 'bogota-resto';
  const envio = !esBogota ? null : entrega === 'bogota-norte' ? ENVIO_BOGOTA_NORTE_COP : ENVIO_BOGOTA_RESTO_COP;
  const total = subtotal + (envio || 0);
  // Un pedido se cierra solo si es en Bogotá y todo tiene precio: ahí ya pagó en línea
  // y no hay nada que coordinar. Lo demás sí necesita que alguien escriba.
  const necesitaCoordinar = !esBogota || hayCotizacion;

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
    total: esBogota && !hayCotizacion ? total : '',
    zona: ENTREGA_LABEL[entrega] || 'A coordinar',
    direccion,
    notas,
    pago: esBogota && !hayCotizacion ? 'En línea (confirmar en Mercado Pago)' : 'Por coordinar',
  });

  const tabla = lineas.length > 0
    ? tablaPedidoHtml({ lineas, subtotal, envio, total, entrega, hayCotizacion })
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
          : '<p style="font-size:14px;color:#201a12;">Ya lo estamos preparando. Te avisamos apenas salga hacia tu dirección.</p>'
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
      subject: `Pedido ${numeroPedido || 'nuevo'}: ${nombre || 'Sin nombre'} — ${esBogota ? formatCOP(total) : 'a cotizar'}`,
      htmlContent: `
        ${encabezadoPedido}
        <p style="font-size:15px;"><strong>${nombre}</strong> — ${ENTREGA_LABEL[entrega] || 'A coordinar'}</p>
        ${tabla}
        <p style="font-size:14px;"><strong>Correo:</strong> ${email}<br />
        <strong>WhatsApp:</strong> ${whatsappLead || 'no dejó'}</p>
        ${direccion ? `<p style="font-size:14px;"><strong>Dirección:</strong> ${direccion}</p>` : ''}
        ${notas ? `<p style="font-size:14px;"><strong>Notas:</strong> ${notas}</p>` : ''}
        ${
          esBogota && !hayCotizacion
            ? '<p style="font-size:13px;color:#7a6c53;">Pedido de Bogotá con precio cerrado: debería venir con pago en línea. Confirma en el panel de Mercado Pago buscando el número de pedido antes de despachar.</p>'
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
