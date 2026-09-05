import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://inefablealro.com',
  integrations: [
    sitemap({
      // Páginas que solo tienen sentido dentro de una compra en curso: /pago-confirmado
      // se llega desde Mercado Pago tras pagar, y /carrito está vacía para cualquiera
      // que no venga de agregar productos. Fuera del sitemap para que Google no las
      // indexe y nadie caiga ahí desde una búsqueda (ambas llevan su propio noindex).
      filter: (page) => !page.includes('/pago-confirmado') && !page.includes('/carrito'),
    }),
  ],
});
