// Lógica compartida de un pedido del carrito: resolverlo contra el catálogo del
// servidor y pintarlo como tabla para los correos.
//
// La usan pago-producto.js (para cobrar) y producto-sync.js (para el CRM y los
// correos), así que el cliente ve exactamente lo mismo que se le cobra.

export const SITIO = 'https://inefablealro.com';

export const ENTREGA_LABEL = {
  'bogota-norte': 'Norte de Bogotá (envío gratis)',
  'bogota-resto': 'Resto de Bogotá (domicilio)',
  otra: 'Otra ciudad (envío por coordinar)',
};

// Según cómo empaquete Netlify, un módulo de datos importado llega como el arreglo
// directo o envuelto en un objeto con .default. Confiar en una sola de esas formas
// tumbó las funciones en producción (2026-09-05). Ver generar-datos-pago.mjs.
export function comoLista(mod, nombreFuncion) {
  if (Array.isArray(mod)) return mod;
  if (Array.isArray(mod?.default)) return mod.default;
  console.error('[%s] Los datos de precios no llegaron como lista:', nombreFuncion, typeof mod);
  return [];
}

export function formatCOP(n) {
  return '$' + Number(n || 0).toLocaleString('es-CO') + ' COP';
}

function escapar(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Toma lo que mandó el navegador y lo resuelve contra el catálogo real.
 *
 * El navegador solo dice QUÉ quiere (slug, presentación, cantidad). El nombre, el
 * precio y la foto salen de acá, del servidor: así nadie puede alterar el precio
 * editando el HTML, y el correo nunca muestra algo distinto de lo que se cobró.
 *
 * @param crudo  Texto JSON del campo "pedido": [{ s: slug, p: presentacion, c: cantidad }]
 * @param productos  Catálogo del servidor (netlify/functions/data/productos.cjs)
 */
export function resolverPedido(crudo, productos) {
  let pedido;
  try {
    pedido = typeof crudo === 'string' ? JSON.parse(crudo) : crudo;
  } catch (err) {
    return { lineas: [], subtotal: 0, hayCotizacion: false, invalido: true };
  }
  if (!Array.isArray(pedido) || pedido.length === 0) {
    return { lineas: [], subtotal: 0, hayCotizacion: false, invalido: true };
  }

  const lineas = [];
  for (const item of pedido.slice(0, 40)) {
    const producto = productos.find((p) => p.slug === item.s);
    if (!producto) continue;
    const variante = producto.variantes.find((v) => v.presentacion === item.p) || producto.variantes[0];
    const cantidad = Math.max(1, Math.min(50, Number(item.c) || 1));
    const precio = variante?.precio;

    lineas.push({
      slug: producto.slug,
      nombre: producto.nombre,
      presentacion: variante?.presentacion || '',
      precio: precio === undefined ? null : precio,
      cantidad,
      subtotal: precio === undefined ? null : precio * cantidad,
      // La miniatura JPG, no la WebP del sitio: WebP se ve rota en Outlook.
      imagen: producto.imagen ? `${SITIO}/images/productos/correo/${producto.slug}.jpg` : null,
    });
  }

  return {
    lineas,
    subtotal: lineas.reduce((suma, l) => suma + (l.subtotal || 0), 0),
    hayCotizacion: lineas.some((l) => l.precio === null),
    invalido: lineas.length === 0,
  };
}

/**
 * Tabla del pedido para el correo. HTML de correo, no de web: tablas, estilos en
 * línea y nada de flex/grid — los clientes de correo viejos no los entienden.
 */
export function tablaPedidoHtml({ lineas, subtotal, envio, total, entrega, hayCotizacion }) {
  const filas = lineas
    .map(
      (l) => `
      <tr>
        <td style="padding:12px 10px 12px 0;vertical-align:top;width:64px;">
          ${l.imagen ? `<img src="${escapar(l.imagen)}" width="56" height="56" alt="" style="display:block;border-radius:3px;border:1px solid #e2d9c8;" />` : ''}
        </td>
        <td style="padding:12px 10px 12px 0;vertical-align:top;font-size:14px;color:#201a12;">
          <strong style="font-weight:600;">${escapar(l.nombre)}</strong><br />
          <span style="color:#7a6c53;font-size:13px;">${escapar(l.presentacion)}</span>
        </td>
        <td style="padding:12px 10px;vertical-align:top;font-size:14px;color:#7a6c53;text-align:center;white-space:nowrap;">
          x${l.cantidad}
        </td>
        <td style="padding:12px 0;vertical-align:top;font-size:14px;color:#201a12;text-align:right;white-space:nowrap;">
          ${l.subtotal === null ? '<span style="color:#7a6c53;">Por cotizar</span>' : escapar(formatCOP(l.subtotal))}
        </td>
      </tr>`
    )
    .join('');

  const lineaTotal = (etiqueta, valor, fuerte = false) => `
      <tr>
        <td colspan="3" style="padding:${fuerte ? '12px' : '5px'} 10px ${fuerte ? '12px' : '5px'} 0;text-align:right;font-size:${fuerte ? '15px' : '14px'};color:#201a12;${fuerte ? 'font-weight:600;border-top:1px solid #e2d9c8;' : ''}">${etiqueta}</td>
        <td style="padding:${fuerte ? '12px' : '5px'} 0;text-align:right;font-size:${fuerte ? '15px' : '14px'};color:#201a12;white-space:nowrap;${fuerte ? 'font-weight:600;border-top:1px solid #e2d9c8;' : ''}">${valor}</td>
      </tr>`;

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:18px 0;">
      <thead>
        <tr>
          <th colspan="2" style="padding:0 0 8px;text-align:left;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7a6c53;font-weight:600;border-bottom:1px solid #e2d9c8;">Producto</th>
          <th style="padding:0 10px 8px;text-align:center;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7a6c53;font-weight:600;border-bottom:1px solid #e2d9c8;">Cant.</th>
          <th style="padding:0 0 8px;text-align:right;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7a6c53;font-weight:600;border-bottom:1px solid #e2d9c8;">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${filas}
        ${lineaTotal('Subtotal', escapar(formatCOP(subtotal)))}
        ${lineaTotal(
          'Envío',
          envio === null || envio === undefined
            ? '<span style="color:#7a6c53;">Por cotizar</span>'
            : envio === 0
              ? 'Gratis'
              : escapar(formatCOP(envio))
        )}
        ${lineaTotal(
          hayCotizacion || envio === null || envio === undefined ? 'Total parcial' : 'Total',
          escapar(formatCOP(total)),
          true
        )}
      </tbody>
    </table>
    <p style="margin:0;font-size:13px;color:#7a6c53;">Entrega: ${escapar(ENTREGA_LABEL[entrega] || 'A coordinar')}</p>
    ${
      hayCotizacion
        ? '<p style="margin:10px 0 0;font-size:13px;color:#a86a2e;">Tu pedido incluye productos que se cotizan según lo que necesites, así que ese valor todavía no está incluido. Te escribimos con el precio final antes de cobrar nada.</p>'
        : ''
    }
  `;
}

/** Resumen en texto plano, para el aviso interno y para WhatsApp. */
export function resumenTexto(lineas) {
  return lineas
    .map((l) => `${l.cantidad} x ${l.nombre}${l.presentacion ? ` (${l.presentacion})` : ''}`)
    .join(' | ');
}
