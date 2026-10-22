import { ADMIN, expect, fillFunnel, resetData, test } from './fixtures.mjs';

test.beforeAll(async () => { await resetData(); });

test('1 · esqueletos de carga en imágenes, calendario y panel', async ({ page }) => {
  // Las capturas tardan: mientras tanto muestran el brillo del esqueleto.
  await page.route('**/assets/capturas/04-panel-admin-claro-*.webp', async (r) => { await new Promise((x) => setTimeout(x, 1500)); r.continue(); });
  await page.goto('/');
  const shot = page.locator('#tp-resumen img');
  await shot.scrollIntoViewIfNeeded();
  await expect(shot).toHaveClass(/(^|\s)sk(\s|$)/);
  await expect(shot).not.toHaveClass(/(^|\s)sk(\s|$)/, { timeout: 8000 });
  await expect(shot).toHaveClass(/sk-in/);

  await page.route('**/api/slots', async (r) => { await new Promise((x) => setTimeout(x, 1200)); r.continue(); });
  await fillFunnel(page);
  await expect(page.locator('.cal-sk')).toBeVisible();
  await expect(page.locator('.cal-time').first()).toBeVisible();
  await expect(page.locator('.cal-sk')).toHaveCount(0);

  await page.route('**/api/admin/metrics*', async (r) => { await new Promise((x) => setTimeout(x, 1200)); r.continue(); });
  await page.goto('/admin/');
  await page.getByLabel('Usuario').fill(ADMIN.username);
  await page.getByLabel('Contraseña').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('.adm-sk')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Resumen comercial' })).toBeVisible();
  await expect(page.locator('.adm-sk')).toHaveCount(0);
});

test('2 · microinteracciones: onda al pulsar y chips que responden al primer toque', async ({ page }) => {
  await page.goto('/book-demo/');
  const next = page.getByRole('button', { name: /Continuar/ });
  await next.hover();
  await page.mouse.down();
  await expect(next.locator('.ripple')).toHaveCount(1);
  await page.mouse.up();
  await expect(next.locator('.ripple')).toHaveCount(0, { timeout: 2000 });
  await page.getByText('Tienda, mini o bodega').click();
  await page.getByText('Registro de ventas').click();
  await expect(page.getByRole('checkbox', { name: 'Registro de ventas' })).toBeChecked();
  await expect(page.locator('.chip .ripple')).toHaveCount(1);
});

test('3 y 5 · animaciones al hacer scroll e indicadores de progreso', async ({ page }) => {
  await page.goto('/');
  const bar = page.locator('.scroll-progress i');
  const scaleAt = async () => page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('.scroll-progress i')).transform).a);
  expect(await scaleAt()).toBeLessThan(0.02);
  const tilt0 = await page.locator('.device').evaluate((d) => getComputedStyle(d).getPropertyValue('--tilt'));
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.locator('.device').evaluate((d) => getComputedStyle(d).getPropertyValue('--tilt'))).not.toBe(tilt0);
  await page.locator('.pains').scrollIntoViewIfNeeded();
  await expect(page.locator('.pains .pain').first()).toHaveClass(/(^|\s)in(\s|$)/);
  // Los pasos se encienden y la línea avanza al recorrer la sección.
  await page.locator('#como-funciona .steps').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 300);
  await expect(page.locator('.step.on').first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(scaleAt).toBeGreaterThan(0.95);
  await expect(bar).toBeAttached();
});

test('4 · tarjetas que reaccionan al puntero', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.pain').first();
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')));
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2);
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.15, { steps: 4 });
  await expect(card).toHaveClass(/tilting/);
  const ry = await card.evaluate((c) => parseFloat(c.style.getPropertyValue('--ry')));
  expect(ry).toBeGreaterThan(2);
  await page.mouse.move(0, 0);
  await expect(card).not.toHaveClass(/tilting/);
});

test('5 · indicador de pasos del formulario y barras del panel', async ({ page }) => {
  await page.goto('/book-demo/');
  await expect(page.locator('[data-stepper] li').nth(0)).toHaveClass(/current/);
  await page.getByText('Cafetería, restaurante o bar').click();
  await expect(page.locator('[data-stepper] li').nth(0)).toHaveClass(/done/);
  await expect(page.locator('[data-stepper] li').nth(1)).toHaveClass(/current/);
});

test('con "reducir movimiento" todo el contenido se ve y no hay ondas', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('.pains .pain').first()).toHaveCSS('opacity', '1');
  await page.locator('.hero .btn-primary').hover();
  await page.mouse.down();
  expect(await page.locator('.ripple').count()).toBe(0);
  await page.mouse.up();
  await ctx.close();
});
