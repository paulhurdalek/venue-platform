import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const administratorEmail = 'e2e-admin@example.test';
const administratorPassword = 'Local-E2E-Admin-42!';
const invitedEmail = 'e2e-member@example.test';
const invitedPassword = 'Local-E2E-Member-42!';
const focusedScenarioTimeout = 90_000;
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

test.describe.serial('Phase 1, Phase 3, Phase 4 and Phase 5 browser acceptance', () => {
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
    await expect(page.locator('input[name="name"]')).toHaveCount(0);
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
    await expect(page.locator('input[name="name"]')).toHaveCount(0);
    await expect(page.getByText('E2E Late Show', { exact: true })).toBeVisible();
    await expect(page.getByText('Fremdveranstaltung / Vermietung', { exact: true })).toBeVisible();
    await expect(page.getByText('01:30 (+1 Tag)', { exact: true })).toBeVisible();
    await expect(page.getByText('Inaktiv', { exact: true })).toBeVisible();
  });

  test('Phase 5: read-only detail, edit cancel/save and confirmed status', async () => {
    await page.goto(eventDetailPath);
    await expect(page.locator('input[name="name"]')).toHaveCount(0);
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
    await expect(page.locator('input[name="name"]')).toHaveCount(0);

    await page.getByLabel('Status ändern').selectOption('CONFIRMED');
    await page.getByRole('button', { name: 'Übernehmen', exact: true }).click();
    await expect(page.locator('.page-heading .status-badge')).toHaveText('Bestätigt');

    await page.getByLabel('Status ändern').selectOption('CANCELLED');
    await page.getByRole('button', { name: 'Übernehmen', exact: true }).click();
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
    await artistContactForm
      .getByRole('button', { name: 'Kontakt verknüpfen', exact: true })
      .click();
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
    await partnerContactForm
      .getByRole('button', { name: 'Kontakt verknüpfen', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Mara E2E', exact: true })).toBeVisible();
    await partnerContactSelect.selectOption({ label: 'Juno E2E' });
    await partnerContactForm.getByRole('checkbox', { name: 'Booking', exact: true }).uncheck();
    await partnerContactForm.getByRole('checkbox', { name: 'Management', exact: true }).check();
    await partnerContactForm
      .getByRole('button', { name: 'Kontakt verknüpfen', exact: true })
      .click();
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

  test('Phase 1, Phase 3, Phase 4 and Phase 5: read-only authorization and logout', async ({
    browser,
  }) => {
    await openOrganizationHome(page, organizationId);
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
