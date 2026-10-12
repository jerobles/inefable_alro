// Zonas de entrega: la única fuente de verdad sobre dónde entregamos y cuánto cuesta.
//
// La importan el formulario del carrito (para pintar el desplegable) y las funciones
// del servidor (para cobrar). Una sola lista evita que se desincronicen: si alguien
// agrega una localidad en un lado y no en el otro, el cobro deja de cuadrar con lo
// que vio el comprador.
//
// ⚠️ EL PRECIO NO SE MUESTRA JUNTO A LA OPCIÓN, A PROPÓSITO (decisión del usuario,
// 2026-10-12). Antes el desplegable decía "Norte de Bogotá — envío gratis", o sea que
// le señalaba al comprador cuál opción le ahorraba plata. Eso invita a mentir, y pasó
// de verdad: en una prueba el propio usuario eligió esa opción con una dirección que
// no correspondía. Ahora el desplegable muestra solo nombres de localidad; cuál es
// gratis es información interna. El costo sí aparece en el total antes de pagar —
// eso no es negociable, no se le puede cobrar a alguien sin mostrarle cuánto.
//
// La idea de fondo: sin el premio a la vista, la gente pone su dirección real, porque
// la necesita para recibir el pedido.

// Las 20 localidades oficiales de Bogotá. El `valor` es lo que viaja en el formulario
// (sin tildes ni espacios, para que no dependa de la codificación del navegador).
export const LOCALIDADES = [
  { valor: 'usaquen', nombre: 'Usaquén' },
  { valor: 'chapinero', nombre: 'Chapinero' },
  { valor: 'santa-fe', nombre: 'Santa Fe' },
  { valor: 'san-cristobal', nombre: 'San Cristóbal' },
  { valor: 'usme', nombre: 'Usme' },
  { valor: 'tunjuelito', nombre: 'Tunjuelito' },
  { valor: 'bosa', nombre: 'Bosa' },
  { valor: 'kennedy', nombre: 'Kennedy' },
  { valor: 'fontibon', nombre: 'Fontibón' },
  { valor: 'engativa', nombre: 'Engativá' },
  { valor: 'suba', nombre: 'Suba' },
  { valor: 'barrios-unidos', nombre: 'Barrios Unidos' },
  { valor: 'teusaquillo', nombre: 'Teusaquillo' },
  { valor: 'los-martires', nombre: 'Los Mártires' },
  { valor: 'antonio-narino', nombre: 'Antonio Nariño' },
  { valor: 'puente-aranda', nombre: 'Puente Aranda' },
  { valor: 'la-candelaria', nombre: 'La Candelaria' },
  { valor: 'rafael-uribe-uribe', nombre: 'Rafael Uribe Uribe' },
  { valor: 'ciudad-bolivar', nombre: 'Ciudad Bolívar' },
  { valor: 'sumapaz', nombre: 'Sumapaz' },
];

// Dónde entregamos nosotros mismos, y por eso no cobramos domicilio.
// Usaquén va desde la Calle 100 hacia el norte. Si algún día se suma otra, basta
// agregarla acá: el formulario y el cobro la toman sin tocar nada más.
const SIN_COSTO = new Set(['usaquen']);

export const TIPOS_DE_LUGAR = [
  { valor: 'casa', nombre: 'Casa' },
  { valor: 'apartamento', nombre: 'Apartamento' },
  { valor: 'conjunto', nombre: 'Conjunto o edificio' },
  { valor: 'oficina', nombre: 'Oficina o local' },
];

// Los tipos que necesitan torre/interior/apartamento para poder entregar.
export const NECESITA_UNIDAD = new Set(['apartamento', 'conjunto', 'oficina']);

export function nombreLocalidad(valor) {
  return LOCALIDADES.find((l) => l.valor === valor)?.nombre || '';
}

export function nombreTipoLugar(valor) {
  return TIPOS_DE_LUGAR.find((t) => t.valor === valor)?.nombre || '';
}

/**
 * Cuánto cuesta el domicilio. **Esta función es la autoridad**: el navegador manda
 * la localidad elegida, nunca un precio, y acá se vuelve a calcular desde cero.
 *
 * @returns número de pesos, o `null` cuando no se puede cobrar en línea todavía
 *          (otra ciudad, o una localidad que no reconocemos).
 */
export function envioDeEntrega({ ciudad, localidad, tarifaBogota, tarifaGratis = 0 }) {
  if (ciudad !== 'bogota') return null; // otra ciudad: se cotiza con la transportadora
  if (!LOCALIDADES.some((l) => l.valor === localidad)) return null;
  return SIN_COSTO.has(localidad) ? tarifaGratis : tarifaBogota;
}

/** Texto corto para el correo, la hoja y WhatsApp. */
export function textoEntrega({ ciudad, localidad, ciudadOtra }) {
  if (ciudad !== 'bogota') return ciudadOtra ? `${ciudadOtra} (otra ciudad)` : 'Otra ciudad';
  const nombre = nombreLocalidad(localidad);
  return nombre ? `Bogotá — ${nombre}` : 'Bogotá';
}
