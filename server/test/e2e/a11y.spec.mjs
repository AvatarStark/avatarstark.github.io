import AxeBuilder from '@axe-core/playwright';
import { expect, fillFunnel, resetData, test } from './fixtures.mjs';

test.beforeAll(async () => { await resetData(); });

const audit = async (page) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
};

for (const path of ['/', '/book-demo/', '/privacidad/', '/admin/']) {
  test(`accesibilidad WCAG 2.2 AA: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')));
    await page.waitForTimeout(1000);
    expect(await audit(page)).toEqual([]);
  });
}

test('accesibilidad del calendario', async ({ page }) => {
  await fillFunnel(page);
  await page.locator('.cal-time').first().click();
  expect(await audit(page)).toEqual([]);
});
