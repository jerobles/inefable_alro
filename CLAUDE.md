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
  layouts/Layout.astro       ← head, header, footer, whatsapp button, script de reveals
  components/                ← Header.astro, Footer.astro, WhatsAppButton.astro
  content/blog/*.md           ← posts del blog (frontmatter: title, description, date, image, draft)
  pages/
    index.astro                ← inicio
    curso.astro                 ← taller + formulario (Netlify Forms)
    blog/index.astro            ← listado
    blog/[...slug].astro        ← post individual
    privacidad.astro
    terminos.astro
public/
  images/                     ← fotos reales de producto + logo (logo.png transparente, logo.svg)
  admin/                      ← index.html + config.yml (Decap CMS)
netlify.toml
```

## Datos reales de la marca (no inventar otros)

- WhatsApp: +57 320 807 6828 → usado en `WhatsAppButton.astro` y en footer/curso
- Instagram: instagram.com/inefable.alro
- Taller de Velas: 25 jul y 1 ago 2026, $180.000 COP, turnos 9am-1pm y 2pm-6pm, Calle 155 #14-80 (Bogotá)
- Logo: badge circular "Inefable ALRO — Ilumina tu espacio / Hecho a mano — Est. 2026"

## Estado actual

Proyecto compila sin errores (`npm run build`). Aún **no desplegado** a Netlify/GitHub —
eso es tarea pendiente del usuario, con guía en `README.md`.

## Pendiente / próximos pasos

1. Ajustes de diseño (razón de esta sesión — preguntar al usuario qué quiere cambiar)
2. Deploy real: GitHub → Netlify → activar Identity + Git Gateway para `/admin`
3. Configurar notificación por correo del formulario del curso (Netlify Forms)
4. Conectar dominio inefable.alro
5. Fase futura (no ahora): pago Wompi para el curso, CRM Brevo, tienda de productos, suscripciones — la arquitectura ya lo permite sin romper nada existente

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
