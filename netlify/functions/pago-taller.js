import { crearPreferencia, siteUrl } from './lib/mercadopago.js';
import talleresRaw from './data/talleres.cjs';

const NOMBRE = 'pago-taller';
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
const talleres = comoLista(talleresRaw);

// Esta función SOLO arma el link de pago — el registro del contacto en Brevo y los
// correos de confirmación los sigue haciendo brevo-sync.js (el formulario le pega a
// las dos por separado, ver initCursoForm en curso.astro). Así no se duplica esa
// lógica y el flujo de siempre sigue funcionando igual aunque el pago falle.
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('[pago-taller] Falta MP_ACCESS_TOKEN en las variables de entorno de Netlify');
    return { statusCode: 500, body: 'Missing Mercado Pago configuration' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: 'Invalid payload' };
  }

  const { tallerSlug, nombre, correo } = data;
  const taller = talleres.find((t) => t.slug === tallerSlug);

  if (!taller) {
    console.error('[pago-taller] Taller no encontrado o ya no está activo:', tallerSlug);
    return { statusCode: 400, body: 'Taller no disponible' };
  }
  if (!correo) {
    return { statusCode: 400, body: 'Missing email' };
  }

  try {
    const { checkoutUrl } = await crearPreferencia({
      accessToken,
      items: [
        {
          title: `${taller.titulo} — Inefable ALRO`,
          quantity: 1,
          unit_price: taller.precio,
        },
      ],
      payer: { name: nombre || undefined, email: correo },
      externalReference: `taller:${taller.slug}:${correo}`,
      backUrls: {
        success: `${siteUrl()}/pago-confirmado?tipo=taller`,
        pending: `${siteUrl()}/pago-confirmado?tipo=taller`,
        failure: `${siteUrl()}/curso?pago=fallido`,
      },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkoutUrl }),
    };
  } catch (err) {
    console.error('[pago-taller] Fallo al crear la preferencia en Mercado Pago', err);
    return { statusCode: err.statusCode || 500, body: err.message };
  }
};
