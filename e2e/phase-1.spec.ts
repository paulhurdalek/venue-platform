import { expect, test, type Page } from '@playwright/test';

const administratorEmail = 'e2e-admin@example.test';
const administratorPassword = 'Local-E2E-Admin-42!';
const invitedEmail = 'e2e-member@example.test';
const invitedPassword = 'Local-E2E-Member-42!';

async function exerciseLifecycle(
  page: Page,
  entityLabel: 'Artist' | 'Kontakt' | 'Geschäftspartner',
  options: { cancel?: boolean; keyboard?: boolean } = {},
) {
  const statusBadge = page.locator('.page-heading .status-badge').first();
  const trigger = page.getByRole('button', { name: 'Weitere Aktionen', exact: true });

  await expect(page.getByRole('heading', { name: 'Lebenszyklus', exact: true })).toHaveCount(0);
  await expect(page.locator('.danger-zone')).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  if (options.keyboard) {
    await trigger.press('ArrowDown');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: `${entityLabel} archivieren`, exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }

  if (options.cancel) {
    await trigger.click();
    await page.getByRole('menuitem', { name: `${entityLabel} archivieren`, exact: true }).click();
    const cancelDialog = page.getByRole('dialog', {
      name: `${entityLabel} archivieren?`,
      exact: true,
    });
    await expect(cancelDialog.getByText(`Der ${entityLabel} wird archiviert.`)).toBeVisible();
    await expect(
      cancelDialog.getByText('Bestehende Verknüpfungen bleiben erhalten.'),
    ).toBeVisible();
    await expect(
      cancelDialog.getByText('Der Datensatz steht für neue Zuordnungen nicht mehr zur Verfügung.'),
    ).toBeVisible();
    await expect(cancelDialog.getByText('Er kann später wieder reaktiviert werden.')).toBeVisible();
    await cancelDialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(cancelDialog).toHaveCount(0);
    await expect(statusBadge).toHaveText('Aktiv');
    await expect(trigger).toBeFocused();
  }

  await trigger.click();
  await page.getByRole('menuitem', { name: `${entityLabel} archivieren`, exact: true }).click();
  const archiveDialog = page.getByRole('dialog', {
    name: `${entityLabel} archivieren?`,
    exact: true,
  });
  await archiveDialog.getByRole('button', { name: 'Archivieren', exact: true }).click();
  await expect(statusBadge).toHaveText('Archiviert');
  await expect(page.getByText(`Der ${entityLabel} wurde archiviert.`)).toBeVisible();

  await trigger.click();
  await page.getByRole('menuitem', { name: 'Reaktivieren', exact: true }).click();
  const reactivateDialog = page.getByRole('dialog', {
    name: `${entityLabel} reaktivieren?`,
    exact: true,
  });
  await reactivateDialog.getByRole('button', { name: 'Reaktivieren', exact: true }).click();
  await expect(statusBadge).toHaveText('Aktiv');
  await expect(page.getByText(`Der ${entityLabel} wurde reaktiviert.`)).toBeVisible();
}

test.setTimeout(180_000);

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
  await expect(
    page.getByRole('heading', { name: 'Organisation einrichten.', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Name des Administrators').fill('E2E Administrator');
  await page.getByLabel('E-Mail-Adresse').fill(administratorEmail);
  await page.locator('input[name="password"]').fill(administratorPassword);
  await page.locator('input[name="passwordConfirmation"]').fill(administratorPassword);
  await page.getByLabel('Organisation').fill('E2E Venue');
  await page.getByLabel('Location').fill('E2E Main Hall');
  await page.getByRole('button', { name: 'Ersteinrichtung abschließen' }).click();
  await expect(
    page.getByRole('heading', { name: 'Willkommen zurück.', exact: true }),
  ).toBeVisible();

  await page.getByLabel('E-Mail-Adresse').fill(administratorEmail);
  await page.locator('input[name="password"]').fill(administratorPassword);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Venue', exact: true })).toBeVisible();
  const organizationId = new URL(page.url()).pathname.split('/')[2]!;

  await page.getByRole('link', { name: 'Organisation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Organisation', exact: true })).toBeVisible();
  await expect(page.getByLabel('Rechtlicher Name')).toHaveCount(0);
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.getByLabel('Rechtlicher Name').fill('E2E Venue GmbH');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Die Organisationsdaten wurden gespeichert.')).toBeVisible();
  await expect(page.getByLabel('Rechtlicher Name')).toHaveCount(0);
  await expect(page.getByText('E2E Venue GmbH', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Location', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Location', exact: true })).toBeVisible();
  await expect(page.getByLabel('Kapazität')).toHaveCount(0);
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
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
  await expect(page.getByLabel('Kapazität')).toHaveCount(0);
  await expect(page.getByText('600', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await expect(page.getByLabel('Ländercode')).toHaveValue('DE');
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page.getByLabel('Ländercode')).toHaveCount(0);

  await page.getByRole('link', { name: 'Artists', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Artists', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Artist anlegen', exact: true }).click();
  await page.getByLabel(/^Künstlername\b/).fill('E2E Echo Unit');
  await page.getByRole('button', { name: 'Artist anlegen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'E2E Echo Unit', exact: true })).toBeVisible();
  const artistDetailPath = new URL(page.url()).pathname;
  await expect(page.getByText('Unvollständig', { exact: true })).toBeVisible();
  await expect(page.locator('input[name="stageName"]')).toHaveCount(0);
  await expect(page.getByText('Instagram', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.getByLabel(/^Website\b/).fill('https://discarded.example.test');
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page.locator('input[name="website"]')).toHaveCount(0);
  await expect(page.getByText('https://discarded.example.test', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.getByLabel(/^Website\b/).fill('https://artist.example.test');
  await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(page.getByText('Die Artist-Stammdaten wurden gespeichert.')).toBeVisible();
  await expect(page.locator('input[name="website"]')).toHaveCount(0);
  await expect(page.locator('a[href="https://artist.example.test/"]')).toBeVisible();
  await exerciseLifecycle(page, 'Artist', { cancel: true, keyboard: true });

  await page.getByRole('link', { name: 'Kontakte', exact: true }).click();
  await page.getByRole('link', { name: 'Kontakt anlegen', exact: true }).click();
  await page.getByLabel(/^Vorname\b/).fill('Mara');
  await page.getByLabel(/^Nachname\b/).fill('E2E');
  await page.getByLabel(/^E-Mail\b/).fill('mara.e2e@example.test');
  await page.getByLabel(/^Telefon\b/).fill('+49 30 5551234');
  await page.getByLabel(/^Mobiltelefon\b/).fill('+49 171 5551234');
  await page.getByRole('button', { name: 'Kontakt anlegen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mara E2E', exact: true })).toBeVisible();
  const contactDetailPath = new URL(page.url()).pathname;
  await expect(page.locator('input[name="firstName"]')).toHaveCount(0);
  await expect(page.locator('a[href="mailto:mara.e2e@example.test"]')).toBeVisible();
  await expect(page.locator('a[href="tel:+49305551234"]')).toBeVisible();
  await expect(page.locator('a[href="tel:+491715551234"]')).toBeVisible();
  await exerciseLifecycle(page, 'Kontakt');
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await expect(page.locator('input[name="firstName"]')).toHaveValue('Mara');
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page.locator('input[name="firstName"]')).toHaveCount(0);

  await page.getByRole('link', { name: 'Kontakte', exact: true }).click();
  await page.getByRole('link', { name: 'Kontakt anlegen', exact: true }).click();
  await page.getByLabel(/^Vorname\b/).fill('Juno');
  await page.getByLabel(/^Nachname\b/).fill('E2E');
  await page.getByLabel(/^Funktion\b/).fill('Management');
  await page.getByLabel(/^E-Mail\b/).fill('juno.e2e@example.test');
  await page.getByLabel(/^Mobiltelefon\b/).fill('+49 172 5559876');
  await page.getByRole('button', { name: 'Kontakt anlegen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Juno E2E', exact: true })).toBeVisible();
  await expect(page.locator('input[name="firstName"]')).toHaveCount(0);

  await page.getByRole('link', { name: 'Artists', exact: true }).click();
  await page.getByRole('link', { name: 'E2E Echo Unit', exact: true }).click();
  await expect(page.locator('.association-create')).toHaveCount(0);
  await page.getByRole('button', { name: 'Direkte Kontakte bearbeiten', exact: true }).click();
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
  await artistContactForm
    .getByRole('button', { name: 'Neuen Ansprechpartner anlegen', exact: true })
    .click();
  await artistContactForm.getByLabel(/^Vorname\b/).fill('Dina');
  await artistContactForm.getByLabel(/^Nachname\b/).fill('Direkt');
  await artistContactForm.getByLabel(/^E-Mail\b/).fill('dina.direct@example.test');
  await artistContactForm
    .getByRole('checkbox', { name: 'Persönlicher Kontakt', exact: true })
    .check();
  await artistContactForm
    .getByRole('button', { name: 'Ansprechpartner anlegen', exact: true })
    .click();
  await expect(page.getByRole('link', { name: 'Dina Direkt', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Geschäftspartner', exact: true }).click();
  await page.getByRole('link', { name: 'Geschäftspartner anlegen', exact: true }).click();
  await page.getByLabel('Firmenname', { exact: true }).fill('E2E Kulturservice GmbH');
  await page.getByRole('checkbox', { name: 'Kunde', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Agentur', exact: true }).check();
  await page.getByRole('button', { name: 'Geschäftspartner anlegen', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'E2E Kulturservice GmbH', exact: true }),
  ).toBeVisible();
  const partnerDetailPath = new URL(page.url()).pathname;
  await expect(page.locator('input[name="companyName"]')).toHaveCount(0);
  await expect(page.getByText('Agentur', { exact: true })).toBeVisible();
  await expect(page.getByText('Kunde', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await expect(page.locator('input[name="companyName"]')).toHaveValue('E2E Kulturservice GmbH');
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page.locator('input[name="companyName"]')).toHaveCount(0);
  await expect(page.locator('.association-create')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ansprechpartner hinzufügen', exact: true }).click();
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
  await partnerContactSelect.selectOption({ label: 'Juno E2E' });
  await partnerContactForm.getByRole('checkbox', { name: 'Booking', exact: true }).uncheck();
  await partnerContactForm.getByRole('checkbox', { name: 'Management', exact: true }).check();
  await partnerContactForm.getByRole('button', { name: 'Kontakt verknüpfen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Juno E2E', exact: true })).toBeVisible();
  await partnerContactForm
    .getByRole('button', { name: 'Neuen Ansprechpartner anlegen', exact: true })
    .click();
  await partnerContactForm.getByLabel(/^Vorname\b/).fill('Pia');
  await partnerContactForm.getByLabel(/^Nachname\b/).fill('Firma');
  await partnerContactForm.getByLabel(/^E-Mail\b/).fill('pia.firma@example.test');
  await partnerContactForm.getByRole('checkbox', { name: 'Technik', exact: true }).check();
  await partnerContactForm
    .getByRole('button', { name: 'Ansprechpartner anlegen', exact: true })
    .click();
  await expect(page.getByRole('link', { name: 'Pia Firma', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Artists', exact: true }).click();
  await page.getByRole('link', { name: 'E2E Echo Unit', exact: true }).click();
  await expect(page.locator('.representation-create')).toHaveCount(0);
  await page.getByRole('button', { name: 'Vertretungen bearbeiten', exact: true }).click();
  const representationForm = page.locator('.representation-create');
  await representationForm
    .getByRole('combobox', { name: 'Agentur/Firma auswählen', exact: true })
    .selectOption({ label: 'E2E Kulturservice GmbH' });
  await representationForm
    .getByRole('group', { name: 'Rollen der Agentur/Firma für diesen Artist', exact: true })
    .getByRole('checkbox', { name: 'Agentur', exact: true })
    .check();
  const representationContactSelect = representationForm.getByRole('combobox', {
    name: 'Ansprechpartner dieser Agentur',
    exact: true,
  });
  const junoPartnerContactId = await representationContactSelect
    .locator('option', { hasText: 'Juno E2E' })
    .getAttribute('value');
  expect(junoPartnerContactId).toBeTruthy();
  await representationContactSelect.selectOption(junoPartnerContactId!);
  await expect(
    representationForm
      .getByRole('combobox', { name: 'Ansprechpartner dieser Agentur', exact: true })
      .locator('option', { hasText: 'Mara E2E' }),
  ).toHaveCount(0);
  await representationForm
    .getByRole('group', { name: 'Zuständigkeit für diesen Artist', exact: true })
    .getByRole('checkbox', { name: 'Booking', exact: true })
    .check();
  await representationForm
    .getByRole('checkbox', { name: 'Hauptansprechpartner', exact: true })
    .check();
  await representationForm
    .getByRole('button', { name: 'Vertretung verknüpfen', exact: true })
    .click();

  const representativeAddForm = page.locator('.representative-add');
  await expect(representativeAddForm).toBeVisible();
  await representativeAddForm
    .getByRole('button', { name: 'Neuen Ansprechpartner anlegen', exact: true })
    .click();
  await representativeAddForm.getByLabel(/^Vorname\b/).fill('Nova');
  await representativeAddForm.getByLabel(/^Nachname\b/).fill('Inline');
  await representativeAddForm.getByLabel(/^Funktion oder Bezeichnung\b/).fill('Tour Management');
  await representativeAddForm.getByLabel(/^E-Mail\b/).fill('nova.inline@example.test');
  await representativeAddForm.getByLabel(/^Mobiltelefon\b/).fill('+49 173 5554321');
  await representativeAddForm.getByRole('checkbox', { name: 'Management', exact: true }).check();
  await representativeAddForm
    .getByRole('button', { name: 'Ansprechpartner anlegen', exact: true })
    .click();
  await expect(page.locator('.representative-card')).toHaveCount(2);
  await expect(page.locator('.representative-card').nth(0)).toContainText('Juno E2E');
  await expect(page.locator('.representative-card').nth(1)).toContainText('Nova Inline');
  await expect(page.locator('.representative-add')).toHaveCount(0);

  const representationCard = page.locator('.representation-card');
  await expect(
    representationCard.getByRole('link', { name: 'E2E Kulturservice GmbH', exact: true }),
  ).toBeVisible();
  await expect(
    representationCard
      .locator('.representation-card__header')
      .getByText('Agentur', { exact: true }),
  ).toBeVisible();
  await expect(
    representationCard.getByRole('link', { name: 'Juno E2E', exact: true }),
  ).toBeVisible();
  await expect(
    representationCard.locator('.representative-card .role-summary').getByText('Booking', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(representationCard.locator('.status-badge--primary')).toHaveText(
    'Hauptansprechpartner',
  );
  await expect(representationCard.locator('a[href="mailto:juno.e2e@example.test"]')).toBeVisible();
  await expect(representationCard.locator('a[href="tel:+491725559876"]')).toBeVisible();
  await expect(
    representationCard.locator('a[href="mailto:nova.inline@example.test"]'),
  ).toBeVisible();

  const directContactCard = page.locator('.association-card').filter({ hasText: 'Mara E2E' });
  await expect(directContactCard.locator('a[href="mailto:mara.e2e@example.test"]')).toBeVisible();
  await expect(directContactCard.locator('a[href="tel:+49305551234"]')).toBeVisible();
  await expect(directContactCard.locator('a[href="tel:+491715551234"]')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole('link', { name: 'Artists', exact: true }).click();
  const artistRow = page
    .locator('.master-data-table tbody tr')
    .filter({ hasText: 'E2E Echo Unit' });
  await expect(
    artistRow.getByRole('link', { name: 'E2E Kulturservice GmbH', exact: true }),
  ).toBeVisible();
  await expect(artistRow.getByRole('link', { name: 'Juno E2E', exact: true })).toBeVisible();
  await expect(artistRow.locator('a[href="mailto:juno.e2e@example.test"]')).toBeVisible();
  await expect(artistRow.locator('a[href="tel:+491725559876"]')).toBeVisible();

  await page.getByRole('link', { name: 'Geschäftspartner', exact: true }).click();
  await page.getByRole('link', { name: 'E2E Kulturservice GmbH', exact: true }).click();

  await exerciseLifecycle(page, 'Geschäftspartner');

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
  await expect(
    invitedPage.getByRole('heading', { name: 'E2E Venue beitreten.', exact: true }),
  ).toBeVisible();
  await invitedPage.getByLabel('Ihr Name').fill('E2E Member');
  await invitedPage.locator('input[name="password"]').fill(invitedPassword);
  await invitedPage.locator('input[name="passwordConfirmation"]').fill(invitedPassword);
  await invitedPage.getByRole('button', { name: 'Konto anlegen und Einladung annehmen' }).click();
  await expect(
    invitedPage.getByRole('heading', { name: 'Willkommen zurück.', exact: true }),
  ).toBeVisible();
  await invitedPage.getByLabel('E-Mail-Adresse').fill(invitedEmail);
  await invitedPage.locator('input[name="password"]').fill(invitedPassword);
  await invitedPage.getByRole('button', { name: 'Anmelden' }).click();
  await expect(invitedPage.getByRole('heading', { name: 'E2E Venue', exact: true })).toBeVisible();
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
  await invitedPage.getByRole('link', { name: 'E2E Echo Unit', exact: true }).click();
  const readOnlyRepresentation = invitedPage.locator('.representation-card');
  await expect(
    readOnlyRepresentation.getByRole('link', {
      name: 'E2E Kulturservice GmbH',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    readOnlyRepresentation.locator('a[href="mailto:juno.e2e@example.test"]'),
  ).toBeVisible();
  await expect(invitedPage.getByRole('button', { name: 'Bearbeiten', exact: true })).toHaveCount(0);
  await expect(
    invitedPage.getByRole('button', { name: 'Vertretungen bearbeiten', exact: true }),
  ).toHaveCount(0);
  await expect(
    invitedPage.getByRole('button', { name: 'Direkte Kontakte bearbeiten', exact: true }),
  ).toHaveCount(0);
  await expect(invitedPage.locator('input[name="stageName"]')).toHaveCount(0);
  await expect(
    invitedPage.getByRole('button', { name: 'Weitere Aktionen', exact: true }),
  ).toHaveCount(0);
  await expect(
    invitedPage.getByRole('button', { name: 'Vertretung lösen', exact: true }),
  ).toHaveCount(0);

  await invitedPage.goto(contactDetailPath);
  await expect(invitedPage.getByRole('heading', { name: 'Mara E2E', exact: true })).toBeVisible();
  await expect(
    invitedPage.getByRole('button', { name: 'Weitere Aktionen', exact: true }),
  ).toHaveCount(0);
  await invitedPage.goto(partnerDetailPath);
  await expect(
    invitedPage.getByRole('heading', { name: 'E2E Kulturservice GmbH', exact: true }),
  ).toBeVisible();
  await expect(
    invitedPage.getByRole('button', { name: 'Weitere Aktionen', exact: true }),
  ).toHaveCount(0);
  await invitedPage.goto(artistDetailPath);

  const forbidden = await invitedContext.request.patch(
    new URL(`/api/v1/organizations/${organizationId}`, invitedPage.url()).toString(),
    { data: { version: 2, phone: '+49 30 000000' } },
  );
  expect(forbidden.status()).toBe(403);

  await invitedPage.getByRole('button', { name: 'Abmelden' }).click();
  await expect(
    invitedPage.getByRole('heading', { name: 'Willkommen zurück.', exact: true }),
  ).toBeVisible();
  await invitedPage.goto(`/o/${organizationId}`);
  await expect(
    invitedPage.getByRole('heading', { name: 'Willkommen zurück.', exact: true }),
  ).toBeVisible();
  await invitedContext.close();
});
