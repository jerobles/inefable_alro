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
  components/                ← Header.astro, Footer.astro (incluye form de newsletter), WhatsAppButton.astro (flotante), WhatsAppBanner.astro (banner con ícono+número+CTA), FormPedido.astro (formulario de pedido compartido entre /tienda y cada página de producto — acepta `productoFijo` para quedar amarrado a un producto)
  content/
    config.ts                  ← schemas de las colecciones (blog, talleres, productos)
    blog/*.md                    ← posts del blog (frontmatter: title, description, date, image, draft)
    talleres/*.md                 ← talleres (frontmatter: titulo, fecha, precio, notaPrecio, duracion, horario, descripcion, incluye, lugar, activo) — editable desde /admin
    productos/*.md                 ← catálogo (41 productos reales, frontmatter: nombre, categoria, descripcion, notasOlfativas, detallesTecnicos, modoDeUso, variantes [{presentacion, precio}], imagen, destacado, disponible) — editable desde /admin
  pages/
    index.astro                ← inicio (hero = banner-principal.webp, video del taller en loop, destacados del catálogo justo después de Historia)
    curso.astro                 ← lee la colección "talleres" (getCollection): tarjetas + form + JSON-LD, todo dinámico. Al enviar, redirige a Mercado Pago si el taller elegido tiene slug (precio fijo).
    tienda/index.astro            ← catálogo completo por categoría; cada tarjeta enlaza a la página del producto (ya NO salta al formulario). JSON-LD ItemList. Al final, el formulario general (por si quieren varios productos).
    tienda/[slug].astro           ← página por producto (41): foto grande, descripción, notas olfativas, **detalles técnicos y modo de uso** (contenido que ya existía en el frontmatter pero no se mostraba en ningún lado), presentaciones con precio, formulario fijado a ese producto, y relacionados de la misma categoría. JSON-LD Product por página.
    pago-confirmado.astro         ← página de vuelta tras pagar en Mercado Pago (back_urls success/pending), con CTA a WhatsApp para coordinar entrega
    blog/index.astro            ← listado
    blog/[...slug].astro        ← post individual
    privacidad.astro
    terminos.astro
scripts/
  generar-datos-pago.mjs      ← corre antes de "astro build" (ver package.json): exporta precios de talleres/productos a netlify/functions/data/*.json, para que las funciones de pago calculen el monto sin confiar en lo que mande el navegador
netlify/
  functions/
    data/*.json                ← generado en cada build por el script de arriba, NO se sube a git (.gitignore)
    lib/brevo.js              ← helpers compartidos de Brevo (sendBrevoEmail con bcc opcional, parseRecipients, toE164Colombia, upsertBrevoContact)
    lib/mercadopago.js          ← crearPreferencia() — arma el link de pago (fetch directo a la API de Mercado Pago, sin SDK)
    brevo-sync.js               ← webhook del form del taller: crea/actualiza contacto en Brevo + 2 correos (confirmación al lead + notificación interna)
    newsletter-sync.js          ← webhook del form de newsletter (footer): crea/actualiza contacto en su propia lista + correo de bienvenida
    producto-sync.js            ← webhook del form "Quiero este producto" (/tienda): crea/actualiza contacto (atributo PRODUCTO_INTERES) + 2 correos, incluye presentación/dirección/zona de entrega en el aviso interno
    pago-taller.js               ← llamada directa (no webhook) desde curso.astro: arma la preferencia de pago del taller elegido y devuelve el link de checkout
    pago-producto.js             ← ídem desde tienda.astro: arma el pedido (producto + envío de Bogotá si aplica) y devuelve el link de checkout
public/
  images/                     ← fotos reales de producto, banner-principal.webp (hero), curso-experiencia-poster.jpg (poster del video), logo.png (favicon/OG), logo-badge.svg (header/footer, recoloreado cream/cream-3, disco crema detrás)
  images/productos/            ← 39 fotos del catálogo, optimizadas a WebP (~1080px)
  videos/curso-experiencia.mp4 ← loop del taller en la home (10s, 552KB, comprimido con ffmpeg)
  admin/                      ← index.html + config.yml (Decap CMS: colecciones "blog", "talleres" y "productos")
netlify.toml                 ← [functions] directory + included_files para empaquetar netlify/functions/data/*.json junto con las funciones
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
- **Correo del dominio (2026-08-22, funcionando):** `hola@inefablealro.com` es la dirección pública de la marca.
  - **Enviar:** lo hace Brevo. El dominio está autenticado ahí (2 CNAME de DKIM `brevo1/2._domainkey`, TXT `brevo-code:`, TXT `_dmarc` con `p=none`). Probado de punta a punta: el correo de confirmación del taller llega desde esa dirección.
  - **Recibir:** ImprovMX (plan gratuito, 1 dominio / 25 alias / 500 reenvíos al día) con 2 registros MX. El alias `hola` reenvía a `jerobles08@gmail.com` **y** `inefable.alro@gmail.com` (ojo: llega duplicado si se revisan ambas bandejas). Se borró el alias comodín `*` para no recibir spam dirigido a direcciones inventadas.
  - ⚠️ **Un dominio solo puede tener UN registro SPF.** ImprovMX pide el suyo y Brevo (aunque no lo exige, porque maneja SPF con su propio return-path) tiene el propio. Quedó **combinado en un solo registro**: `v=spf1 include:spf.improvmx.com include:spf.brevo.com ~all`. Si algún día se agrega otro servicio que envíe correo, hay que **sumar su `include:` a ese mismo registro**, nunca crear un TXT SPF aparte — dos registros SPF invalidan la autenticación entera.
  - Probar el reenvío enviando desde `jerobles08@` o `inefable.alro@` **no funciona bien**: como son los destinos, Gmail detecta un bucle y lo marca como spam. Hay que probar desde un remitente externo.
- **Dominio real en vivo: `https://inefablealro.com`** (comprado en Namecheap el 2026-08-22, con Netlify DNS — nameservers `dns1..4.p01.nsone.net`). `www.inefablealro.com` redirige al dominio pelado. Certificado SSL de Let's Encrypt emitido automáticamente. El subdominio viejo `preeminent-mermaid-8418d4.netlify.app` sigue funcionando en paralelo (Netlify no lo quita), pero el oficial es el dominio propio.
  - Ojo con el nombre: el plan viejo hablaba de `inefable.alro` — **`.alro` no existe como extensión de dominio**, era un error heredado. El dominio real es `inefablealro.com`.
  - Al diagnosticar DNS, no confiar en `curl` desde esta máquina: el caché de DNS de Windows guarda las IPs viejas y hace parecer que el dominio responde desde Namecheap. Usar `curl --resolve dominio:443:IP` o consultar los nameservers autoritativos para ver el estado real.
- Netlify Identity + Git Gateway activos → `/admin` (Decap CMS) funciona en producción
- Formulario del curso: notificación por email configurada + integración a Brevo funcionando de punta a punta (`netlify/functions/brevo-sync.js`). Ojo: el webhook de Netlify se autodesactiva tras 6 fallos seguidos — si deja de sincronizar, revisar Forms → Form notifications y reactivarlo ahí. Brevo trata el atributo `WHATSAPP` como campo de teléfono y exige formato internacional; la función ya formatea a `+57` automáticamente.
- Catálogo (`/tienda`): formulario "Quiero este producto" probado de punta a punta en producción (2026-08-22) — contacto creado en Brevo con el atributo `PRODUCTO_INTERES`, más los 2 correos (confirmación + notificación interna). Los 3 webhooks de Forms (taller, newsletter, producto) ya quedaron configurados y escopados cada uno a su formulario.
- SEO: sitemap real (`@astrojs/sitemap`), canonical, og:url, JSON-LD (Organization + Event del taller), imágenes con `width`/`height` fijos
- Diseño: logo corregido (contraste en fondo oscuro), banner principal actualizado con foto real de producto
- `astro.config.mjs` → `site` actualizado a `https://inefablealro.com` (antes tenía `https://inefable.alro.co`, un dominio inventado que nunca existió) — de ahí salen canonical, og:url, sitemap y JSON-LD

## Pendiente / próximos pasos

0.3. **Pago en línea con Mercado Pago (2026-08-22, código completo con datos de prueba — falta el Access Token real para probar de punta a punta).** Ver [[pasarela-pago-mercado-pago]] en memoria: el proveedor real es Mercado Pago (no Wompi), misma cuenta que ya usa el cliente para el curso.
   - **Cómo funciona:** el registro en Brevo (CRM) sigue exactamente el mismo camino de siempre (Netlify Forms → `brevo-sync.js` / `producto-sync.js`, sin tocar esa lógica). Aparte, si el pedido tiene un precio fijo conocido, el formulario llama directo (fetch, no vía webhook) a una función nueva que arma una "preferencia" en Mercado Pago y redirige al comprador a pagar. Al volver, cae en `/pago-confirmado`, que lo invita a coordinar por WhatsApp.
   - **Taller (`/curso`):** cualquier taller real (no la opción "aún no estoy segur@") redirige a pago — precio tomado de `talleres.json` (generado del content collection), no del navegador.
   - **Catálogo (`/tienda`):** rediseñado con selector de **presentación** (dinámico según el producto, con precio), **cantidad** numérica, y **zona de entrega**:
     - **Norte de Bogotá:** envío gratis, pago en línea. Variable `ENVIO_BOGOTA_NORTE_COP` (default `0`).
     - **Resto de Bogotá:** domicilio $15.000, pago en línea. Variable `ENVIO_BOGOTA_RESTO_COP` (default `15000`) — **tarifas confirmadas por el usuario el 2026-08-22**, ya no son un placeholder.
     - **Otra ciudad:** sigue el flujo manual de siempre (Netlify Forms → WhatsApp), la transportadora se cotiza caso por caso — no pasa por Mercado Pago.
     - Productos "Por cotización" (sin precio fijo, ej. recordatorios) nunca intentan pago en línea, sin importar la zona — se detecta tanto en el cliente como en la función (doble chequeo).
   - **Resiliencia:** si `MP_ACCESS_TOKEN` no está configurado (como ahora) o la llamada a Mercado Pago falla por lo que sea, el formulario NO se rompe — cae de vuelta al mensaje de siempre ("te contactaremos por WhatsApp"), porque el registro en Brevo ya se disparó antes de intentar el pago. Verificado con un dry-run local (`fetch` simulado) cubriendo: taller válido, taller inválido, Bogotá con envío, Bogotá gratis, producto "por cotización" (debe rechazar) y sin token configurado — los 6 casos se comportan como se espera.
   - **Pendiente del usuario:**
     1. Conseguir el **Access Token de Mercado Pago** del cliente (panel de desarrolladores, misma cuenta del curso) — se puede empezar con el de **prueba** para hacer un pago de prueba real de punta a punta antes de pasar a producción.
     2. Configurar `MP_ACCESS_TOKEN` en Netlify con ese valor.
     3. Confirmar que `ENVIO_BOGOTA_RESTO_COP` ($15.000) sigue vigente al momento de publicar (puede cambiar sin tocar código, solo la variable de entorno — eso sí, redesplegar para que el texto del formulario y el cobro real queden sincronizados).
   - **No incluido en este alcance (posible mejora futura):** un webhook de Mercado Pago que marque automáticamente el contacto como "pagado" en Brevo — hoy la confirmación del pago solo se ve en el panel de Mercado Pago, no en Brevo.

0. **En curso (2026-08-21): rediseño de talleres**, por módulos, aprobando cada uno con el usuario antes de seguir:
   - Módulo 1 ✅ hecho — datos reales corregidos (WhatsApp, talleres de agosto), botón "Reservar este taller" por tarjeta
   - Módulo 1.5 ✅ **activo y confirmado en producción** — `brevo-sync.js` manda 2 correos por Brevo (transactional email, misma API key): confirmación al lead + notificación a la empresa con botón "Escríbele por WhatsApp" directo al número del lead. Remitente separado en dos para no bloquear todo por el correo corporativo:
     - `BREVO_SENDER_EMAIL_INTERNO` = `jerobles08@gmail.com` (verificado en Brevo, funcionando — el usuario confirmó que le llegó el correo de prueba con el botón). Nota: Brevo avisa que un Gmail gratuito no cumple los requisitos ideales de DKIM/DMARC — no es problema para un correo interno (a lo sumo cae en Spam la primera vez, se soluciona marcándolo "No es spam").
     - `BREVO_SENDER_EMAIL` = **`hola@inefablealro.com`** ✅ **probado en producción (2026-08-22)** — remitente del correo de confirmación AL CLIENTE. Ya no es un Gmail: el dominio quedó **autenticado en Brevo** (DKIM + DMARC), así que se puede enviar desde cualquier dirección `@inefablealro.com` sin verificar cada una por separado, y los correos van firmados (mucho menos riesgo de spam que con el Gmail gratuito).
     - `BUSINESS_NOTIFY_EMAIL` = `jerobles08@gmail.com` (acepta varios separados por coma si hace falta sumar destinatarios) — este es el correo de **notificación interna** (aviso de nuevo lead con botón de WhatsApp), separado del correo de confirmación al cliente. Cambiar `BREVO_SENDER_EMAIL` no afecta a este: los avisos internos le siguen llegando al usuario sin importar qué remitente use el correo al cliente.
     - **BCC de revisión (2026-08-22):** los 3 correos de confirmación al cliente (taller, newsletter, producto) ahora también van con copia oculta (BCC) a `BUSINESS_NOTIFY_EMAIL`, para que el usuario pueda ir revisando lo que efectivamente le llega a cada persona. Se implementó agregando un parámetro `bcc` a `sendBrevoEmail` en `netlify/functions/lib/brevo.js`.
     - Importante: `formresponses@netlify.com` es el remitente FIJO de la notificación nativa de Netlify Forms (la que ya funciona, en paralelo) — esa NO se puede personalizar ni ponerle botones, por eso se armó el correo aparte por Brevo.
   - Módulo 2 ✅ hecho — colección "Talleres" en Decap CMS (`src/content/talleres/*.md`, schema en `src/content/config.ts`). El usuario agrega/edita/oculta talleres desde `/admin` sin tocar código. Campos: titulo, fecha, precio, notaPrecio, duracion, horario, descripcion, incluye (lista), lugar, activo (boolean para ocultar sin borrar).
   - Módulo 3 ✅ hecho — `/curso` lee la colección de talleres: filtra los inactivos y los que ya pasaron de fecha, ordena, y genera tarjetas + JSON-LD + opciones del selector del formulario dinámicamente. Brevo guarda a qué taller se inscribió cada contacto en el atributo `TALLER` (texto libre, no una lista aparte por taller — así no hay que crear una lista nueva en Brevo cada vez que se agrega un taller). Si no hay talleres activos/futuros, la página muestra un estado vacío con CTA a WhatsApp en vez de quedar rota.
   - Módulo 4 ✅ código hecho, activo en producción — formulario de newsletter (nombre + correo) en el footer (todas las páginas). `netlify/functions/newsletter-sync.js` guarda el contacto en su propia lista de Brevo y manda un correo de bienvenida (usa `BREVO_SENDER_EMAIL`, el corporativo — mismo bloqueo que el Módulo 1.5). Se creó `netlify/functions/lib/brevo.js` con las funciones compartidas para no duplicar código entre las 3 funciones de Brevo. `BREVO_NEWSLETTER_LIST_ID` = `6`, ya configurada.
   - Módulo 5 ✅ hecho — banner visual de WhatsApp + efecto hover en las tarjetas de taller:
     - Nuevo componente `src/components/WhatsAppBanner.astro` (ícono + número grande + CTA), reemplaza el link de solo texto en `/curso`. Reutilizado también en `/tienda`. **Ojo con el texto:** en `/curso` dice "¿Tienes dudas antes de inscribirte?" (NO "reserva directo") — a propósito, para que el formulario siga siendo el único camino "oficial" de reserva y no le reste capturas al CRM.
     - `.taller-card:hover` — se levanta 6px, borde ámbar, sombra suave (mismo patrón en `.prod-card` de /tienda y `.destacados__card` del inicio).
     - Logo y flyer de la home (adelantados de este módulo): `logo-badge.svg` con disco crema detrás, más grande (56px header, 64px footer); el flyer viejo se reemplazó por un `<video>` en loop.

   **Webhooks de Forms (taller, newsletter, producto) ✅ configurados y probados (2026-08-22)** — cada uno escopado a su propio formulario en Netlify (`pre-inscripcion-curso`, `newsletter`, `pedido-producto`), ya no dispara con "any form". `formresponses@netlify.com` sigue siendo el remitente fijo de las notificaciones nativas de Netlify Forms (en paralelo, no se puede personalizar).

0.5. **Catálogo "lite" (Fase 8 parcial, sin pago — 2026-08-22).** El usuario decidió el orden: catálogo primero, luego dominio (Fase 6), y dejar la tienda con pago real (Fase 8 completa, Shopify) para más adelante. Iniciativa completa en código, por los mismos módulos que talleres:
   - **Tienda-1** ✅ — colección "productos" (`src/content/productos/*.md`, 41 productos reales tomados del catálogo del cliente — un PDF exportado de Google Sheets, texto extraído con `pdftotext`, y fotos reales de una carpeta de Drive del cliente, optimizadas a WebP con `sharp`). 6 categorías: velas-aromaticas, bebidas-frias, postres, velas-intencion, varios, recordatorios. 2 productos sin foto todavía (Edición Cóctel, Corazones y Tapa de Corcho) — usan un marcador visual, no una foto inventada.
   - **Tienda-2** ✅ — página `/tienda`: catálogo completo agrupado por categoría, tarjetas con foto/precio(s)/variantes, JSON-LD Product.
   - **Tienda-3** ✅ — sección de destacados en el inicio (4 productos marcados `destacado: true`), posicionada justo después de "Historia" y antes de "Calidad" (a propósito — el objetivo es vender, no dejarlo "de segundas"). Reemplazó la vieja galería estática de 3 fotos sin precio.
   - **Tienda-4** ✅ **probado de punta a punta en producción (2026-08-22)** — formulario "Quiero este producto" en `/tienda` → `netlify/functions/producto-sync.js` (mismo patrón que brevo-sync, atributo Brevo `PRODUCTO_INTERES`, lista `BREVO_PRODUCTOS_LIST_ID` = `7`). El usuario creó el atributo `PRODUCTO_INTERES` en Brevo, hizo una prueba real y confirmó: llegó el contacto a la lista con el atributo, más los 2 correos.
   - "Tienda" se agregó a la navegación del header y el footer.
   - **Tienda-5 (ajustes de diseño, 2026-08-22)** ✅ — orden del menú (Blog al final, antes solo del CTA), hero con acceso directo a "Ver el catálogo" (reemplazó el link a Instagram, que ya está en header/footer), secuencia de color de secciones del inicio corregida (Historia clara → Destacados oscura → Calidad clara → Taller oscura, alternando; se había roto al mover Destacados a fondo claro junto a Historia), y el formulario de newsletter del footer ahora ocupa el mismo ancho que las columnas de abajo (antes los inputs de ancho fijo lo dejaban apretado a la izquierda).
   - **Recordatorio de privacidad:** la foto de "Recordatorio Virgencita Presentación Especial" tiene el nombre real de un cliente y la fecha de un evento — el usuario confirmó tener autorización para usarla públicamente (2026-08-22). Si en el futuro se reemplaza esa foto, no hay que preguntar de nuevo salvo que cambie el contexto.
1. **Tarea futura, no bloqueante:** notificación instantánea por WhatsApp (no correo) al número de la empresa vía CallMeBot cuando alguien se inscribe — al usuario le gustó la idea pero no gestiona ese número, así que alguien más debe activarlo (mandarle un mensaje al bot de CallMeBot desde ese WhatsApp para obtener el API key) antes de poder implementarlo
2. ~~Comprar y conectar el dominio~~ ✅ **hecho (2026-08-22)** — `inefablealro.com` en Namecheap con Netlify DNS. Ver la sección "Estado actual".
3. ~~Configurar Google Analytics~~ ✅ **hecho (2026-08-22)** — GA4 `G-RLDQTW4MVH` en `Layout.astro`, solo en el build de producción (`import.meta.env.PROD`) para no contar las pruebas locales. Verificado en el sitio en vivo: el script carga y se crean las cookies `_ga` y `_ga_RLDQTW4MVH`.
   - **Search Console** también configurado: propiedad de tipo **Dominio**, verificada con un registro TXT (`google-site-verification=...`) en el DNS de Netlify (Name = `@`), y sitemap enviado como **URL completa** (`https://inefablealro.com/sitemap-index.xml` — en las propiedades de tipo "Dominio" no sirve la ruta corta).
   - `/pago-confirmado` queda fuera del sitemap (filter de `@astrojs/sitemap`) y lleva `<meta name="robots" content="noindex, follow">` vía la prop `noindex` del Layout — llegar ahí desde una búsqueda no tiene sentido.
   - La política de privacidad se actualizó al instalar GA: se agregaron las secciones "Proveedores que tratan datos por nosotros" (Brevo, Netlify, Google) y "Cookies y estadísticas de navegación". **Si se activa el pago con Mercado Pago, hay que sumarlo a esa lista de proveedores.**
4. Widget de Instagram en la home (esperando que el usuario conecte su cuenta en snapwidget.com y pase el código embed)
5. Seguir ajustes de diseño puntuales (el usuario los va revisando y pidiendo de a poco)
6. **Pago en línea (aclarado 2026-08-22, corrige suposición anterior del plan que decía "Wompi"):** el cliente ya usa **Mercado Pago** para cobrar el curso con tarjeta (cuenta propia del cliente, manejo manual hoy). Wompi y Mercado Pago son pasarelas distintas que no se conectan entre sí — para no manejar dos proveedores, lo lógico es integrar Mercado Pago, no Wompi. Opciones evaluadas (sin necesitar Shopify):
   - **Link de pago de Mercado Pago** — cero código, se genera manual desde el panel de Mercado Pago por pedido y se manda por WhatsApp. Se puede activar ya, sin tocar el sitio.
   - **Checkout Pro de Mercado Pago** — sí requiere desarrollo (una función de Netlify que arma una "preferencia" de pago con la lista de productos/cantidades del pedido, usando el Access Token de Mercado Pago del cliente; el comprador es redirigido a la página de pago de Mercado Pago y vuelve al sitio). Soporta varios productos en un mismo pago de forma nativa (a diferencia del widget simple de Wompi, pensado para un solo monto fijo). Más liviano que Shopify, pero no trivial — pendiente de decidir con el usuario si se hace ya o se deja para cuando tengan el dominio conectado. Requiere que el cliente comparta su Access Token de Mercado Pago.
   - Tienda con pago real vía Shopify Buy Button (~$25-39 USD/mes) sigue como alternativa de Fase 8b si en el futuro prefieren un carrito de compras completo en vez de este flujo más simple.

## Herramientas instaladas en esta máquina (fuera del proyecto)

- **ffmpeg** (via winget, `Gyan.FFmpeg`) — para comprimir/recortar video e imágenes de fotogramas. Ejecutable en `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin\` (puede no estar en el PATH de la sesión de bash hasta reiniciar la shell — usar la ruta completa si `ffmpeg` no se reconoce).
- **poppler** (via winget, `oschwartz10612.Poppler`) — para leer PDFs por línea de comandos (`pdftotext`, `pdfimages`, `pdfinfo`) cuando el Read tool no puede (no ve el PATH nuevo hasta reiniciar el proceso). Ejecutables en `%LOCALAPPDATA%\Microsoft\WinGet\Packages\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\poppler-25.07.0\Library\bin\`.
- Si un archivo con tilde/ñ en el nombre da "File does not exist" en Read/Bash pese a que `ls` sí lo muestra, es un problema de normalización Unicode del nombre — usar `find -iname "patrón*"` para obtener el path exacto en vez de escribir la tilde a mano.

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
- La regla base `img { max-width: 100%; height: auto; }` en `global.css` es importante — si una sección nueva de imagen necesita alto distinto, usar `aspect-ratio` + `object-fit: cover` en el CSS de esa sección (como `.prod-card__img img` en /tienda), no depender solo de los atributos `width`/`height` del HTML.
- `@astrojs/sitemap` debe quedar en `3.2.1` (`package.json`) — versiones más nuevas (3.7.x) rompen el build con Astro 4.16.
- **Funciones de Netlify: no leer archivos del disco en tiempo de ejecución.** Netlify empaqueta las funciones con esbuild y las transpila a **CommonJS**, así que los dos idiomas obvios para ubicar un archivo vecino fallan **solo en producción** (HTTP 502, el código compila perfecto en local):
  - `const __dirname = path.dirname(fileURLToPath(import.meta.url))` → `SyntaxError: Identifier '__dirname' has already been declared` (el bundler ya inyecta uno).
  - `new URL('./data/x.json', import.meta.url)` → `TypeError: Invalid URL` (en CJS `import.meta.url` no es válido).
  - **Lo que sí funciona:** generar los datos como un **módulo `.js`** (`export default [...]`) e `import`arlo normalmente — el bundler lo inlinea dentro del paquete de la función. Así quedó `scripts/generar-datos-pago.mjs` + `netlify/functions/data/*.js`.
  - **Cómo probarlo antes de publicar** (un dry-run del código fuente ESM NO detecta nada de esto): empaquetar con esbuild igual que Netlify y ejecutar el bundle resultante:
    ```bash
    ./node_modules/.bin/esbuild netlify/functions/pago-taller.js --bundle --platform=node --target=node20 --format=cjs --outfile=/tmp/f.cjs && node -e "require('/tmp/f.cjs')"
    ```
  - Mordió dos veces seguidas el 2026-08-22 en `pago-taller.js` y `pago-producto.js`.
- Atributos HTML estáticos (`pattern="..."`, etc.) escritos directo en un `.astro`: Astro se come una barra invertida simple al compilar (`\-` → `-`, `\.` → `.`). Si el atributo necesita un carácter escapado de verdad, hay que escribir doble barra en el código fuente (`\\-`, `\\.`) para que quede una sola en el HTML final. Ya mordió dos veces: el patrón de validación de correo lo tenía mal en `curso.astro` y `Footer.astro` (guion sin escapar dentro de `[...]`, inválido bajo el modo "v"/unicode-sets de regex que usan los navegadores nuevos — tiraba una excepción de JS real al validar el formulario, no solo un problema cosmético).
