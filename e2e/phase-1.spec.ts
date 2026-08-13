import { expect, test } from '@playwright/test';

const administratorEmail = 'e2e-admin@example.test';
const administratorPassword = 'Local-E2E-Admin-42!';
const invitedEmail = 'e2e-member@example.test';
const invitedPassword = 'Local-E2E-Member-42!';

test.setTimeout(120_000);

test('bootstrap, administration, invitation, authorization and logout', async ({
  browser,
  context,
  page,
}) => {
  const bootstrapLink = process.env.E2E_BOOTSTRAP_LINK;
  if (!bootstrapLink) throw new Error('E2E_BOOTSTRAP_LINK is required');
  page.on('requestfailed', (failedRequest) => {
    const url = new URL(failedRequest.url());
    if (url.pathname.startsWith('/api/')) {
      console.error(
        `API request failed: ${url.origin}${url.pathname} (${failedRequest.failure()?.errorText})`,
      );
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`Browser console: ${message.text()}`);
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto(bootstrapLink);
  await expect(page.getByRole('heading', { name: 'Organisation einrichten.' })).toBeVisible();
  await page.getByLabel('Name des Administrators').fill('E2E Administrator');
  await page.getByLabel('E-Mail-Adresse').fill(administratorEmail);
  await page.locator('input[name="password"]').fill(administratorPassword);
  await page.locator('input[name="passwordConfirmation"]').fill(administratorPassword);
  await page.getByLabel('Organisation').fill('E2E Venue');
  await page.getByLabel('Location').fill('E2E Main Hall');
  await page.getByRole('button', { name: 'Ersteinrichtung abschließen' }).click();
  await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();

  await page.getByLabel('E-Mail-Adresse').fill(administratorEmail);
  await page.locator('input[name="password"]').fill(administratorPassword);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Venue' })).toBeVisible();
  const organizationId = new URL(page.url()).pathname.split('/')[2]!;

  await page.getByRole('link', { name: 'Organisation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Organisation' })).toBeVisible();
  await page.getByLabel('Rechtlicher Name').fill('E2E Venue GmbH');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Die Organisationsdaten wurden gespeichert.')).toBeVisible();

  await page.getByRole('link', { name: 'Location', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Location' })).toBeVisible();
  await page.getByLabel('Kapazität').fill('600');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Die Locationdaten wurden gespeichert.')).toBeVisible();

  await page.getByRole('link', { name: 'Team', exact: true }).click();
  await page.getByLabel('E-Mail-Adresse').fill(invitedEmail);
  await page
    .locator('.invitation-form')
    .getByRole('checkbox', { name: /Lesend/ })
    .check();
  await page.getByRole('button', { name: 'Einladungslink erstellen' }).click();
  await expect(page.getByText(/Der Link wird nur jetzt vollständig angezeigt/)).toBeVisible();
  const invitationLink = await page.getByLabel('Einladungslink').inputValue();
  await page.getByRole('button', { name: 'Link kopieren' }).click();
  await expect(page.getByText('Der Einladungslink wurde kopiert.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(invitationLink);

  const invitedContext = await browser.newContext();
  const invitedPage = await invitedContext.newPage();
  await invitedPage.goto(invitationLink);
  await expect(invitedPage.getByRole('heading', { name: 'E2E Venue beitreten.' })).toBeVisible();
  await invitedPage.getByLabel('Ihr Name').fill('E2E Member');
  await invitedPage.locator('input[name="password"]').fill(invitedPassword);
  await invitedPage.locator('input[name="passwordConfirmation"]').fill(invitedPassword);
  await invitedPage.getByRole('button', { name: 'Konto anlegen und Einladung annehmen' }).click();
  await expect(invitedPage.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
  await invitedPage.getByLabel('E-Mail-Adresse').fill(invitedEmail);
  await invitedPage.locator('input[name="password"]').fill(invitedPassword);
  await invitedPage.getByRole('button', { name: 'Anmelden' }).click();
  await expect(invitedPage.getByRole('heading', { name: 'E2E Venue' })).toBeVisible();
  await expect(invitedPage.getByRole('link', { name: 'Team', exact: true })).toHaveCount(0);

  const forbidden = await invitedContext.request.patch(
    new URL(`/api/v1/organizations/${organizationId}`, invitedPage.url()).toString(),
    { data: { version: 2, phone: '+49 30 000000' } },
  );
  expect(forbidden.status()).toBe(403);

  await invitedPage.getByRole('button', { name: 'Abmelden' }).click();
  await expect(invitedPage.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
  await invitedPage.goto(`/o/${organizationId}`);
  await expect(invitedPage.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
  await invitedContext.close();
});
