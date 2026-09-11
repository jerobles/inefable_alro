// Valida la firma con la que Mercado Pago sella cada aviso de webhook.
//
// Sin esto, la URL del webhook es una puerta abierta: cualquiera que la descubra
// podría mandar un "pago aprobado" inventado y hacer que despachemos un pedido que
// nadie pagó. La firma es lo único que prueba que el aviso viene de Mercado Pago.
//
// Cómo funciona (según su documentación):
//   - Llega el header  x-signature: ts=1704908010,v1=abc123...
//   - Llega el header  x-request-id
//   - Y en la URL,     ?data.id=123456789
//   - Se arma la cadena  id:<data.id>;request-id:<x-request-id>;ts:<ts>;
//   - Se calcula HMAC-SHA256 de esa cadena con la clave secreta del panel
//   - El resultado en hexadecimal tiene que ser igual a v1

import crypto from 'node:crypto';

// Un aviso viejo reaprovechado por un atacante no debería servir. Mercado Pago no fija
// una ventana, así que se usa uno holgado: tolera reintentos y relojes desfasados, pero
// descarta cualquier cosa verdaderamente añeja.
const VENTANA_SEGUNDOS = 15 * 60;

function parsearCabecera(xSignature) {
  const partes = String(xSignature || '').split(',');
  const out = {};
  for (const parte of partes) {
    const [clave, valor] = parte.split('=');
    if (clave && valor) out[clave.trim()] = valor.trim();
  }
  return { ts: out.ts, v1: out.v1 };
}

// Comparación en tiempo constante: comparar hashes con === filtra información por el
// tiempo que tarda en fallar, y con eso se puede adivinar la firma carácter a carácter.
function igualesSeguro(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * @returns {{ valida: boolean, motivo?: string }}
 */
export function validarFirmaMercadoPago({ xSignature, xRequestId, dataId, secreto }) {
  if (!secreto) {
    return { valida: false, motivo: 'MP_WEBHOOK_SECRET no está configurado' };
  }
  if (!xSignature) {
    return { valida: false, motivo: 'el aviso llegó sin header x-signature' };
  }
  if (!dataId) {
    return { valida: false, motivo: 'el aviso llegó sin data.id' };
  }

  const { ts, v1 } = parsearCabecera(xSignature);
  if (!ts || !v1) {
    return { valida: false, motivo: 'x-signature no tiene el formato ts=...,v1=...' };
  }

  const edad = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!Number.isFinite(edad) || edad > VENTANA_SEGUNDOS) {
    return { valida: false, motivo: `el aviso está fuera de la ventana de tiempo (${edad}s)` };
  }

  // Mercado Pago indica pasar el id en minúsculas cuando es alfanumérico.
  const id = String(dataId).toLowerCase();
  const manifiesto = `id:${id};request-id:${xRequestId || ''};ts:${ts};`;

  const calculada = crypto.createHmac('sha256', secreto).update(manifiesto).digest('hex');

  if (!igualesSeguro(calculada, v1)) {
    return { valida: false, motivo: 'la firma no coincide' };
  }

  return { valida: true };
}
