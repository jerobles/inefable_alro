// Optimiza fotos para el sitio: las achica y las convierte a WebP.
//
// Es la herramienta para preparar fotos ANTES de subirlas por /admin. Las fotos que
// salen de un celular o de Drive pesan varios MB cada una; subidas tal cual harían la
// página lenta, sobre todo en datos móviles. Este script deja cada foto en ~100KB sin
// que se note diferencia en pantalla.
//
// A diferencia de los otros dos scripts de esta carpeta, este NO corre en el build:
// se ejecuta a mano cuando hay fotos nuevas.
//
//   npm run fotos -- "C:/Users/PC/Downloads/fotos nuevas"
//
// Deja los resultados en una subcarpeta "optimizadas" al lado de los originales, así
// que nunca pisa las fotos que le pasas. De ahí se suben por /admin.
//
// Opciones (todas tienen valor por defecto, no hace falta usarlas):
//   --ancho 1080     ancho máximo en píxeles (por defecto 1080)
//   --calidad 80     calidad del WebP, 1 a 100 (por defecto 80)
//   --salida "ruta"  carpeta donde dejar el resultado

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ANCHO_POR_DEFECTO = 1080;
const CALIDAD_POR_DEFECTO = 80;

// Formatos que sharp abre sin ayuda. HEIC (fotos de iPhone) queda fuera a propósito:
// sharp no lo soporta sin compilar librerías extra, así que se avisa en vez de fallar.
const SOPORTADOS = /\.(jpe?g|png|webp|tiff?|avif|gif)$/i;
const HEIC = /\.(heic|heif)$/i;

function leerArgumentos(argv) {
  const opciones = { ancho: ANCHO_POR_DEFECTO, calidad: CALIDAD_POR_DEFECTO, salida: null };
  const sueltos = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ancho') opciones.ancho = Number(argv[++i]) || ANCHO_POR_DEFECTO;
    else if (a === '--calidad') opciones.calidad = Number(argv[++i]) || CALIDAD_POR_DEFECTO;
    else if (a === '--salida') opciones.salida = argv[++i];
    else sueltos.push(a);
  }

  opciones.origen = sueltos[0];
  return opciones;
}

function ayuda() {
  console.log(`
  Optimizar fotos para el sitio
  ─────────────────────────────

  Uso:
    npm run fotos -- "ruta de la carpeta con las fotos"

  Ejemplo:
    npm run fotos -- "C:/Users/PC/Downloads/fotos nuevas"

  Deja las fotos listas en una subcarpeta "optimizadas", sin tocar las originales.
  Desde ahí se suben por /admin.

  Opciones (opcionales):
    --ancho 1080      ancho máximo en píxeles
    --calidad 80      calidad del WebP (1-100)
    --salida "ruta"   otra carpeta de destino
`);
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

const opciones = leerArgumentos(process.argv.slice(2));

if (!opciones.origen) {
  ayuda();
  process.exit(0);
}

const origen = path.resolve(opciones.origen);

if (!fs.existsSync(origen) || !fs.statSync(origen).isDirectory()) {
  console.error(`\n  No encontré esa carpeta:\n  ${origen}\n`);
  console.error('  Revisa que la ruta esté bien escrita y entre comillas si tiene espacios.\n');
  process.exit(1);
}

const destino = opciones.salida ? path.resolve(opciones.salida) : path.join(origen, 'optimizadas');

const archivos = fs.readdirSync(origen).filter((f) => SOPORTADOS.test(f) || HEIC.test(f));
const heicEncontrados = archivos.filter((f) => HEIC.test(f));
const procesables = archivos.filter((f) => SOPORTADOS.test(f));

if (procesables.length === 0 && heicEncontrados.length === 0) {
  console.log(`\n  No hay fotos en esa carpeta.\n  Busqué archivos .jpg, .png, .webp y similares en:\n  ${origen}\n`);
  process.exit(0);
}

fs.mkdirSync(destino, { recursive: true });

console.log(`\n  Optimizando ${procesables.length} foto(s) a ${opciones.ancho}px de ancho...\n`);

let pesoOriginal = 0;
let pesoFinal = 0;
let listas = 0;
const fallidas = [];

for (const archivo of procesables) {
  const entrada = path.join(origen, archivo);
  // Nombre en minúsculas y sin tildes ni espacios: es el que termina en la URL de la
  // foto, y así no aparecen caracteres codificados feos como %C3%A1.
  const base = path
    .basename(archivo, path.extname(archivo))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const salida = path.join(destino, `${base}.webp`);

  try {
    await sharp(entrada)
      // .rotate() sin argumentos aplica la orientación que guardó la cámara. Sin esto,
      // varias fotos de celular salen acostadas.
      .rotate()
      .resize({ width: opciones.ancho, withoutEnlargement: true })
      .webp({ quality: opciones.calidad })
      .toFile(salida);

    const antes = fs.statSync(entrada).size;
    const despues = fs.statSync(salida).size;
    pesoOriginal += antes;
    pesoFinal += despues;
    listas++;

    console.log(`  ${archivo}  →  ${path.basename(salida)}   ${kb(antes)} → ${kb(despues)}`);
  } catch (err) {
    fallidas.push({ archivo, motivo: err.message });
  }
}

const ahorro = pesoOriginal > 0 ? Math.round((1 - pesoFinal / pesoOriginal) * 100) : 0;

console.log(`\n  ─────────────────────────────`);
console.log(`  ${listas} foto(s) listas en:\n  ${destino}`);
if (pesoOriginal > 0) {
  console.log(`\n  Peso total: ${(pesoOriginal / 1024 / 1024).toFixed(2)} MB → ${(pesoFinal / 1024 / 1024).toFixed(2)} MB  (${ahorro}% menos)`);
}

if (heicEncontrados.length > 0) {
  console.log(`\n  ⚠  ${heicEncontrados.length} foto(s) en formato HEIC (de iPhone) que no puedo abrir:`);
  heicEncontrados.forEach((f) => console.log(`     ${f}`));
  console.log(`
     Para convertirlas, la forma más fácil es abrirlas en el visor de fotos de
     Windows y usar "Guardar como" en JPG. Después vuelve a correr este comando.

     O, si prefieres, en el iPhone: Ajustes → Cámara → Formatos → "Más compatible",
     y las fotos nuevas saldrán en JPG directamente.`);
}

if (fallidas.length > 0) {
  console.log(`\n  ⚠  ${fallidas.length} foto(s) no se pudieron procesar:`);
  fallidas.forEach(({ archivo, motivo }) => console.log(`     ${archivo} — ${motivo}`));
}

console.log('');
