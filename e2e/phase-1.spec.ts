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
  const countryCode = page.getByLabel('Ländercode');
  await expect(countryCode).toHaveAttribute('pattern', '[A-Za-z]{2}');
  await countryCode.fill('49');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(
    page.getByText('Der Ländercode muss aus zwei Buchstaben bestehen, zum Beispiel DE.'),
  ).toBeVisible();
  await expect(countryCode).toBeFocused();

  await countryCode.fill('de');
  await expect(countryCode).toHaveValue('DE');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Die Locationdaten wurden gespeichert.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Ländercode')).toHaveValue('DE');

  await page.getByRole('link', { name: 'Artists', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Artists', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Artist anlegen', exact: true }).click();
  await page.getByLabel(/^Künstlername\b/).fill('E2E Echo Unit');
  await page.getByRole('button', { name: 'Artist anlegen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'E2E Echo Unit', exact: true })).toBeVisible();
  await expect(page.getByText('Unvollständig', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Kontakte', exact: true }).click();
  await page.getByRole('link', { name: 'Kontakt anlegen', exact: true }).click();
  await page.getByLabel(/^Vorname\b/).fill('Mara');
  await page.getByLabel(/^Nachname\b/).fill('E2E');
  await page.getByLabel(/^E-Mail\b/).fill('mara.e2e@example.test');
  await page.getByRole('button', { name: 'Kontakt anlegen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mara E2E', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Artists', exact: true }).click();
  await page.getByRole('link', { name: 'E2E Echo Unit', exact: true }).click();
  const artistContactForm = page.locator('.association-create');
  const artistContactSelect = page.getByRole('combobox', {
    name: 'Kontakt auswählen',
    exact: true,
  });
  await expect(artistContactSelect).toBeVisible();
  await artistContactSelect.selectOption({ label: 'Mara E2E' });
  await artistContactForm.getByRole('checkbox', { name: 'Management', exact: true }).check();
  await artistContactForm.getByRole('button', { name: 'Kontakt verknüpfen', exact: true }).click();
  await expect(page.getByText('Unvollständig', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Mara E2E', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Geschäftspartner', exact: true }).click();
  await page.getByRole('link', { name: 'Geschäftspartner anlegen', exact: true }).click();
  await page.getByLabel('Firmenname', { exact: true }).fill('E2E Kulturservice GmbH');
  await page.getByRole('checkbox', { name: 'Kunde', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Agentur', exact: true }).check();
  await page.getByRole('button', { name: 'Geschäftspartner anlegen', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'E2E Kulturservice GmbH', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Agentur, Kunde', { exact: true })).toBeVisible();
  const partnerContactForm = page.locator('.association-create');
  const partnerContactSelect = page.getByRole('combobox', {
    name: 'Kontakt auswählen',
    exact: true,
  });
  await expect(partnerContactSelect).toBeVisible();
  await partnerContactSelect.selectOption({ label: 'Mara E2E' });
  await partnerContactForm.getByRole('checkbox', { name: 'Booking', exact: true }).check();
  await partnerContactForm.getByRole('button', { name: 'Kontakt verknüpfen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mara E2E', exact: true })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Archivieren', exact: true }).click();
  await expect(page.getByText('Archiviert', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reaktivieren', exact: true }).click();
  await expect(page.getByText('Aktiv', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Team', exact: true }).click();
  await page.getByLabel('E-Mail-Adresse').fill(invitedEmail);
  await page
    .locator('.invitation-form')
    .getByRole('checkbox', { name: /^Lesend\b/ })
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
  await expect(invitedPage.getByRole('link', { name: 'Artists', exact: true })).toBeVisible();
  await expect(invitedPage.getByRole('link', { name: 'Kontakte', exact: true })).toBeVisible();
  await expect(
    invitedPage.getByRole('link', { name: 'Geschäftspartner', exact: true }),
  ).toBeVisible();
  await invitedPage.getByRole('link', { name: 'Artists', exact: true }).click();
  await expect(invitedPage.getByRole('link', { name: 'Artist anlegen', exact: true })).toHaveCount(
    0,
  );

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
