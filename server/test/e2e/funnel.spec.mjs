import { expect, fillFunnel, noHorizontalOverflow, resetData, sql, test } from './fixtures.mjs';

test.beforeEach(async () => { await resetData(); });

test('validaciones de cada paso', async ({ page, consoleErrors }) => {
  await page.goto('/book-demo/');
  await page.getByRole('button', { name: /Continuar/ }).click();
  await expect(page.getByText('Elige una opción para continuar.')).toBeVisible();
  await page.getByText('Tienda, mini o bodega').click();
  // Elegir con el ratón avanza solo al paso siguiente.
  await expect(page.getByRole('heading', { name: '¿Qué necesitas mejorar?' })).toBeVisible();
  await expect(page.getByText('Paso 2 de 6', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Continuar/ }).click();
  await expect(page.getByText('Elige al menos una opción.')).toBeVisible();
  await page.getByText('Otros').click();
  await expect(page.getByLabel(/¿Qué más te gustaría resolver?/)).toBeVisible();
  await page.getByRole('button', { name: /Continuar/ }).click();
  await page.getByText('Solo yo').click();
  await page.getByText('Solo estoy investigando').click();
  await page.getByRole('button', { name: /Ver horarios disponibles/ }).click();
  await expect(page.getByText('Escribe tu nombre.')).toBeVisible();
  await expect(page.getByText(/Escribe el número con código de país/)).toBeVisible();
  await expect(page.getByText(/Necesitamos tu permiso/)).toBeVisible();
  await expect(page.getByLabel('Tu nombre')).toBeFocused();
  await page.getByLabel('WhatsApp', { exact: true }).fill('12');
  await page.getByLabel(/Correo electrónico/).fill('no-es-correo');
  await page.getByRole('button', { name: /Ver horarios disponibles/ }).click();
  await expect(page.getByText('Revisa el correo o déjalo vacío.')).toBeVisible();
  expect(await sql('SELECT count(*)::int AS n FROM leads')).toEqual([{ n: 0 }]);
  expect(consoleErrors).toEqual([]);
});

test('teclado, navegación hacia atrás y persistencia al recargar', async ({ page }) => {
  await page.goto('/book-demo/?negocio=tienda');
  // El parámetro preselecciona el tipo de negocio.
  await expect(page.getByRole('radio', { name: /Tienda, mini o bodega/ })).toBeChecked();
  await page.getByRole('radio', { name: /Tienda, mini o bodega/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /Fregadora/ })).toBeChecked();
  // Con teclado no avanza solo; se confirma con Enter.
  await expect(page.getByRole('heading', { name: '¿Qué tipo de negocio tienes?' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '¿Qué necesitas mejorar?' })).toBeFocused();
  await expect(page.getByText('Paso 2 de 6', { exact: true })).toBeVisible();
  await page.getByText('Reportes').click();
  await page.getByRole('button', { name: /Continuar/ }).click();
  await page.getByText('6 a 15').click();
  await expect(page.getByText('Paso 4 de 6', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(page.getByRole('radio', { name: '6 a 15' })).toBeChecked();
  await page.reload();
  await expect(page.getByText('Paso 3 de 6', { exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: '6 a 15' })).toBeChecked();
  await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(page.getByRole('checkbox', { name: 'Reportes' })).toBeChecked();
});

test('reserva completa con confirmación', async ({ page, consoleErrors }, info) => {
  await fillFunnel(page);
  await expect(page.getByText(/Gracias, María/)).toBeVisible();
  const day = page.locator('.cal-day:not([disabled])').first();
  await expect(day).toBeVisible();
  await expect(page.locator('.cal-time').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('calendario.png'), fullPage: true });
  const timeText = (await page.locator('.cal-time').nth(1).textContent()).trim();
  await page.locator('.cal-time').nth(1).click();
  await expect(page.getByText('Has elegido')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar demostración' }).click();

  await expect(page.getByRole('heading', { name: '¡Listo, María! Tu demostración está confirmada.' })).toBeVisible();
  await expect(page.locator('[data-sum="when"]')).toContainText(timeText);
  await expect(page.locator('[data-sum="when"]')).toContainText('Cuba (La Habana)');
  await expect(page.locator('[data-sum="contact"]')).toHaveText('WhatsApp +5351234567');
  await expect(page.locator('[data-sum="business"]')).toHaveText('Café La Esquina');
  // Sin proveedores configurados no se afirma ningún envío.
  await expect(page.locator('[data-notify]')).not.toContainText('Te enviamos');
  await expect(page.locator('[data-notify]')).toContainText('Guarda esta confirmación');
  await expect(page.locator('[data-manage]')).toHaveAttribute('href', /\/book-demo\/gestionar\/#t=/);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Añadir a mi calendario' }).click();
  const ics = await (await download).path();
  const fs = await import('node:fs/promises');
  const text = await fs.readFile(ics, 'utf8');
  expect(text).toContain('BEGIN:VEVENT');
  expect(text).toContain('SUMMARY:Demostración de NexoPOS');
  await page.screenshot({ path: info.outputPath('confirmacion.png'), fullPage: true });

  const [lead] = await sql('SELECT status, priority, score, needs FROM leads');
  expect(lead).toMatchObject({ status: 'demo_programada', priority: 'alta' });
  const [b] = await sql(`SELECT count(*)::int AS n FROM bookings WHERE status = 'confirmada'`);
  expect(b.n).toBe(1);
  const events = (await sql(`SELECT DISTINCT name FROM funnel_events ORDER BY 1`)).map((r) => r.name);
  expect(events).toEqual(expect.arrayContaining(['funnel_start', 'step_view', 'step_complete', 'lead_created', 'slot_selected', 'booking_created']));
  expect(consoleErrors).toEqual([]);
});

test('dos personas eligen el mismo horario: la segunda recibe aviso y otro horario', async ({ browser }) => {
  const a = await browser.newContext({ timezoneId: 'America/Havana' });
  const b = await browser.newContext({ timezoneId: 'America/Havana' });
  const pa = await a.newPage();
  const pb = await b.newPage();
  await fillFunnel(pa, { whatsapp: '+5350000001', name: 'Ana Uno' });
  await fillFunnel(pb, { whatsapp: '+5350000002', name: 'Beto Dos' });
  await pa.locator('.cal-time').first().click();
  await pb.locator('.cal-time').first().click();
  const chosen = await pb.locator('.cal-time[aria-pressed="true"]').textContent();
  await pa.getByRole('button', { name: 'Confirmar demostración' }).click();
  await expect(pa.getByRole('heading', { name: /Tu demostración está confirmada/ })).toBeVisible();
  await pb.getByRole('button', { name: 'Confirmar demostración' }).click();
  await expect(pb.getByText(/Ese horario ya no está disponible|se acaba de ocupar/)).toBeVisible();
  // El calendario se recarga sin el horario ocupado.
  await expect(pb.locator('.cal-time').first()).not.toHaveText(chosen);
  await pb.locator('.cal-time').first().click();
  await pb.getByRole('button', { name: 'Confirmar demostración' }).click();
  await expect(pb.getByRole('heading', { name: /Tu demostración está confirmada/ })).toBeVisible();
  const rows = await sql(`SELECT starts_at FROM bookings WHERE status = 'confirmada'`);
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((r) => +r.starts_at)).size).toBe(2);
  expect((await sql(`SELECT count(*)::int AS n FROM funnel_events WHERE name = 'booking_conflict'`))[0].n).toBe(1);
  await a.close();
  await b.close();
});

test('reprogramar y cancelar con el enlace seguro', async ({ page, consoleErrors }, info) => {
  await fillFunnel(page);
  await page.locator('.cal-time').first().click();
  await page.getByRole('button', { name: 'Confirmar demostración' }).click();
  await expect(page.getByRole('heading', { name: /Tu demostración está confirmada/ })).toBeVisible();
  const href = await page.locator('[data-manage]').getAttribute('href');
  await page.goto(href);
  await expect(page.getByRole('heading', { name: 'Tu demostración está confirmada' })).toBeVisible();
  await page.getByRole('button', { name: 'Cambiar fecha u hora' }).click();
  await expect(page.locator('.cal-time').first()).toBeVisible();
  await page.locator('.cal-time').nth(3).click();
  await page.getByRole('button', { name: 'Cambiar a este horario' }).click();
  await expect(page.getByRole('heading', { name: 'Listo, cambiamos tu demostración' })).toBeVisible();
  // El enlace antiguo deja de funcionar.
  const old = await page.request.post('/api/manage/lookup', { data: { token: new URL(href).hash.slice(3) } });
  expect(old.status()).toBe(404);
  await page.getByRole('button', { name: 'Cancelar demostración' }).click();
  await page.getByLabel(/Motivo/).fill('Me surgió un viaje');
  await page.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(page.getByRole('heading', { name: 'Cancelamos tu demostración' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('gestion-cancelada.png'), fullPage: true });
  const [bk] = await sql('SELECT status, cancel_reason, reschedule_count FROM bookings');
  expect(bk).toEqual({ status: 'cancelada', cancel_reason: 'Me surgió un viaje', reschedule_count: 1 });
  await page.goto('/book-demo/gestionar/#t=enlace-falso');
  await expect(page.getByRole('heading', { name: 'No pudimos abrir tu reserva' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('sin horarios configurados no se inventan horarios', async ({ page }) => {
  await resetData({ hours: false });
  await fillFunnel(page);
  await expect(page.getByText('Ahora mismo no hay horarios libres en los próximos días.')).toBeVisible();
  await expect(page.locator('.cal-time')).toHaveCount(0);
  expect((await sql('SELECT count(*)::int AS n FROM leads'))[0].n).toBe(1);
});

test('estado de carga y error del calendario', async ({ page }) => {
  let fail = true;
  await page.route('**/api/slots', async (route) => {
    if (fail) { fail = false; await new Promise((r) => setTimeout(r, 600)); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"x"}' }); }
    return route.continue();
  });
  await fillFunnel(page);
  await expect(page.getByText('El calendario no está disponible ahora mismo.')).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.locator('.cal-time').first()).toBeVisible();
});

test('si la API no responde, ofrece WhatsApp sin perder respuestas', async ({ page }) => {
  await page.route('**/api/leads', (route) => route.fulfill({ status: 503, contentType: 'text/html', body: '<h1>caído</h1>' }));
  await page.goto('/book-demo/');
  await page.getByText('Cafetería, restaurante o bar').click();
  await page.getByText('Registro de ventas').click();
  await page.getByRole('button', { name: /Continuar/ }).click();
  await page.getByText('Solo yo').click();
  await page.getByText('Durante este mes').click();
  await page.getByLabel('Tu nombre').fill('Luis');
  await page.getByLabel('Nombre del negocio').fill('Bar Luis');
  await page.getByLabel('WhatsApp', { exact: true }).fill('+5352223333');
  await page.getByRole('checkbox', { name: /Acepto que NexoPOS/ }).check();
  await page.getByRole('button', { name: /Ver horarios disponibles/ }).click();
  await expect(page.getByText('No pudimos conectar con el sistema de reservas.')).toBeVisible();
  const wa = page.getByRole('link', { name: 'Enviar por WhatsApp' });
  await expect(wa).toHaveAttribute('href', /wa\.me\/5363715593\?text=.*Bar%20Luis/);
  await expect(page.getByLabel('Tu nombre')).toHaveValue('Luis');
});
