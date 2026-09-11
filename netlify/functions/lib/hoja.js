// Habla con la hoja de cálculo de Google donde caen los pedidos.
//
// No usa la API de Google ni una cuenta de servicio: la hoja tiene pegado un pequeño
// script (ver docs/hoja-de-pedidos.md) publicado como "aplicación web", y aquí solo se
// le hace un POST a esa URL. Sin proyecto en Google Cloud, sin archivos de llaves, y
// la hoja sigue siendo del usuario, para compartirla con quien quiera.
//
// La URL va en HOJA_PEDIDOS_URL y un secreto compartido en HOJA_PEDIDOS_TOKEN (el
// script rechaza cualquier envío que no lo traiga, para que nadie más pueda escribir
// filas si la URL se filtra).
//
// Dos operaciones:
//   - registrarEnHoja()      agrega la fila cuando entra el pedido
//   - actualizarPagoEnHoja() marca esa fila como pagada cuando Mercado Pago confirma

const TIMEOUT_MS = 8000;

/**
 * POST al Apps Script, con toda la interpretación de errores en un solo lugar.
 * NUNCA lanza: devuelve { error } con un motivo legible, o { datos } si salió bien.
 */
async function hablarConLaHoja(cuerpo, etiqueta) {
  const url = process.env.HOJA_PEDIDOS_URL;
  const token = process.env.HOJA_PEDIDOS_TOKEN;

  if (!url) {
    // Todavía sin configurar: no es un error, simplemente aún no hay hoja.
    return { error: null, datos: null, sinConfigurar: true };
  }

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(url, {
      method: 'POST',
      // Apps Script responde con redirecciones; fetch las sigue solo.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, ...cuerpo }),
      signal: control.signal,
    });

    const texto = await respuesta.text();

    // 401/403 con el HTML de la pantalla de permisos de Google = la implementación no
    // quedó publicada como "Cualquier usuario". Es el error más común al configurarla,
    // y decir solo "respondió 401" no le sirve a nadie para arreglarlo.
    if (respuesta.status === 401 || respuesta.status === 403) {
      console.error('[hoja] Google respondió %s (pantalla de permisos): la implementación no es pública', respuesta.status);
      return { error: 'la implementación del script no es pública — en Apps Script, "Quién tiene acceso" debe ser "Cualquier usuario"' };
    }
    if (!respuesta.ok) {
      console.error('[hoja] La hoja respondió %s: %s', respuesta.status, texto.slice(0, 300));
      return { error: `la hoja respondió ${respuesta.status}` };
    }

    // Tres respuestas posibles, y cada una apunta a un problema distinto. Distinguirlas
    // importa: mandar a revisar la implementación cuando lo que falla es la clave hace
    // perder el tiempo buscando donde no es.
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch (err) {
      // No es JSON — típicamente el HTML de la pantalla de permisos de Google.
      console.error('[hoja] Respuesta inesperada de la hoja (%s):', etiqueta, texto.slice(0, 300));
      return { error: 'la implementación del script no es pública (debe ser "Cualquier usuario")' };
    }

    if (json && json.ok === false) {
      console.error('[hoja] La hoja rechazó la petición (%s):', etiqueta, json.error);
      return {
        error:
          json.error === 'clave incorrecta'
            ? 'la clave del script y la de HOJA_PEDIDOS_TOKEN no coinciden'
            : `la hoja rechazó la petición: ${json.error}`,
      };
    }

    return { error: null, datos: json };
  } catch (err) {
    const motivo = err.name === 'AbortError' ? 'la hoja no respondió a tiempo' : err.message;
    console.error('[hoja] Falló la petición a la hoja (%s):', etiqueta, motivo);
    return { error: motivo };
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Agrega el pedido como una fila nueva. NUNCA lanza: si la hoja falla, el pedido ya
 * está en el correo, en Netlify y en el CRM, y perderlo todo por un fallo de Google
 * sería absurdo. Devuelve un texto con el motivo cuando no se pudo, o null si quedó bien.
 */
export async function registrarEnHoja(fila) {
  // Sin `accion` a propósito: un Apps Script viejo (el que solo sabe agregar) sigue
  // funcionando igual, así que actualizarlo no es urgente para que entren pedidos.
  const { error } = await hablarConLaHoja({ fila }, 'agregar');
  if (!error) console.log('[hoja] Pedido %s registrado en la hoja', fila.numeroPedido || '(sin número)');
  return error || null;
}

/**
 * Marca en la hoja que un pedido ya se pagó (o que el pago fue rechazado).
 *
 * Devuelve `{ error, actualizado }`. **`actualizado` es la pieza de idempotencia de
 * todo el webhook**: la hoja solo lo pone en true cuando la fila de verdad cambió de
 * estado. Mercado Pago manda el mismo aviso varias veces, así que sin esto se podrían
 * enviar varios correos de "pago confirmado" por una sola compra.
 */
export async function actualizarPagoEnHoja({ numeroPedido, pago }) {
  if (!numeroPedido) return { error: 'el pago no traía número de pedido', actualizado: false };

  const { error, datos, sinConfigurar } = await hablarConLaHoja(
    { accion: 'actualizarPago', numeroPedido, pago },
    'actualizarPago'
  );

  if (sinConfigurar) return { error: null, actualizado: false };
  if (error) return { error, actualizado: false };

  // Un Apps Script sin actualizar no conoce la acción y responde el ok de siempre, sin
  // el campo `actualizado`. Se detecta explícitamente para no confundirlo con "la fila
  // ya estaba pagada" y quedarnos callados creyendo que todo salió bien.
  if (datos && datos.actualizado === undefined) {
    console.warn('[hoja] El Apps Script no entiende "actualizarPago": falta actualizar la implementación (ver docs/hoja-de-pedidos.md)');
    return { error: 'el script de la hoja todavía no sabe actualizar pagos', actualizado: false };
  }

  if (datos?.actualizado) {
    console.log('[hoja] Pedido %s marcado como "%s" en la hoja', numeroPedido, pago);
  } else {
    console.log('[hoja] Pedido %s: la hoja no cambió (%s)', numeroPedido, datos?.motivo || 'ya estaba así');
  }

  return { error: null, actualizado: Boolean(datos?.actualizado), motivo: datos?.motivo };
}
