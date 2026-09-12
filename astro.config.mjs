import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { execSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import rehypeBarraFinal from './scripts/rehype-barra-final.mjs';

// ---------------------------------------------------------------------------
// <lastmod> del sitemap: cuándo cambió de verdad cada página.
//
// La fecha sale del ÚLTIMO COMMIT que tocó el archivo fuente, no de la fecha del
// despliegue. Es la diferencia entre decir la verdad y mentir: si se pusiera la
// fecha del build, cada despliegue le diría a Google que las 49 páginas cambiaron,
// Google lo comprobaría, vería que no es cierto y dejaría de hacerle caso al dato
// entero. Un producto que no se toca en meses conserva su fecha, que es justo lo
// que <lastmod> significa.
//
// Si git no está disponible (o el archivo aún no está commiteado), la página se
// queda SIN lastmod a propósito. Omitirlo es válido; poner una fecha inventada no.
// ---------------------------------------------------------------------------

const cacheFechas = new Map();

function fechaDeCommit(ruta) {
  if (cacheFechas.has(ruta)) return cacheFechas.get(ruta);
  let fecha = null;
  try {
    if (existsSync(ruta)) {
      const salida = execSync(`git log -1 --format=%cI -- "${ruta}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (salida) fecha = new Date(salida);
    }
  } catch {
    // git no disponible en el entorno de build: se omite el lastmod.
  }
  cacheFechas.set(ruta, fecha);
  return fecha;
}

// La más reciente de varias rutas. Sirve para las páginas que muestran una
// colección: /tienda cambia cuando se edita cualquier producto, no solo cuando se
// toca tienda/index.astro.
function masReciente(...rutas) {
  const fechas = rutas.flat().map(fechaDeCommit).filter(Boolean);
  if (!fechas.length) return null;
  return new Date(Math.max(...fechas.map((f) => f.getTime())));
}

function archivosDe(carpeta) {
  try {
    return readdirSync(carpeta)
      .filter((n) => n.endsWith('.md'))
      .map((n) => `${carpeta}/${n}`);
  } catch {
    return [];
  }
}

const PRODUCTOS = archivosDe('src/content/productos');
const TALLERES = archivosDe('src/content/talleres');
const POSTS = archivosDe('src/content/blog');

function fuenteDeLaPagina(ruta) {
  const producto = ruta.match(/^\/tienda\/(.+)\/$/);
  if (producto) return [`src/content/productos/${producto[1]}.md`];

  const post = ruta.match(/^\/blog\/(.+)\/$/);
  if (post) return [`src/content/blog/${post[1]}.md`];

  switch (ruta) {
    // El inicio muestra los productos destacados, así que también cambia con ellos.
    case '/':
      return ['src/pages/index.astro', ...PRODUCTOS];
    case '/tienda/':
      return ['src/pages/tienda/index.astro', ...PRODUCTOS];
    case '/curso/':
      return ['src/pages/curso.astro', ...TALLERES];
    case '/blog/':
      return ['src/pages/blog/index.astro', ...POSTS];
    case '/privacidad/':
      return ['src/pages/privacidad.astro'];
    case '/terminos/':
      return ['src/pages/terminos.astro'];
    default:
      return [];
  }
}

export default defineConfig({
  site: 'https://inefablealro.com',
  markdown: {
    // Corrige la barra final de los enlaces internos escritos desde /admin.
    rehypePlugins: [rehypeBarraFinal],
  },
  integrations: [
    sitemap({
      // Páginas que solo tienen sentido dentro de una compra en curso: /pago-confirmado
      // se llega desde Mercado Pago tras pagar, y /carrito está vacía para cualquiera
      // que no venga de agregar productos. Fuera del sitemap para que Google no las
      // indexe y nadie caiga ahí desde una búsqueda (ambas llevan su propio noindex).
      filter: (page) => !page.includes('/pago-confirmado') && !page.includes('/carrito'),
      serialize(item) {
        const ruta = new URL(item.url).pathname;
        const fecha = masReciente(fuenteDeLaPagina(ruta));
        if (fecha) item.lastmod = fecha.toISOString();
        return item;
      },
    }),
  ],
});
