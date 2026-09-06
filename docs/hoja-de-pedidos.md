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
];

function doPost(e) {
  try {
    var datos = JSON.parse(e.postData.contents);
    if (!TOKEN || datos.token !== TOKEN) {
      return responder({ ok: false, error: 'clave incorrecta' });
    }

    var f = datos.fila || {};
    var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    // La primera vez, crea los encabezados y los deja fijos al hacer scroll.
    if (hoja.getLastRow() === 0) {
      hoja.appendRow(ENCABEZADOS);
      hoja.getRange(1, 1, 1, ENCABEZADOS.length).setFontWeight('bold');
      hoja.setFrozenRows(1);
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
    ]);

    return responder({ ok: true });
  } catch (err) {
    return responder({ ok: false, error: String(err) });
  }
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
  ejemplo). El script escribe siempre las 14 primeras y no pisa lo que venga después.
- **La columna "Total" viene vacía** cuando el pedido no tiene precio cerrado
  (otra ciudad, o productos por cotización): en esos casos el valor final aún no
  existe. La columna "Pago" te dice cuál es cuál.
- **"Pago: En línea (confirmar en Mercado Pago)"** no significa que el pago se haya
  completado — significa que el pedido fue por ese camino. El sitio no puede saber
  si el pago se aprobó (eso necesitaría el webhook de Mercado Pago, que está
  pendiente). **Confirma en el panel de Mercado Pago buscando el número de pedido
  antes de despachar.**
- **Si modificas el script después**, no basta con guardar: hay que ir a
  **Implementar → Administrar implementaciones**, editar (✏️) y elegir
  **Versión: Nueva versión**. Si no, sigue corriendo la versión vieja.
- **Si la hoja falla** (URL mal copiada, implementación no pública, Google caído),
  el pedido **no se pierde**: sigue llegando a tu correo, a Netlify y a Brevo, y el
  correo interno incluye un aviso de que esa fila no se pudo escribir.
- **Si nunca configuras las variables**, no pasa nada: el sitio simplemente no
  intenta escribir en ninguna hoja.
