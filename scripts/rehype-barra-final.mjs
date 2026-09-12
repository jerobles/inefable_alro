// ---------------------------------------------------------------------------
// Barra final automática en los enlaces internos del markdown (posts del blog).
//
// Astro genera cada página como una carpeta (/tienda/index.html), así que la
// dirección buena es /tienda/ y Netlify responde 301 desde /tienda. Un enlace
// escrito a mano desde /admin como "[el catálogo](/tienda)" manda al visitante
// por un rebote innecesario y desperdicia la señal para Google.
//
// En vez de confiar en que quien escribe se acuerde de la barra, se corrige al
// compilar. Escribir /tienda o /tienda/ da el mismo resultado correcto.
//
// NO se tocan: enlaces externos (https://, mailto:, wa.me), anclas puras (#algo),
// rutas a archivos con extensión (/images/foto.webp) ni lo que ya termina en barra.
// ---------------------------------------------------------------------------

const TERMINA_EN_EXTENSION = /\.[a-z0-9]{2,5}$/i;

export function conBarraFinal(href) {
  // Solo rutas internas absolutas. "//otro-sitio.com" es protocol-relative: externo.
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return null;

  // El ancla y la consulta van DESPUÉS de la barra: /tienda#aromas → /tienda/#aromas
  const corte = href.search(/[?#]/);
  const ruta = corte === -1 ? href : href.slice(0, corte);
  const resto = corte === -1 ? '' : href.slice(corte);

  if (ruta.endsWith('/') || TERMINA_EN_EXTENSION.test(ruta)) return null;
  return `${ruta}/${resto}`;
}

function recorrer(nodo, alEncontrarEnlace) {
  if (nodo.type === 'element' && nodo.tagName === 'a') alEncontrarEnlace(nodo);
  for (const hijo of nodo.children || []) recorrer(hijo, alEncontrarEnlace);
}

export default function rehypeBarraFinal() {
  return (tree) => {
    recorrer(tree, (enlace) => {
      const corregido = conBarraFinal(enlace.properties?.href);
      if (corregido) enlace.properties.href = corregido;
    });
  };
}
