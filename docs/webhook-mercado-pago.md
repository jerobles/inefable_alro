# Confirmación automática del pago (webhook de Mercado Pago)

**Estado: no implementado.** Este documento describe cómo se haría, para retomarlo
cuando se decida. No hay código escrito todavía.

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

## Lo que tendría que hacer el usuario

1. En el panel de Mercado Pago, **crear el secreto de firma** del webhook y pasarlo
   para configurarlo en Netlify.
2. Crear el atributo nuevo en Brevo.
3. Volver a implementar el Apps Script con la acción de actualizar (versión nueva, no
   solo guardar).

## Cómo se probaría

El punto delicado es que **no se puede probar de verdad sin pagos reales**, y con
credenciales de prueba los avisos llegan igual pero desde el entorno de prueba. El
plan sería:

1. Dry-run local del bundle, como con las demás funciones, cubriendo: firma inválida,
   aviso duplicado (idempotencia), pago aprobado, rechazado y pendiente, y fallo de la
   hoja o de Brevo.
2. Con credenciales de prueba, un pago completo y verificar que llegue el aviso y se
   actualice la fila.
3. Ya en producción, un pago real mínimo, verificando que la hoja pase sola de
   "En línea (confirmar)" a "Pagado".

## Cuánto pesa

Es la pieza más delicada de todo el pago, no por volumen de código sino porque toca
dinero y tiene que ser a prueba de reintentos y de mensajes falsos. Estimación
honesta: bastante más trabajo que el carrito completo, casi todo en pruebas.

**Mientras no exista, la regla operativa es la de siempre:** confirmar cada pago en el
panel de Mercado Pago, buscando el número de pedido, antes de despachar.
