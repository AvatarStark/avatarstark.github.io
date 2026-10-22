import { migrate, pool } from '../src/db.js';

await migrate();
await pool.end();
console.log('Base de datos al día.');
