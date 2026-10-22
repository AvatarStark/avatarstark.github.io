import { ADMIN, expect, fillFunnel, resetData, sql, test } from './fixtures.mjs';

test.beforeEach(async () => { await resetData(); });

async function login(page, { username = ADMIN.username, password = ADMIN.password } = {}) {
  await page.goto('/admin/');
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('rutas protegidas: sin sesión no hay datos', async ({ page, request }) => {
  for (const [m, p] of [['get', '/api/admin/leads'], ['get', '/api/admin/metrics'], ['get', '/api/admin/leads/1'], ['patch', '/api/admin/leads/1'], ['put', '/api/admin/settings/availability'], ['get', '/api/admin/bookings']]) {
    const r = await request[m](p, { data: {} });
    expect(r.status(), `${m} ${p}`).toBe(401);
  }
  await page.goto('/admin/#prospectos');
  await expect(page.getByRole('heading', { name: 'Panel comercial' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  // Un token inventado en el navegador no da acceso.
  await page.evaluate(() => sessionStorage.setItem('nexo_admin_token', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.falso'));
  await page.reload();
  await expect(page.getByText(/sesión caducó/)).toBeVisible();
});

test('contraseña incorrecta', async ({ page }) => {
  await login(page, { password: 'equivocada-123' });
  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible();
});

test('gestión de prospectos, demostraciones, notas y métricas', async ({ page, browser, consoleErrors }, info) => {
  // Un visitante reserva desde la web.
  const visitor = await browser.newContext({ timezoneId: 'America/Havana' });
  const vp = await visitor.newPage();
  await fillFunnel(vp);
  await vp.locator('.cal-time').first().click();
  await vp.getByRole('button', { name: 'Confirmar demostración' }).click();
  await expect(vp.getByRole('heading', { name: /confirmada/ })).toBeVisible();
  await visitor.close();

  await login(page);
  await expect(page.getByRole('heading', { name: 'Resumen comercial' })).toBeVisible();
  await expect(page.locator('.adm-kpi').first()).toContainText('1');
  await expect(page.locator('.adm-kpi', { hasText: 'Formulario → reserva' })).toContainText('100%');
  await page.screenshot({ path: info.outputPath('admin-resumen.png'), fullPage: true });

  await page.getByRole('link', { name: 'Prospectos' }).click();
  await expect(page.getByRole('cell', { name: /María López/ })).toBeVisible();
  await expect(page.locator('#adm-main')).not.toContainText('null');
  await page.getByPlaceholder(/Buscar nombre/).fill('no-existe');
  await expect(page.getByText('No hay prospectos con estos filtros.')).toBeVisible();
  await page.getByPlaceholder(/Buscar nombre/).fill('esquina');
  await page.getByRole('cell', { name: /María López/ }).click();

  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('heading', { name: 'María López' })).toBeVisible();
  await expect(drawer).toContainText('Control de inventario, Control de ganancias');
  await expect(drawer).toContainText('Proveedor sin configurar');
  await drawer.getByPlaceholder(/Tiene dos cajas/).fill('Quiere empezar el lunes');
  await drawer.getByRole('button', { name: 'Guardar nota' }).click();
  await expect(drawer.getByText('Quiere empezar el lunes')).toBeVisible();
  await expect(drawer.getByRole('status')).toHaveText('Nota guardada');
  await drawer.getByRole('button', { name: 'Marcar realizada' }).click();
  await expect(drawer.getByLabel('Estado del prospecto')).toHaveValue('demo_realizada');
  await drawer.getByLabel('Estado del prospecto').selectOption('cliente');
  await expect(drawer.locator('.adm-timeline')).toContainText('Demo realizada → Cliente');
  await page.screenshot({ path: info.outputPath('admin-prospecto.png') });
  await drawer.getByRole('button', { name: 'Cerrar' }).click();

  await page.getByRole('link', { name: 'Resumen' }).click();
  await expect(page.locator('.adm-kpi', { hasText: 'Tasa de cierre' })).toContainText('100%');
  await expect(page.locator('.adm-kpi', { hasText: /^Clientes/ })).toContainText('1');

  await page.getByRole('link', { name: 'Agenda' }).click();
  await expect(page.getByText('No hay demostraciones programadas.')).toBeVisible();
  await page.getByRole('button', { name: 'Pasadas' }).click();
  expect(consoleErrors).toEqual([]);
});

test('disponibilidad: guardar franjas cambia los horarios de la web', async ({ page }, info) => {
  await login(page);
  await page.getByRole('link', { name: 'Disponibilidad' }).click();
  await expect(page.getByText(/Ahora mismo la web ofrece \d+ horarios/)).toBeVisible();
  await expect(page.locator('#adm-main')).not.toContainText('null');
  // Quita todas las franjas y guarda: la web deja de ofrecer horarios.
  while (await page.getByRole('button', { name: 'Quitar franja' }).count()) await page.getByRole('button', { name: 'Quitar franja' }).first().click();
  await page.getByRole('button', { name: 'Guardar disponibilidad' }).click();
  await expect(page.getByText('Ahora mismo la web no ofrece ningún horario')).toBeVisible();
  const r = await page.request.get('/api/slots');
  expect((await r.json()).slots).toEqual([]);
  // Añade una franja el lunes.
  await page.locator('.adm-weekday', { hasText: 'Lunes' }).getByRole('button', { name: '+ Franja' }).click();
  await page.getByRole('button', { name: 'Guardar disponibilidad' }).click();
  await expect(page.getByText(/Ahora mismo la web ofrece \d+ horarios/)).toBeVisible();
  await page.screenshot({ path: info.outputPath('admin-disponibilidad.png'), fullPage: true });
  const [s] = await sql(`SELECT value FROM settings WHERE key = 'availability'`);
  expect(s.value.weekly['1']).toEqual([{ start: '09:00', end: '17:00' }]);
});

test('usuario de ventas no puede cambiar la configuración', async ({ page }) => {
  const bcrypt = (await import('bcryptjs')).default;
  await sql(`INSERT INTO admin_users (username, display_name, password_hash, role) VALUES ('vendedor', 'Vendedor', $1, 'ventas')`, [await bcrypt.hash('clave-ventas-1234', 4)]);
  await login(page, { username: 'vendedor', password: 'clave-ventas-1234' });
  await page.getByRole('link', { name: 'Puntuación' }).click();
  await expect(page.getByRole('button', { name: 'Guardar reglas' })).toBeHidden();
  const token = await page.evaluate(() => sessionStorage.getItem('nexo_admin_token'));
  const r = await page.request.put('/api/admin/settings/scoring', { headers: { Authorization: `Bearer ${token}` }, data: { value: {} } });
  expect(r.status()).toBe(403);
});
