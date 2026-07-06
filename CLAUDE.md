# CLAUDE.md — Contexto del proyecto inefable.alro

Este archivo se lee automáticamente al iniciar una sesión de Claude Code en esta carpeta.
No repitas este contexto en el chat — ya está aquí.

## Qué es esto

Sitio web para "Inefable ALRO", marca colombiana de velas artesanales (@inefable.alro).
Fase actual: marca + blog SEO + landing de curso con captura de leads.
Dueño sin equipo técnico — explica cambios de forma clara y directa, sin asumir conocimiento previo de desarrollo web.

## Stack (no cambiar sin discutirlo explícitamente)

- **Astro** 4.16 (SSG, sin React/Vue — componentes `.astro` puros)
- **Decap CMS** (git-gateway) — panel admin en `/admin`
- **Netlify** — hosting, build, Netlify Forms (formulario del curso), Netlify Identity (login admin)
- JS vanilla, sin frameworks pesados. Patrón `safe(fn, name)` con try/catch en cada `init*`.
- Reveals con IntersectionObserver, threshold 0.05 + timeout de seguridad de 6s.
- Nunca gatear micro-interacciones (hover, fade, tilt) con `prefers-reduced-motion` — solo animaciones intrusivas (autoplay, parallax fuerte).

## Identidad visual

Arquetipo "Editorial Dark Warm" adaptado a velas:
- `--bg: #16110c` `--bg-2: #1e1710` `--bg-3: #271e14` (tarjetas)
- `--cream: #f3ead9` `--cream-2: #ddcdb3` `--cream-3: #948468`
- `--accent: #c98a45` (ámbar) `--gold: #d9b26a`
- `--paper: #f4efe6` (secciones invertidas claras) `--ink: #201a12`
- Tipografía: **Fraunces** (display, cursiva para énfasis) + **Inter** (body)
- Tokens en `src/styles/global.css`

## Estructura del proyecto

```
src/
  layouts/Layout.astro       ← head (SEO, canonical, JSON-LD Organization), header, footer, whatsapp button, script de reveals
  components/                ← Header.astro, Footer.astro, WhatsAppButton.astro
  content/blog/*.md           ← posts del blog (frontmatter: title, description, date, image, draft)
  pages/
    index.astro                ← inicio (hero = banner-principal.webp)
    curso.astro                 ← taller + formulario (Netlify Forms) + JSON-LD Event (2 fechas)
    blog/index.astro            ← listado
    blog/[...slug].astro        ← post individual
    privacidad.astro
    terminos.astro
netlify/
  functions/brevo-sync.js     ← recibe el webhook de Netlify Forms y crea/actualiza el contacto en Brevo
public/
  images/                     ← fotos reales de producto, banner-principal.webp (hero), logo.png (favicon/OG), logo-badge.svg (header/footer, recoloreado cream/cream-3 para fondo oscuro)
  admin/                      ← index.html + config.yml (Decap CMS)
netlify.toml                 ← incluye [functions] directory para brevo-sync
astro.config.mjs             ← incluye integración @astrojs/sitemap (fijar en v3.2.1, versiones más nuevas rompen con Astro 4)
```

## Datos reales de la marca (no inventar otros)

- WhatsApp: +57 320 807 6828 → usado en `WhatsAppButton.astro` y en footer/curso
- Instagram: instagram.com/inefable.alro
- Taller de Velas: 25 jul y 1 ago 2026, $180.000 COP, turnos 9am-1pm y 2pm-6pm, Calle 155 #14-80 (Bogotá)
- Logo: badge circular "Inefable ALRO — Ilumina tu espacio / Hecho a mano — Est. 2026"

## Estado actual (actualizado 2026-07-05)

Proyecto compila sin errores (`npm run build`) y **ya está desplegado y en vivo**:
- Repo en GitHub: `git@github.com-personal:jerobles/inefable_alro.git` (branch `main`, cuenta personal — la máquina tiene 2 cuentas GitHub, ver alias SSH `github.com-personal`)
- Sitio en vivo en Netlify: `https://preeminent-mermaid-8418d4.netlify.app/` (deploy continuo desde `main`)
- Netlify Identity + Git Gateway activos → `/admin` (Decap CMS) funciona en producción
- Formulario del curso: notificación por email configurada + integración a Brevo funcionando de punta a punta (`netlify/functions/brevo-sync.js`). Ojo: el webhook de Netlify se autodesactiva tras 6 fallos seguidos — si deja de sincronizar, revisar Forms → Form notifications y reactivarlo ahí. Brevo trata el atributo `WHATSAPP` como campo de teléfono y exige formato internacional; la función ya formatea a `+57` automáticamente.
- SEO: sitemap real (`@astrojs/sitemap`), canonical, og:url, JSON-LD (Organization + Event del taller), imágenes con `width`/`height` fijos
- Diseño: logo corregido (contraste en fondo oscuro), banner principal actualizado con foto real de producto
- Dominio real `inefable.alro` **aún no comprado/conectado** — el sitio vive en el subdominio gratis de Netlify mientras tanto

## Pendiente / próximos pasos

1. Comprar y conectar el dominio `inefable.alro` en Netlify (dominio en sí no es gratis, ~$12-15 USD/año; conectarlo a Netlify sí lo es)
2. Configurar Google Analytics (pendiente hasta tener el dominio final, GA lo pide en su configuración)
3. Widget de Instagram en la home (esperando que el usuario conecte su cuenta en snapwidget.com y pase el código embed)
4. Seguir ajustes de diseño puntuales (el usuario los va revisando y pidiendo de a poco)
5. Fase futura (no ahora): pago Wompi para el curso, tienda de productos, suscripciones — la arquitectura ya lo permite sin romper nada existente

## Comandos útiles

```bash
npm install       # primera vez
npm run dev        # servidor local, http://localhost:4321
npm run build       # verificar que compila antes de dar por terminado un cambio
```

## Convenciones al trabajar aquí

- Cualquier cambio de diseño: mantener los tokens de `global.css`, no introducir colores/fuentes sueltas.
- Contenido hardcodeado en el HTML cuando sea posible (no generar contenido crítico solo vía JS).
- Antes de terminar una tarea, correr `npm run build` y confirmar que no hay errores.
- No agregar dependencias npm pesadas (frameworks JS, librerías de animación grandes) sin confirmar con el usuario — el sitio se diseñó para ser liviano y mantenible por alguien sin equipo técnico.
- La regla base `img { max-width: 100%; height: auto; }` en `global.css` es importante — si una sección nueva de imagen necesita alto distinto, usar `aspect-ratio` + `object-fit: cover` en el CSS de esa sección (como `.galeria__grid img`), no depender solo de los atributos `width`/`height` del HTML.
- `@astrojs/sitemap` debe quedar en `3.2.1` (`package.json`) — versiones más nuevas (3.7.x) rompen el build con Astro 4.16.
