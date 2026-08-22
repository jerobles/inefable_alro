import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crearPreferencia, siteUrl } from './lib/mercadopago.js';

// Se lee con fs en vez de "import ... with { type: 'json' }" para no depender de una
// versión de Node tan nueva como la que necesita esa sintaxis.
// Ojo: NO declarar un `__dirname` propio — el bundler de Netlify (esbuild) ya inyecta
// uno al empaquetar, y redeclararlo tumba la función entera con
// "SyntaxError: Identifier '__dirname' has already been declared" (pasó en producción
// el 2026-08-22). Con `new URL(..., import.meta.url)` se evita el conflicto.
const talleres = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL('./data/talleres.json', import.meta.url)), 'utf8')
);

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
