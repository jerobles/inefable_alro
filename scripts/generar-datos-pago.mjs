// Exporta un resumen de precios (talleres y productos) a JSON plano para que las
// funciones de pago (netlify/functions/pago-*.js) puedan calcular el monto a cobrar
// en el servidor, sin confiar en el precio que mande el navegador.
//
// Se corre automáticamente como parte de "npm run build" (ver package.json), así que
// el usuario no tiene que acordarse de nada: cada vez que edita un taller o producto
// desde /admin y se publica, este archivo se regenera solo con los datos más recientes.
//
// Los archivos generados en netlify/functions/data/ NO se suben a git (están en
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

// Se escriben como módulos CommonJS (.cjs con module.exports) a propósito.
//
// Leerlos del disco en tiempo de ejecución no funciona: Netlify transpila las funciones
// a CommonJS, donde `import.meta.url` es inválido y `__dirname` ya está declarado —
// ambos caminos tumbaron la función en producción el 2026-08-22.
//
// Y escribirlos como módulos ESM (.js con `export default`) tampoco: se creía que el
// bundler los metía DENTRO del paquete de la función, pero NO lo hace — los deja fuera
// y los carga con require() en tiempo de ejecución. Ahí Node devuelve el módulo
// envuelto en su namespace, el envoltorio de interop de esbuild lo envuelve otra vez,
// y `productos.default` termina siendo un objeto en vez del arreglo:
//   TypeError: import_productos.default.find is not a function
// (reventó en producción el 2026-09-05, apenas se configuró MP_ACCESS_TOKEN y el
// código alcanzó a llegar a esa línea por primera vez).
//
// CommonJS funciona en los DOS escenarios: si el bundler lo inlinea, el interop deja el
// arreglo en .default; si lo deja afuera, require() devuelve el arreglo directo. Aun
// así, las funciones normalizan lo que reciben — ver la nota en pago-producto.js.
const outDir = path.join(ROOT, 'netlify', 'functions', 'data');
const banner = '// Generado por scripts/generar-datos-pago.mjs — no editar a mano.\n';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'talleres.cjs'), `${banner}module.exports = ${JSON.stringify(talleres, null, 2)};\n`);
fs.writeFileSync(path.join(outDir, 'productos.cjs'), `${banner}module.exports = ${JSON.stringify(productos, null, 2)};\n`);

console.log(
  `[generar-datos-pago] ${talleres.length} taller(es) y ${productos.length} producto(s) exportados para las funciones de pago.`
);
