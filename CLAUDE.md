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
  components/                ← Header.astro, Footer.astro (incluye form de newsletter), WhatsAppButton.astro (flotante), WhatsAppBanner.astro (banner con ícono+número+CTA, usado en /curso)
  content/
    config.ts                  ← schemas de las colecciones (blog, talleres)
    blog/*.md                    ← posts del blog (frontmatter: title, description, date, image, draft)
    talleres/*.md                 ← talleres (frontmatter: titulo, fecha, precio, notaPrecio, duracion, horario, descripcion, incluye, lugar, activo) — editable desde /admin
  pages/
    index.astro                ← inicio (hero = banner-principal.webp, video del taller en loop)
    curso.astro                 ← lee la colección "talleres" (getCollection): tarjetas + form + JSON-LD, todo dinámico
    blog/index.astro            ← listado
    blog/[...slug].astro        ← post individual
    privacidad.astro
    terminos.astro
netlify/
  functions/
    lib/brevo.js              ← helpers compartidos de Brevo (sendBrevoEmail, parseRecipients, toE164Colombia, upsertBrevoContact)
    brevo-sync.js               ← webhook del form del taller: crea/actualiza contacto en Brevo + 2 correos (confirmación al lead + notificación interna)
    newsletter-sync.js          ← webhook del form de newsletter (footer): crea/actualiza contacto en su propia lista + correo de bienvenida
public/
  images/                     ← fotos reales de producto, banner-principal.webp (hero), curso-experiencia-poster.jpg (poster del video), logo.png (favicon/OG), logo-badge.svg (header/footer, recoloreado cream/cream-3, disco crema detrás)
  videos/curso-experiencia.mp4 ← loop del taller en la home (10s, 552KB, comprimido con ffmpeg)
  admin/                      ← index.html + config.yml (Decap CMS: colecciones "blog" y "talleres")
netlify.toml                 ← incluye [functions] directory para brevo-sync
astro.config.mjs             ← incluye integración @astrojs/sitemap (fijar en v3.2.1, versiones más nuevas rompen con Astro 4)
```

## Datos reales de la marca (no inventar otros)

- WhatsApp: +57 302 110 1969 → usado en `WhatsAppButton.astro`, footer, curso, privacidad, términos (cambió desde +57 320 807 6828, actualizado 2026-08-21)
- Instagram: instagram.com/inefable.alro
- Talleres (agosto 2026, Calle 155 #14-80, Bogotá) — ojo: van a seguir cambiando mes a mes, verificar con el usuario antes de asumir que siguen vigentes:
  - 22 ago: Taller de Creación de Velas de Postre, $100.000 COP, 2h, horario a confirmar por WhatsApp
  - 29 ago: Taller de Velas (el genérico de siempre), $180.000 COP, turnos 9am-1pm y 2pm-6pm
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

0. **En curso (2026-08-21): rediseño de talleres**, por módulos, aprobando cada uno con el usuario antes de seguir:
   - Módulo 1 ✅ hecho — datos reales corregidos (WhatsApp, talleres de agosto), botón "Reservar este taller" por tarjeta
   - Módulo 1.5 ✅ **activo y confirmado en producción** — `brevo-sync.js` manda 2 correos por Brevo (transactional email, misma API key): confirmación al lead + notificación a la empresa con botón "Escríbele por WhatsApp" directo al número del lead. Remitente separado en dos para no bloquear todo por el correo corporativo:
     - `BREVO_SENDER_EMAIL_INTERNO` = `jerobles08@gmail.com` (verificado en Brevo, funcionando — el usuario confirmó que le llegó el correo de prueba con el botón). Nota: Brevo avisa que un Gmail gratuito no cumple los requisitos ideales de DKIM/DMARC — no es problema para un correo interno (a lo sumo cae en Spam la primera vez, se soluciona marcándolo "No es spam").
     - `BREVO_SENDER_EMAIL` — remitente del correo de confirmación AL CLIENTE. Debe ser un correo "empresarial" (el usuario no quiere usar el personal aquí) — sigue pendiente de que se lo pasen. Mientras no esté, ese correo específico se omite en silencio (no rompe nada).
     - `BUSINESS_NOTIFY_EMAIL` = `jerobles08@gmail.com` (acepta varios separados por coma si hace falta sumar destinatarios)
     - Importante: `formresponses@netlify.com` es el remitente FIJO de la notificación nativa de Netlify Forms (la que ya funciona, en paralelo) — esa NO se puede personalizar ni ponerle botones, por eso se armó el correo aparte por Brevo.
   - Módulo 2 ✅ hecho — colección "Talleres" en Decap CMS (`src/content/talleres/*.md`, schema en `src/content/config.ts`). El usuario agrega/edita/oculta talleres desde `/admin` sin tocar código. Campos: titulo, fecha, precio, notaPrecio, duracion, horario, descripcion, incluye (lista), lugar, activo (boolean para ocultar sin borrar).
   - Módulo 3 ✅ hecho — `/curso` lee la colección de talleres: filtra los inactivos y los que ya pasaron de fecha, ordena, y genera tarjetas + JSON-LD + opciones del selector del formulario dinámicamente. Brevo guarda a qué taller se inscribió cada contacto en el atributo `TALLER` (texto libre, no una lista aparte por taller — así no hay que crear una lista nueva en Brevo cada vez que se agrega un taller). Si no hay talleres activos/futuros, la página muestra un estado vacío con CTA a WhatsApp en vez de quedar rota.
   - Módulo 4 — formulario de newsletter (nombre + correo) en el footer (aparece en todas las páginas, no solo el inicio). `netlify/functions/newsletter-sync.js` guarda el contacto en una lista aparte de Brevo y manda un correo de bienvenida (usa `BREVO_SENDER_EMAIL`, el corporativo — mismo bloqueo que el Módulo 1.5). Se creó `netlify/functions/lib/brevo.js` con las funciones compartidas (`sendBrevoEmail`, `parseRecipients`, `toE164Colombia`, `upsertBrevoContact`) para no duplicar código entre `brevo-sync.js` y `newsletter-sync.js`. Estado (2026-08-21):
     - `BREVO_NEWSLETTER_LIST_ID` = `6` — lista "Newsletter" ya creada en Brevo, variable **agregada por el usuario en Netlify**.
     - **Pendiente, recién se puede hacer después de publicar** (Netlify detecta el formulario "newsletter" al desplegar, no antes): agregar un "Outgoing webhook" en Forms → Form notifications apuntando a `.../.netlify/functions/newsletter-sync`, **limitado específicamente al formulario "newsletter"** (no "any form").
     - **Corrección pendiente en el webhook existente del taller:** el outgoing webhook de `brevo-sync` quedó configurado para dispararse con "any form" (cualquier formulario) — válido cuando solo existía un formulario, pero ahora que hay dos hay que editarlo para limitarlo solo a "pre-inscripcion-curso". Si no se corrige, las inscripciones al newsletter también dispararían brevo-sync (mal) y viceversa.
   - Módulo 5 ✅ hecho — banner visual de WhatsApp + efecto hover en las tarjetas de taller:
     - Nuevo componente `src/components/WhatsAppBanner.astro` (ícono + número grande + CTA), reemplaza el link de solo texto en `/curso`. Reutilizable si se quiere en otras páginas.
     - `.taller-card:hover` — se levanta 6px, borde ámbar, sombra suave (mismo patrón que la galería del inicio).
     - El logo y el flyer de la home (también parte de este módulo) **ya se habían hecho antes de tiempo**, a pedido del usuario: `logo-badge.svg` con disco crema detrás (antes casi no se veía sobre fondo oscuro) y más grande (56px header, 64px footer); el flyer viejo (`curso-flyer.webp`, WhatsApp desactualizado escrito en la imagen) se reemplazó por un `<video>` en loop (`public/videos/curso-experiencia.mp4`, 552KB, 10s, comprimido con ffmpeg) que respeta `prefers-reduced-motion`.

   **Los 5 módulos del rediseño de talleres están completos en código.** Falta: los 2 pasos de configuración de Forms/webhooks en Netlify (ver Módulo 4) y publicar — el usuario pidió dejar las pruebas para el final, después de revisar todo.
1. **Tarea futura, no bloqueante:** notificación instantánea por WhatsApp (no correo) al número de la empresa vía CallMeBot cuando alguien se inscribe — al usuario le gustó la idea pero no gestiona ese número, así que alguien más debe activarlo (mandarle un mensaje al bot de CallMeBot desde ese WhatsApp para obtener el API key) antes de poder implementarlo
2. Comprar y conectar el dominio `inefable.alro` en Netlify (dominio en sí no es gratis, ~$12-15 USD/año; conectarlo a Netlify sí lo es)
3. Configurar Google Analytics (pendiente hasta tener el dominio final, GA lo pide en su configuración)
4. Widget de Instagram en la home (esperando que el usuario conecte su cuenta en snapwidget.com y pase el código embed)
5. Seguir ajustes de diseño puntuales (el usuario los va revisando y pidiendo de a poco)
6. Fase futura (no ahora): pago Wompi para el curso, tienda de productos, suscripciones — la arquitectura ya lo permite sin romper nada existente

## Herramientas instaladas en esta máquina (fuera del proyecto)

- **ffmpeg** (via winget, `Gyan.FFmpeg`) — para comprimir/recortar video e imágenes de fotogramas. Ejecutable en `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin\` (puede no estar en el PATH de la sesión de bash hasta reiniciar la shell — usar la ruta completa si `ffmpeg` no se reconoce).

## Flujo de deploy (importante, desde 2026-08-21)

El usuario pidió limitar los deploys para no gastar minutos de build de Netlify. **No hacer `git push` después de cada cambio** — hacer commits locales normalmente, probar en el servidor local, y solo subir (`git push`) cuando el usuario lo pida explícitamente ("publica esto", "sube los cambios"). Excepción: publicar posts del blog desde `/admin` sí sube directo a producción vía Git Gateway, eso es independiente y está bien que pase.

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
- Atributos HTML estáticos (`pattern="..."`, etc.) escritos directo en un `.astro`: Astro se come una barra invertida simple al compilar (`\-` → `-`, `\.` → `.`). Si el atributo necesita un carácter escapado de verdad, hay que escribir doble barra en el código fuente (`\\-`, `\\.`) para que quede una sola en el HTML final. Ya mordió dos veces: el patrón de validación de correo lo tenía mal en `curso.astro` y `Footer.astro` (guion sin escapar dentro de `[...]`, inválido bajo el modo "v"/unicode-sets de regex que usan los navegadores nuevos — tiraba una excepción de JS real al validar el formulario, no solo un problema cosmético).
