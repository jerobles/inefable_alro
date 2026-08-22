import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://inefablealro.com',
  integrations: [
    sitemap({
      // /pago-confirmado solo tiene sentido llegando desde Mercado Pago tras pagar.
      // Fuera del sitemap para que Google no la indexe y nadie caiga ahí desde una
      // búsqueda (la página además lleva su propio noindex).
      filter: (page) => !page.includes('/pago-confirmado'),
    }),
  ],
});
