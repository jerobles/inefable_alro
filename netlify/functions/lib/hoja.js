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

    // 401/403 con el HTML de la pantalla de permisos de Google = la implementación no
    // quedó publicada como "Cualquier usuario". Es el error más común al configurarla,
    // y decir solo "respondió 401" no le sirve a nadie para arreglarlo.
    if (respuesta.status === 401 || respuesta.status === 403) {
      console.error('[hoja] Google respondió %s (pantalla de permisos): la implementación no es pública', respuesta.status);
      return 'la implementación del script no es pública — en Apps Script, "Quién tiene acceso" debe ser "Cualquier usuario"';
    }
    if (!respuesta.ok) {
      console.error('[hoja] La hoja respondió %s: %s', respuesta.status, texto.slice(0, 300));
      return `la hoja respondió ${respuesta.status}`;
    }

    // Tres respuestas posibles, y cada una apunta a un problema distinto. Distinguirlas
    // importa: mandar a revisar la implementación cuando lo que falla es la clave hace
    // perder el tiempo buscando donde no es.
    if (texto.includes('"ok":true')) {
      console.log('[hoja] Pedido %s registrado en la hoja', fila.numeroPedido || '(sin número)');
      return null;
    }

    // 2) El script contestó, pero rechazó la fila (casi siempre: la clave de Netlify y
    //    la del script no son idénticas).
    try {
      const json = JSON.parse(texto);
      if (json && json.ok === false) {
        console.error('[hoja] La hoja rechazó la fila:', json.error);
        return json.error === 'clave incorrecta'
          ? 'la clave del script y la de HOJA_PEDIDOS_TOKEN no coinciden'
          : `la hoja rechazó la fila: ${json.error}`;
      }
    } catch (err) {
      /* no era JSON: cae al caso de abajo */
    }

    // 3) No es JSON — típicamente el HTML de la pantalla de permisos de Google, que es
    //    lo que se recibe cuando la implementación no quedó pública ("Cualquier usuario").
    console.error('[hoja] Respuesta inesperada de la hoja:', texto.slice(0, 300));
    return 'la implementación del script no es pública (debe ser "Cualquier usuario")';

  } catch (err) {
    const motivo = err.name === 'AbortError' ? 'la hoja no respondió a tiempo' : err.message;
    console.error('[hoja] No se pudo registrar el pedido en la hoja:', motivo);
    return motivo;
  } finally {
    clearTimeout(reloj);
  }
}
