// Recibe los avisos de Mercado Pago cuando un pago cambia de estado.
//
// Es lo que cierra el hueco de siempre: hasta ahora el sitio mandaba a pagar y nadie
// avisaba de vuelta, así que un pedido abandonado en la pantalla de pago se veía igual
// que uno pagado y había que confirmar cada uno a mano en el panel.
//
// Tres reglas que Mercado Pago marca como obligatorias, y que son justo donde se
// equivocan las integraciones:
//
//   1. NUNCA confiar en el cuerpo del aviso. Se valida la firma y, además, se vuelve a
//      consultar el pago por API — esa respuesta es la única verdad.
//   2. Responder rápido con 2xx. Si tardamos o fallamos, Mercado Pago reintenta y
//      llegan avisos duplicados.
//   3. Ser idempotente. El mismo pago llega varias veces; procesarlo dos veces no puede
//      mandar dos correos ni ensuciar la hoja.
//
// La idempotencia se ancla en la HOJA, que es el único estado compartido que tiene este
// sitio: solo se manda el correo de "pago confirmado" cuando la hoja confirma que la
// fila de verdad cambió. Ver actualizarPagoEnHoja() en lib/hoja.js.

import { consultarPago } from './lib/mercadopago.js';
import { validarFirmaMercadoPago } from './lib/firma-mp.js';
import { actualizarPagoEnHoja } from './lib/hoja.js';
import { parseRecipients, sendBrevoEmail, upsertBrevoContact, hoyISO } from './lib/brevo.js';

const NOMBRE = 'pago-webhook';

// Cómo se traduce cada estado de Mercado Pago a lo que queda escrito en la hoja.
//
// Solo se toca la columna **Pago**. La columna Estado (Nuevo → En producción →
// Despachado) es del usuario y el sitio no la pisa nunca: si un aviso tardío llegara
// después de que ella ya movió el pedido a "Despachado", devolverlo a "Pagado" sería
// destruir su trabajo. Esa regla ya estaba fijada desde que se armó la hoja.
const ESTADOS = {
  approved: { pago: 'Pagado ✓', avisar: 'cliente' },
  refunded: { pago: 'Reembolsado', avisar: null },
  charged_back: { pago: 'Contracargo', avisar: 'interno' },
  rejected: { pago: 'Pago rechazado', avisar: 'interno' },
  cancelled: { pago: 'Pago cancelado', avisar: null },
};

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  const secreto = process.env.MP_WEBHOOK_SECRET;

  if (!accessToken) {
    console.error(`[${NOMBRE}] Falta MP_ACCESS_TOKEN`);
    return { statusCode: 500, body: 'Missing Mercado Pago configuration' };
  }

  // Los headers de Netlify llegan en minúsculas, pero no se asume.
  const headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );

  // El id viene en la query (?data.id=...) y, según el tipo de aviso, también en el
  // cuerpo. La firma se calcula sobre el de la query.
  const query = event.queryStringParameters || {};
  let cuerpo = {};
  try {
    cuerpo = JSON.parse(event.body || '{}');
  } catch (err) {
    /* algunos avisos llegan sin cuerpo JSON; el id de la query es suficiente */
  }

  const tipo = query.type || query.topic || cuerpo.type || cuerpo.action?.split('.')[0] || '';
  const dataId = query['data.id'] || query.id || cuerpo.data?.id || '';

  // Mercado Pago avisa de varias cosas (merchant_order, etc.). Aquí solo interesan los
  // pagos; lo demás se confirma recibido y se ignora, para que no reintente.
  if (!String(tipo).includes('payment')) {
    console.log(`[${NOMBRE}] Aviso ignorado (tipo "${tipo}")`);
    return { statusCode: 200, body: 'ignored' };
  }

  const firma = validarFirmaMercadoPago({
    xSignature: headers['x-signature'],
    xRequestId: headers['x-request-id'],
    dataId,
    secreto,
  });

  if (!firma.valida) {
    // 401 a propósito: si alguien está probando la URL, que no reciba un OK.
    console.error(`[${NOMBRE}] Firma rechazada: ${firma.motivo}`);
    return { statusCode: 401, body: 'Invalid signature' };
  }

  let pago;
  try {
    pago = await consultarPago({ accessToken, pagoId: dataId });
  } catch (err) {
    // 500 a propósito: acá SÍ queremos que Mercado Pago reintente, porque el aviso era
    // legítimo y el fallo es nuestro (o de su API). Es el único caso en toda la
    // integración donde devolver error es lo correcto.
    console.error(`[${NOMBRE}] No se pudo consultar el pago ${dataId}:`, err.message);
    return { statusCode: 500, body: 'No se pudo consultar el pago' };
  }

  const { estado, numeroPedido, monto, correo, metodo, detalle } = pago;
  console.log(`[${NOMBRE}] Pago ${pago.id} (${estado}) para pedido ${numeroPedido || 'sin referencia'}`);

  const config = ESTADOS[estado];

  // Pendiente / en proceso (efectivo, PSE a medias): todavía no hay nada que decidir.
  // Ya llegará el aviso definitivo, y hasta entonces la hoja queda como está.
  if (!config) {
    console.log(`[${NOMBRE}] Estado "${estado}" sin acción, se espera el aviso definitivo`);
    return { statusCode: 200, body: 'ok' };
  }

  const { error: errorHoja, actualizado } = await actualizarPagoEnHoja({
    numeroPedido,
    pago: config.pago,
  });

  if (errorHoja) {
    console.error(`[${NOMBRE}] La hoja no se pudo actualizar: ${errorHoja}`);
  }

  // AQUÍ está la idempotencia: si la fila no cambió, este aviso ya se procesó antes (o
  // la hoja falló). En cualquiera de los dos casos NO se manda correo: repetir un "pago
  // confirmado" es peor que no mandarlo, y el pago sigue visible en el panel.
  if (!actualizado) {
    return { statusCode: 200, body: 'ok (sin cambios)' };
  }

  const apiKey = process.env.BREVO_API_KEY;

  if (estado === 'approved' && apiKey) {
    // El contacto ya existe (lo creó producto-sync al enviar el formulario); esto solo
    // le suma la fecha del pago.
    if (correo) {
      try {
        await upsertBrevoContact({
          apiKey,
          listId: process.env.BREVO_PRODUCTOS_LIST_ID,
          email: correo,
          attributes: { ULTIMO_PAGO: hoyISO() },
        });
      } catch (err) {
        console.error(`[${NOMBRE}] No se pudo anotar el pago en Brevo:`, err.message);
      }
    }

    // Este correo SÍ puede decir "pago confirmado": llega después de que Mercado Pago
    // lo aprobó, a diferencia del que sale al enviar el formulario.
    await sendBrevoEmail({
      apiKey,
      recipients: [{ email: correo }],
      bcc: parseRecipients(process.env.BUSINESS_NOTIFY_EMAIL),
      subject: `Pago confirmado — pedido ${numeroPedido}`,
      htmlContent: `
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7a6c53;">Pedido ${numeroPedido}</p>
        <h2 style="font-family:Georgia,serif;font-weight:500;margin:0 0 16px;">¡Tu pago quedó confirmado!</h2>
        <p>Ya recibimos tu pago de <strong>$${Number(monto || 0).toLocaleString('es-CO')} COP</strong>. Tu pedido entra a producción y te avisamos por WhatsApp cuando salga para entrega.</p>
        <p>Gracias por escoger Inefable ALRO 🕯️</p>
      `,
    });
  }

  if (config.avisar === 'interno' && apiKey) {
    const notificar = parseRecipients(process.env.BUSINESS_NOTIFY_EMAIL);
    if (notificar.length > 0) {
      await sendBrevoEmail({
        apiKey,
        recipients: notificar,
        senderEmail: process.env.BREVO_SENDER_EMAIL_INTERNO || process.env.BREVO_SENDER_EMAIL,
        senderName: process.env.BREVO_SENDER_NAME_INTERNO || process.env.BREVO_SENDER_NAME,
        subject: `⚠️ Pago ${estado === 'rejected' ? 'rechazado' : estado} — pedido ${numeroPedido}`,
        htmlContent: `
          <p><strong>Pedido:</strong> ${numeroPedido}</p>
          <p><strong>Estado del pago:</strong> ${estado}${detalle ? ` (${detalle})` : ''}</p>
          <p><strong>Medio:</strong> ${metodo || 'no informado'}</p>
          <p><strong>Correo:</strong> ${correo || 'no informado'}</p>
          <p style="margin-top:16px;padding:12px;background:#fff4e5;border-left:3px solid #c98a45;font-size:13px;">
            ${estado === 'rejected'
              ? 'El pago no pasó. La persona sigue en la hoja y en el CRM: escríbele por WhatsApp antes de dar la venta por perdida — muchas veces es un problema de la tarjeta, no falta de interés.'
              : 'Revisa este pago en el panel de Mercado Pago.'}
          </p>
        `,
      });
    }
  }

  return { statusCode: 200, body: 'ok' };
};
