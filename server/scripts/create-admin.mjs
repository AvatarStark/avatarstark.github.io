// Crea o actualiza un usuario del panel comercial.
// Uso: npm run admin:create -- --usuario ana --nombre "Ana Pérez" --rol admin
// La contraseña se pide por la terminal (o por la variable ADMIN_PASSWORD) y nunca se imprime.
import { parseArgs } from 'node:util';
import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import { migrate, pool, query } from '../src/db.js';

const { values } = parseArgs({ options: { usuario: { type: 'string' }, nombre: { type: 'string' }, rol: { type: 'string', default: 'admin' } } });
const username = (values.usuario || '').trim().toLowerCase();
if (!/^[a-z0-9._-]{3,40}$/.test(username)) { console.error('Indica --usuario (3-40 caracteres: letras, números, punto, guion).'); process.exit(1); }
if (!['admin', 'ventas'].includes(values.rol)) { console.error('--rol debe ser admin o ventas.'); process.exit(1); }

async function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes(prompt)) process.stdout.write(s); };
  return new Promise((resolve) => rl.question(prompt, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); }));
}

const password = process.env.ADMIN_PASSWORD || await ask('Contraseña (mínimo 12 caracteres): ');
if (password.length < 12) { console.error('La contraseña debe tener al menos 12 caracteres.'); process.exit(1); }

await migrate(() => {});
const hash = await bcrypt.hash(password, 12);
await query(
  `INSERT INTO admin_users (username, display_name, password_hash, role) VALUES ($1,$2,$3,$4)
   ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash,
     role = EXCLUDED.role, token_version = admin_users.token_version + 1, failed_logins = 0, locked_until = NULL, active = true`,
  [username, values.nombre || username, hash, values.rol],
);
await pool.end();
console.log(`Usuario ${username} listo (rol ${values.rol}). Las sesiones anteriores de este usuario quedan cerradas.`);
