# Confirmación automática del pago (webhook de Mercado Pago)

**Estado: implementado y desplegado el 2026-09-11** en `netlify/functions/pago-webhook.js`,
con `lib/firma-mp.js` (validación de firma) y `actualizarPagoEnHoja()` en `lib/hoja.js`.
La función responde en producción (`POST` sin firma válida → `401`; `GET` → `405`; un aviso
que no es de pago → `200` ignorado).

**Verificado en producción (2026-09-11)**, tras el cambio de los dos canales: aviso sin
firma → `500 No se pudo consultar el pago` (o sea, lo aceptó y fue a consultar el id
inventado, que Mercado Pago rechazó); aviso **con** firma falsa → `401`; IPN de
`merchant_order` → `200 ignored`; `GET` → `405`.

**Los tres pasos de configuración están hechos** (2026-09-11), incluida la clave
`MP_WEBHOOK_SECRET`. Falta la prueba con un pago real, que solo llega con la próxima venta:
el usuario no administra la cuenta de Mercado Pago, así que no puede usar el simulador del
panel, y decidió no reversar su compra real para provocar un aviso.

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

### Los avisos vienen por DOS canales, y uno NO va firmado (2026-09-11)

Descubierto en producción, con la clave ya configurada: los avisos llegaban con
`Firma rechazada: el aviso llegó sin header x-signature`. No era un problema de
configuración.

| Canal | Cómo llega | ¿Firmado? |
|---|---|---|
| **Webhooks** (el moderno, el del panel) | `?type=payment&data.id=…`, cuerpo JSON | Sí, header `x-signature` |
| **IPN** (el viejo, el que dispara el `notification_url` de la preferencia) | `?topic=payment&id=…`, a veces sin cuerpo | **No**, y no hay forma de pedírselo |

Rechazar el segundo canal significaba **perder pagos reales**. La regla quedó así:

- **Firma presente → tiene que ser válida**, o se corta con 401. Una firma presente pero
  incorrecta sí es un intento de falsificación.
- **Firma ausente → se procesa igual**, dejando un aviso en el log.

**Por qué aceptar un aviso sin firmar no abre un hueco.** El aviso solo trae un **id**,
nunca un estado. El estado se lee después contra la API de Mercado Pago con nuestro propio
Access Token, y esa respuesta es la única que se cree. Alguien que descubriera la URL solo
podría lograr que consultemos un id: si no es un pago de esta cuenta, la API responde 404 y
no pasa nada; y si lo es, actuamos sobre su estado real, que es justo lo correcto.
Inventarse un "pago aprobado" es imposible. **La seguridad de esta integración la sostiene
la reconsulta por API, no la firma** — la firma es una capa extra, no el cimiento.

Como los dos canales pueden avisar del mismo pago, llegan invocaciones duplicadas: las
absorbe la idempotencia anclada en la hoja, que ya estaba hecha para eso.

---

## El problema que resuelve

Antes de esto, el sitio mandaba a la gente a pagar pero **nadie le avisaba de vuelta si el
pago se aprobó**. Eso dejaba tres huecos:

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

## Lo que tiene que hacer el usuario

1. ✅ **Hecho (2026-09-11) — Mercado Pago → Tus integraciones → tu aplicación → Webhooks.**
   URL `https://inefablealro.com/.netlify/functions/pago-webhook` registrada, evento
   **Pagos**, y la clave secreta puesta en Netlify como `MP_WEBHOOK_SECRET` + redespliegue.
   - **Cómo saber si la clave llegó a la función, mirando el log:** el chequeo de la clave
     es el **primero** de todos, así que si el log dice `MP_WEBHOOK_SECRET no está
     configurado`, no llegó; **cualquier otro motivo de rechazo prueba que sí está**.
     Desde afuera no se puede distinguir: un aviso con firma falsa devuelve 401 igual en
     los dos casos, a propósito, para no darle pistas a quien esté tanteando la URL.
2. ✅ **Hecho — Brevo → Contactos → Configuración → Atributos:** `ULTIMO_PAGO`, tipo **Fecha**.
3. ✅ **Hecho (2026-09-11) — Apps Script de la hoja reimplementado** con la versión nueva
   (la de este repo, en `docs/hoja-de-pedidos.md`), que ya trae la acción `actualizarPago`.
   Recordatorio para futuros cambios: hay que crear una **implementación nueva**, no solo
   guardar el código — es el mismo paso que costó la primera vez.

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
| **Aviso del canal IPN, sin firma** | se procesa igual: marca la hoja y manda el correo |
| **IPN repetido** | 200, un solo correo (la idempotencia cubre los dos canales) |
| **IPN de merchant_order** | se ignora, 200 |
| **Firma presente pero falsa** | sigue siendo 401 |
| **Sin firma, y el pago no existe en la cuenta** | 500 y ningún efecto — el caso del atacante que inventa un id |

**Falta la prueba real:** un pago de verdad, verificando que la hoja pase sola de
"En línea (confirmar en Mercado Pago)" a "Pagado ✓" y que llegue el correo de
confirmación. No se puede simular: depende de que Mercado Pago mande el aviso a la URL
registrada en el panel.

**Hasta que esa prueba pase, la regla operativa sigue siendo la de siempre:** confirmar
cada pago en el panel de Mercado Pago, buscando el número de pedido, antes de despachar.
