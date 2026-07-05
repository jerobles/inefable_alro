# inefable.alro — Sitio web

Proyecto construido con **Astro** + **Decap CMS** (panel de administrador) + **Netlify** (hosting y formularios).

## Qué incluye

- **Inicio** (`/`) — marca, historia, calidad, vitrina de productos, teaser del taller.
- **Blog** (`/blog`) — listado + páginas individuales, con 2 artículos de ejemplo.
- **Taller de velas** (`/curso`) — info, agenda y formulario de pre-inscripción (Netlify Forms).
- **Panel de administrador** (`/admin`) — para publicar artículos del blog sin tocar código.
- **Política de privacidad** y **Términos y condiciones** — borrador conforme a la Ley 1581 de Colombia (revisar con un abogado antes de publicar).
- Botón flotante de WhatsApp con tu número ya configurado.

## Cómo correrlo en tu computador

Necesitas [Node.js](https://nodejs.org) instalado (versión 18 o superior).

```bash
npm install
npm run dev
```

Abre `http://localhost:4321` en tu navegador.

## Cómo publicarlo (paso a paso)

### 1. Sube el proyecto a GitHub

1. Crea una cuenta en [github.com](https://github.com) si no tienes una.
2. Crea un repositorio nuevo (por ejemplo `inefable-alro`).
3. Desde la carpeta del proyecto:
   ```bash
   git init
   git add .
   git commit -m "Primera versión del sitio"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/inefable-alro.git
   git push -u origin main
   ```

### 2. Conecta el repositorio a Netlify

1. Crea una cuenta en [netlify.com](https://netlify.com) (gratis).
2. "Add new site" → "Import an existing project" → conecta tu cuenta de GitHub → elige el repositorio.
3. Netlify detecta automáticamente el comando de build (`npm run build`) y la carpeta (`dist`) gracias al archivo `netlify.toml`. Solo confirma y da clic en "Deploy".
4. En unos minutos tu sitio estará en una URL tipo `nombre-random.netlify.app`.

### 3. Conecta tu dominio (inefable.alro)

En Netlify: Site settings → Domain management → Add a domain → sigue las instrucciones para apuntar tu dominio ahí.

### 4. Activa el panel de administrador (`/admin`)

El panel usa **Netlify Identity + Git Gateway** para que puedas iniciar sesión y publicar sin tocar GitHub directamente:

1. En tu sitio en Netlify: Site settings → Identity → **Enable Identity**.
2. En la misma sección, en "Registration preferences", elige **Invite only** (para que solo tú puedas crear cuenta).
3. Ve a Identity → Services → **Enable Git Gateway**.
4. Ve a Identity → Invite users → invítate a ti mismo con tu correo.
5. Revisa tu correo, acepta la invitación, crea tu contraseña.
6. Ahora entra a `https://tudominio.com/admin` e inicia sesión — ya puedes publicar artículos del blog.

### 5. Activa las notificaciones del formulario del curso

El formulario de pre-inscripción ya está conectado a Netlify Forms automáticamente (no requiere configuración extra). Para recibir un correo cada vez que alguien se inscribe:

Site settings → Forms → Form notifications → Add notification → Email notification → escribe tu correo.

Más adelante, cuando quieras conectar esto a Brevo (CRM), se hace agregando una integración vía Zapier/Make entre Netlify Forms y Brevo, o con una función serverless — lo vemos en la siguiente fase.

## Estructura del proyecto

```
src/
  layouts/Layout.astro       ← estructura base (head, header, footer)
  components/                ← Header, Footer, botón de WhatsApp
  content/blog/               ← artículos del blog (Markdown)
  pages/
    index.astro                ← inicio
    curso.astro                 ← taller + formulario
    blog/index.astro            ← listado del blog
    blog/[...slug].astro        ← plantilla de artículo individual
    privacidad.astro
    terminos.astro
public/
  images/                     ← fotos y logo de la marca
  admin/                      ← panel de administrador (Decap CMS)
```

## Próximos pasos (fases futuras, ya contempladas en la arquitectura)

- Tienda de productos (Shopify Buy Button u otra integración).
- Suscripción mensual recurrente.
- Automatización de WhatsApp más allá del botón de contacto.

No requieren rehacer el sitio — se integran sobre esta misma base.
