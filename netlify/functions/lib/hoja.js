// Envía cada pedido a la hoja de cálculo de Google, como una fila nueva.
//
// No usa la API de Google ni una cuenta de servicio: la hoja tiene pegado un pequeño
// script (ver docs/hoja-de-pedidos.md) publicado como "aplicación web", y aquí solo se
// le hace un POST a esa URL. Sin proyecto en Google Cloud, sin archivos de llaves, y
// la hoja sigue siendo del usuario, para compartirla con quien quiera.
//
// La URL va en HOJA_PEDIDOS_URL y un secreto compartido en HOJA_PEDIDOS_TOKEN (el
// script rechaza cualquier envío que no lo traiga, para que nadie más pueda escribir
// filas si la URL se filtra).

const TIMEOUT_MS = 8000;

/**
 * Manda una fila a la hoja. NUNCA lanza: si la hoja falla, el pedido ya está en el
 * correo, en Netlify y en el CRM, y perderlo todo por un fallo de Google sería
 * absurdo. Devuelve un texto con el motivo cuando no se pudo, o null si quedó bien.
 */
export async function registrarEnHoja(fila) {
  const url = process.env.HOJA_PEDIDOS_URL;
  const token = process.env.HOJA_PEDIDOS_TOKEN;

  if (!url) {
    // Todavía sin configurar: no es un error, simplemente aún no hay hoja.
    return null;
  }

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(url, {
      method: 'POST',
      // Apps Script responde con redirecciones; fetch las sigue solo.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, fila }),
      signal: control.signal,
    });

    const texto = await respuesta.text();
    if (!respuesta.ok) {
      console.error('[hoja] La hoja respondió %s: %s', respuesta.status, texto.slice(0, 200));
      return `la hoja respondió ${respuesta.status}`;
    }
    // El script devuelve {"ok":true}. Si llega otra cosa (típicamente el HTML de la
    // pantalla de login de Google), es que la implementación no quedó pública.
    if (!texto.includes('"ok":true')) {
      console.error('[hoja] Respuesta inesperada de la hoja:', texto.slice(0, 200));
      return 'la hoja no aceptó la fila (revisa que la implementación sea pública)';
    }

    console.log('[hoja] Pedido %s registrado en la hoja', fila.numeroPedido || '(sin número)');
    return null;
  } catch (err) {
    const motivo = err.name === 'AbortError' ? 'la hoja no respondió a tiempo' : err.message;
    console.error('[hoja] No se pudo registrar el pedido en la hoja:', motivo);
    return motivo;
  } finally {
    clearTimeout(reloj);
  }
}
