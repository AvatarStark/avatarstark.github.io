import { expect, noHorizontalOverflow, resetData, test } from './fixtures.mjs';

test.beforeEach(async () => { await resetData(); });

test('embudo completo en móvil', async ({ page, consoleErrors }, info) => {
  await page.goto('/book-demo/');
  await expect(page.getByRole('button', { name: 'Atrás' })).toBeHidden();
  await page.screenshot({ path: info.outputPath('m1-negocio.png'), fullPage: true });
  await page.getByText('Cafetería, restaurante o bar').tap();
  await page.getByText('Control de inventario').tap();
  await page.screenshot({ path: info.outputPath('m2-necesidades.png'), fullPage: true });
  await page.getByRole('button', { name: /Continuar/ }).tap();
  await page.getByText('2 a 5').tap();
  await page.getByText('Durante este mes').tap();
  await page.getByLabel('Tu nombre').fill('Pedro');
  await page.getByLabel('Nombre del negocio').fill('Mini Pedro');
  await page.getByLabel('WhatsApp', { exact: true }).fill('+53 5 999 8888');
  await page.getByRole('checkbox', { name: /Acepto que NexoPOS/ }).check();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('m3-contacto.png'), fullPage: true });
  await page.waitForTimeout(3100);
  await page.getByRole('button', { name: /Ver horarios disponibles/ }).tap();
  await page.locator('.cal-time').nth(2).tap();
  await expect(page.getByRole('button', { name: 'Confirmar demostración' })).toBeInViewport();
  await expect(page.getByRole('button', { name: /Continuar/ })).toBeHidden();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('m4-calendario.png'), fullPage: false });
  await page.getByRole('button', { name: 'Confirmar demostración' }).tap();
  await expect(page.getByRole('heading', { name: /Tu demostración está confirmada/ })).toBeVisible();
  // Sin correo no se muestra la fila vacía.
  await expect(page.locator('[data-sum-email-row]')).toBeHidden();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('m5-confirmacion.png'), fullPage: true });
  expect(consoleErrors).toEqual([]);
});
