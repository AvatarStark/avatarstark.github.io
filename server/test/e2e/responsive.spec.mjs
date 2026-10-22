import { expect, noHorizontalOverflow, resetData, test } from './fixtures.mjs';

test.beforeAll(async () => { await resetData(); });

for (const width of [320, 390, 768, 1024]) {
  test(`sin desbordes ni textos cortados a ${width}px`, async ({ page, consoleErrors }) => {
    await page.setViewportSize({ width, height: 860 });
    for (const path of ['/', '/book-demo/', '/privacidad/', '/admin/']) {
      await page.goto(path);
      await noHorizontalOverflow(page);
      // Ningún botón o enlace visible se sale de la pantalla.
      const outside = await page.evaluate(() => [...document.querySelectorAll('a.btn, button')].filter((e) => {
        const r = e.getBoundingClientRect();
        const style = getComputedStyle(e);
        return r.width > 0 && style.visibility !== 'hidden' && !e.closest('.tour-tabs, .sticky-cta') && (r.left < -1 || r.right > window.innerWidth + 1);
      }).map((e) => e.textContent.trim().slice(0, 40)));
      expect(outside, `${path} a ${width}px`).toEqual([]);
    }
    expect(consoleErrors).toEqual([]);
  });
}

test('menú móvil y CTA fija', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Abrir menú' });
  await toggle.click();
  await expect(page.getByRole('link', { name: 'Cómo funciona', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Cómo funciona', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#stickyCta')).toHaveClass(/show/);
  await page.locator('#contacto').scrollIntoViewIfNeeded();
  await expect(page.locator('#stickyCta')).not.toHaveClass(/show/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('landing-movil.png'), fullPage: true });
});
