// Crea una "preferencia" de pago en Mercado Pago (checkout hosteado por ellos) y
// devuelve el link al que hay que redirigir a la persona para que pague.
//
// Usa el Access Token (de prueba o de producción, según lo que esté puesto en
// MP_ACCESS_TOKEN en Netlify) — mismo patrón que netlify/functions/lib/brevo.js:
// fetch directo a la API REST, sin agregar el SDK de Mercado Pago como dependencia.
//
// Ojo: el prefijo del token NO dice si es de prueba o de producción — ambos empiezan
// con APP_USR-. Lo que los distingue es de qué pestaña del panel se copiaron.
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

  // Siempre init_point, nunca sandbox_init_point. Mercado Pago ELIMINÓ el entorno
  // sandbox: ya no hay una URL de pruebas aparte, todo (incluidas las cuentas de
  // prueba) corre contra la misma API de producción. Lo único que decide si un pago
  // es real o de prueba es CUÁL Access Token está configurado, no la URL. Su propia
  // documentación advierte que el código que use sandbox_init_point no funciona:
  // el link llega vacío o cae en una página de error.
  return {
    checkoutUrl: preferencia.init_point,
    preferenceId: preferencia.id,
  };
}

// URL base del sitio para armar los back_urls (a dónde vuelve la persona tras pagar).
// Netlify pone la variable URL sola en cada deploy — no hace falta configurarla a mano.
export function siteUrl() {
  return process.env.URL || 'https://inefablealro.com';
}
