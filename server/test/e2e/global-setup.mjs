// Base desechable para las pruebas de navegador: se borra y se migra de nuevo en cada ejecución.
export default async function globalSetup() {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://nexo_web:devpass@localhost:5432/nexo_web_test';
  const { pool, query, migrate } = await import('../../src/db.js');
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(() => {});
  await pool.end();
}
