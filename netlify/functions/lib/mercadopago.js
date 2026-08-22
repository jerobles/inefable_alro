// Crea una "preferencia" de pago en Mercado Pago (checkout hosteado por ellos) y
// devuelve el link al que hay que redirigir a la persona para que pague.
//
// Usa el Access Token (de prueba o de producción, según lo que esté puesto en
// MP_ACCESS_TOKEN en Netlify) — mismo patrón que netlify/functions/lib/brevo.js:
// fetch directo a la API REST, sin agregar el SDK de Mercado Pago como dependencia.
export async function crearPreferencia({ accessToken, items, payer, externalReference, backUrls }) {
  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: items.map((it) => ({ currency_id: 'COP', ...it })),
      payer,
      external_reference: externalReference,
      back_urls: backUrls,
      auto_return: 'approved',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Mercado Pago error ${response.status}: ${errText}`);
    err.statusCode = 502;
    throw err;
  }

  const preferencia = await response.json();

  // sandbox_init_point solo viene poblado cuando el Access Token es de PRUEBA — se usa
  // ese para poder probar el flujo completo sin cobrar de verdad. Con un token de
  // producción, Mercado Pago no manda sandbox_init_point y cae directo a init_point.
  return {
    checkoutUrl: preferencia.sandbox_init_point || preferencia.init_point,
    preferenceId: preferencia.id,
  };
}

// URL base del sitio para armar los back_urls (a dónde vuelve la persona tras pagar).
// Netlify pone la variable URL sola en cada deploy — no hace falta configurarla a mano.
export function siteUrl() {
  return process.env.URL || 'https://inefablealro.com';
}
