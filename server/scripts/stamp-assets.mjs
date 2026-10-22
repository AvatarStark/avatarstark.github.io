// Añade a cada CSS/JS enlazado desde las páginas una huella de su contenido (?v=xxxxxxxx).
// Si un archivo cambia, cambia su URL y ningún navegador sigue usando la versión vieja en caché.
// Uso: npm run assets:stamp   (las pruebas fallan si alguna huella no está al día)
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PAGES = ['index.html', '404.html', 'book-demo/index.html', 'book-demo/gestionar/index.html', 'admin/index.html', 'privacidad/index.html'];
const REF = /((?:href|src)=")((?:\.\.\/|\/)*assets\/(?:css|js)\/[\w.-]+\.(?:css|js))(?:\?v=[0-9a-f]+)?(")/g;

const hashOf = async (file) => createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 10);

export async function stamp({ write = true } = {}) {
  const stale = [];
  for (const page of PAGES) {
    const file = path.join(root, page);
    const html = await readFile(file, 'utf8');
    let out = html;
    for (const m of [...html.matchAll(REF)]) {
      const asset = path.resolve(path.dirname(file), m[2].startsWith('/') ? path.join(root, m[2]) : m[2]);
      const ref = `${m[1]}${m[2]}?v=${await hashOf(m[2].startsWith('/') ? path.join(root, m[2]) : asset)}${m[3]}`;
      out = out.replace(m[0], ref);
    }
    if (out !== html) { stale.push(page); if (write) await writeFile(file, out); }
  }
  return stale;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const changed = await stamp();
  console.log(changed.length ? `Huellas actualizadas en: ${changed.join(', ')}` : 'Huellas al día.');
}
