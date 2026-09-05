import { crearPreferencia, siteUrl } from './lib/mercadopago.js';
import productosRaw from './data/productos.cjs';

const NOMBRE = 'pago-producto';
// El archivo de precios se genera en el build (scripts/generar-datos-pago.mjs). Se
// importa, no se lee del disco, y se normaliza a un arreglo antes de usarlo: según cómo
// lo empaquete Netlify, el mismo `import` puede llegar como el arreglo directo o
// envuelto en un objeto con .default. Confiar en una sola de esas formas tumbó la
// función en producción (2026-09-05). Ver el detalle en generar-datos-pago.mjs.
function comoLista(mod) {
  if (Array.isArray(mod)) return mod;
  if (Array.isArray(mod?.default)) return mod.default;
  console.error('[%s] Los datos de precios no llegaron como lista:', NOMBRE, typeof mod);
  return [];
}
const productos = comoLista(productosRaw);

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

  const { productoSlug, variantePresentacion, cantidad, nombre, correo, zonaBogota } = data;
  const producto = productos.find((p) => p.slug === productoSlug);
  const variante = producto?.variantes.find((v) => v.presentacion === variantePresentacion);

  if (!producto || !variante || variante.precio === undefined) {
    console.error('[pago-producto] Producto/variante no encontrado o sin precio fijo:', productoSlug, variantePresentacion);
    return { statusCode: 400, body: 'Producto no disponible para pago en línea' };
  }
  if (!correo) {
    return { statusCode: 400, body: 'Missing email' };
  }

  const cantidadNum = Math.max(1, Math.min(50, Number(cantidad) || 1));
  const envio = zonaBogota === 'norte' ? ENVIO_BOGOTA_NORTE_COP : ENVIO_BOGOTA_RESTO_COP;

  const items = [
    {
      title: `${producto.nombre} — ${variante.presentacion}`,
      quantity: cantidadNum,
      unit_price: variante.precio,
    },
  ];
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
      externalReference: `producto:${producto.slug}:${correo}`,
      backUrls: {
        success: `${siteUrl()}/pago-confirmado?tipo=producto`,
        pending: `${siteUrl()}/pago-confirmado?tipo=producto`,
        failure: `${siteUrl()}/tienda?pago=fallido`,
      },
    });

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
