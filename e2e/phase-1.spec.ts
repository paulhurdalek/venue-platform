import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const administratorEmail = 'e2e-admin@example.test';
const administratorPassword = 'Local-E2E-Admin-42!';
const invitedEmail = 'e2e-member@example.test';
const invitedPassword = 'Local-E2E-Member-42!';
const focusedScenarioTimeout = 180_000;
const e2eBaseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

function contrastRatio(foreground: string, background: string) {
  const luminance = (value: string) => {
    const channels = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function attachBrowserDiagnostics(page: Page) {
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
}

async function openOrganizationHome(page: Page, organizationId: string) {
  await page.goto(`/o/${organizationId}`);
  await expect(page.getByRole('heading', { name: 'E2E Venue', exact: true })).toBeVisible();
}

async function exerciseLifecycle(
  page: Page,
  entityLabel: 'Artist' | 'Kontakt' | 'Geschäftspartner' | 'Veranstaltungsformat',
  options: { cancel?: boolean; keyboard?: boolean } = {},
) {
  const entityArticle = entityLabel === 'Veranstaltungsformat' ? 'Das' : 'Der';
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
    await expect(
      cancelDialog.getByText(`${entityArticle} ${entityLabel} wird archiviert.`),
    ).toBeVisible();
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
  await expect(page.getByText(`${entityArticle} ${entityLabel} wurde archiviert.`)).toBeVisible();

  await trigger.click();
  await page.getByRole('menuitem', { name: 'Reaktivieren', exact: true }).click();
  const reactivateDialog = page.getByRole('dialog', {
    name: `${entityLabel} reaktivieren?`,
    exact: true,
  });
  await reactivateDialog.getByRole('button', { name: 'Reaktivieren', exact: true }).click();
  await expect(statusBadge).toHaveText('Aktiv');
  await expect(page.getByText(`${entityArticle} ${entityLabel} wurde reaktiviert.`)).toBeVisible();
}

test.describe.serial('Phase 1 through Phase 7 browser acceptance', () => {
  // Database reset and the one-time bootstrap link make the complete E2E command the retry boundary.
  test.describe.configure({ retries: 0, timeout: focusedScenarioTimeout });

  let administratorContext: BrowserContext;
  let page: Page;
  let organizationId = '';
  let eventFormatDetailPath = '';
  let eventDetailPath = '';
  let dateOptionDetailPath = '';
  let artistDetailPath = '';
  let contactDetailPath = '';
  let partnerDetailPath = '';
  let phase7ServiceDetailPath = '';
  let phase7EventDetailPath = '';

  test.beforeAll(async ({ browser }) => {
    administratorContext = await browser.newContext({ baseURL: e2eBaseUrl });
    await administratorContext.grantPermissions(['clipboard-read', 'clipboard-write']);
    page = await administratorContext.newPage();
    attachBrowserDiagnostics(page);
  });

  test.afterAll(async () => {
    await administratorContext?.close();
  });

  test('Phase 1: bootstrap and administrator sign-in', async () => {
    const bootstrapLink = process.env.E2E_BOOTSTRAP_LINK;
    if (!bootstrapLink) throw new Error('E2E_BOOTSTRAP_LINK is required');

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
    organizationId = new URL(page.url()).pathname.split('/')[2]!;
    expect(organizationId).toBeTruthy();
  });

  test('Phase 1: organization and location administration', async () => {
    await openOrganizationHome(page, organizationId);
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
  });

  test('Phase 4: event format creation, editing, lifecycle and responsive layout', async () => {
    await openOrganizationHome(page, organizationId);
    await page.getByRole('link', { name: 'Formate', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Veranstaltungsformate', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Noch keine Veranstaltungsformate angelegt.')).toBeVisible();
    await page.getByRole('link', { name: 'Veranstaltungsformat anlegen', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('E2E Late Show');
    const eventKind = page.getByRole('combobox', { name: 'Veranstaltungsart', exact: true });
    await expect(eventKind).toBeVisible();
    await expect(eventKind).toHaveValue('OWN_PRODUCTION');
    await eventKind.selectOption({ value: 'THIRD_PARTY_EVENT' });
    await expect(eventKind).toHaveValue('THIRD_PARTY_EVENT');
    await page.getByLabel('Get-in Technik').fill('16:00');
    await page.getByLabel('Get-in Artists').fill('17:30');
    await page.getByLabel('Einlass').fill('19:00');
    await page.getByLabel('Beginn').fill('20:00');
    await page.getByRole('textbox', { name: 'Ende optional', exact: true }).fill('01:30');
    await page.getByRole('combobox', { name: 'Tag des Endes', exact: true }).selectOption('NEXT');
    await page.getByRole('combobox', { name: 'Aufzeichnung', exact: true }).selectOption('ENABLED');
    await page.getByRole('button', { name: 'Veranstaltungsformat anlegen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'E2E Late Show', exact: true })).toBeVisible();
    eventFormatDetailPath = new URL(page.url()).pathname;
    await expect(page.locator('#event-format-detail-editor input[name="name"]')).toHaveCount(0);
    await expect(page.getByText('Fremdveranstaltung / Vermietung', { exact: true })).toBeVisible();
    await expect(page.getByText('01:30 (+1 Tag)', { exact: true })).toBeVisible();
    await expect(page.getByText('Standardmäßig aktiv', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await page.getByLabel('Beschreibung').fill('Dieser Entwurf wird verworfen.');
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(page.getByLabel('Beschreibung')).toHaveCount(0);
    await expect(page.getByText('Dieser Entwurf wird verworfen.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await page.getByLabel('Beschreibung').fill('Kompakte E2E Formatvorlage');
    await page
      .getByRole('combobox', { name: 'Aufzeichnung', exact: true })
      .selectOption('DISABLED');
    await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
    await expect(page.getByText('Das Veranstaltungsformat wurde gespeichert.')).toBeVisible();
    await expect(page.getByLabel('Beschreibung')).toHaveCount(0);
    await expect(page.getByText('Kompakte E2E Formatvorlage', { exact: true })).toBeVisible();
    await expect(page.getByText('Standardmäßig inaktiv', { exact: true })).toBeVisible();
    await exerciseLifecycle(page, 'Veranstaltungsformat', { cancel: true, keyboard: true });

    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('Phase 5: empty calendar and event creation from visible format defaults', async () => {
    await openOrganizationHome(page, organizationId);
    await page.getByRole('link', { name: 'Veranstaltungen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Veranstaltungen', exact: true })).toBeVisible();
    await expect(page.locator('.month-calendar')).toBeVisible();
    await expect(page.locator('.calendar-event')).toHaveCount(0);

    await page.getByRole('link', { name: 'Veranstaltung anlegen', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Veranstaltung anlegen', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Veranstaltungsformat')).toContainText('E2E Late Show');
    await expect(page.getByLabel('Veranstaltungsname')).toHaveValue('E2E Late Show');
    await expect(page.getByLabel('Get-in Technik')).toHaveValue('16:00');
    await expect(page.getByLabel('Get-in Artists')).toHaveValue('17:30');
    await expect(page.getByLabel('Einlass')).toHaveValue('19:00');
    await expect(page.getByLabel('Beginn')).toHaveValue('20:00');
    await expect(page.getByRole('textbox', { name: 'Ende optional', exact: true })).toHaveValue(
      '01:30',
    );
    await expect(page.getByLabel('Tag des Endes')).toHaveValue('NEXT');
    await expect(page.getByLabel('Location')).toHaveValue(/.+/);
    await page.getByLabel('Datum').fill('2026-08-23');
    await page.getByLabel('Veranstaltungsname').fill('E2E Venue Night');
    await page.getByRole('button', { name: 'Veranstaltung anlegen', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'E2E Venue Night', exact: true })).toBeVisible();
    eventDetailPath = new URL(page.url()).pathname;
    await expect(page.locator('#event-detail-editor input[name="name"]')).toHaveCount(0);
    await expect(
      page.locator('#event-detail-editor').getByText('E2E Late Show', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Fremdveranstaltung / Vermietung', { exact: true })).toBeVisible();
    await expect(page.getByText('01:30 (+1 Tag)', { exact: true })).toBeVisible();
    await expect(page.getByText('Inaktiv', { exact: true })).toBeVisible();
  });

  test('Phase 5: read-only detail, edit cancel/save and confirmed status', async () => {
    await page.goto(eventDetailPath);
    await expect(page.locator('#event-detail-editor input[name="name"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await page.getByLabel('Veranstaltungsname').fill('Dieser Entwurf wird verworfen');
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(page.getByText('Dieser Entwurf wird verworfen', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'E2E Venue Night', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await page.getByLabel('Beginn').fill('20:30');
    await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
    await expect(page.getByText('Die Veranstaltung wurde gespeichert.')).toBeVisible();
    await expect(page.getByText('20:30', { exact: true })).toBeVisible();
    await expect(page.locator('#event-detail-editor input[name="name"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Weitere Veranstaltungsaktionen' }).click();
    await page.getByRole('menuitem', { name: 'Status bearbeiten', exact: true }).click();
    let statusDialog = page.getByRole('dialog', { name: 'Status bearbeiten', exact: true });
    await statusDialog
      .getByRole('combobox', { name: 'Status', exact: true })
      .selectOption('CONFIRMED');
    await statusDialog.getByRole('button', { name: 'Status übernehmen', exact: true }).click();
    await expect(page.locator('.page-heading .status-badge')).toHaveText('Bestätigt');

    await page.getByRole('button', { name: 'Weitere Veranstaltungsaktionen' }).click();
    await page.getByRole('menuitem', { name: 'Status bearbeiten', exact: true }).click();
    statusDialog = page.getByRole('dialog', { name: 'Status bearbeiten', exact: true });
    await statusDialog
      .getByRole('combobox', { name: 'Status', exact: true })
      .selectOption('CANCELLED');
    await statusDialog.getByRole('button', { name: 'Änderung prüfen', exact: true }).click();
    const cancellation = page.getByRole('dialog', { name: 'Abgesagt bestätigen?', exact: true });
    await expect(cancellation).toBeVisible();
    await cancellation.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(cancellation).toHaveCount(0);
    await expect(page.locator('.page-heading .status-badge')).toHaveText('Bestätigt');
  });

  test('Phase 5: free event creation clears template values and shows manual review', async () => {
    await page.goto(`/o/${organizationId}/events/new`);
    await expect(page.getByLabel('Veranstaltungsname')).toHaveValue('E2E Late Show');
    await page.getByLabel('Ohne Vorlage', { exact: true }).check();
    await expect(page.getByLabel('Veranstaltungsformat')).toHaveCount(0);
    await expect(page.getByLabel('Veranstaltungsname')).toHaveValue('');
    await expect(page.getByLabel('Get-in Technik')).toHaveValue('');
    await page
      .getByRole('combobox', { name: 'Veranstaltungsart', exact: true })
      .selectOption('OWN_PRODUCTION');
    await page.getByLabel('Veranstaltungsname').fill('E2E Freies Event');
    await page.getByLabel('Datum').fill('2026-08-24');
    await page.getByRole('button', { name: 'Veranstaltung anlegen', exact: true }).click();

    await expect(
      page.getByRole('heading', { name: 'E2E Freies Event', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Ohne Vorlage', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Zeiten unvollständig – Konfliktprüfung nur eingeschränkt möglich', {
        exact: true,
      }),
    ).toBeVisible();
  });

  test('Phase 5: date option ranks, calendar markers and manual promotion', async () => {
    await page.goto(`/o/${organizationId}/events`);
    await page.getByRole('link', { name: 'Terminoption anlegen', exact: true }).click();
    await page.getByLabel('Bezeichnung').fill('E2E Erste Option');
    await page.getByLabel('Datum').fill('2026-08-26');
    await page.getByLabel('Belegungsbeginn').fill('16:00');
    await page.getByLabel('Belegungsende').fill('23:00');
    await page.getByRole('button', { name: 'Terminoption anlegen', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'E2E Erste Option', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('1. Option', { exact: true }).first()).toBeVisible();
    const firstOptionDetailPath = new URL(page.url()).pathname;

    await page.goto(`/o/${organizationId}/events/options/new`);
    await page.getByLabel('Bezeichnung').fill('E2E Zweite Option');
    await page.getByLabel('Datum').fill('2026-08-26');
    await page.getByLabel('Belegungsbeginn').fill('17:00');
    await page.getByLabel('Belegungsende').fill('22:00');
    await page.getByRole('button', { name: 'Terminoption anlegen', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'E2E Zweite Option', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('2. Option', { exact: true }).first()).toBeVisible();
    dateOptionDetailPath = new URL(page.url()).pathname;

    await page.goto(`/o/${organizationId}/events?view=calendar&month=2026-08`);
    await expect(
      page
        .locator('.month-calendar .calendar-option--first')
        .filter({ hasText: 'E2E Erste Option' }),
    ).toBeVisible();
    await expect(
      page
        .locator('.month-calendar .calendar-option--second')
        .filter({ hasText: 'E2E Zweite Option' }),
    ).toBeVisible();

    await page.goto(firstOptionDetailPath);
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Freigeben', exact: true }).click();
    await expect(page.locator('.page-heading .status-badge')).toHaveText('Freigegeben');

    await page.goto(dateOptionDetailPath);
    await expect(
      page.getByText('Kann zur 1. Option hochgestuft werden', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Zur 1. Option hochstufen', exact: true }).click();
    await expect(page.getByText('1. Option', { exact: true }).first()).toBeVisible();
  });

  test('Phase 5: weekday availability selection and safe clipboard text', async () => {
    await page.goto(`/o/${organizationId}/events?view=free`);
    const freeDatesNavigation = page.getByRole('link', { name: 'Freitermine', exact: true });
    const calendarNavigation = page.getByRole('link', { name: 'Kalender', exact: true });
    await expect(freeDatesNavigation).toHaveAttribute('aria-current', 'page');
    const unselectedStyles = await calendarNavigation.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        color: style.color,
      };
    });
    expect(unselectedStyles).toEqual({
      background: 'rgb(255, 255, 255)',
      border: 'rgb(22, 95, 74)',
      color: 'rgb(15, 81, 61)',
    });
    expect(
      contrastRatio(unselectedStyles.color, unselectedStyles.background),
    ).toBeGreaterThanOrEqual(4.5);
    const selectedStyles = await freeDatesNavigation.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        color: style.color,
        decoration: style.textDecorationLine,
      };
    });
    expect(selectedStyles).toEqual({
      background: 'rgb(22, 95, 74)',
      color: 'rgb(255, 255, 255)',
      decoration: 'underline',
    });
    expect(contrastRatio(selectedStyles.color, selectedStyles.background)).toBeGreaterThanOrEqual(
      4.5,
    );
    await calendarNavigation.hover();
    await expect(calendarNavigation).toHaveCSS('background-color', 'rgb(237, 247, 242)');
    await expect(calendarNavigation).toHaveCSS('color', 'rgb(15, 81, 61)');
    await calendarNavigation.focus();
    await expect(calendarNavigation).toHaveCSS('outline-width', '3px');
    const disabledCopy = page.getByRole('button', { name: 'Auswahl kopieren', exact: true });
    const disabledStyles = await disabledCopy.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    expect(disabledStyles).toEqual({
      background: 'rgb(232, 234, 231)',
      color: 'rgb(89, 97, 93)',
    });
    expect(contrastRatio(disabledStyles.color, disabledStyles.background)).toBeGreaterThanOrEqual(
      4.5,
    );
    await page.getByLabel('Von').fill('2026-08-27');
    await page.getByLabel('Bis').fill('2026-08-28');
    await page.getByLabel('Fr', { exact: true }).check();
    await page.getByRole('button', { name: 'Freitermine prüfen', exact: true }).click();
    const results = page.getByLabel('Ergebnisse der Freiterminsuche');
    await expect(results.locator('.availability-result')).toHaveCount(1);
    const friday = results.locator('.availability-result').filter({ hasText: '28. August 2026' });
    await expect(friday).toContainText('Frei');
    await friday.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Auswahl kopieren', exact: true }).click();
    await expect(page.getByText('1 Termin wurde in die Zwischenablage kopiert.')).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain(
      'Folgende Termine können wir Ihnen derzeit unverbindlich anbieten:',
    );
    expect(clipboard).toContain('Freitag, 28. August 2026 | 16:00–23:00');
    expect(clipboard).toContain(
      'Die Verfügbarkeit kann sich bis zur ausdrücklichen Optionierung ändern.',
    );
    expect(clipboard).not.toContain('E2E Erste Option');
  });

  test('Phase 5: keyboard batch selection proposes ranks and creates independent options', async () => {
    await page.goto(`/o/${organizationId}/events?view=free`);
    await page.getByLabel('Von').fill('2026-08-26');
    await page.getByLabel('Bis').fill('2026-08-27');
    await page
      .getByRole('combobox', { name: 'Ergebnisfilter', exact: true })
      .selectOption('FREE_AND_SECOND_OPTION');
    await page.getByRole('button', { name: 'Freitermine prüfen', exact: true }).click();

    const firstDate = page.getByRole('checkbox', {
      name: 'Mittwoch, 26. August 2026 auswählen',
      exact: true,
    });
    const secondDate = page.getByRole('checkbox', {
      name: 'Donnerstag, 27. August 2026 auswählen',
      exact: true,
    });
    await firstDate.focus();
    await page.keyboard.press('Space');
    await expect(firstDate).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(secondDate).toBeFocused();
    await page.keyboard.press('Space');
    await expect(secondDate).toBeChecked();
    await expect(page.getByText('2 Termine ausgewählt', { exact: true })).toBeVisible();

    const createBatch = page.getByRole('button', { name: 'Optionen anlegen', exact: true });
    await createBatch.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Mehrere Terminoptionen anlegen', exact: true }),
    ).toBeFocused();
    await expect(page.getByLabel('Rang Termin 1', { exact: true })).toHaveValue('SECOND');
    await expect(page.getByLabel('Rang Termin 2', { exact: true })).toHaveValue('FIRST');
    await expect(page.getByText('2 Optionen werden angelegt.', { exact: true })).toBeVisible();
    await page.getByLabel('Bezeichnung beziehungsweise Anfrage').fill('E2E Batch-Anfrage');
    await page.getByRole('button', { name: 'Optionen verbindlich anlegen', exact: true }).click();

    await expect(
      page.getByText('2 Terminoptionen wurden angelegt.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('0 Termine ausgewählt', { exact: true })).toBeVisible();
    const created = page.getByRole('region', { name: 'Neu angelegte Terminoptionen' });
    await expect(created.getByRole('link')).toHaveCount(2);
    await expect(created).toContainText('2. Option');
    await expect(created).toContainText('1. Option');
  });

  test('Phase 5: correct calendar date, list filters and narrow agenda', async () => {
    await page.goto(`/o/${organizationId}/events?view=calendar&month=2026-08`);
    const calendarEvent = page.locator('.calendar-event').filter({ hasText: 'E2E Venue Night' });
    await expect(calendarEvent).toBeVisible();
    await expect(calendarEvent).toContainText('20:30');
    await expect(
      page.locator('.month-calendar__day').filter({ has: calendarEvent }),
    ).toHaveAttribute('aria-label', /23\. August 2026/);

    await page.getByRole('link', { name: 'Liste', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Liste', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.getByLabel('Suche').fill('Venue Night');
    await page.getByLabel('Status').selectOption('CONFIRMED');
    await page.getByRole('button', { name: 'Filtern', exact: true }).click();
    const row = page.locator('.event-list-table tbody tr').filter({ hasText: 'E2E Venue Night' });
    await expect(row).toContainText('23.08.2026');
    await expect(row).toContainText('20:30');
    await expect(row).toContainText('Bestätigt');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/o/${organizationId}/events?view=calendar&month=2026-08`);
    await expect(page.locator('.month-calendar')).toBeHidden();
    await expect(page.locator('.calendar-agenda')).toBeVisible();
    await expect(
      page.locator('.agenda-event').filter({ hasText: 'E2E Venue Night' }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('Phase 3: artist and direct contacts', async () => {
    await openOrganizationHome(page, organizationId);
    await page.getByRole('link', { name: 'Artists', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Artists', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Artist anlegen', exact: true }).click();
    await page.getByLabel(/^Künstlername\b/).fill('E2E Echo Unit');
    await page.getByRole('button', { name: 'Artist anlegen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'E2E Echo Unit', exact: true })).toBeVisible();
    artistDetailPath = new URL(page.url()).pathname;
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
    contactDetailPath = new URL(page.url()).pathname;
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
    await expect(page.locator('.association-create')).toBeHidden();
    await page.getByRole('button', { name: 'Direkten Kontakt hinzufügen', exact: true }).click();
    const artistContactForm = page.locator('.association-create');
    const artistContactSelect = page.getByRole('combobox', {
      name: 'Kontakt auswählen',
      exact: true,
    });
    await expect(artistContactSelect).toBeVisible();
    await artistContactSelect.selectOption({ label: 'Mara E2E' });
    await artistContactForm.getByRole('checkbox', { name: 'Management', exact: true }).check();
    await artistContactForm
      .getByRole('button', { name: 'Kontakt verknüpfen', exact: true })
      .click();
    await expect(page.getByText('Unvollständig', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Mara E2E', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Direkten Kontakt hinzufügen', exact: true }).click();
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
  });

  test('Phase 3: business partner and partner contacts', async () => {
    await openOrganizationHome(page, organizationId);
    await page.getByRole('link', { name: 'Geschäftspartner', exact: true }).click();
    await page.getByRole('link', { name: 'Geschäftspartner anlegen', exact: true }).click();
    await page.getByLabel('Firmenname', { exact: true }).fill('E2E Kulturservice GmbH');
    await page.getByRole('checkbox', { name: 'Kunde', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Agentur', exact: true }).check();
    await page.getByRole('button', { name: 'Geschäftspartner anlegen', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'E2E Kulturservice GmbH', exact: true }),
    ).toBeVisible();
    partnerDetailPath = new URL(page.url()).pathname;
    await expect(page.locator('input[name="companyName"]')).toHaveCount(0);
    await expect(page.locator('.page-heading')).toContainText('Agentur');
    await expect(page.locator('.page-heading')).toContainText('Kunde');
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await expect(page.locator('input[name="companyName"]')).toHaveValue('E2E Kulturservice GmbH');
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(page.locator('input[name="companyName"]')).toHaveCount(0);
    await expect(page.locator('.association-create')).toBeHidden();
    await page.getByRole('button', { name: 'Ansprechpartner hinzufügen', exact: true }).click();
    const partnerContactForm = page.locator('.association-create');
    const partnerContactSelect = page.getByRole('combobox', {
      name: 'Kontakt auswählen',
      exact: true,
    });
    await expect(partnerContactSelect).toBeVisible();
    await partnerContactSelect.selectOption({ label: 'Mara E2E' });
    await partnerContactForm.getByRole('checkbox', { name: 'Booking', exact: true }).check();
    await partnerContactForm
      .getByRole('button', { name: 'Kontakt verknüpfen', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Mara E2E', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ansprechpartner hinzufügen', exact: true }).click();
    await partnerContactSelect.selectOption({ label: 'Juno E2E' });
    await partnerContactForm.getByRole('checkbox', { name: 'Booking', exact: true }).uncheck();
    await partnerContactForm.getByRole('checkbox', { name: 'Management', exact: true }).check();
    await partnerContactForm
      .getByRole('button', { name: 'Kontakt verknüpfen', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Juno E2E', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ansprechpartner hinzufügen', exact: true }).click();
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
  });

  test('Phase 3: artist representation, summaries and partner lifecycle', async () => {
    await openOrganizationHome(page, organizationId);
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
    await expect(
      representationCard.locator('a[href="mailto:juno.e2e@example.test"]'),
    ).toBeVisible();
    await expect(representationCard.locator('a[href="tel:+491725559876"]')).toBeVisible();
    await expect(
      representationCard.locator('a[href="mailto:nova.inline@example.test"]'),
    ).toBeVisible();

    const directContactCard = page.locator('.association-card').filter({ hasText: 'Mara E2E' });
    await expect(directContactCard.locator('a[href="mailto:mara.e2e@example.test"]')).toBeVisible();
    await expect(directContactCard.locator('a[href="tel:+49305551234"]')).toBeVisible();
    await expect(directContactCard.locator('a[href="tel:+491715551234"]')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
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
  });

  test('Phase 6: line-up requirements, booking workflow, ordering and finance', async () => {
    await page.goto(eventDetailPath);
    await expect(page.getByRole('tab', { name: 'Übersicht', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: 'Auftrittsplan', exact: true }).click();
    await expect(page).toHaveURL(/\?tab=lineup$/);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Auftrittsplan', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const requirements = page.locator('.lineup-requirements');
    await requirements.getByRole('button', { name: 'Vorgaben bearbeiten', exact: true }).click();
    await requirements.getByRole('button', { name: 'Position hinzufügen', exact: true }).click();
    await requirements.getByRole('button', { name: 'Position hinzufügen', exact: true }).click();
    await requirements.getByRole('button', { name: 'Position hinzufügen', exact: true }).click();
    await requirements
      .getByRole('group', { name: 'Position 2', exact: true })
      .getByRole('combobox', { name: 'Rolle', exact: true })
      .selectOption('MODERATOR');
    const headlinerRequirement = requirements.getByRole('group', {
      name: 'Position 3',
      exact: true,
    });
    await headlinerRequirement
      .getByRole('combobox', { name: 'Rolle', exact: true })
      .selectOption('OTHER');
    await headlinerRequirement
      .getByRole('textbox', { name: 'Rollenbezeichnung', exact: true })
      .fill('Headliner');
    await headlinerRequirement
      .getByRole('textbox', { name: 'Standardgage optional', exact: true })
      .fill('650,00');
    await requirements
      .getByRole('group', { name: 'Position 1', exact: true })
      .getByRole('textbox', { name: 'Standardgage optional', exact: true })
      .fill('880,00');
    await requirements.getByRole('button', { name: 'Vorgaben speichern', exact: true }).click();
    await expect(page.getByText('Die Line-up-Vorgaben wurden gespeichert.')).toBeVisible();
    await expect(requirements.getByText('Artists', { exact: true })).toHaveCount(0);
    await requirements.getByRole('button', { name: '3 Vorgaben anzeigen', exact: true }).click();
    await expect(requirements.getByText('Artists', { exact: true })).toBeVisible();
    await expect(requirements.getByText('Moderator', { exact: true })).toBeVisible();
    await expect(requirements.getByText('Headliner', { exact: true })).toBeVisible();
    await expect(requirements).toContainText('Standardgage: 650,00 €');

    await page.getByRole('tab', { name: 'Bookings', exact: true }).click();
    await expect(page).toHaveURL(/\?tab=bookings$/);
    await page.goBack();
    await expect(page).toHaveURL(/\?tab=lineup$/);
    await page.goForward();
    await expect(page).toHaveURL(/\?tab=bookings$/);
    const bookingPanel = page.locator('.booking-panel');
    await bookingPanel
      .getByRole('button', { name: 'Ersten Artist hinzufügen', exact: true })
      .first()
      .click();
    let bookingEditor = bookingPanel.locator('.booking-editor');
    const artistSearch = bookingEditor.getByRole('combobox', {
      name: 'Artist suchen und auswählen',
      exact: true,
    });
    await artistSearch.fill('E2E');
    await expect(bookingEditor.getByRole('option', { name: /E2E Echo Unit/ })).toBeVisible();
    await artistSearch.fill('Echo Unit');
    await artistSearch.press('ArrowDown');
    await artistSearch.press('Enter');
    await expect(bookingEditor.getByText(/Ausgewählt:.*E2E Echo Unit/)).toBeVisible();
    await expect(
      bookingEditor.getByRole('textbox', { name: 'Vereinbarte Gage optional / keine Gage' }),
    ).toHaveValue('880,00');
    await expect(
      bookingEditor.getByText('Automatisch aus dem Artistprofil übernommen'),
    ).toBeVisible();
    await expect(
      bookingEditor
        .getByRole('combobox', { name: 'Agentur / Management optional', exact: true })
        .locator('option:checked'),
    ).toHaveText('E2E Kulturservice GmbH');
    await expect(
      bookingEditor
        .getByRole('combobox', { name: 'Ansprechpartner optional', exact: true })
        .locator('option:checked'),
    ).toHaveText('Juno E2E · juno.e2e@example.test');
    await bookingEditor
      .getByRole('textbox', { name: 'Vereinbarte Gage optional / keine Gage' })
      .fill('1250,00');
    await bookingEditor.getByRole('textbox', { name: 'Reisekosten optional' }).fill('25.00');
    await bookingEditor
      .getByRole('textbox', { name: 'Interne Bookingnotiz optional', exact: true })
      .fill('E2E Booking mit produktionsnahen Kontaktdaten');
    await bookingEditor.getByRole('button', { name: 'Booking anlegen', exact: true }).click();
    await expect(page.getByText('Das Booking wurde angelegt.')).toBeVisible();

    const artistBooking = bookingPanel.locator('.booking-card').filter({
      has: page.getByText('Artist', { exact: true }),
    });
    await expect(artistBooking).toContainText('Gage: 1.250,00 €');
    await expect(artistBooking).toContainText('Reisekosten: 25,00 €');
    await expect(artistBooking).toContainText('E2E Kulturservice GmbH');
    await expect(artistBooking).toContainText('Juno E2E');
    await expect(
      artistBooking.locator('a[href="mailto:juno.e2e@example.test"]').first(),
    ).toBeVisible();
    await expect(artistBooking.getByRole('button', { name: 'Status ändern' })).toHaveCount(0);
    await artistBooking
      .getByRole('button', { name: 'Aktionen für Booking E2E Echo Unit', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Status bearbeiten', exact: true }).click();
    await artistBooking
      .getByRole('combobox', { name: 'Status von E2E Echo Unit', exact: true })
      .selectOption('CONFIRMED');
    await expect(page.getByText('Status geändert: Bestätigt.', { exact: true })).toBeVisible();
    await expect(artistBooking.getByText('Bestätigt', { exact: true })).toBeVisible();
    await artistBooking.getByText('Kontakte aufklappen', { exact: true }).click();
    await expect(
      artistBooking.getByRole('link', { name: 'E2E Kulturservice GmbH', exact: true }),
    ).toBeVisible();
    await expect(artistBooking.getByRole('link', { name: 'Juno E2E', exact: true })).toBeVisible();
    await expect(
      artistBooking.getByText(/Juno E2E · Management · Primärer Ansprechpartner · Booking/),
    ).toBeVisible();
    await expect(artistBooking.getByText('Weitere Ansprechpartner', { exact: true })).toBeVisible();
    await expect(
      artistBooking.getByRole('link', { name: 'Nova Inline', exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.booking-progress-card').filter({
        has: page.getByText('Artists', { exact: true }),
      }),
    ).toContainText('1/1 bestätigt');

    await bookingPanel.getByRole('button', { name: 'Artist hinzufügen', exact: true }).click();
    bookingEditor = bookingPanel.locator('.booking-editor');
    const duplicateArtistSearch = bookingEditor.getByRole('combobox', {
      name: 'Artist suchen und auswählen',
      exact: true,
    });
    await duplicateArtistSearch.fill('Echo Unit');
    await duplicateArtistSearch.press('ArrowDown');
    await duplicateArtistSearch.press('Enter');
    await bookingEditor.getByRole('button', { name: 'Booking anlegen', exact: true }).click();
    const duplicateBookingDialog = page.getByRole('dialog', {
      name: 'Dieser Artist ist für diese Veranstaltung bereits gebucht.',
    });
    await expect(duplicateBookingDialog).toContainText('Artist · Bestätigt');
    await duplicateBookingDialog
      .getByRole('button', {
        name: /Weiteren Auftritt zum bestehenden Booking hinzufügen/,
      })
      .click();
    await expect(
      page.getByText('Ein weiterer Auftritt wurde dem bestehenden Booking hinzugefügt.'),
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Auftrittsplan', exact: true }).click();
    const performanceOrder = bookingPanel.locator('.performance-order');
    let echoProgramRows = performanceOrder.locator('.program-row').filter({
      has: page.getByText('E2E Echo Unit', { exact: true }),
    });
    await expect(echoProgramRows).toHaveCount(2);
    const firstEchoProgramRow = performanceOrder.locator('.program-row').nth(0);
    await firstEchoProgramRow.getByRole('button', { name: /Aktionen für E2E Echo Unit/ }).click();
    await page.getByRole('menuitem', { name: 'Bearbeiten', exact: true }).click();
    await firstEchoProgramRow
      .getByRole('textbox', { name: 'Bezeichnung optional', exact: true })
      .fill('Set 1');
    await firstEchoProgramRow
      .getByRole('spinbutton', { name: 'Dauer in Minuten optional', exact: true })
      .fill('10');
    await firstEchoProgramRow.getByRole('button', { name: 'Speichern', exact: true }).click();
    echoProgramRows = performanceOrder.locator('.program-row').filter({
      has: page.getByText('E2E Echo Unit', { exact: true }),
    });
    await expect(echoProgramRows).toHaveCount(2);
    const secondEchoProgramRow = performanceOrder.locator('.program-row').nth(1);
    await secondEchoProgramRow.getByRole('button', { name: /Aktionen für E2E Echo Unit/ }).click();
    await page.getByRole('menuitem', { name: 'Bearbeiten', exact: true }).click();
    await secondEchoProgramRow
      .getByRole('textbox', { name: 'Bezeichnung optional', exact: true })
      .fill('Set 2');
    await secondEchoProgramRow
      .getByRole('spinbutton', { name: 'Dauer in Minuten optional', exact: true })
      .fill('10');
    await secondEchoProgramRow.getByRole('button', { name: 'Speichern', exact: true }).click();
    await performanceOrder
      .getByRole('button', { name: 'Art des neuen Programmpunkts auswählen', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Umbauzeit', exact: true }).click();
    const breakEditor = performanceOrder.locator('.program-item-editor');
    await breakEditor
      .getByRole('textbox', { name: 'Bezeichnung optional', exact: true })
      .fill('Umbaupause');
    await breakEditor
      .getByRole('spinbutton', { name: 'Dauer in Minuten optional', exact: true })
      .fill('20');
    await breakEditor.getByRole('button', { name: 'Programmpunkt anlegen', exact: true }).click();
    await expect(performanceOrder).toContainText('bekannte Gesamtdauer 40 Minuten');

    let breakRow = performanceOrder.locator('.program-row').filter({
      has: page.getByText('Umbaupause', { exact: true }),
    });
    await page.route('**/program/order', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ code: 'VERSION_CONFLICT', message: 'Sortierung blockiert' }),
        contentType: 'application/json',
        status: 409,
      });
    });
    await breakRow.getByRole('button', { name: 'Aktionen für Umbaupause', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Nach oben', exact: true }).click();
    await expect(page.getByText(/Die vorherige Reihenfolge wurde wiederhergestellt/)).toBeVisible();
    await expect(performanceOrder.locator('.program-row').nth(1)).toContainText('Set 2');
    await page.unroute('**/program/order');

    breakRow = performanceOrder.locator('.program-row').filter({
      has: page.getByText('Umbaupause', { exact: true }),
    });
    let secondSetRow = performanceOrder.locator('.program-row').filter({ hasText: 'Set 2' });
    await breakRow.getByRole('button', { name: /Umbaupause ziehen/ }).dragTo(secondSetRow);
    await expect(page.getByText('Die Auftrittsreihenfolge wurde gespeichert.')).toBeVisible();
    secondSetRow = performanceOrder.locator('.program-row').filter({ hasText: 'Set 2' });
    const secondSetHandle = secondSetRow.getByRole('button', { name: /E2E Echo Unit ziehen/ });
    await secondSetHandle.focus();
    await secondSetHandle.press('ArrowUp');
    await expect(performanceOrder.locator('.program-row').nth(1)).toContainText('Set 2');
    const movedSecondSetHandle = secondSetRow.getByRole('button', {
      name: /E2E Echo Unit ziehen/,
    });
    await expect(movedSecondSetHandle).toBeEnabled();
    await movedSecondSetHandle.press('ArrowDown');
    await expect(performanceOrder.locator('.program-row').nth(1)).toContainText('Umbaupause');

    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Auftrittsreihenfolge', exact: true }),
    ).toBeVisible();
    const persistedProgram = page.locator('.performance-order');
    await expect(persistedProgram.locator('.program-row').nth(0)).toContainText('Set 1');
    await expect(persistedProgram.locator('.program-row').nth(1)).toContainText('Umbaupause');
    await expect(persistedProgram.locator('.program-row').nth(2)).toContainText('Set 2');

    await page.getByRole('tab', { name: 'Bookings', exact: true }).click();
    await bookingPanel.getByRole('button', { name: 'Artist hinzufügen', exact: true }).click();
    bookingEditor = bookingPanel.locator('.booking-editor');
    await bookingEditor
      .getByRole('textbox', { name: 'Interne Bookingnotiz optional', exact: true })
      .fill('Bleibt bei der Schnellanlage erhalten');
    await bookingEditor.getByRole('button', { name: 'Artist neu anlegen', exact: true }).click();
    let quickArtistDialog = page.getByRole('dialog', { name: 'Artist neu anlegen' });
    await quickArtistDialog.getByLabel('Künstlername', { exact: true }).fill('E2E Echo Unit');
    await quickArtistDialog
      .getByRole('button', { name: 'Prüfen und anlegen', exact: true })
      .click();
    await expect(quickArtistDialog.getByText('Mögliche Dubletten', { exact: true })).toBeVisible();
    await expect(
      quickArtistDialog.getByRole('button', { name: 'Diesen auswählen', exact: true }),
    ).toBeVisible();
    await quickArtistDialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(
      bookingEditor.getByRole('textbox', { name: 'Interne Bookingnotiz optional', exact: true }),
    ).toHaveValue('Bleibt bei der Schnellanlage erhalten');
    await bookingEditor.getByRole('button', { name: 'Artist neu anlegen', exact: true }).click();
    quickArtistDialog = page.getByRole('dialog', { name: 'Artist neu anlegen' });
    await quickArtistDialog.getByLabel('Künstlername', { exact: true }).fill('E2E Newcomer');
    await quickArtistDialog.getByLabel('Vorname optional', { exact: true }).fill('Nika');
    await quickArtistDialog.getByLabel('Nachname optional', { exact: true }).fill('Neu');
    await quickArtistDialog
      .getByLabel('E-Mail optional', { exact: true })
      .fill('nika.neu@example.test');
    await quickArtistDialog.getByLabel('Telefon optional', { exact: true }).fill('+49 170 1002003');
    await quickArtistDialog
      .getByRole('button', { name: 'Prüfen und anlegen', exact: true })
      .click();
    await expect(bookingEditor.getByText(/Ausgewählt:.*E2E Newcomer/)).toBeVisible();
    await expect(bookingEditor.getByText('Artist angelegt.')).toBeVisible();
    await bookingEditor
      .getByRole('combobox', { name: 'Rolle', exact: true })
      .selectOption({ label: 'Headliner' });
    await expect(
      bookingEditor.getByRole('textbox', { name: 'Vereinbarte Gage optional / keine Gage' }),
    ).toHaveValue('650,00');
    await bookingEditor
      .getByRole('combobox', { name: 'Anfangsstatus', exact: true })
      .selectOption('CONFIRMED');
    await bookingEditor
      .getByRole('textbox', { name: 'Vereinbarte Gage optional / keine Gage' })
      .fill('650.00');
    await bookingEditor
      .getByRole('combobox', { name: 'Hotelregelung', exact: true })
      .selectOption('BUYOUT');
    await bookingEditor
      .getByRole('textbox', { name: 'Buy-out-Betrag optional', exact: true })
      .fill('100,00');
    await bookingEditor
      .getByRole('textbox', { name: 'Hotelnotiz optional', exact: true })
      .fill('Eigenständig organisiert');
    await bookingEditor.getByRole('button', { name: 'Booking anlegen', exact: true }).click();
    await expect(page.getByText('Das Booking wurde angelegt.')).toBeVisible();

    const headlinerBooking = bookingPanel.locator('.booking-card').filter({
      has: page.getByText('Headliner', { exact: true }),
    });
    await expect(headlinerBooking).toContainText('E2E Newcomer');
    await expect(headlinerBooking).toContainText('Gage: 650,00 €');
    await expect(headlinerBooking).toContainText('Eigenvertretung · Direktkontakt');
    await expect(
      headlinerBooking.locator('a[href="mailto:nika.neu@example.test"]').first(),
    ).toBeVisible();
    await expect(headlinerBooking.locator('a[href="tel:+49 170 1002003"]').first()).toBeVisible();
    await headlinerBooking.getByText('Bookingdetails und Statushistorie', { exact: true }).click();
    await expect(headlinerBooking).toContainText('Hotel-Buy-out');
    await expect(headlinerBooking).toContainText('100,00 €');
    await expect(headlinerBooking).toContainText('Eigenständig organisiert');
    await headlinerBooking
      .getByRole('button', { name: 'Aktionen für Booking E2E Newcomer', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Booking bearbeiten', exact: true }).click();
    await expect(
      headlinerBooking.getByRole('combobox', { name: 'Hotelregelung', exact: true }),
    ).toHaveValue('BUYOUT');
    await expect(
      headlinerBooking.getByRole('textbox', { name: 'Buy-out-Betrag optional', exact: true }),
    ).toHaveValue('100,00');
    await headlinerBooking.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(
      page.locator('.booking-progress-card').filter({
        has: page.getByText('Headliner', { exact: true }),
      }),
    ).toContainText('1/1 bestätigt');

    await page.route('**/bookings/*/status', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          code: 'VERSION_CONFLICT',
          message: 'Simulierter Versionskonflikt',
        }),
        contentType: 'application/json',
        status: 409,
      });
    });
    await headlinerBooking
      .getByRole('button', { name: 'Aktionen für Booking E2E Newcomer', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Status bearbeiten', exact: true }).click();
    const headlinerStatus = headlinerBooking.getByRole('combobox', {
      name: 'Status von E2E Newcomer',
      exact: true,
    });
    await headlinerStatus.selectOption('OPTION');
    await expect(page.getByText('Simulierter Versionskonflikt', { exact: true })).toBeVisible();
    await expect(headlinerBooking.getByText('Bestätigt', { exact: true })).toBeVisible();
    await page.unroute('**/bookings/*/status');

    await artistBooking
      .getByRole('button', { name: 'Aktionen für Booking E2E Echo Unit', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Status bearbeiten', exact: true }).click();
    await artistBooking
      .getByRole('combobox', { name: 'Status von E2E Echo Unit', exact: true })
      .selectOption('CANCELLED');
    const statusDialog = page.getByRole('dialog', { name: /Status auf „Storniert“ setzen/ });
    await statusDialog.getByLabel('Statusnotiz optional').fill('E2E Statuskorrektur');
    await statusDialog.getByRole('button', { name: 'Änderung bestätigen', exact: true }).click();
    await expect(page.getByText('Status geändert: Storniert.', { exact: true })).toBeVisible();
    await expect(artistBooking).toHaveCount(0);
    await bookingPanel
      .getByRole('checkbox', { name: 'Historische einblenden', exact: true })
      .check();
    const historicalArtistBooking = bookingPanel.locator('.booking-card').filter({
      has: page.getByText('Artist', { exact: true }),
    });
    await expect(historicalArtistBooking.getByText('Storniert', { exact: true })).toBeVisible();
    await historicalArtistBooking
      .getByText('Bookingdetails und Statushistorie', { exact: true })
      .click();
    await expect(historicalArtistBooking).toContainText('Bestätigt → Storniert');
    await expect(historicalArtistBooking).toContainText('E2E Statuskorrektur');
    await historicalArtistBooking
      .getByRole('button', { name: 'Aktionen für Booking E2E Echo Unit', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Status bearbeiten', exact: true }).click();
    await historicalArtistBooking
      .getByRole('combobox', { name: 'Status von E2E Echo Unit' })
      .selectOption('REQUESTED');
    let reactivationDialog = page.getByRole('dialog', { name: 'Booking reaktivieren?' });
    await reactivationDialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(historicalArtistBooking.getByText('Storniert', { exact: true })).toBeVisible();
    await historicalArtistBooking
      .getByRole('button', { name: 'Aktionen für Booking E2E Echo Unit', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Status bearbeiten', exact: true }).click();
    await historicalArtistBooking
      .getByRole('combobox', { name: 'Status von E2E Echo Unit' })
      .selectOption('REQUESTED');
    reactivationDialog = page.getByRole('dialog', { name: 'Booking reaktivieren?' });
    await reactivationDialog.getByLabel('Statusnotiz optional').fill('Wieder angefragt');
    await reactivationDialog
      .getByRole('button', { name: 'Änderung bestätigen', exact: true })
      .click();
    await expect(page.getByText('Status geändert: Angefragt.', { exact: true })).toBeVisible();
  });

  test('Phase 7: catalog, format snapshot, calculation approval and booking reset', async () => {
    await page.goto(`/o/${organizationId}/business-partners`);
    await page.getByRole('link', { name: 'Geschäftspartner anlegen', exact: true }).click();
    await page.getByLabel('Firmenname', { exact: true }).fill('E2E Technikpartner B');
    await page.getByRole('button', { name: 'Geschäftspartner anlegen', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'E2E Technikpartner B', exact: true }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Leistungen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Leistungen', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Kategorien', exact: true }).click();
    await page.getByLabel('Neue Kategorie', { exact: true }).fill('E2E Technik');
    await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
    await expect(page.getByText('Kategorie angelegt.', { exact: true })).toBeVisible();
    await expect(page.getByText('E2E Technik', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Zum Leistungskatalog', exact: true }).click();
    await page.goto(`/o/${organizationId}/services/new`);
    await expect(
      page.getByRole('heading', { name: 'Leistung anlegen', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Bezeichnung', { exact: true }).fill('E2E Tontechnik');
    await page.locator('select[name="categoryId"]').selectOption({ label: 'E2E Technik' });
    await page
      .getByRole('combobox', { name: 'Abrechnungseinheit', exact: true })
      .selectOption('FLAT_RATE');
    await page.locator('input[name="salesPrice"]').fill('450,00');
    await page.getByRole('button', { name: 'Leistung anlegen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'E2E Tontechnik', exact: true })).toBeVisible();
    phase7ServiceDetailPath = new URL(page.url()).pathname;
    await expect(page.getByLabel('Bezeichnung', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Dienstleisterpreis hinzufügen', exact: true }).click();
    let providerForm = page.locator('.compact-provider-form');
    await providerForm
      .getByRole('combobox', { name: 'Dienstleister', exact: true })
      .selectOption({ label: 'E2E Kulturservice GmbH' });
    await providerForm.locator('input[name="purchasePrice"]').fill('350.00');
    await providerForm.getByRole('checkbox', { name: 'Bevorzugt', exact: true }).check();
    await providerForm.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
    await expect(page.locator('.master-data-table tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Dienstleisterpreis hinzufügen', exact: true }).click();
    providerForm = page.locator('.compact-provider-form');
    await providerForm
      .getByRole('combobox', { name: 'Dienstleister', exact: true })
      .selectOption({ label: 'E2E Technikpartner B' });
    await providerForm.locator('input[name="purchasePrice"]').fill('375,00');
    await providerForm.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
    await expect(page.locator('.master-data-table tbody tr')).toHaveCount(2);

    await page.goto(eventFormatDetailPath);
    const formatServices = page.locator('.service-subpanel');
    await formatServices.getByRole('button', { name: 'Leistung hinzufügen', exact: true }).click();
    await formatServices
      .getByRole('combobox', { name: 'Leistung', exact: true })
      .selectOption({ label: 'E2E Tontechnik' });
    await formatServices.getByRole('textbox', { name: 'Menge', exact: true }).fill('2');
    await formatServices
      .getByRole('combobox', { name: 'Dienstleister', exact: true })
      .selectOption({ label: 'E2E Kulturservice GmbH' });
    await formatServices.locator('input[name="salesOverride"]').fill('500,00');
    await formatServices.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
    await expect(
      formatServices.getByText('Leistungsvorgabe angelegt.', { exact: true }),
    ).toBeVisible();
    await expect(formatServices).toContainText('Einkauf: 350,00 €');
    await expect(formatServices).toContainText('Verkauf: 500,00 €');

    await page.goto(`/o/${organizationId}/events/new`);
    await page
      .locator('select[name="sourceEventFormatId"]')
      .selectOption({ label: 'E2E Late Show' });
    await page.getByLabel('Veranstaltungsname').fill('E2E Phase 7 Event');
    await page.getByLabel('Datum').fill('2027-10-01');
    await page.getByRole('button', { name: 'Veranstaltung anlegen', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'E2E Phase 7 Event', exact: true }),
    ).toBeVisible();
    phase7EventDetailPath = new URL(page.url()).pathname;

    await page.getByRole('tab', { name: 'Kalkulation', exact: true }).click();
    const calculationPanel = page.locator('.calculation-panel');
    await expect(calculationPanel).toContainText('E2E Tontechnik');
    await expect(calculationPanel).toContainText('Format-Snapshot');
    await calculationPanel
      .getByRole('button', { name: 'Neue Kalkulationsposition auswählen', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Aus Leistungskatalog', exact: true }).click();
    const catalogPosition = page.getByRole('dialog', { name: 'Aus Leistungskatalog', exact: true });
    await catalogPosition
      .getByRole('combobox', { name: 'Leistung', exact: true })
      .selectOption({ label: 'E2E Tontechnik' });
    await expect(
      catalogPosition
        .getByRole('combobox', { name: 'Dienstleister', exact: true })
        .locator('option:checked'),
    ).toHaveText('E2E Kulturservice GmbH');
    await expect(catalogPosition.locator('input[name="purchasePrice"]')).toHaveValue('350,00');
    await expect(catalogPosition.locator('input[name="salesPrice"]')).toHaveValue('450,00');
    await catalogPosition.locator('input[name="purchasePrice"]').fill('360,00');
    await expect(catalogPosition.locator('input[name="purchasePrice"]')).toHaveValue('360,00');
    await catalogPosition
      .getByRole('button', { name: 'Aus Leistungskatalog schließen', exact: true })
      .click();
    const snapshotCalculationRow = calculationPanel
      .locator('tr[data-position-id]')
      .filter({ hasText: 'E2E Tontechnik' });
    await calculationPanel.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await snapshotCalculationRow
      .getByRole('textbox', { name: 'Menge für E2E Tontechnik', exact: true })
      .fill('3');
    await expect(
      calculationPanel.getByText(/1 Position geändert · nicht gespeichert/),
    ).toBeVisible();
    await calculationPanel.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(
      snapshotCalculationRow.getByRole('textbox', { name: 'Menge für E2E Tontechnik' }),
    ).toHaveCount(0);
    await calculationPanel.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await expect(snapshotCalculationRow.locator('td[data-label="EK gesamt"] input')).toHaveCount(0);
    await snapshotCalculationRow
      .getByRole('textbox', { name: 'Einkaufspreis pro Einheit für E2E Tontechnik' })
      .fill('');
    await calculationPanel.getByRole('button', { name: 'Speichern', exact: true }).click();
    const missingPriceNotice = calculationPanel.getByRole('button', { name: /benötigt noch/ });
    await missingPriceNotice.click();
    await expect(snapshotCalculationRow.locator('.missing-price-cell')).toBeFocused();
    await snapshotCalculationRow
      .getByRole('button', { name: 'Aktionen für E2E Tontechnik', exact: true })
      .click();
    await page
      .getByRole('menuitem', { name: 'Preise aus Katalog übernehmen', exact: true })
      .click();
    const pricePreview = calculationPanel.getByRole('dialog', {
      name: 'Vorschau der Katalogpreis-Übernahme',
    });
    await expect(pricePreview).toContainText('EK 350,00 €');
    await expect(pricePreview).toContainText('Bereits hinterlegte Preise bleiben unverändert.');
    await pricePreview.getByRole('button', { name: 'Übernehmen', exact: true }).click();
    await expect(
      calculationPanel.getByText('Katalogpreise übernommen.', { exact: true }),
    ).toBeVisible();
    const techniqueGroup = calculationPanel.getByRole('button', { name: /E2E Technik/ });
    await techniqueGroup.click();
    await expect(snapshotCalculationRow).toBeHidden();
    await techniqueGroup.click();
    await expect(snapshotCalculationRow).toBeVisible();
    await calculationPanel
      .getByRole('button', { name: 'Neue Kalkulationsposition auswählen', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Individuelle Position', exact: true }).click();
    const customPosition = page.getByRole('dialog', { name: 'Individuelle Position', exact: true });
    await customPosition
      .getByRole('textbox', { name: 'Bezeichnung', exact: true })
      .fill('E2E Stagehands');
    await customPosition.getByRole('textbox', { name: 'Kategorie', exact: true }).fill('Personal');
    await customPosition.getByRole('textbox', { name: 'Menge', exact: true }).fill('3');
    await customPosition.locator('input[name="purchasePrice"]').fill('100,00');
    await customPosition.locator('input[name="salesPrice"]').fill('150.00');
    await customPosition
      .getByRole('combobox', { name: 'Kostenstatus', exact: true })
      .selectOption('COMMITTED');
    await customPosition.getByRole('button', { name: 'Position anlegen', exact: true }).click();
    await expect(calculationPanel.getByText('Position angelegt.', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Bookings', exact: true }).click();
    const bookingPanel = page.locator('.booking-panel');
    await bookingPanel
      .getByRole('button', { name: /Artist hinzufügen/, exact: false })
      .first()
      .click();
    const bookingEditor = bookingPanel.locator('.booking-editor');
    const artistSearch = bookingEditor.getByRole('combobox', {
      name: 'Artist suchen und auswählen',
      exact: true,
    });
    await artistSearch.fill('E2E Newcomer');
    await artistSearch.press('ArrowDown');
    await artistSearch.press('Enter');
    await bookingEditor
      .getByRole('textbox', { name: 'Vereinbarte Gage optional / keine Gage' })
      .fill('200,00');
    await bookingEditor.getByRole('button', { name: 'Booking anlegen', exact: true }).click();
    await expect(page.getByText('Das Booking wurde angelegt.', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Kalkulation', exact: true }).click();
    const newcomerCostRow = calculationPanel.locator('tr').filter({ hasText: 'E2E Newcomer' });
    await expect(newcomerCostRow).toContainText('Gage');
    await expect(calculationPanel).toContainText('Voraussichtliche Gesamtkosten');
    await expect(calculationPanel).toContainText('1.200,00 €');
    await expect(calculationPanel).toContainText('Davon verbindlich');
    await expect(calculationPanel).toContainText('300,00 €');
    await expect(calculationPanel).toContainText('Noch nicht verbindlich');
    await expect(calculationPanel).toContainText('900,00 €');
    await calculationPanel
      .getByRole('button', { name: 'Weitere Kalkulationsaktionen', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Zur Prüfung geben', exact: true }).click();
    await expect(calculationPanel.getByText('Zur Prüfung', { exact: true })).toBeVisible();
    await calculationPanel
      .getByRole('button', { name: 'Weitere Kalkulationsaktionen', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Freigeben', exact: true }).click();
    await expect(calculationPanel.getByText('Freigegeben', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Bookings', exact: true }).click();
    const bookingCard = bookingPanel.locator('.booking-card').filter({ hasText: 'E2E Newcomer' });
    await bookingCard
      .getByRole('button', { name: 'Aktionen für Booking E2E Newcomer', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Booking bearbeiten', exact: true }).click();
    await bookingCard
      .getByRole('textbox', { name: 'Vereinbarte Gage optional / keine Gage' })
      .fill('250,00');
    await bookingCard.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
    await expect(page.getByText('Das Booking wurde gespeichert.', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Kalkulation', exact: true }).click();
    await expect(calculationPanel.getByText('Entwurf', { exact: true })).toBeVisible();
    await calculationPanel.getByText('Statushistorie', { exact: true }).click();
    await expect(calculationPanel).toContainText('Booking-Finanzdaten geändert');
  });

  test('Phase 1 through Phase 7: read-only authorization and logout', async ({ browser }) => {
    await openOrganizationHome(page, organizationId);
    await page.getByRole('link', { name: 'Team', exact: true }).click();
    await page.getByRole('button', { name: 'Einladung erstellen', exact: true }).click();
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

    const invitedContext = await browser.newContext({ baseURL: e2eBaseUrl });
    const invitedPage = await invitedContext.newPage();
    attachBrowserDiagnostics(invitedPage);
    try {
      await invitedPage.goto(invitationLink);
      await expect(
        invitedPage.getByRole('heading', { name: 'E2E Venue beitreten.', exact: true }),
      ).toBeVisible();
      await invitedPage.getByLabel('Ihr Name').fill('E2E Member');
      await invitedPage.locator('input[name="password"]').fill(invitedPassword);
      await invitedPage.locator('input[name="passwordConfirmation"]').fill(invitedPassword);
      await invitedPage
        .getByRole('button', { name: 'Konto anlegen und Einladung annehmen' })
        .click();
      await expect(
        invitedPage.getByRole('heading', { name: 'Willkommen zurück.', exact: true }),
      ).toBeVisible();
      await invitedPage.getByLabel('E-Mail-Adresse').fill(invitedEmail);
      await invitedPage.locator('input[name="password"]').fill(invitedPassword);
      await invitedPage.getByRole('button', { name: 'Anmelden' }).click();
      await expect(
        invitedPage.getByRole('heading', { name: 'E2E Venue', exact: true }),
      ).toBeVisible();
      await expect(invitedPage.getByRole('link', { name: 'Team', exact: true })).toHaveCount(0);
      await expect(invitedPage.getByRole('link', { name: 'Artists', exact: true })).toBeVisible();
      await expect(invitedPage.getByRole('link', { name: 'Kontakte', exact: true })).toBeVisible();
      await expect(
        invitedPage.getByRole('link', { name: 'Geschäftspartner', exact: true }),
      ).toBeVisible();
      await expect(invitedPage.getByRole('link', { name: 'Formate', exact: true })).toBeVisible();
      await expect(
        invitedPage.getByRole('link', { name: 'Veranstaltungen', exact: true }),
      ).toBeVisible();
      await expect(
        invitedPage.getByRole('link', { name: 'Leistungen', exact: true }),
      ).toBeVisible();
      await invitedPage.getByRole('link', { name: 'Formate', exact: true }).click();
      await expect(
        invitedPage.getByRole('link', { name: 'Veranstaltungsformat anlegen', exact: true }),
      ).toHaveCount(0);
      await invitedPage.getByRole('link', { name: 'E2E Late Show', exact: true }).click();
      await expect(invitedPage.locator('input[name="name"]')).toHaveCount(0);
      await expect(
        invitedPage.getByRole('button', { name: 'Bearbeiten', exact: true }),
      ).toHaveCount(0);
      await expect(
        invitedPage.getByRole('button', { name: 'Weitere Aktionen', exact: true }),
      ).toHaveCount(0);
      const forbiddenEventFormat = await invitedContext.request.post(
        new URL(
          `/api/v1/organizations/${organizationId}/event-formats`,
          invitedPage.url(),
        ).toString(),
        { data: { name: 'Forbidden browser format', eventKind: 'OWN_PRODUCTION' } },
      );
      expect(forbiddenEventFormat.status()).toBe(403);
      await invitedPage.getByRole('link', { name: 'Veranstaltungen', exact: true }).click();
      await expect(
        invitedPage.getByRole('link', { name: 'Veranstaltung anlegen', exact: true }),
      ).toHaveCount(0);
      await expect(
        invitedPage.getByRole('link', { name: 'Terminoption anlegen', exact: true }),
      ).toHaveCount(0);
      await invitedPage.goto(dateOptionDetailPath);
      await expect(
        invitedPage.getByRole('heading', { name: 'E2E Zweite Option', exact: true }),
      ).toBeVisible();
      await expect(
        invitedPage.getByRole('button', { name: 'Bearbeiten', exact: true }),
      ).toHaveCount(0);
      await expect(invitedPage.getByRole('button', { name: 'Freigeben', exact: true })).toHaveCount(
        0,
      );
      await expect(
        invitedPage.getByRole('link', { name: 'In Veranstaltung umwandeln', exact: true }),
      ).toHaveCount(0);
      await invitedPage.goto(eventDetailPath);
      await expect(
        invitedPage.getByRole('heading', { name: 'E2E Venue Night', exact: true }),
      ).toBeVisible();
      await expect(
        invitedPage.getByRole('button', { name: 'Bearbeiten', exact: true }),
      ).toHaveCount(0);
      await expect(invitedPage.getByLabel('Status ändern')).toHaveCount(0);
      await invitedPage.getByRole('tab', { name: 'Bookings', exact: true }).click();
      const readOnlyBookingPanel = invitedPage.locator('.booking-panel');
      await expect(
        readOnlyBookingPanel
          .locator('.booking-card')
          .getByRole('link', { name: 'E2E Echo Unit', exact: true }),
      ).toBeVisible();
      await expect(
        readOnlyBookingPanel.getByRole('button', { name: 'Artist hinzufügen', exact: true }),
      ).toHaveCount(0);
      await expect(
        readOnlyBookingPanel.getByRole('button', { name: 'Bearbeiten', exact: true }),
      ).toHaveCount(0);
      await expect(readOnlyBookingPanel.getByText(/Gage:/)).toHaveCount(0);
      await invitedPage.getByRole('tab', { name: 'Auftrittsplan', exact: true }).click();
      await expect(
        readOnlyBookingPanel.getByRole('button', { name: 'Vorgaben bearbeiten', exact: true }),
      ).toHaveCount(0);
      await expect(
        readOnlyBookingPanel.getByRole('button', {
          name: 'Art des neuen Programmpunkts auswählen',
          exact: true,
        }),
      ).toHaveCount(0);
      const eventId = eventDetailPath.split('/').at(-1)!;
      const forbiddenEvent = await invitedContext.request.patch(
        new URL(
          `/api/v1/organizations/${organizationId}/events/${eventId}/status`,
          invitedPage.url(),
        ).toString(),
        { data: { version: 3, status: 'CANCELLED' } },
      );
      expect(forbiddenEvent.status()).toBe(403);
      await invitedPage.goto(eventFormatDetailPath);
      await expect(
        invitedPage.getByRole('heading', { name: 'E2E Late Show', exact: true }),
      ).toBeVisible();
      await invitedPage.getByRole('link', { name: 'Artists', exact: true }).click();
      await expect(
        invitedPage.getByRole('link', { name: 'Artist anlegen', exact: true }),
      ).toHaveCount(0);
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
      await expect(
        invitedPage.getByRole('button', { name: 'Bearbeiten', exact: true }),
      ).toHaveCount(0);
      await expect(
        invitedPage.getByRole('button', { name: 'Vertretungen bearbeiten', exact: true }),
      ).toHaveCount(0);
      await expect(
        invitedPage.getByRole('button', { name: 'Direkten Kontakt hinzufügen', exact: true }),
      ).toHaveCount(0);
      await expect(invitedPage.locator('input[name="stageName"]')).toHaveCount(0);
      await expect(
        invitedPage.getByRole('button', { name: 'Weitere Aktionen', exact: true }),
      ).toHaveCount(0);
      await expect(
        invitedPage.getByRole('button', { name: 'Vertretung lösen', exact: true }),
      ).toHaveCount(0);

      await invitedPage.goto(contactDetailPath);
      await expect(
        invitedPage.getByRole('heading', { name: 'Mara E2E', exact: true }),
      ).toBeVisible();
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

      await invitedPage.goto(phase7ServiceDetailPath);
      await expect(
        invitedPage.getByRole('heading', { name: 'E2E Tontechnik', exact: true }),
      ).toBeVisible();
      await expect(invitedPage.getByText('Nicht freigegeben', { exact: true })).toBeVisible();
      await expect(
        invitedPage.getByRole('button', { name: 'Bearbeiten', exact: true }),
      ).toHaveCount(0);
      await expect(invitedPage.getByText('350,00 €', { exact: true })).toHaveCount(0);

      await invitedPage.goto(phase7EventDetailPath);
      await invitedPage.getByRole('tab', { name: 'Kalkulation', exact: true }).click();
      const readOnlyCalculation = invitedPage.locator('.calculation-panel');
      await expect(readOnlyCalculation).toContainText('E2E Tontechnik');
      await expect(
        readOnlyCalculation.getByRole('button', { name: 'Zur Prüfung', exact: true }),
      ).toHaveCount(0);
      await expect(
        readOnlyCalculation.getByRole('button', { name: 'Freigeben', exact: true }),
      ).toHaveCount(0);
      const phase7EventId = phase7EventDetailPath.split('/').at(-1)!;
      const redactedResponse = await invitedContext.request.get(
        new URL(
          `/api/v1/organizations/${organizationId}/events/${phase7EventId}/calculation`,
          invitedPage.url(),
        ).toString(),
      );
      expect(redactedResponse.status()).toBe(200);
      const redactedCalculation = (await redactedResponse.json()) as {
        positions: Array<Record<string, unknown>>;
        bookingCosts: Array<Record<string, unknown>>;
        totals: Record<string, unknown>;
      };
      expect(redactedCalculation.positions[0]).not.toHaveProperty('purchaseUnitPriceMinor');
      expect(redactedCalculation.positions[0]).not.toHaveProperty('salesUnitPriceMinor');
      expect(redactedCalculation.bookingCosts[0]).not.toHaveProperty('amountMinor');
      expect(redactedCalculation.totals).not.toHaveProperty('estimatedCostMinor');
      expect(redactedCalculation.totals).not.toHaveProperty('serviceMarginMinor');

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
    } finally {
      await invitedContext.close();
    }
  });
});
