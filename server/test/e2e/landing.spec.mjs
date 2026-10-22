import { expect, noHorizontalOverflow, resetData, sql, test } from './fixtures.mjs';

test.beforeAll(async () => { await resetData(); });

test('landing en escritorio: contenido, CTA, recorrido y preguntas', async ({ page, consoleErrors }, info) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/NexoPOS/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.hero .btn-primary')).toHaveText(/Solicitar demostración/);
  await expect(page.getByRole('link', { name: 'Ver cómo funciona' })).toHaveAttribute('href', '#producto');

  // Todos los CTA de demostración llevan al embudo.
  const ctas = page.locator('a[data-cta]:not([href*="wa.me"]):not([href^="#"])');
  const n = await ctas.count();
  expect(n).toBeGreaterThan(8);
  for (let i = 0; i < n; i++) await expect(ctas.nth(i)).toHaveAttribute('href', /book-demo\//);

  // Imágenes: todas cargan y tienen texto alternativo (o son decorativas).
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } });
  await page.waitForLoadState('networkidle');
  // Las imágenes visibles deben estar cargadas; las de pestañas ocultas se cargan al mostrarse.
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.checkVisibility({ visibilityProperty: true }) && i.getBoundingClientRect().width > 0 && (!i.complete || i.naturalWidth === 0)).map((i) => i.src));
  expect(broken).toEqual([]);
  expect(await page.locator('img:not([alt])').count()).toBe(0);

  // Recorrido del producto por pestañas (ratón y teclado).
  await page.locator('#producto').scrollIntoViewIfNeeded();
  await page.getByRole('tab', { name: /Inventario/ }).click();
  await expect(page.locator('#tp-inventario')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('tab', { name: /Cocina/ })).toHaveAttribute('aria-selected', 'true');

  // Negocios
  await page.getByRole('tab', { name: 'Tienda, mini o bodega' }).click();
  await expect(page.getByRole('heading', { name: 'Un inventario que cuadra.' })).toBeVisible();

  // Preguntas frecuentes
  await page.getByText('¿NexoPOS necesita Internet para funcionar?').click();
  await expect(page.getByText(/Vender, cobrar, consultar el inventario/).first()).toBeVisible();

  // Recorrido guiado: se puede pausar.
  await page.locator('#demo').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Pausar recorrido' }).click();
  await expect(page.getByRole('button', { name: 'Reproducir recorrido' })).toBeVisible();

  await noHorizontalOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('landing-escritorio.png'), fullPage: true });
  expect(consoleErrors).toEqual([]);
});

test('el CTA del hero abre el embudo y se registra el evento', async ({ page }) => {
  await page.goto('/');
  await page.locator('.hero .btn-primary').click();
  await expect(page).toHaveURL(/\/book-demo\/\?origen=hero/);
  await expect(page.getByRole('heading', { name: '¿Qué tipo de negocio tienes?' })).toBeVisible();
  await expect.poll(async () => (await sql(`SELECT count(*)::int AS n FROM funnel_events WHERE name = 'cta_click' AND label = 'hero'`))[0].n).toBe(1);
});

test('variante A/B estable durante la sesión', async ({ page }) => {
  await page.goto('/');
  const v = await page.evaluate(() => document.documentElement.dataset.abHero);
  expect(['a', 'b']).toContain(v);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.abHero)).toBe(v);
  await expect(page.locator(`.ab-hero-${v}`)).toBeVisible();
  await expect(page.locator(`.ab-hero-${v === 'a' ? 'b' : 'a'}`)).toBeHidden();
});

test('privacidad y 404', async ({ page, consoleErrors }) => {
  await page.goto('/privacidad/');
  await expect(page.getByRole('heading', { name: 'Política de privacidad' })).toBeVisible();
  const r = await page.goto('/no-existe');
  expect(r.status()).toBe(404);
  await expect(page.getByText('no existe.')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('archivos del servidor y ocultos no se publican', async ({ request }) => {
  for (const p of ['/server/package.json', '/server/.env', '/.git/config', '/server/src/config.js']) {
    expect((await request.get(p)).status(), p).toBe(404);
  }
});
