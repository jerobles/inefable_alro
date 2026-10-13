# Hoja de pedidos en Google Sheets

Cada pedido del sitio cae solo como una fila en una hoja de cálculo tuya, para saber
qué hay que preparar y despachar, y para compartirla con quien quieras.

**No usa Google Cloud ni cuentas de servicio ni archivos de llaves.** La hoja lleva
pegado el script de abajo, publicado como "aplicación web"; el sitio le manda un POST
a esa URL y el script agrega la fila. Nada más.

> La hoja **no reemplaza** a Netlify: cada pedido sigue guardándose ahí también. La
> hoja es la copia cómoda de mirar y de compartir; Netlify es el respaldo.

---

## Paso 1 — Crear la hoja

1. Entra a [sheets.new](https://sheets.new) y ponle un nombre, por ejemplo
   **Pedidos Inefable ALRO**.
2. No hace falta escribir encabezados: el script los crea solo con el primer pedido.

## Paso 2 — Inventar una clave

Necesitas una clave secreta que solo conozcan la hoja y el sitio. Sirve para que
nadie más pueda escribir filas si la URL se filtra.

Inventa una cadena larga y difícil (letras y números, unos 30 caracteres). Por
ejemplo, algo con la forma `k7Qm2xR9vT4bN8sL1pW6zY3cH5dF0g`, pero **no uses esa**:
escribe una tuya. La vas a necesitar en dos lugares, y tiene que ser idéntica en los
dos. **No la guardes en el repositorio ni la mandes por chat.**

## Paso 3 — Pegar el script

En la hoja: menú **Extensiones → Apps Script**. Borra todo lo que haya y pega esto:

```javascript
// Recibe los pedidos del sitio y los agrega como filas.
// La clave debe ser IDÉNTICA a la de la variable HOJA_PEDIDOS_TOKEN en Netlify.
const TOKEN = 'PEGA-AQUI-TU-CLAVE';

const ENCABEZADOS = [
  'Fecha', 'Pedido', 'Estado', 'Cliente', 'WhatsApp', 'Correo', 'Productos',
  'Subtotal', 'Envío', 'Total', 'Zona', 'Dirección', 'Notas', 'Pago',
  // ⚠️ Lo nuevo va DESPUÉS de "Pago". Esa columna es la 14 y el sitio escribe ahí
  // cuando Mercado Pago confirma: si se mete algo antes, se corre y deja de
  // funcionar sin avisar. Agrega siempre al final.
  'Ciudad', 'Localidad', 'Barrio', 'Tipo de lugar', 'Torre/Apto',
  'Indicaciones', 'Recibe',
];

// Columna donde está cada cosa (1 = A). Solo se usan al actualizar un pago.
const COL_PEDIDO = 2;  // B
const COL_PAGO = 14;   // N

function doPost(e) {
  try {
    var datos = JSON.parse(e.postData.contents);
    if (!TOKEN || datos.token !== TOKEN) {
      return responder({ ok: false, error: 'clave incorrecta' });
    }

    if (datos.accion === 'actualizarPago') {
      return actualizarPago(datos);
    }

    var f = datos.fila || {};
    var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    // La primera vez, crea los encabezados y los deja fijos al hacer scroll.
    if (hoja.getLastRow() === 0) {
      hoja.appendRow(ENCABEZADOS);
      hoja.getRange(1, 1, 1, ENCABEZADOS.length).setFontWeight('bold');
      hoja.setFrozenRows(1);
    } else {
      // Si una versión anterior dejó menos encabezados, se completan los que falten.
      // Sin esto, al agregar columnas nuevas los datos entrarían bajo celdas vacías.
      var anchoActual = hoja.getLastColumn();
      if (anchoActual < ENCABEZADOS.length) {
        var faltantes = ENCABEZADOS.slice(anchoActual);
        hoja.getRange(1, anchoActual + 1, 1, faltantes.length)
          .setValues([faltantes])
          .setFontWeight('bold');
      }
    }

    hoja.appendRow([
      f.fecha ? new Date(f.fecha) : new Date(),
      f.numeroPedido || '',
      f.estado || 'Nuevo',
      f.cliente || '',
      f.whatsapp || '',
      f.correo || '',
      f.productos || '',
      f.subtotal === undefined ? '' : f.subtotal,
      f.envio === undefined ? '' : f.envio,
      f.total === undefined ? '' : f.total,
      f.zona || '',
      f.direccion || '',
      f.notas || '',
      f.pago || '',
      f.ciudad || '',
      f.localidad || '',
      f.barrio || '',
      f.tipoLugar || '',
      f.unidad || '',
      f.indicaciones || '',
      f.recibe || '',
    ]);

    return responder({ ok: true });
  } catch (err) {
    return responder({ ok: false, error: String(err) });
  }
}

// Marca un pedido como pagado cuando Mercado Pago lo confirma.
//
// Solo toca la columna Pago. La columna Estado es tuya: si ya moviste el pedido a
// "En producción" o "Despachado", un aviso tardío no puede devolverlo atrás.
//
// Devuelve `actualizado: true` SOLO si la celda de verdad cambió. De eso depende que
// no se manden correos repetidos: Mercado Pago envía el mismo aviso varias veces.
function actualizarPago(datos) {
  var candado = LockService.getScriptLock();
  // Dos avisos simultáneos podrían leer la celda antes de que el otro la escriba, y
  // ambos creerían que la cambiaron: dos correos por un solo pago.
  if (!candado.tryLock(10000)) {
    return responder({ ok: false, error: 'la hoja estaba ocupada' });
  }

  try {
    var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var ultima = hoja.getLastRow();
    if (ultima < 2) {
      return responder({ ok: true, actualizado: false, motivo: 'la hoja está vacía' });
    }

    var pedidos = hoja.getRange(2, COL_PEDIDO, ultima - 1, 1).getValues();
    var fila = -1;
    // De abajo hacia arriba: si un número se repitiera, gana el pedido más reciente.
    for (var i = pedidos.length - 1; i >= 0; i--) {
      if (String(pedidos[i][0]).trim() === String(datos.numeroPedido).trim()) {
        fila = i + 2;
        break;
      }
    }

    if (fila === -1) {
      return responder({ ok: true, actualizado: false, motivo: 'no encontré ese número de pedido' });
    }

    var celda = hoja.getRange(fila, COL_PAGO);
    var actual = String(celda.getValue()).trim();
    var nuevo = String(datos.pago || '').trim();

    if (actual === nuevo) {
      return responder({ ok: true, actualizado: false, motivo: 'ya estaba en ese estado' });
    }

    celda.setValue(nuevo);
    SpreadsheetApp.flush();
    return responder({ ok: true, actualizado: true, fila: fila });
  } catch (err) {
    return responder({ ok: false, error: String(err) });
  } finally {
    candado.releaseLock();
  }
}

// Abrir la URL en el navegador cae aquí. Sirve para comprobar, sin hacer un pedido,
// que la implementación quedó bien publicada Y que es la versión correcta.
//
// El "columnas" es la clave: si dice 14, está corriendo la versión vieja — o sea que
// pegaste el código pero NO creaste una implementación nueva, que es el error más
// común. Tiene que decir 21.
function doGet() {
  return responder({
    ok: true,
    mensaje: 'La hoja está lista para recibir pedidos.',
    columnas: ENCABEZADOS.length,
  });
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
```

Reemplaza `PEGA-AQUI-TU-CLAVE` por la clave del paso 2 y guarda (💾).

## Paso 4 — Publicarlo

1. Botón **Implementar → Nueva implementación**.
2. En el engranaje ⚙️ elige **Aplicación web**.
3. Configura así:
   - **Ejecutar como:** Yo (tu cuenta)
   - **Quién tiene acceso:** **Cualquier usuario** ← imprescindible
4. **Implementar**. Google te va a pedir autorizar el script; acepta. Va a mostrar
   una advertencia de "app no verificada": es tu propio script, entra en
   *Configuración avanzada → Ir a (nombre del proyecto)*.
5. Copia la **URL de la aplicación web** (termina en `/exec`).

### Comprueba que quedó bien, antes de seguir

Pega esa URL en el navegador y ábrela. Deberías ver exactamente esto:

```json
{"ok":true,"mensaje":"La hoja está lista para recibir pedidos.","columnas":21}
```

> **Mira el número de `columnas`.** Si dice **21**, está corriendo la versión nueva.
> Si dice **14**, pegaste el código pero **no creaste una implementación nueva** —
> Google sigue ejecutando la versión anterior. Es el error más común y no avisa de
> ninguna forma: los pedidos siguen entrando, solo que sin las columnas nuevas.
> Vuelve al paso 4 y usa **Implementar → Nueva implementación** (no basta con guardar).

| Lo que ves | Qué pasa |
|---|---|
| El `{"ok":true…}` con `"columnas":21` | Perfecto, sigue al paso 5 |
| `"columnas":14` | El código es viejo: falta crear la **implementación nueva** |
| Una pantalla de Google pidiendo iniciar sesión o dar permiso | La implementación **no quedó pública**. Vuelve al paso 4 y pon "Quién tiene acceso: Cualquier usuario" |
| "Se requiere autorización" | Falta autorizar el script. Vuelve a **Implementar** y acepta los permisos |
| Un error de página no encontrada | La URL está mal copiada, o es la de `/dev` en vez de la de `/exec` |

> **"Cualquier usuario" suena peligroso, ¿lo es?** Solo si alguien adivina tu URL
> *y* tu clave. Sin la clave correcta, el script rechaza todo. Y aunque acertara,
> lo único que podría hacer es agregar filas basura a la hoja — no leerla, no
> borrarla, no llegar a tu cuenta de Google.

## Paso 5 — Configurar el sitio

En **Netlify → Site configuration → Environment variables**, agrega dos:

| Variable | Valor |
|---|---|
| `HOJA_PEDIDOS_URL` | La URL que termina en `/exec` |
| `HOJA_PEDIDOS_TOKEN` | La clave del paso 2, exactamente igual |
| `HOJA_PEDIDOS_ENLACE` | *(opcional)* La URL **de la hoja**, la que se abre en el navegador |

> **Ojo, son dos direcciones distintas.** `HOJA_PEDIDOS_URL` es la del script
> (termina en `/exec`) y es la que usa el sitio para escribir. `HOJA_PEDIDOS_ENLACE`
> es la de la hoja de cálculo normal (la que ves en la barra del navegador cuando la
> tienes abierta, con `docs.google.com/spreadsheets/...`) y solo sirve para poner un
> botón **"Abrir la hoja de pedidos"** en el correo interno de cada pedido. Si no la
> configuras, el correo sale igual, solo que sin ese botón.

Después, **Deploys → Trigger deploy** para que la función las tome.

## Paso 6 — Compartir la hoja

Botón **Compartir** de la hoja, como cualquier documento de Google. Si tu cliente
solo debe consultar y marcar estados, dale permiso de **Editor** sobre la hoja pero
**no** le des acceso al script.

---

## Cosas que conviene saber

- **La columna "Estado"** llega siempre como `Nuevo`. Cámbiala a mano
  (*En producción*, *Despachado*, *Entregado*…). El sitio nunca la vuelve a tocar:
  cada pedido es una fila nueva.
- **Puedes agregar tus propias columnas al final** (una de "Observaciones", por
  ejemplo). El script escribe siempre las 21 primeras y no pisa lo que venga después.
- **Las columnas 15 a 21** (Ciudad, Localidad, Barrio, Tipo de lugar, Torre/Apto,
  Indicaciones, Recibe) traen la dirección partida en pedazos, para poder **filtrar y
  contar**: cuántos pedidos van a Suba, en qué barrios se concentran tus clientes, si
  vale la pena ampliar la entrega propia. La columna *Dirección* sigue llevándolo todo
  junto, que es lo que se lee para despachar.
  - **Van después de "Pago" a propósito.** El sitio escribe la confirmación del pago en
    la columna 14; si metes una columna nueva antes de esa, el pago empieza a escribirse
    en la casilla equivocada **sin que nada lo avise**. Agrega siempre al final.
  - Si tu hoja ya tenía datos, el script **completa solo los encabezados nuevos** la
    primera vez que entre un pedido.
- **La columna "Total" viene vacía** cuando el pedido no tiene precio cerrado
  (otra ciudad, o productos por cotización): en esos casos el valor final aún no
  existe. La columna "Pago" te dice cuál es cuál.
- **La columna "Pago" se actualiza sola** cuando Mercado Pago confirma (pasa a
  `Pagado ✓`, o a `Pago rechazado` si no se aprobó). Eso lo hace el webhook, y para
  que funcione hace falta que el script esté en su **versión nueva** (la de arriba, con
  la acción `actualizarPago`) y que esté puesta la clave `MP_WEBHOOK_SECRET` en Netlify.
  - **"En línea (confirmar en Mercado Pago)"** es el valor con el que nace la fila:
    significa que el pedido fue por ese camino, **no** que el pago se completó. Mientras
    la fila siga así, **confirma en el panel de Mercado Pago buscando el número de pedido
    antes de despachar.**
  - El sitio **nunca toca la columna Estado**, solo la de Pago: si ya moviste el pedido a
    "Despachado", un aviso tardío no te lo devuelve atrás.
- ⚠️ **Si modificas el script después, hay DOS botones parecidos y solo uno sirve.**
  Guardar (💾) no basta: Google sigue ejecutando la versión publicada.
  - ✅ **Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión.**
    Mantiene **la misma URL**, así que el sitio sigue funcionando sin tocar nada.
  - ❌ **Implementar → Nueva implementación** crea **una URL distinta**. La vieja —la
    que tiene configurada el sitio— se queda corriendo el código viejo, y los pedidos
    siguen entrando como si nada. Pasó el 2026-10-12 y costó un rato entenderlo:
    el log decía *"Pedido registrado en la hoja"* sin ningún error, porque de verdad
    se estaba registrando… en la versión vieja.
  - Para salir de dudas: abre la URL de `HOJA_PEDIDOS_URL` en el navegador y mira el
    número de `columnas` que responde.
- **Si la hoja falla** (URL mal copiada, implementación no pública, Google caído),
  el pedido **no se pierde**: sigue llegando a tu correo, a Netlify y a Brevo, y el
  correo interno incluye un aviso de que esa fila no se pudo escribir.
- **Si nunca configuras las variables**, no pasa nada: el sitio simplemente no
  intenta escribir en ninguna hoja.
