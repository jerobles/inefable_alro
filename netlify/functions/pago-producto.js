import { crearPreferencia, siteUrl } from './lib/mercadopago.js';
import { comoLista, resolverPedido, resumenTexto } from './lib/pedido.js';
import productosRaw from './data/productos.cjs';

const NOMBRE = 'pago-producto';
const productos = comoLista(productosRaw, NOMBRE);

// Por ahora el pago en línea solo aplica a entregas en Bogotá (domicilio con tarifa
// fija incluida en el cobro). Pedidos a otras ciudades siguen el flujo de siempre:
// se coordinan por WhatsApp y se cotiza el envío con la transportadora caso por caso,
// sin pasar por aquí. Tarifas confirmadas por el usuario (2026-08-22): norte de
// Bogotá gratis, resto de la ciudad $15.000.
const ENVIO_BOGOTA_NORTE_COP = Number(process.env.ENVIO_BOGOTA_NORTE_COP) || 0;
const ENVIO_BOGOTA_RESTO_COP = Number(process.env.ENVIO_BOGOTA_RESTO_COP) || 15000;

// Igual que pago-taller.js: esta función solo arma el link de pago. El registro en
// Brevo (con la dirección incluida en el aviso interno) lo sigue haciendo
// producto-sync.js por su lado, sin duplicar esa lógica acá.
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('[pago-producto] Falta MP_ACCESS_TOKEN en las variables de entorno de Netlify');
    return { statusCode: 500, body: 'Missing Mercado Pago configuration' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: 'Invalid payload' };
  }

  const { nombre, correo, zonaBogota, numeroPedido } = data;
  if (!correo) {
    return { statusCode: 400, body: 'Missing email' };
  }

  // El carrito manda una lista. Se sigue aceptando un producto suelto porque el
  // formulario que lo enviaba se retiró el 2026-09-06 y una página cacheada en el
  // navegador de alguien puede seguir mandándolo un rato. Se normalizan a lo mismo
  // para que de aquí en adelante haya un único camino.
  const crudo = data.pedido
    ? data.pedido
    : data.productoSlug
      ? [{ s: data.productoSlug, p: data.variantePresentacion, c: data.cantidad }]
      : null;

  if (!crudo) {
    console.error('[pago-producto] Payload sin pedido ni producto:', JSON.stringify(data).slice(0, 200));
    return { statusCode: 400, body: 'Pedido vacío' };
  }

  const { lineas, subtotal, hayCotizacion, invalido } = resolverPedido(crudo, productos);

  if (invalido) {
    console.error('[pago-producto] Ningún producto del pedido existe en el catálogo:', JSON.stringify(crudo).slice(0, 200));
    return { statusCode: 400, body: 'Pedido no disponible para pago en línea' };
  }

  // Doble chequeo (el navegador ya lo evita, pero no se le cree): un pedido con algo
  // por cotizar no tiene precio final, así que no puede cobrarse en línea.
  if (hayCotizacion) {
    console.error('[pago-producto] El pedido incluye productos por cotización, no se cobra en línea:', resumenTexto(lineas));
    return { statusCode: 400, body: 'Pedido no disponible para pago en línea' };
  }

  const envio = zonaBogota === 'norte' ? ENVIO_BOGOTA_NORTE_COP : ENVIO_BOGOTA_RESTO_COP;

  const items = lineas.map((l) => ({
    title: `${l.nombre} — ${l.presentacion}`,
    quantity: l.cantidad,
    unit_price: l.precio,
  }));

  // Mercado Pago no acepta ítems con precio $0 — si el envío es gratis (norte de
  // Bogotá), simplemente no se agrega la línea de domicilio.
  if (envio > 0) {
    items.push({ title: 'Domicilio en Bogotá', quantity: 1, unit_price: envio });
  }

  try {
    const { checkoutUrl } = await crearPreferencia({
      accessToken,
      items,
      payer: { name: nombre || undefined, email: correo },
      // El número de pedido es la única forma de cruzar un pago del panel de Mercado
      // Pago con el pedido que llegó por correo y con la fila de la hoja de cálculo.
      externalReference: numeroPedido || `producto:${lineas[0].slug}:${correo}`,
      backUrls: {
        success: `${siteUrl()}/pago-confirmado?tipo=producto`,
        pending: `${siteUrl()}/pago-confirmado?tipo=producto`,
        failure: `${siteUrl()}/carrito?pago=fallido`,
      },
    });

    console.log(`[pago-producto] Preferencia creada para ${numeroPedido || 'sin número'}: ${lineas.length} línea(s), subtotal ${subtotal} + envío ${envio}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkoutUrl }),
    };
  } catch (err) {
    console.error('[pago-producto] Fallo al crear la preferencia en Mercado Pago', err);
    return { statusCode: err.statusCode || 500, body: err.message };
  }
};
