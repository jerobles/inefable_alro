# Confirmación automática del pago (webhook de Mercado Pago)

**Estado: implementado el 2026-09-11** en `netlify/functions/pago-webhook.js`, con
`lib/firma-mp.js` (validación de firma) y `actualizarPagoEnHoja()` en `lib/hoja.js`.
Falta que el usuario complete los tres pasos de configuración (ver más abajo) y probarlo
con un pago real.

**Lo que disparó hacerlo:** el pedido `IA-260909-AKNQ` llegó por correo y quedó en la
hoja, pero dos días después no aparecía ningún pago en Mercado Pago. Sin webhook no había
forma de saber si la persona había abandonado el checkout o si algo había fallado — y los
logs de Netlify solo duran 24 horas, así que ya no se podía averiguar.

## Decisiones que se tomaron al implementarlo

- **Solo se toca la columna Pago, nunca Estado.** Estado es del usuario (Nuevo → En
  producción → Despachado); un aviso tardío que la devolviera a "Pagado" destruiría su
  trabajo. Esa regla ya venía del diseño de la hoja.
- **La idempotencia se ancla en la hoja**, que es el único estado compartido que tiene
  este sitio. El Apps Script solo responde `actualizado: true` cuando la celda de verdad
  cambió, y el correo de "pago confirmado" únicamente se manda en ese caso. Sin esto,
  cada reintento de Mercado Pago sería otro correo al cliente.
- **Si la hoja falla, NO se manda el correo.** No se puede confirmar que sea la primera
  vez, y repetir un "pago confirmado" es peor que no mandarlo: el pago sigue visible en
  el panel de Mercado Pago.
- **Consultar el pago que falla devuelve 500 a propósito** — es el único lugar de toda la
  integración donde devolver error es correcto, porque ahí sí queremos que Mercado Pago
  reintente. Todo lo demás responde 200.
- El `notification_url` se manda **en cada preferencia**, además de dejarlo configurado en
  el panel: así el aviso queda amarrado al pedido.

---

## El problema que resuelve

Hoy el sitio manda a la gente a pagar, pero **nadie le avisa de vuelta si el pago se
aprobó**. Eso deja tres huecos:

1. El correo de confirmación dice *"recibimos tu pedido"*, no *"recibimos tu pago"*,
   porque se envía antes de que la persona termine de pagar. No se le puede prometer
   algo que no sabemos.
2. La hoja de pedidos dice *"Pago: En línea (confirmar en Mercado Pago)"*. Hay que
   entrar al panel de Mercado Pago, buscar el número de pedido y confirmar **a mano**
   antes de despachar.
3. Un pedido que se abandonó en la pantalla de pago se ve exactamente igual que uno
   pagado. No hay forma de distinguirlos sin revisar uno por uno.

Con el webhook, Mercado Pago avisa al sitio cuando el pago cambia de estado, y el
sitio actualiza solo la hoja, el CRM y el correo.

## Cómo funciona un webhook de Mercado Pago

1. Se registra una **URL de notificación** — en el panel de Mercado Pago, o mandando
   `notification_url` al crear cada preferencia (esto último es preferible: deja el
   aviso amarrado al pedido, sin depender de configuración manual en el panel).
2. Cuando el pago cambia de estado, Mercado Pago hace un **POST** a esa URL con algo
   como `{"type":"payment","data":{"id":"123456789"}}`. **Ese aviso trae el id, no el
   estado.**
3. El sitio toma ese id y **vuelve a preguntarle a la API de Mercado Pago** por el
   pago (`GET /v1/payments/{id}` con el Access Token). Solo esa respuesta es la
   verdad.

Tres reglas que la documentación de Mercado Pago marca como obligatorias, y que son
justo donde se equivocan las integraciones:

- **Nunca confiar en el cuerpo del aviso.** Se valida la firma del header
  `x-signature` (HMAC con un secreto del panel) y, además, se consulta el pago por
  API. Sin eso, cualquiera que descubra la URL podría inventarse un "pago aprobado".
- **Responder rápido con un 2xx.** Si el sitio se demora o falla, Mercado Pago
  reintenta; una función lenta genera avisos duplicados.
- **Ser idempotente.** El mismo pago va a llegar varias veces (por reintentos y por
  cambios de estado). Procesarlo dos veces no puede duplicar filas, ni correos, ni
  el contador de pedidos.

## Qué haría la función

Una función nueva, `netlify/functions/pago-webhook.js`:

1. Valida la firma `x-signature`. Si no cuadra → `401` y se acabó.
2. Lee el `data.id` y consulta el pago en la API de Mercado Pago.
3. Del pago saca `status` (`approved`, `rejected`, `pending`…) y
   `external_reference` — que es **nuestro número de pedido** (`IA-260906-KX7A`). Ese
   campo ya se está enviando hoy, así que el amarre entre pago y pedido ya existe.
4. Según el estado:
   - **Aprobado:** marca el pedido como pagado en la hoja y en Brevo, y le manda a la
     persona un correo corto de "pago confirmado" (este sí puede decirlo).
   - **Rechazado:** deja constancia y avisa internamente, para poder escribirle a esa
     persona y no perder la venta.
   - **Pendiente** (efectivo, PSE en proceso): no hace nada todavía; ya llegará el
     aviso definitivo.
5. Devuelve `200` siempre que el aviso se haya procesado, aunque Brevo o la hoja
   fallen — mismo principio que el resto de las funciones: ningún servicio externo
   puede convertirse en un punto único de falla.

## Lo que hay que tocar además de la función

| Pieza | Cambio |
|---|---|
| `lib/mercadopago.js` | Agregar `notification_url` a la preferencia y una función `consultarPago(id)`. |
| **El Apps Script de la hoja** | Hoy solo sabe **agregar** filas. Necesita una acción nueva que **busque la fila por número de pedido** y actualice las columnas Estado y Pago. Ver `docs/hoja-de-pedidos.md`. |
| `lib/hoja.js` | Una función `actualizarPagoEnHoja(numeroPedido, estado)` que llame a esa acción. |
| Brevo | Un atributo nuevo (por ejemplo `ULTIMO_PAGO`, tipo Fecha) que el usuario debe crear a mano en el panel, como los otros. |
| Variables de Netlify | `MP_WEBHOOK_SECRET`, la clave de firma que da el panel de Mercado Pago. |

## Lo que tiene que hacer el usuario (pendiente)

1. **Mercado Pago → Tus integraciones → tu aplicación → Webhooks.** Registrar la URL
   `https://inefablealro.com/.netlify/functions/pago-webhook`, marcar el evento **Pagos**,
   y copiar la **clave secreta** que genera. Ponerla en Netlify como `MP_WEBHOOK_SECRET`.
   Sin esa variable el webhook rechaza todo con 401 — a propósito: sin firma no hay forma
   de distinguir un aviso real de uno inventado.
2. **Brevo → Contactos → Configuración → Atributos:** crear `ULTIMO_PAGO`, tipo **Fecha**.
3. **Volver a implementar el Apps Script** de la hoja con la versión nueva (la de este
   repo, en `docs/hoja-de-pedidos.md`), que ya trae la acción `actualizarPago`. Ojo: hay
   que crear una **implementación nueva**, no solo guardar el código — es el mismo paso
   que costó la primera vez.
   - Mientras no se actualice, los pedidos siguen entrando normal (la acción de agregar no
     cambió) pero el webhook responderá que "el script de la hoja todavía no sabe
     actualizar pagos", y quedará en los logs.

## Cómo se probó

**Dry-run del bundle CJS** (como lo empaqueta Netlify, no el fuente ESM — ver la
convención de "Funciones de Netlify" en CLAUDE.md), con la API de Mercado Pago, Brevo y
la hoja simuladas. Nueve casos, todos pasando:

| Caso | Esperado |
|---|---|
| Firma inventada | 401, no toca hoja ni correos |
| Aviso viejo (fuera de la ventana de 15 min) | 401 — corta el reaprovechamiento de un aviso capturado |
| Pago aprobado, primera vez | marca la hoja, manda el correo, NO toca la columna Estado |
| El MISMO aviso otra vez | 200 sin segundo correo (idempotencia) |
| Pago rechazado | avisa internamente, NO le dice al cliente que pagó |
| Pago pendiente (PSE a medias) | 200 sin hacer nada, espera el aviso definitivo |
| Aviso de otro tipo (merchant_order) | se ignora, 200 |
| La API de Mercado Pago falla | **500**, para que Mercado Pago reintente |
| La hoja falla | 200, pero NO manda el correo de pago confirmado |

**Falta la prueba real:** un pago de verdad, verificando que la hoja pase sola de
"En línea (confirmar en Mercado Pago)" a "Pagado ✓" y que llegue el correo de
confirmación. No se puede simular: depende de que Mercado Pago mande el aviso a la URL
registrada en el panel.

**Hasta que esa prueba pase, la regla operativa sigue siendo la de siempre:** confirmar
cada pago en el panel de Mercado Pago, buscando el número de pedido, antes de despachar.
