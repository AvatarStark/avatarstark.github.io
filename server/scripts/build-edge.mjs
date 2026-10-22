// Copia server/src a supabase/functions/api/app para desplegarlo como Edge Function.
import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dest = path.join(root, 'supabase', 'functions', 'api', 'app');
await rm(dest, { recursive: true, force: true });
await cp(path.join(root, 'server', 'src'), dest, { recursive: true, filter: (src) => src !== path.join(root, 'server', 'src', 'index.js') });
console.log(`Código de la API copiado en ${path.relative(root, dest)}`);
