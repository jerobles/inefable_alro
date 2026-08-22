// Exporta un resumen de precios (talleres y productos) a JSON plano para que las
// funciones de pago (netlify/functions/pago-*.js) puedan calcular el monto a cobrar
// en el servidor, sin confiar en el precio que mande el navegador.
//
// Se corre automáticamente como parte de "npm run build" (ver package.json), así que
// el usuario no tiene que acordarse de nada: cada vez que edita un taller o producto
// desde /admin y se publica, este archivo se regenera solo con los datos más recientes.
//
// Los .json generados en netlify/functions/data/ NO se suben a git (están en
// .gitignore) — son un derivado del build, no la fuente de la verdad.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function readFrontmatter(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  return yaml.load(match[1]) || {};
}

function leerColeccion(nombre) {
  const dirPath = path.join(ROOT, 'src', 'content', nombre);
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const slug = f.replace(/\.md$/, '');
      const data = readFrontmatter(path.join(dirPath, f)) || {};
      return { slug, ...data };
    });
}

const talleres = leerColeccion('talleres')
  .filter((t) => t.activo !== false)
  .map((t) => ({ slug: t.slug, titulo: t.titulo, precio: t.precio }));

const productos = leerColeccion('productos')
  .filter((p) => p.disponible !== false)
  .map((p) => ({
    slug: p.slug,
    nombre: p.nombre,
    variantes: (p.variantes || []).map((v) => ({ presentacion: v.presentacion, precio: v.precio })),
  }));

// Se escriben como módulos .js (no .json) a propósito: así las funciones los traen con
// un `import` normal y el bundler de Netlify los mete DENTRO del paquete de la función.
// Leerlos del disco en tiempo de ejecución no funciona: Netlify transpila las funciones
// a CommonJS, donde `import.meta.url` es inválido y `__dirname` ya está declarado —
// ambos caminos tumbaron la función en producción el 2026-08-22.
const outDir = path.join(ROOT, 'netlify', 'functions', 'data');
const banner = '// Generado por scripts/generar-datos-pago.mjs — no editar a mano.\n';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'talleres.js'), `${banner}export default ${JSON.stringify(talleres, null, 2)};\n`);
fs.writeFileSync(path.join(outDir, 'productos.js'), `${banner}export default ${JSON.stringify(productos, null, 2)};\n`);

console.log(
  `[generar-datos-pago] ${talleres.length} taller(es) y ${productos.length} producto(s) exportados para las funciones de pago.`
);
