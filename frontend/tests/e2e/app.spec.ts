import { test, expect } from '@playwright/test';

const progression = 'Cm7 F7 | Bb7 Eb7';

test.describe('Generador de Montunos - flujo principal', () => {
  test('permite generar y preparar un montuno para descarga', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Generador de Montunos' })).toBeVisible();

    const progressionInput = page.locator('#progression');
    await progressionInput.fill('');
    await progressionInput.type(progression);

    await page.getByRole('button', { name: 'Generar montuno' }).click();

    await expect(page.locator('#summary-content')).toContainText('Compases');

    const chordsTableRows = page.locator('#chords tr');
    await expect(chordsTableRows).toHaveCount(4);

    const downloadButton = page.getByRole('button', { name: 'Descargar MIDI' });
    await expect(downloadButton).toBeEnabled();
  });
});
