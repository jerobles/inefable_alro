// Genera miniaturas JPG de las fotos de producto, para usarlas en los correos.
//
// ¿Por qué no reusar las WebP que ya están en public/images/productos/?
// Porque WebP NO sirve en correo: Outlook para Windows muestra la imagen rota y
// Gmail la reprocesa. Una parte de los clientes vería el correo de confirmación con
// cuadros vacíos donde deberían ir sus velas. En correo se usa JPG o PNG, punto.
//
// Corre como parte de "npm run build" (ver package.json), así que cuando el usuario
// suba la foto de un producto nuevo desde /admin, su miniatura se genera sola en el
// siguiente despliegue. Nadie tiene que acordarse de nada.
//
// Lo generado (public/images/productos/correo/) NO se sube a git: es un derivado.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ORIGEN = path.join(ROOT, 'public', 'images', 'productos');
const DESTINO = path.join(ORIGEN, 'correo');

// 160px de ancho: en el correo se ven a 80px, el doble para pantallas retina.
const ANCHO = 160;

if (!fs.existsSync(ORIGEN)) {
  console.log('[miniaturas-correo] No hay carpeta de fotos de producto, no hay nada que hacer.');
  process.exit(0);
}

fs.mkdirSync(DESTINO, { recursive: true });

const fuentes = fs.readdirSync(ORIGEN).filter((f) => /\.(webp|jpe?g|png)$/i.test(f));

let generadas = 0;
let reusadas = 0;
let fallidas = 0;

for (const archivo of fuentes) {
  const slug = archivo.replace(/\.[^.]+$/, '');
  const entrada = path.join(ORIGEN, archivo);
  const salida = path.join(DESTINO, `${slug}.jpg`);

  // Si la miniatura ya existe y es más nueva que el original, no se rehace: en un
  // build limpio se generan todas, pero en local no se repite el trabajo cada vez.
  try {
    if (fs.existsSync(salida) && fs.statSync(salida).mtimeMs >= fs.statSync(entrada).mtimeMs) {
      reusadas++;
      continue;
    }
  } catch (err) {
    /* si falla el chequeo de fechas, simplemente se regenera */
  }

  try {
    await sharp(entrada)
      .resize(ANCHO, ANCHO, { fit: 'cover', position: 'centre' })
      // Fondo crema por si la imagen trae transparencia: en un correo el fondo
      // transparente se ve negro en unos clientes y blanco en otros.
      .flatten({ background: '#f4efe6' })
      .jpeg({ quality: 78, progressive: true })
      .toFile(salida);
    generadas++;
  } catch (err) {
    // Una foto rota no puede tumbar el build entero: el correo saldrá sin esa
    // miniatura (la plantilla lo tolera) y queda el aviso en el log del despliegue.
    console.warn(`[miniaturas-correo] No se pudo procesar ${archivo}:`, err.message);
    fallidas++;
  }
}

console.log(
  `[miniaturas-correo] ${generadas} generada(s), ${reusadas} ya estaban al día` +
    (fallidas ? `, ${fallidas} con error` : '') +
    ` (de ${fuentes.length} fotos).`
);
