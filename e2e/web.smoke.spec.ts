import { expect, test } from '@playwright/test';

test('shows the neutral Phase 0 foundation page', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Die Projektgrundlage ist eingerichtet.' }),
  ).toBeVisible();
  await expect(page.getByText('Keine fachlichen Funktionen aktiviert')).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
});
