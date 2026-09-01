import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';

const administratorEmail = 'e2e-admin@example.test';
const administratorPassword = 'Local-E2E-Admin-42!';
const invitedPassword = 'Local-E2E-Member-42!';
const focusedScenarioTimeout = 180_000;
const e2eBaseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

function pdfResponseText(body: Buffer, contentEncoding?: string): string {
  const decoded =
    contentEncoding === 'br'
      ? brotliDecompressSync(body)
      : contentEncoding === 'gzip'
        ? gunzipSync(body)
        : contentEncoding === 'deflate'
          ? inflateSync(body)
          : body;
  return decoded.toString('latin1');
}

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

async function openOrganizationMenu(page: Page) {
  const trigger = page
    .locator('.workspace-sidebar')
    .getByRole('button', { name: /Organisationsmenü/ });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
}

async function activateOrganizationMenuLink(
  page: Page,
  name: 'Location' | 'Organisation' | 'Team',
) {
  await openOrganizationMenu(page);
  const link = page
    .locator('.workspace-account-menu__content')
    .getByRole('link', { name, exact: true });
  await link.focus();
  await expect(link).toBeFocused();
  await link.press('Enter');
}

async function exerciseLifecycle(
  page: Page,
  entityLabel: 'Artist' | 'Kontakt' | 'Geschäftspartner' | 'Veranstaltungsformat',
  options: { cancel?: boolean; keyboard?: boolean } = {},
) {
  const entityArticle = entityLabel === 'Veranstaltungsformat' ? 'Das' : 'Der';
  const statusBadge = (status: 'Aktiv' | 'Archiviert') =>
    page.locator('.page-heading').getByText(status, { exact: true });
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
    await expect(statusBadge('Aktiv')).toBeVisible();
    await expect(trigger).toBeFocused();
  }

  await trigger.click();
  await page.getByRole('menuitem', { name: `${entityLabel} archivieren`, exact: true }).click();
  const archiveDialog = page.getByRole('dialog', {
    name: `${entityLabel} archivieren?`,
    exact: true,
  });
  await archiveDialog.getByRole('button', { name: 'Archivieren', exact: true }).click();
  await expect(statusBadge('Archiviert')).toBeVisible();
  await expect(page.getByText(`${entityArticle} ${entityLabel} wurde archiviert.`)).toBeVisible();

  await trigger.click();
  await page.getByRole('menuitem', { name: 'Reaktivieren', exact: true }).click();
  const reactivateDialog = page.getByRole('dialog', {
    name: `${entityLabel} reaktivieren?`,
    exact: true,
  });
  await reactivateDialog.getByRole('button', { name: 'Reaktivieren', exact: true }).click();
  await expect(statusBadge('Aktiv')).toBeVisible();
  await expect(page.getByText(`${entityArticle} ${entityLabel} wurde reaktiviert.`)).toBeVisible();
}

type Phase6Scenario = {
  artistId: string;
  artistName: string;
  context: BrowserContext;
  eventDetailPath: string;
  eventId: string;
  organizationId: string;
  page: Page;
};

type OwnerSession = {
  context: BrowserContext;
  locationId: string;
  organizationId: string;
  page: Page;
};

async function requireOk(response: Awaited<ReturnType<Page['context']>['request']['get']>) {
  if (!response.ok()) {
    throw new Error(`Fixture request failed with ${response.status()}: ${await response.text()}`);
  }
  return response;
}

function fixtureToken(scenario: string) {
  return `${scenario}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isolatedClientIp(scenario: string) {
  let hash = 2_166_136_261;
  for (const character of scenario) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  const unsignedHash = hash >>> 0;
  return `198.18.${((unsignedHash >>> 8) % 254) + 1}.${(unsignedHash % 254) + 1}`;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Venue', exact: true })).toBeVisible();
}

async function bootstrapAdministrator(browser: Browser) {
  const bootstrapLink = process.env.E2E_BOOTSTRAP_LINK;
  if (!bootstrapLink) throw new Error('E2E_BOOTSTRAP_LINK is required');
  const context = await browser.newContext({ baseURL: e2eBaseUrl });
  const page = await context.newPage();
  attachBrowserDiagnostics(page);
  try {
    await page.goto(bootstrapLink);
    const setupHeading = page.getByRole('heading', {
      name: 'Organisation einrichten.',
      exact: true,
    });
    if (await setupHeading.isVisible()) {
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
    }
  } finally {
    await context.close();
  }
}

async function createOwnerSession(browser: Browser, scenario: string): Promise<OwnerSession> {
  const context = await browser.newContext({
    baseURL: e2eBaseUrl,
    extraHTTPHeaders: { 'x-forwarded-for': isolatedClientIp(`owner-${scenario}`) },
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  attachBrowserDiagnostics(page);
  try {
    await signIn(page, administratorEmail, administratorPassword);
    const organizationId = new URL(page.url()).pathname.split('/')[2]!;
    const locationsResponse = await requireOk(
      await context.request.get(`/api/v1/organizations/${organizationId}/locations`),
    );
    const locations = (await locationsResponse.json()) as Array<{ id: string }>;
    if (!locations[0]) throw new Error('E2E fixture requires the bootstrap location.');
    return { context, locationId: locations[0].id, organizationId, page };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function createEventFormatFixture(
  session: OwnerSession,
  scenario: string,
  overrides: Record<string, unknown> = {},
) {
  const name = `E2E Format ${fixtureToken(scenario)}`;
  const response = await requireOk(
    await session.context.request.post(
      `/api/v1/organizations/${session.organizationId}/event-formats`,
      {
        data: {
          name,
          eventKind: 'OWN_PRODUCTION',
          defaultTechnicalGetInTime: '16:00',
          defaultArtistGetInTime: '17:30',
          defaultDoorsTime: '19:00',
          defaultStartTime: '20:00',
          defaultEndTime: '01:30',
          defaultEndNextDay: true,
          recordingDefault: 'ENABLED',
          ...overrides,
        },
      },
    ),
  );
  const format = (await response.json()) as { id: string; name: string };
  return { ...format, detailPath: `/o/${session.organizationId}/event-formats/${format.id}` };
}

async function createEventFixture(
  session: OwnerSession,
  scenario: string,
  overrides: Record<string, unknown> = {},
) {
  const name = `E2E Event ${fixtureToken(scenario)}`;
  const response = await requireOk(
    await session.context.request.post(`/api/v1/organizations/${session.organizationId}/events`, {
      data: {
        eventDate: '2098-06-15',
        eventKind: 'OWN_PRODUCTION',
        locationId: session.locationId,
        name,
        startTime: '20:00',
        ...overrides,
      },
    }),
  );
  const event = (await response.json()) as { id: string; name: string; version: number };
  return { ...event, detailPath: `/o/${session.organizationId}/events/${event.id}` };
}

async function createArtistFixture(session: OwnerSession, scenario: string) {
  const name = `E2E Artist ${fixtureToken(scenario)}`;
  const response = await requireOk(
    await session.context.request.post(`/api/v1/organizations/${session.organizationId}/artists`, {
      data: { stageName: name },
    }),
  );
  const artist = (await response.json()) as { id: string };
  return { id: artist.id, name, detailPath: `/o/${session.organizationId}/artists/${artist.id}` };
}

async function createContactFixture(
  session: OwnerSession,
  scenario: string,
  overrides: Record<string, unknown> = {},
) {
  const token = fixtureToken(scenario);
  const firstName = typeof overrides.firstName === 'string' ? overrides.firstName : 'E2E';
  const lastName = typeof overrides.lastName === 'string' ? overrides.lastName : `Contact ${token}`;
  const email = `${token}@example.test`;
  const response = await requireOk(
    await session.context.request.post(`/api/v1/organizations/${session.organizationId}/contacts`, {
      data: { firstName, lastName, email, ...overrides },
    }),
  );
  const contact = (await response.json()) as { id: string };
  return {
    id: contact.id,
    name: `${firstName} ${lastName}`,
    email: typeof overrides.email === 'string' ? overrides.email : email,
    mobile: typeof overrides.mobile === 'string' ? overrides.mobile : null,
    phone: typeof overrides.phone === 'string' ? overrides.phone : null,
    detailPath: `/o/${session.organizationId}/contacts/${contact.id}`,
  };
}

async function roleId(
  session: OwnerSession,
  resource: 'contact-roles' | 'business-partner-roles',
  key: string,
) {
  const response = await requireOk(
    await session.context.request.get(
      `/api/v1/organizations/${session.organizationId}/${resource}`,
    ),
  );
  const roles = (await response.json()) as Array<{ id: string; key: string }>;
  const role = roles.find((candidate) => candidate.key === key);
  if (!role) throw new Error(`E2E fixture role ${key} is missing.`);
  return role.id;
}

async function createBusinessPartnerFixture(
  session: OwnerSession,
  scenario: string,
  overrides: Record<string, unknown> = {},
) {
  const name = `E2E Partner ${fixtureToken(scenario)}`;
  const response = await requireOk(
    await session.context.request.post(
      `/api/v1/organizations/${session.organizationId}/business-partners`,
      { data: { companyName: name, ...overrides } },
    ),
  );
  const partner = (await response.json()) as { id: string };
  return {
    id: partner.id,
    name,
    detailPath: `/o/${session.organizationId}/business-partners/${partner.id}`,
  };
}

async function createRepresentationFixture(session: OwnerSession, scenario: string) {
  const phoneSuffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')}`;
  const artist = await createArtistFixture(session, `${scenario}-artist`);
  const directContact = await createContactFixture(session, `${scenario}-direct`, {
    firstName: 'Mara',
    label: 'Management',
    phone: `+49 30 ${phoneSuffix}`,
    mobile: `+49 171 ${phoneSuffix}`,
  });
  const representative = await createContactFixture(session, `${scenario}-representative`, {
    firstName: 'Juno',
    label: 'Management',
    phone: `+49 172 ${phoneSuffix}`,
  });
  const agencyRoleId = await roleId(session, 'business-partner-roles', 'agency');
  const managementRoleId = await roleId(session, 'contact-roles', 'management');
  const bookingRoleId = await roleId(session, 'contact-roles', 'booking');
  const partner = await createBusinessPartnerFixture(session, `${scenario}-agency`, {
    roleIds: [agencyRoleId],
  });
  await requireOk(
    await session.context.request.post(
      `/api/v1/organizations/${session.organizationId}/artists/${artist.id}/contacts`,
      { data: { contactId: directContact.id, roleIds: [managementRoleId] } },
    ),
  );
  await requireOk(
    await session.context.request.post(
      `/api/v1/organizations/${session.organizationId}/business-partners/${partner.id}/contacts`,
      { data: { contactId: directContact.id, roleIds: [bookingRoleId] } },
    ),
  );
  const representativeLinkResponse = await requireOk(
    await session.context.request.post(
      `/api/v1/organizations/${session.organizationId}/business-partners/${partner.id}/contacts`,
      { data: { contactId: representative.id, roleIds: [managementRoleId] } },
    ),
  );
  const partnerWithContacts = (await representativeLinkResponse.json()) as {
    contacts: Array<{ id: string; contact: { id: string } }>;
  };
  const representativePartnerContact = partnerWithContacts.contacts.find(
    (association) => association.contact.id === representative.id,
  );
  if (!representativePartnerContact)
    throw new Error('E2E representative contact association is missing.');
  return {
    agencyRoleId,
    artist,
    bookingRoleId,
    directContact,
    managementRoleId,
    partner,
    representative,
    representativePartnerContactId: representativePartnerContact.id,
  };
}

async function createDealFixture(session: OwnerSession, scenario: string) {
  const businessPartner = await createBusinessPartnerFixture(
    session,
    `${scenario}-business-partner`,
  );
  const event = await createEventFixture(session, `${scenario}-event`, {
    eventKind: 'THIRD_PARTY_EVENT',
  });
  const templateResponse = await requireOk(
    await session.context.request.post(
      `/api/v1/organizations/${session.organizationId}/deal-templates`,
      {
        data: {
          name: `E2E Deal Template ${fixtureToken(scenario)}`,
          components: [
            {
              type: 'FIXED_RENT',
              label: 'Saalmiete',
              amountNetMinor: '100000',
              taxRateBasisPoints: 1900,
              includeWkz: false,
            },
          ],
          servicePositions: [],
        },
      },
    ),
  );
  const template = (await templateResponse.json()) as { id: string };
  const dealResponse = await requireOk(
    await session.context.request.post(
      `/api/v1/organizations/${session.organizationId}/events/${event.id}/deal`,
      { data: { businessPartnerId: businessPartner.id, templateId: template.id } },
    ),
  );
  const deal = (await dealResponse.json()) as { id: string };
  return { businessPartner, deal, event, template };
}

async function createOfferFixture(session: OwnerSession, scenario: string, title: string) {
  const source = await createDealFixture(session, scenario);
  const templateResponse = await requireOk(
    await session.context.request.post(
      `/api/v1/organizations/${session.organizationId}/document-templates`,
      {
        data: {
          name: `E2E Offer Template ${fixtureToken(scenario)}`,
          type: 'OFFER',
          title,
          blocks: [],
          footer: null,
        },
      },
    ),
  );
  const template = (await templateResponse.json()) as { id: string };
  const documentResponse = await requireOk(
    await session.context.request.post(
      `/api/v1/organizations/${session.organizationId}/events/${source.event.id}/documents`,
      {
        data: {
          type: 'OFFER',
          templateId: template.id,
          dealId: source.deal.id,
          title,
        },
      },
    ),
  );
  const document = (await documentResponse.json()) as { id: string; revision: number };
  return { ...source, document, documentTemplate: template };
}

async function selectExactArtist(bookingEditor: ReturnType<Page['locator']>, artistName: string) {
  const search = bookingEditor.getByRole('combobox', {
    name: 'Artist suchen und auswählen',
    exact: true,
  });
  await search.fill(artistName);
  await bookingEditor.getByRole('option', { name: artistName, exact: true }).click();
  await expect(search).toHaveValue(artistName);
  await expect(bookingEditor.locator('.artist-selection')).toHaveText(`Ausgewählt: ${artistName}`);
}

async function createReadOnlySession(
  browser: Browser,
  owner: OwnerSession,
  scenario: string,
  verifyClipboard = false,
) {
  const token = fixtureToken(scenario).toLowerCase();
  const email = `${token}@example.test`;
  const invitationLink = await test.step('eigene Leserechte-Einladung anlegen', async () => {
    await openOrganizationHome(owner.page, owner.organizationId);
    await activateOrganizationMenuLink(owner.page, 'Team');
    await owner.page.getByRole('button', { name: 'Einladung erstellen', exact: true }).click();
    await owner.page.getByLabel('E-Mail-Adresse').fill(email);
    await owner.page
      .locator('.invitation-form')
      .getByRole('checkbox', { name: /^Lesend\b/ })
      .check();
    await owner.page.getByRole('button', { name: 'Einladungslink erstellen' }).click();
    await expect(
      owner.page.getByText(/Der Link wird nur jetzt vollständig angezeigt/),
    ).toBeVisible();
    const link = await owner.page.getByLabel('Einladungslink').inputValue();
    if (verifyClipboard) {
      await owner.page.getByRole('button', { name: 'Link kopieren' }).click();
      await expect(owner.page.getByText('Der Einladungslink wurde kopiert.')).toBeVisible();
      expect(await owner.page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    }
    return link;
  });

  const context = await browser.newContext({
    baseURL: e2eBaseUrl,
    extraHTTPHeaders: { 'x-forwarded-for': isolatedClientIp(`reader-${scenario}`) },
  });
  const page = await context.newPage();
  attachBrowserDiagnostics(page);
  try {
    await test.step('eigene Leserechte-Einladung annehmen', async () => {
      await page.goto(invitationLink);
      await expect(
        page.getByRole('heading', { name: 'E2E Venue beitreten.', exact: true }),
      ).toBeVisible();
      await page.getByLabel('Ihr Name').fill(`E2E Reader ${scenario}`);
      await page.locator('input[name="password"]').fill(invitedPassword);
      await page.locator('input[name="passwordConfirmation"]').fill(invitedPassword);
      await page.getByRole('button', { name: 'Konto anlegen und Einladung annehmen' }).click();
      await expect(
        page.getByRole('heading', { name: 'Willkommen zurück.', exact: true }),
      ).toBeVisible();
    });
    await test.step('mit eigener Leserechte-Sitzung anmelden', async () => {
      await signIn(page, email, invitedPassword);
    });
    return { context, email, page };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function createPhase6Scenario(
  session: OwnerSession,
  scenario: string,
): Promise<Phase6Scenario> {
  const { context, organizationId, page } = session;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const eventName = `E2E Phase 6 ${scenario} ${token}`;
  const eventResponse = await requireOk(
    await context.request.post(`/api/v1/organizations/${organizationId}/events`, {
      data: {
        eventDate: '2098-06-15',
        eventKind: 'OWN_PRODUCTION',
        locationId: session.locationId,
        name: eventName,
        startTime: '20:00',
      },
    }),
  );
  const event = (await eventResponse.json()) as { id: string };

  const artistName = `E2E Phase 6 Artist ${scenario} ${token}`;
  const artistResponse = await requireOk(
    await context.request.post(`/api/v1/organizations/${organizationId}/artists`, {
      data: { stageName: artistName },
    }),
  );
  const artist = (await artistResponse.json()) as { id: string };

  return {
    artistId: artist.id,
    artistName,
    context,
    eventDetailPath: `/o/${organizationId}/events/${event.id}`,
    eventId: event.id,
    organizationId,
    page,
  };
}

async function closePhase6Scenario(scenario: Phase6Scenario) {
  if (!scenario.page.isClosed()) {
    await scenario.page.unrouteAll({ behavior: 'ignoreErrors' });
  }
}

test.describe('Phase 1 through Phase 10 browser acceptance', () => {
  // Database reset and the one-time bootstrap link make the complete E2E command the retry boundary.
  test.describe.configure({ mode: 'default', retries: 0, timeout: focusedScenarioTimeout });

  let administratorContext: BrowserContext | undefined;
  let page: Page;
  let organizationId = '';
  let ownerSession: OwnerSession;

  test.beforeAll(async ({ browser }) => {
    await bootstrapAdministrator(browser);
  });

  test.beforeEach(async ({ browser }, testInfo) => {
    ownerSession = await createOwnerSession(browser, testInfo.title);
    administratorContext = ownerSession.context;
    page = ownerSession.page;
    organizationId = ownerSession.organizationId;
  });

  test.afterEach(async () => {
    await administratorContext?.close();
    administratorContext = undefined;
  });

  test('Phase 1: bootstrap and administrator sign-in', async () => {
    await expect(page.getByRole('heading', { name: 'E2E Venue', exact: true })).toBeVisible();
    expect(organizationId).toBeTruthy();
  });

  test('Navigation: desktop sidebar and accessible mobile drawer', async () => {
    await openOrganizationHome(page, organizationId);
    await page.setViewportSize({ width: 1280, height: 900 });

    const desktopSidebar = page.locator('.workspace-sidebar');
    const desktopNavigation = desktopSidebar.getByRole('navigation', {
      name: 'Hauptnavigation',
      exact: true,
    });
    await expect(desktopSidebar).toBeVisible();
    await expect(desktopSidebar.getByText('Venue Platform', { exact: true })).toBeVisible();
    await expect(
      desktopNavigation.getByRole('link', { name: 'Übersicht', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    const masterDataTrigger = desktopNavigation.getByRole('button', {
      name: 'Stammdaten',
      exact: true,
    });
    const templatesTrigger = desktopNavigation.getByRole('button', {
      name: 'Vorlagen',
      exact: true,
    });
    await expect(masterDataTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(templatesTrigger).toHaveAttribute('aria-expanded', 'true');
    await masterDataTrigger.click();
    await expect(masterDataTrigger).toHaveAttribute('aria-expanded', 'false');
    await expect(desktopNavigation.getByRole('link', { name: 'Artists', exact: true })).toHaveCount(
      0,
    );
    await page.reload();
    await expect(masterDataTrigger).toHaveAttribute('aria-expanded', 'false');

    await page.goto(`/o/${organizationId}/artists`);
    await expect(page.getByRole('heading', { name: 'Artists', exact: true })).toBeVisible();
    await expect(masterDataTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(desktopNavigation.locator('.workspace-nav__group--active')).toContainText(
      'Stammdaten',
    );
    await expect(
      desktopNavigation.getByRole('link', { name: 'Artists', exact: true }),
    ).toHaveAttribute('aria-current', 'page');

    await page.goto(`/o/${organizationId}/document-templates`);
    await expect(templatesTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(desktopNavigation.locator('.workspace-nav__group--active')).toContainText(
      'Vorlagen',
    );

    await desktopNavigation.getByRole('link', { name: 'Veranstaltungen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Veranstaltungen', exact: true })).toBeVisible();
    await masterDataTrigger.click();
    await expect(masterDataTrigger).toHaveAttribute('aria-expanded', 'true');

    const organizationMenu = desktopSidebar.getByRole('button', { name: /Organisationsmenü/ });
    await expect(organizationMenu).toHaveAttribute('aria-expanded', 'false');
    await organizationMenu.click();
    await expect(organizationMenu).toHaveAttribute('aria-expanded', 'true');
    await expect(
      desktopSidebar.getByRole('link', { name: 'Organisation', exact: true }),
    ).toBeVisible();
    await expect(desktopSidebar.getByRole('link', { name: 'Location', exact: true })).toBeVisible();
    await expect(desktopSidebar.getByRole('link', { name: 'Team', exact: true })).toBeVisible();
    await organizationMenu.click();
    await expect(organizationMenu).toHaveAttribute('aria-expanded', 'false');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(desktopSidebar).toBeHidden();
    const menuButton = page.getByRole('button', { name: 'Menü öffnen', exact: true });
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await menuButton.click();
    const drawer = page.getByRole('dialog', { name: 'Venue Platform', exact: true });
    const closeButton = drawer.getByRole('button', { name: 'Menü schließen', exact: true });
    await expect(drawer).toBeVisible();
    await expect(closeButton).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(menuButton).toBeFocused();

    await menuButton.click();
    await expect(drawer).toBeVisible();
    await page.locator('.workspace-drawer-backdrop').click({ position: { x: 380, y: 800 } });
    await expect(drawer).toHaveCount(0);

    await menuButton.click();
    await drawer.getByRole('link', { name: 'Übersicht', exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'E2E Venue', exact: true })).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('Phase 1: organization and location administration', async () => {
    await openOrganizationHome(page, organizationId);
    await activateOrganizationMenuLink(page, 'Organisation');
    await expect(page.getByRole('heading', { name: 'Organisation', exact: true })).toBeVisible();
    await expect(page.getByLabel('Rechtlicher Name')).toHaveCount(0);
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await page.getByLabel('Rechtlicher Name').fill('E2E Venue GmbH');
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expect(page.getByText('Die Organisationsdaten wurden gespeichert.')).toBeVisible();
    await expect(page.getByLabel('Rechtlicher Name')).toHaveCount(0);
    await expect(page.getByText('E2E Venue GmbH', { exact: true })).toBeVisible();

    await activateOrganizationMenuLink(page, 'Location');
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
    const eventFormatDetailPath = new URL(page.url()).pathname;
    expect(eventFormatDetailPath).toContain('/event-formats/');
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
    const mobileOverflow = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      offenders: [...document.querySelectorAll<HTMLElement>('body *')]
        .map((element) => ({
          className: element.className,
          right: Math.round(element.getBoundingClientRect().right),
          tagName: element.tagName,
        }))
        .filter((element) => element.right > window.innerWidth + 1)
        .slice(0, 10),
    }));
    expect(mobileOverflow, JSON.stringify(mobileOverflow)).toMatchObject({ fits: true });
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('Phase 5: empty calendar and event creation from visible format defaults', async () => {
    const eventFormat = await createEventFormatFixture(ownerSession, 'event-defaults', {
      eventKind: 'THIRD_PARTY_EVENT',
      recordingDefault: 'DISABLED',
    });
    await openOrganizationHome(page, organizationId);
    await page.getByRole('link', { name: 'Veranstaltungen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Veranstaltungen', exact: true })).toBeVisible();
    await page.goto(`/o/${organizationId}/events?view=calendar&month=2097-01`);
    await expect(page.locator('.month-calendar')).toBeVisible();
    await expect(page.locator('.calendar-event')).toHaveCount(0);

    await page.getByRole('link', { name: 'Veranstaltung anlegen', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Veranstaltung anlegen', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: 'Veranstaltungsformat', exact: true }),
    ).toContainText(eventFormat.name);
    await page
      .getByRole('combobox', { name: 'Veranstaltungsformat', exact: true })
      .selectOption({ label: eventFormat.name });
    await expect(page.getByLabel('Veranstaltungsname')).toHaveValue(eventFormat.name);
    await expect(page.getByLabel('Get-in Technik')).toHaveValue('16:00');
    await expect(page.getByLabel('Get-in Artists')).toHaveValue('17:30');
    await expect(page.getByLabel('Einlass')).toHaveValue('19:00');
    await expect(page.getByLabel('Beginn')).toHaveValue('20:00');
    await expect(page.getByRole('textbox', { name: 'Ende optional', exact: true })).toHaveValue(
      '01:30',
    );
    await expect(page.getByLabel('Tag des Endes')).toHaveValue('NEXT');
    await expect(page.getByLabel('Location')).toHaveValue(/.+/);
    await page.getByLabel('Datum').fill('2097-01-23');
    const eventName = `E2E Venue Night ${fixtureToken('visible-defaults')}`;
    await page.getByLabel('Veranstaltungsname').fill(eventName);
    await page.getByRole('button', { name: 'Veranstaltung anlegen', exact: true }).click();

    await expect(page.getByRole('heading', { name: eventName, exact: true })).toBeVisible();
    await expect(page.locator('#event-detail-editor input[name="name"]')).toHaveCount(0);
    await expect(
      page.locator('#event-detail-editor').getByText(eventFormat.name, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Fremdveranstaltung / Vermietung', { exact: true })).toBeVisible();
    await expect(page.getByText('01:30 (+1 Tag)', { exact: true })).toBeVisible();
    await expect(page.getByText('Inaktiv', { exact: true })).toBeVisible();
  });

  test('Phase 5: read-only detail, edit cancel/save and confirmed status', async () => {
    const event = await createEventFixture(ownerSession, 'detail-lifecycle', {
      name: `E2E Venue Night ${fixtureToken('detail')}`,
    });
    await page.goto(event.detailPath);
    await expect(page.locator('#event-detail-editor input[name="name"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await page.getByLabel('Veranstaltungsname').fill('Dieser Entwurf wird verworfen');
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(page.getByText('Dieser Entwurf wird verworfen', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: event.name, exact: true })).toBeVisible();

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
    const eventFormat = await createEventFormatFixture(ownerSession, 'free-event');
    await page.goto(`/o/${organizationId}/events/new`);
    await page
      .getByRole('combobox', { name: 'Veranstaltungsformat', exact: true })
      .selectOption({ label: eventFormat.name });
    await expect(page.getByLabel('Veranstaltungsname')).toHaveValue(eventFormat.name);
    await page.getByRole('radio', { name: 'Ohne Veranstaltungsformat', exact: true }).check();
    await expect(
      page.getByRole('combobox', { name: 'Veranstaltungsformat', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel('Veranstaltungsname')).toHaveValue('');
    await expect(page.getByLabel('Get-in Technik')).toHaveValue('');
    await page
      .getByRole('combobox', { name: 'Veranstaltungsart', exact: true })
      .selectOption('OWN_PRODUCTION');
    const eventName = `E2E Freies Event ${fixtureToken('free')}`;
    await page.getByLabel('Veranstaltungsname').fill(eventName);
    await page.getByLabel('Datum').fill('2097-01-24');
    await page.getByRole('button', { name: 'Veranstaltung anlegen', exact: true }).click();

    await expect(page.getByRole('heading', { name: eventName, exact: true })).toBeVisible();
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
    await expect(
      page.locator('.page-heading').getByText('1. Option', { exact: true }),
    ).toBeVisible();
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
    await expect(
      page.locator('.page-heading').getByText('2. Option', { exact: true }),
    ).toBeVisible();
    const dateOptionDetailPath = new URL(page.url()).pathname;

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
    await expect(
      page.locator('.page-heading').getByText('1. Option', { exact: true }),
    ).toBeVisible();
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
    await page.getByLabel('Von').fill('2097-03-07');
    await page.getByLabel('Bis').fill('2097-03-08');
    await page.getByLabel('Fr', { exact: true }).check();
    await page.getByRole('button', { name: 'Freitermine prüfen', exact: true }).click();
    const results = page.getByLabel('Ergebnisse der Freiterminsuche');
    await expect(results.locator('.availability-result')).toHaveCount(1);
    const friday = results.locator('.availability-result').filter({ hasText: '8. März 2097' });
    await expect(friday).toContainText('Frei');
    await friday.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Auswahl kopieren', exact: true }).click();
    await expect(page.getByText('1 Termin wurde in die Zwischenablage kopiert.')).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain(
      'Folgende Termine können wir Ihnen derzeit unverbindlich anbieten:',
    );
    expect(clipboard).toContain('Freitag, 8. März 2097 | 16:00–23:00');
    expect(clipboard).toContain(
      'Die Verfügbarkeit kann sich bis zur ausdrücklichen Optionierung ändern.',
    );
    expect(clipboard).not.toContain('E2E Erste Option');
  });

  test('Phase 5: keyboard batch selection proposes ranks and creates independent options', async () => {
    await requireOk(
      await ownerSession.context.request.post(
        `/api/v1/organizations/${organizationId}/date-options`,
        {
          data: {
            label: `E2E existing option ${fixtureToken('batch-rank')}`,
            locationId: ownerSession.locationId,
            occupancyEndTime: '23:00',
            occupancyStartTime: '16:00',
            optionDate: '2097-03-06',
            validUntil: '2097-03-05T23:59:59.000Z',
          },
        },
      ),
    );
    await page.goto(`/o/${organizationId}/events?view=free`);
    await page.getByLabel('Von').fill('2097-03-06');
    await page.getByLabel('Bis').fill('2097-03-07');
    await page
      .getByRole('combobox', { name: 'Ergebnisfilter', exact: true })
      .selectOption('FREE_AND_SECOND_OPTION');
    await page.getByRole('button', { name: 'Freitermine prüfen', exact: true }).click();

    const firstDate = page.getByRole('checkbox', {
      name: 'Mittwoch, 6. März 2097 auswählen',
      exact: true,
    });
    const secondDate = page.getByRole('checkbox', {
      name: 'Donnerstag, 7. März 2097 auswählen',
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
    const eventName = `E2E Calendar Event ${fixtureToken('calendar')}`;
    const event = await createEventFixture(ownerSession, 'calendar-list', {
      eventDate: '2097-02-23',
      name: eventName,
      startTime: '20:30',
    });
    await requireOk(
      await ownerSession.context.request.patch(
        `/api/v1/organizations/${organizationId}/events/${event.id}/status`,
        { data: { version: event.version, status: 'CONFIRMED' } },
      ),
    );
    await page.goto(`/o/${organizationId}/events?view=calendar&month=2097-02`);
    const calendarEvent = page.locator('.calendar-event').filter({ hasText: eventName });
    await expect(calendarEvent).toBeVisible();
    await expect(calendarEvent).toContainText('20:30');
    await expect(
      page.locator('.month-calendar__day').filter({ has: calendarEvent }),
    ).toHaveAttribute('aria-label', /23\. Februar 2097/);

    await page.getByRole('link', { name: 'Liste', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Liste', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.getByLabel('Suche').fill(eventName);
    await page.getByLabel('Status').selectOption('CONFIRMED');
    await page.getByRole('button', { name: 'Filtern', exact: true }).click();
    const row = page.locator('.event-list-table tbody tr').filter({ hasText: eventName });
    await expect(row).toContainText('23.02.2097');
    await expect(row).toContainText('20:30');
    await expect(row).toContainText('Bestätigt');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/o/${organizationId}/events?view=calendar&month=2097-02`);
    await expect(page.locator('.month-calendar')).toBeHidden();
    await expect(page.locator('.calendar-agenda')).toBeVisible();
    await expect(page.locator('.agenda-event').filter({ hasText: eventName })).toBeVisible();
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
    const mara = await createContactFixture(ownerSession, 'partner-mara', {
      firstName: 'Mara',
      lastName: fixtureToken('partner-contact'),
    });
    const juno = await createContactFixture(ownerSession, 'partner-juno', {
      firstName: 'Juno',
      lastName: fixtureToken('partner-contact'),
    });
    const partnerName = `E2E Kulturservice ${fixtureToken('partner')} GmbH`;
    await openOrganizationHome(page, organizationId);
    await page.getByRole('link', { name: 'Geschäftspartner', exact: true }).click();
    await page.getByRole('link', { name: 'Geschäftspartner anlegen', exact: true }).click();
    await page.getByLabel('Firmenname', { exact: true }).fill(partnerName);
    await page.getByRole('checkbox', { name: 'Kunde', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Agentur', exact: true }).check();
    await page.getByRole('button', { name: 'Geschäftspartner anlegen', exact: true }).click();
    await expect(page.getByRole('heading', { name: partnerName, exact: true })).toBeVisible();
    await expect(page.locator('input[name="companyName"]')).toHaveCount(0);
    await expect(page.locator('.page-heading')).toContainText('Agentur');
    await expect(page.locator('.page-heading')).toContainText('Kunde');
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await expect(page.locator('input[name="companyName"]')).toHaveValue(partnerName);
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
    await partnerContactSelect.selectOption({ label: mara.name });
    await partnerContactForm.getByRole('checkbox', { name: 'Booking', exact: true }).check();
    await partnerContactForm
      .getByRole('button', { name: 'Kontakt verknüpfen', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: mara.name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ansprechpartner hinzufügen', exact: true }).click();
    await partnerContactSelect.selectOption({ label: juno.name });
    await partnerContactForm.getByRole('checkbox', { name: 'Booking', exact: true }).uncheck();
    await partnerContactForm.getByRole('checkbox', { name: 'Management', exact: true }).check();
    await partnerContactForm
      .getByRole('button', { name: 'Kontakt verknüpfen', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: juno.name, exact: true })).toBeVisible();
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
    const fixture = await createRepresentationFixture(ownerSession, 'representation');
    await page.goto(fixture.artist.detailPath);
    await expect(page.locator('.representation-create')).toHaveCount(0);
    await page.getByRole('button', { name: 'Vertretungen bearbeiten', exact: true }).click();
    const representationForm = page.locator('.representation-create');
    await representationForm
      .getByRole('combobox', { name: 'Agentur/Firma auswählen', exact: true })
      .selectOption({ label: fixture.partner.name });
    await representationForm
      .getByRole('group', { name: 'Rollen der Agentur/Firma für diesen Artist', exact: true })
      .getByRole('checkbox', { name: 'Agentur', exact: true })
      .check();
    const representationContactSelect = representationForm.getByRole('combobox', {
      name: 'Ansprechpartner dieser Agentur',
      exact: true,
    });
    const junoPartnerContactId = await representationContactSelect
      .locator('option', { hasText: fixture.representative.name })
      .getAttribute('value');
    expect(junoPartnerContactId).toBeTruthy();
    await representationContactSelect.selectOption(junoPartnerContactId!);
    await expect(
      representationForm
        .getByRole('combobox', { name: 'Ansprechpartner dieser Agentur', exact: true })
        .locator('option', { hasText: fixture.directContact.name }),
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
    const representativeCards = page.locator('.representative-card');
    await expect(representativeCards).toHaveCount(2);
    await expect(
      representativeCards.filter({ hasText: fixture.representative.name }),
    ).toBeVisible();
    await expect(representativeCards.filter({ hasText: 'Nova Inline' })).toBeVisible();
    await expect(page.locator('.representative-add')).toHaveCount(0);

    const representationCard = page.locator('.representation-card');
    await expect(
      representationCard.getByRole('link', { name: fixture.partner.name, exact: true }),
    ).toBeVisible();
    await expect(
      representationCard
        .locator('.representation-card__header')
        .getByText('Agentur', { exact: true }),
    ).toBeVisible();
    await expect(
      representationCard.getByRole('link', { name: fixture.representative.name, exact: true }),
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
      representationCard.locator(`a[href="mailto:${fixture.representative.email}"]`),
    ).toBeVisible();
    await expect(
      representationCard.locator(
        `a[href="tel:${fixture.representative.phone?.replace(/[^\d+]/g, '')}"]`,
      ),
    ).toBeVisible();
    await expect(
      representationCard.locator('a[href="mailto:nova.inline@example.test"]'),
    ).toBeVisible();

    const directContactCard = page
      .locator('.association-card')
      .filter({ hasText: fixture.directContact.name });
    await expect(
      directContactCard.locator(`a[href="mailto:${fixture.directContact.email}"]`),
    ).toBeVisible();
    await expect(
      directContactCard.locator(
        `a[href="tel:${fixture.directContact.phone?.replace(/[^\d+]/g, '')}"]`,
      ),
    ).toBeVisible();
    await expect(
      directContactCard.locator(
        `a[href="tel:${fixture.directContact.mobile?.replace(/[^\d+]/g, '')}"]`,
      ),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.getByRole('link', { name: 'Artists', exact: true }).click();
    const artistRow = page
      .locator('.master-data-table tbody tr')
      .filter({ hasText: fixture.artist.name });
    await expect(
      artistRow.getByRole('link', { name: fixture.partner.name, exact: true }),
    ).toBeVisible();
    await expect(
      artistRow.getByRole('link', { name: fixture.representative.name, exact: true }),
    ).toBeVisible();
    await expect(
      artistRow.locator(`a[href="mailto:${fixture.representative.email}"]`),
    ).toBeVisible();
    await expect(
      artistRow.locator(`a[href="tel:${fixture.representative.phone?.replace(/[^\d+]/g, '')}"]`),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Geschäftspartner', exact: true }).click();
    await page.getByRole('link', { name: fixture.partner.name, exact: true }).click();

    await exerciseLifecycle(page, 'Geschäftspartner');
  });

  test('Phase 6: line-up requirements and booking creation', async () => {
    const scenario = await createPhase6Scenario(ownerSession, 'lineup');
    const { artistName, eventDetailPath, page } = scenario;
    try {
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
      const headliner = requirements.getByRole('group', { name: 'Position 3', exact: true });
      await headliner.getByRole('combobox', { name: 'Rolle', exact: true }).selectOption('OTHER');
      await headliner
        .getByRole('textbox', { name: 'Rollenbezeichnung', exact: true })
        .fill('Headliner');
      await headliner
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
      await expect(requirements).toContainText('Artists');
      await expect(requirements).toContainText('Moderator');
      await expect(requirements).toContainText('Headliner');
      await expect(requirements).toContainText('Standardgage: 650,00 €');

      await page.getByRole('tab', { name: 'Bookings', exact: true }).click();
      await expect(page).toHaveURL(/\?tab=bookings$/);
      await page.goBack();
      await expect(page).toHaveURL(/\?tab=lineup$/);
      await page.goForward();
      const bookingPanel = page.locator('.booking-panel');
      await bookingPanel
        .locator('.lineup-empty')
        .getByRole('button', { name: 'Ersten Artist hinzufügen', exact: true })
        .click();
      const editor = bookingPanel.locator('.booking-editor');
      await selectExactArtist(editor, artistName);
      await expect(editor.getByText(new RegExp(`Ausgewählt:.*${artistName}`))).toBeVisible();
      await expect(
        editor.getByRole('textbox', { name: 'Vereinbarte Gage optional / keine Gage' }),
      ).toHaveValue('880,00');
      await editor
        .getByRole('textbox', { name: 'Vereinbarte Gage optional / keine Gage' })
        .fill('1250,00');
      await editor.getByRole('textbox', { name: 'Reisekosten optional' }).fill('25.00');
      await editor
        .getByRole('textbox', { name: 'Interne Bookingnotiz optional', exact: true })
        .fill('E2E Booking mit produktionsnahen Kontaktdaten');
      await editor.getByRole('button', { name: 'Booking anlegen', exact: true }).click();
      await expect(page.getByText('Das Booking wurde angelegt.')).toBeVisible();
      const booking = bookingPanel.locator('.booking-card').filter({ hasText: artistName });
      await expect(booking).toContainText('Gage: 1.250,00 €');
      await expect(booking).toContainText('Reisekosten: 25,00 €');
      await booking
        .getByRole('button', { name: `Aktionen für Booking ${artistName}`, exact: true })
        .click();
      await page.getByRole('menuitem', { name: 'Status bearbeiten', exact: true }).click();
      await booking
        .getByRole('combobox', { name: `Status von ${artistName}`, exact: true })
        .selectOption('CONFIRMED');
      await expect(page.getByText('Status geändert: Bestätigt.', { exact: true })).toBeVisible();
      await expect(
        page.locator('.booking-progress-card').filter({ hasText: 'Artists' }),
      ).toContainText('1/1 bestätigt');
    } finally {
      await closePhase6Scenario(scenario);
    }
  });

  test('Phase 6: duplicate handling and quick creation', async () => {
    const scenario = await createPhase6Scenario(ownerSession, 'duplicates');
    const { artistName, eventDetailPath, page } = scenario;
    try {
      await page.goto(`${eventDetailPath}?tab=bookings`);
      const bookingPanel = page.locator('.booking-panel');
      await bookingPanel
        .locator('.lineup-empty')
        .getByRole('button', { name: 'Ersten Artist hinzufügen', exact: true })
        .click();
      let editor = bookingPanel.locator('.booking-editor');
      await selectExactArtist(editor, artistName);
      await editor.getByRole('button', { name: 'Booking anlegen', exact: true }).click();
      await expect(page.getByText('Das Booking wurde angelegt.')).toBeVisible();
      const originalBooking = bookingPanel.locator('.booking-card').filter({ hasText: artistName });
      await originalBooking
        .getByRole('button', { name: `Aktionen für Booking ${artistName}`, exact: true })
        .click();
      await page.getByRole('menuitem', { name: 'Status bearbeiten', exact: true }).click();
      await originalBooking
        .getByRole('combobox', { name: `Status von ${artistName}`, exact: true })
        .selectOption('CONFIRMED');
      await expect(page.getByText('Status geändert: Bestätigt.', { exact: true })).toBeVisible();

      await bookingPanel.getByRole('button', { name: 'Artist hinzufügen', exact: true }).click();
      editor = bookingPanel.locator('.booking-editor');
      await selectExactArtist(editor, artistName);
      await editor.getByRole('button', { name: 'Booking anlegen', exact: true }).click();
      const duplicateDialog = page.getByRole('dialog', {
        name: 'Dieser Artist ist für diese Veranstaltung bereits gebucht.',
      });
      await expect(duplicateDialog).toContainText('Artist · Bestätigt');
      await duplicateDialog
        .getByRole('button', { name: /Weiteren Auftritt zum bestehenden Booking hinzufügen/ })
        .click();
      await expect(
        page.getByText('Ein weiterer Auftritt wurde dem bestehenden Booking hinzugefügt.'),
      ).toBeVisible();

      await bookingPanel.getByRole('button', { name: 'Artist hinzufügen', exact: true }).click();
      editor = bookingPanel.locator('.booking-editor');
      await editor
        .getByRole('textbox', { name: 'Interne Bookingnotiz optional', exact: true })
        .fill('Bleibt bei der Schnellanlage erhalten');
      await editor.getByRole('button', { name: 'Artist neu anlegen', exact: true }).click();
      let quickDialog = page.getByRole('dialog', { name: 'Artist neu anlegen' });
      await quickDialog.getByLabel('Künstlername', { exact: true }).fill(artistName);
      await quickDialog.getByRole('button', { name: 'Prüfen und anlegen', exact: true }).click();
      await expect(quickDialog.getByText('Mögliche Dubletten', { exact: true })).toBeVisible();
      await expect(
        quickDialog.getByRole('button', { name: 'Diesen auswählen', exact: true }),
      ).toBeVisible();
      await quickDialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
      await expect(
        editor.getByRole('textbox', { name: 'Interne Bookingnotiz optional', exact: true }),
      ).toHaveValue('Bleibt bei der Schnellanlage erhalten');
      await editor.getByRole('button', { name: 'Artist neu anlegen', exact: true }).click();
      quickDialog = page.getByRole('dialog', { name: 'Artist neu anlegen' });
      const newcomer = `${artistName} Newcomer`;
      await quickDialog.getByLabel('Künstlername', { exact: true }).fill(newcomer);
      await quickDialog.getByLabel('Vorname optional', { exact: true }).fill('Nika');
      await quickDialog.getByLabel('Nachname optional', { exact: true }).fill('Neu');
      await quickDialog
        .getByLabel('E-Mail optional', { exact: true })
        .fill('nika.neu@example.test');
      await quickDialog.getByLabel('Telefon optional', { exact: true }).fill('+49 170 1002003');
      await quickDialog.getByRole('button', { name: 'Prüfen und anlegen', exact: true }).click();
      await expect(editor.getByText(new RegExp(`Ausgewählt:.*${newcomer}`))).toBeVisible();
      await expect(editor.getByText('Artist angelegt.')).toBeVisible();
    } finally {
      await closePhase6Scenario(scenario);
    }
  });

  test('Phase 6: performance order with drag-and-drop and keyboard reorder', async () => {
    const scenario = await createPhase6Scenario(ownerSession, 'order');
    const { artistId, artistName, context, eventDetailPath, eventId, organizationId, page } =
      scenario;
    try {
      const createBooking = async (confirmDuplicateArtist = false) =>
        requireOk(
          await context.request.post(
            `/api/v1/organizations/${organizationId}/events/${eventId}/bookings`,
            { data: { artistId, confirmDuplicateArtist, role: 'ARTIST', status: 'CONFIRMED' } },
          ),
        );
      await createBooking();
      await createBooking(true);
      await page.goto(`${eventDetailPath}?tab=lineup`);
      const order = page.locator('.performance-order');
      const rows = order.locator('.program-row').filter({ hasText: artistName });
      await expect(rows).toHaveCount(2);
      const programItemIds = await rows.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-program-item')),
      );
      const [firstProgramItemId, secondProgramItemId] = programItemIds;
      if (!firstProgramItemId || !secondProgramItemId) {
        throw new Error('Die beiden erwarteten Auftrittszeilen wurden nicht gefunden.');
      }
      for (const [programItemId, label] of [
        [firstProgramItemId, 'Set 1'],
        [secondProgramItemId, 'Set 2'],
      ] as const) {
        const row = order.locator(`.program-row[data-program-item="${programItemId}"]`);
        await row.getByRole('button', { name: new RegExp(`Aktionen für ${artistName}`) }).click();
        await page.getByRole('menuitem', { name: 'Bearbeiten', exact: true }).click();
        await row.getByRole('textbox', { name: 'Bezeichnung optional', exact: true }).fill(label);
        await row
          .getByRole('spinbutton', { name: 'Dauer in Minuten optional', exact: true })
          .fill('10');
        await row.getByRole('button', { name: 'Speichern', exact: true }).click();
      }
      await order
        .getByRole('button', { name: 'Art des neuen Programmpunkts auswählen', exact: true })
        .click();
      await page.getByRole('menuitem', { name: 'Umbauzeit', exact: true }).click();
      const breakEditor = order.locator('.program-item-editor');
      await breakEditor
        .getByRole('textbox', { name: 'Bezeichnung optional', exact: true })
        .fill('Umbaupause');
      await breakEditor
        .getByRole('spinbutton', { name: 'Dauer in Minuten optional', exact: true })
        .fill('20');
      await breakEditor.getByRole('button', { name: 'Programmpunkt anlegen', exact: true }).click();
      await expect(order).toContainText('bekannte Gesamtdauer 40 Minuten');

      let breakRow = order.locator('.program-row').filter({ hasText: 'Umbaupause' });
      await page.route('**/program/order', (route) =>
        route.fulfill({
          body: JSON.stringify({ code: 'VERSION_CONFLICT', message: 'Sortierung blockiert' }),
          contentType: 'application/json',
          status: 409,
        }),
      );
      await breakRow.getByRole('button', { name: 'Aktionen für Umbaupause', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Nach oben', exact: true }).click();
      await expect(
        page.getByText(/Die vorherige Reihenfolge wurde wiederhergestellt/),
      ).toBeVisible();
      await expect(order.locator('.program-row')).toContainText(['Set 1', 'Set 2', 'Umbaupause']);
      await page.unroute('**/program/order');

      breakRow = order.locator('.program-row').filter({ hasText: 'Umbaupause' });
      let secondSet = order.locator('.program-row').filter({ hasText: 'Set 2' });
      await breakRow.getByRole('button', { name: /Umbaupause ziehen/ }).dragTo(secondSet);
      await expect(page.getByText('Die Auftrittsreihenfolge wurde gespeichert.')).toBeVisible();
      secondSet = order.locator('.program-row').filter({ hasText: 'Set 2' });
      const handle = secondSet.getByRole('button', { name: new RegExp(`${artistName} ziehen`) });
      await handle.focus();
      await handle.press('ArrowUp');
      await expect(order.locator('.program-row')).toContainText(['Set 1', 'Set 2', 'Umbaupause']);
      const movedSecondSet = order.locator('.program-row').filter({ hasText: 'Set 2' });
      const movedHandle = movedSecondSet.getByRole('button', {
        name: new RegExp(`${artistName} ziehen`),
      });
      await expect(movedHandle).toBeEnabled();
      await movedHandle.press('ArrowDown');
      await expect(order.locator('.program-row')).toContainText(['Set 1', 'Umbaupause', 'Set 2']);
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Auftrittsreihenfolge', exact: true }),
      ).toBeVisible();
      const persisted = page.locator('.performance-order');
      await expect(persisted.locator('.program-row')).toContainText([
        'Set 1',
        'Umbaupause',
        'Set 2',
      ]);
    } finally {
      await closePhase6Scenario(scenario);
    }
  });

  test('Phase 6: finance, status changes and booking lifecycle', async () => {
    const scenario = await createPhase6Scenario(ownerSession, 'finance');
    const { eventDetailPath, page } = scenario;
    try {
      await page.goto(`${eventDetailPath}?tab=lineup`);
      const requirements = page.locator('.lineup-requirements');
      await requirements.getByRole('button', { name: 'Vorgaben bearbeiten', exact: true }).click();
      await requirements.getByRole('button', { name: 'Position hinzufügen', exact: true }).click();
      await requirements
        .getByRole('group', { name: 'Position 1', exact: true })
        .getByRole('combobox', { name: 'Rolle', exact: true })
        .selectOption('OTHER');
      await requirements
        .getByRole('group', { name: 'Position 1', exact: true })
        .getByRole('textbox', { name: 'Rollenbezeichnung', exact: true })
        .fill('Headliner');
      await requirements
        .getByRole('group', { name: 'Position 1', exact: true })
        .getByRole('textbox', { name: 'Standardgage optional', exact: true })
        .fill('650,00');
      await requirements.getByRole('button', { name: 'Vorgaben speichern', exact: true }).click();
      await page.getByRole('tab', { name: 'Bookings', exact: true }).click();
      const panel = page.locator('.booking-panel');
      await panel
        .locator('.lineup-empty')
        .getByRole('button', { name: 'Ersten Artist hinzufügen', exact: true })
        .click();
      const editor = panel.locator('.booking-editor');
      await editor.getByRole('button', { name: 'Artist neu anlegen', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Artist neu anlegen' });
      const newcomer = `E2E Finance Newcomer ${Date.now()}`;
      await dialog.getByLabel('Künstlername', { exact: true }).fill(newcomer);
      await dialog.getByLabel('E-Mail optional', { exact: true }).fill('nika.neu@example.test');
      await dialog.getByLabel('Telefon optional', { exact: true }).fill('+49 170 1002003');
      await dialog.getByRole('button', { name: 'Prüfen und anlegen', exact: true }).click();
      await expect(editor.getByText(new RegExp(`Ausgewählt:.*${newcomer}`))).toBeVisible();
      await editor
        .getByRole('combobox', { name: 'Rolle', exact: true })
        .selectOption({ label: 'Headliner' });
      await expect(
        editor.getByRole('textbox', { name: 'Vereinbarte Gage optional / keine Gage' }),
      ).toHaveValue('650,00');
      await editor
        .getByRole('combobox', { name: 'Anfangsstatus', exact: true })
        .selectOption('CONFIRMED');
      await editor
        .getByRole('combobox', { name: 'Hotelregelung', exact: true })
        .selectOption('BUYOUT');
      await editor
        .getByRole('textbox', { name: 'Buy-out-Betrag optional', exact: true })
        .fill('100,00');
      await editor
        .getByRole('textbox', { name: 'Hotelnotiz optional', exact: true })
        .fill('Eigenständig organisiert');
      const createBooking = editor.getByRole('button', { name: 'Booking anlegen', exact: true });
      await expect(createBooking).toBeEnabled();
      await createBooking.click();
      await expect(page.getByText('Das Booking wurde angelegt.')).toBeVisible();
      const booking = panel.locator('.booking-card').filter({ hasText: newcomer });
      await expect(booking).toContainText('Gage: 650,00 €');
      await expect(booking).toContainText('Eigenvertretung · Direktkontakt');
      await expect(
        booking
          .locator('.booking-contact-channels')
          .getByRole('link', { name: 'nika.neu@example.test', exact: true }),
      ).toBeVisible();
      await expect(
        booking
          .locator('.booking-contact-channels')
          .getByRole('link', { name: '+49 170 1002003', exact: true }),
      ).toBeVisible();
      await booking.getByText('Bookingdetails und Statushistorie', { exact: true }).click();
      await expect(booking).toContainText('Hotel-Buy-out');
      await expect(booking).toContainText('100,00 €');
      await expect(booking).toContainText('Eigenständig organisiert');
      await booking
        .getByRole('button', { name: `Aktionen für Booking ${newcomer}`, exact: true })
        .click();
      await page.getByRole('menuitem', { name: 'Booking bearbeiten', exact: true }).click();
      await expect(
        booking.getByRole('combobox', { name: 'Hotelregelung', exact: true }),
      ).toHaveValue('BUYOUT');
      await expect(
        booking.getByRole('textbox', { name: 'Buy-out-Betrag optional', exact: true }),
      ).toHaveValue('100,00');
      await booking.getByRole('button', { name: 'Abbrechen', exact: true }).click();
      await expect(
        panel.locator('.booking-progress-card').filter({ hasText: 'Headliner' }),
      ).toContainText('1/1 bestätigt');

      await page.route('**/bookings/*/status', (route) =>
        route.fulfill({
          body: JSON.stringify({
            code: 'VERSION_CONFLICT',
            message: 'Simulierter Versionskonflikt',
          }),
          contentType: 'application/json',
          status: 409,
        }),
      );
      await booking
        .getByRole('button', { name: `Aktionen für Booking ${newcomer}`, exact: true })
        .click();
      await page.getByRole('menuitem', { name: 'Status bearbeiten', exact: true }).click();
      await booking
        .getByRole('combobox', { name: `Status von ${newcomer}`, exact: true })
        .selectOption('OPTION');
      await expect(page.getByText('Simulierter Versionskonflikt', { exact: true })).toBeVisible();
      await expect(booking.getByText('Bestätigt', { exact: true })).toBeVisible();
      await page.unroute('**/bookings/*/status');

      await booking
        .getByRole('button', { name: `Aktionen für Booking ${newcomer}`, exact: true })
        .click();
      await page.getByRole('menuitem', { name: 'Status bearbeiten', exact: true }).click();
      await booking
        .getByRole('combobox', { name: `Status von ${newcomer}`, exact: true })
        .selectOption('CANCELLED');
      const statusDialog = page.getByRole('dialog', { name: /Status auf „Storniert“ setzen/ });
      await statusDialog.getByLabel('Statusnotiz optional').fill('E2E Statuskorrektur');
      await statusDialog.getByRole('button', { name: 'Änderung bestätigen', exact: true }).click();
      await expect(page.getByText('Status geändert: Storniert.', { exact: true })).toBeVisible();
      await expect(booking).toHaveCount(0);
      await panel.getByRole('checkbox', { name: 'Historische einblenden', exact: true }).check();
      const historical = panel.locator('.booking-card').filter({ hasText: newcomer });
      await expect(historical.getByText('Storniert', { exact: true })).toBeVisible();
      await historical.getByText('Bookingdetails und Statushistorie', { exact: true }).click();
      await expect(historical).toContainText('Bestätigt → Storniert');
      await expect(historical).toContainText('E2E Statuskorrektur');
      await historical
        .getByRole('button', { name: `Aktionen für Booking ${newcomer}`, exact: true })
        .click();
      await page.getByRole('menuitem', { name: 'Status bearbeiten', exact: true }).click();
      await historical
        .getByRole('combobox', { name: `Status von ${newcomer}` })
        .selectOption('REQUESTED');
      let reactivate = page.getByRole('dialog', { name: 'Booking reaktivieren?' });
      await reactivate.getByRole('button', { name: 'Abbrechen', exact: true }).click();
      await expect(historical.getByText('Storniert', { exact: true })).toBeVisible();
      await historical
        .getByRole('button', { name: `Aktionen für Booking ${newcomer}`, exact: true })
        .click();
      await page.getByRole('menuitem', { name: 'Status bearbeiten', exact: true }).click();
      await historical
        .getByRole('combobox', { name: `Status von ${newcomer}` })
        .selectOption('REQUESTED');
      reactivate = page.getByRole('dialog', { name: 'Booking reaktivieren?' });
      await reactivate.getByLabel('Statusnotiz optional').fill('Wieder angefragt');
      await reactivate.getByRole('button', { name: 'Änderung bestätigen', exact: true }).click();
      await expect(page.getByText('Status geändert: Angefragt.', { exact: true })).toBeVisible();
    } finally {
      await closePhase6Scenario(scenario);
    }
  });

  test('Phase 7: catalog, format snapshot, calculation approval and booking reset', async () => {
    const phase7Format = await createEventFormatFixture(ownerSession, 'phase-7');
    const primaryProvider = await createBusinessPartnerFixture(ownerSession, 'phase-7-provider-a');
    const secondaryProvider = await createBusinessPartnerFixture(
      ownerSession,
      'phase-7-provider-b',
    );
    const phase7ArtistName = `E2E Phase 7 Newcomer ${Date.now()}`;
    const phase7ArtistResponse = await requireOk(
      await page.context().request.post(`/api/v1/organizations/${organizationId}/artists`, {
        data: { stageName: phase7ArtistName },
      }),
    );
    await phase7ArtistResponse.json();
    await openOrganizationHome(page, organizationId);
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
    const phase7ServiceDetailPath = new URL(page.url()).pathname;
    expect(phase7ServiceDetailPath).toContain('/services/');
    await expect(page.getByLabel('Bezeichnung', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Dienstleisterpreis hinzufügen', exact: true }).click();
    let providerForm = page.locator('.compact-provider-form');
    await providerForm
      .getByRole('combobox', { name: 'Dienstleister', exact: true })
      .selectOption({ label: primaryProvider.name });
    await providerForm.locator('input[name="purchasePrice"]').fill('350.00');
    await providerForm.getByRole('checkbox', { name: 'Bevorzugt', exact: true }).check();
    await providerForm.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
    await expect(page.locator('.master-data-table tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Dienstleisterpreis hinzufügen', exact: true }).click();
    providerForm = page.locator('.compact-provider-form');
    await providerForm
      .getByRole('combobox', { name: 'Dienstleister', exact: true })
      .selectOption({ label: secondaryProvider.name });
    await providerForm.locator('input[name="purchasePrice"]').fill('375,00');
    await providerForm.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
    await expect(page.locator('.master-data-table tbody tr')).toHaveCount(2);

    await page.goto(phase7Format.detailPath);
    const formatServices = page.locator('.service-subpanel');
    await formatServices.getByRole('button', { name: 'Leistung hinzufügen', exact: true }).click();
    await formatServices
      .getByRole('combobox', { name: 'Leistung', exact: true })
      .selectOption({ label: 'E2E Tontechnik' });
    await formatServices.getByRole('textbox', { name: 'Menge', exact: true }).fill('2');
    await formatServices
      .getByRole('combobox', { name: 'Dienstleister', exact: true })
      .selectOption({ label: primaryProvider.name });
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
      .selectOption({ label: phase7Format.name });
    const phase7EventName = `E2E Phase 7 Event ${fixtureToken('calculation')}`;
    await page.getByLabel('Veranstaltungsname').fill(phase7EventName);
    await page.getByLabel('Datum').fill('2097-10-01');
    await page.getByRole('button', { name: 'Veranstaltung anlegen', exact: true }).click();
    await expect(page.getByRole('heading', { name: phase7EventName, exact: true })).toBeVisible();
    const phase7EventDetailPath = new URL(page.url()).pathname;
    expect(phase7EventDetailPath).toContain('/events/');

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
    ).toHaveText(primaryProvider.name);
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
      .locator('.lineup-empty')
      .getByRole('button', { name: 'Ersten Artist hinzufügen', exact: true })
      .click();
    const bookingEditor = bookingPanel.locator('.booking-editor');
    await selectExactArtist(bookingEditor, phase7ArtistName);
    await bookingEditor
      .getByRole('textbox', { name: 'Vereinbarte Gage optional / keine Gage' })
      .fill('200,00');
    await bookingEditor.getByRole('button', { name: 'Booking anlegen', exact: true }).click();
    await expect(page.getByText('Das Booking wurde angelegt.', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Kalkulation', exact: true }).click();
    const newcomerCostRow = calculationPanel.locator('tr').filter({ hasText: phase7ArtistName });
    await expect(newcomerCostRow).toContainText('Gage');
    await expect(newcomerCostRow).toContainText('200,00 €');
    await expect(
      calculationPanel.getByRole('button', { name: 'Booking / Gagen', exact: true }),
    ).toBeVisible();
    await expect(calculationPanel).toContainText('Gesamtkosten');
    await expect(calculationPanel).toContainText('1.200,00 €');
    await expect(calculationPanel).toContainText('IST');
    await expect(calculationPanel).toContainText('folgt später');
    await expect(calculationPanel).toContainText('Verbindlich');
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
    const bookingCard = bookingPanel.locator('.booking-card').filter({ hasText: phase7ArtistName });
    await bookingCard
      .getByRole('button', { name: `Aktionen für Booking ${phase7ArtistName}`, exact: true })
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

  test('Navigation: event tabs stay inside the content area', async () => {
    const event = await createEventFixture(ownerSession, 'event-tabs');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(event.detailPath);
    const sidebar = page.locator('.workspace-sidebar');
    const eventNavigation = page.getByRole('navigation', {
      name: 'Veranstaltungsbereiche',
      exact: true,
    });
    await expect(eventNavigation).toBeVisible();
    const [sidebarBox, tabsBox] = await Promise.all([
      sidebar.boundingBox(),
      eventNavigation.boundingBox(),
    ]);
    expect(sidebarBox).not.toBeNull();
    expect(tabsBox).not.toBeNull();
    expect(tabsBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width);
    const initialTabsY = tabsBox!.y;

    await eventNavigation.getByRole('tab', { name: 'Bookings', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Bookings', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect((await eventNavigation.boundingBox())!.y).toBe(initialTabsY);
    await eventNavigation.getByRole('tab', { name: 'Kalkulation', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Kalkulation', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect((await eventNavigation.boundingBox())!.y).toBe(initialTabsY);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(eventNavigation).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menü öffnen', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('Phase 8: compact ticket prices, allocations, revenue and mobile result', async () => {
    const phase8EventName = `E2E Phase 8 Event ${fixtureToken('revenue')}`;
    const event = await createEventFixture(ownerSession, 'phase-8', {
      eventDate: '2097-10-01',
      name: phase8EventName,
    });
    await page.goto(event.detailPath);
    await page.getByRole('tab', { name: 'Kalkulation', exact: true }).click();
    const revenue = page.locator('.revenue-workspace');
    await expect(revenue.locator('.revenue-summary-strip')).toBeVisible();
    const costsBox = await revenue
      .getByRole('heading', { name: 'Kosten', exact: true })
      .boundingBox();
    const ticketsBox = await revenue
      .getByRole('heading', { name: 'Tickets & Erlöse', exact: true })
      .boundingBox();
    expect(costsBox).not.toBeNull();
    expect(ticketsBox).not.toBeNull();
    expect(ticketsBox!.y).toBeGreaterThan(costsBox!.y);
    await expect(
      revenue.getByRole('region', {
        name: 'Kostenkalkulation, horizontal scrollbare Tabelle',
        exact: true,
      }),
    ).toBeVisible();

    await revenue.getByLabel('Erwartete Gästezahl').fill('120');
    await revenue
      .locator('.expected-guests-form')
      .getByRole('button', { name: 'Speichern', exact: true })
      .click();
    await expect(
      revenue.getByText('Erwartete Gästezahl gespeichert.', { exact: true }),
    ).toBeVisible();

    await revenue.getByRole('button', { name: 'Ticketstufe hinzufügen', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Ticketstufe anlegen', exact: true });
    await dialog.getByLabel('Bezeichnung der Ticketstufe', { exact: true }).fill('E2E Vorverkauf');
    await dialog.getByLabel('Erwartete Menge').fill('100');
    await dialog.getByRole('textbox', { name: 'Ticketgrundpreis €', exact: true }).fill('20,00');
    await dialog
      .getByRole('combobox', { name: 'Steuersatzvorlage für Ticketgrundpreis', exact: true })
      .selectOption({ label: 'Regulär – 19 %' });
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(revenue.getByText('Ticketstufe angelegt.', { exact: true })).toBeVisible();
    const tierRow = revenue.locator('tr').filter({ hasText: 'E2E Vorverkauf' });
    await expect(tierRow).toHaveCount(1);
    await expect(tierRow).toContainText('20,00');

    await revenue.getByRole('button', { name: 'Aktionen für E2E Vorverkauf', exact: true }).click();
    await page
      .getByRole('menuitem', { name: 'Preisstruktur-Position hinzufügen', exact: true })
      .click();
    dialog = page.getByRole('dialog', {
      name: 'Preisstruktur-Position anlegen',
      exact: true,
    });
    await dialog.getByLabel('Bezeichnung').fill('E2E WKZ');
    await dialog.getByRole('textbox', { name: 'Betrag €', exact: true }).fill('1,19');
    await dialog
      .getByRole('combobox', {
        name: 'Steuersatzvorlage für Preisstruktur-Position',
        exact: true,
      })
      .selectOption({ label: 'Regulär – 19 %' });
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(
      revenue.getByText('Preisstruktur-Position angelegt.', { exact: true }),
    ).toBeVisible();
    await revenue.getByText(/Preisstruktur-Positionen und Empfänger-Aufteilungen/).click();
    await expect(revenue).toContainText('Eigene Organisation / Club');
    await expect(revenue).toContainText('21,19');

    await revenue
      .getByRole('button', { name: 'Ticketing-Aufschlüsselung erstellen', exact: true })
      .click();
    const breakdown = page.getByRole('dialog', {
      name: 'Ticketing-Aufschlüsselung',
      exact: true,
    });
    await expect(breakdown).toContainText(phase8EventName);
    await expect(breakdown).toContainText('1. Oktober 2097');
    await expect(breakdown).toContainText('E2E Vorverkauf');
    await expect(breakdown).toContainText('Grundpreis netto');
    await expect(breakdown).toContainText('Umsatzsteuer 19 %');
    await expect(breakdown).toContainText('Ticketpreis für den Ticketanbieter');
    await expect(breakdown).toContainText('21,19 €');
    await expect(breakdown).toContainText('zzgl. Versand, sofern zutreffend');
    await breakdown.getByRole('button', { name: 'Als Text kopieren', exact: true }).click();
    await expect(breakdown.getByText('Aufschlüsselung kopiert.', { exact: true })).toBeVisible();
    expect(
      (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\u00a0', ' '),
    ).toContain('Ticketpreis für den Ticketanbieter: 21,19 €');
    await breakdown
      .getByRole('button', { name: 'Ticketing-Aufschlüsselung schließen', exact: true })
      .click();

    const additionalRevenueDetails = revenue.locator('.revenue-subsection');
    await expect(additionalRevenueDetails).not.toHaveAttribute('open', '');
    await additionalRevenueDetails.getByText('Weitere Erlöse', { exact: true }).click();
    await revenue.getByRole('button', { name: 'Erlös hinzufügen', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Weiteren Erlös anlegen', exact: true });
    await dialog.getByLabel('Bezeichnung').fill('E2E Sponsoring');
    await dialog.getByRole('textbox', { name: 'Betrag €', exact: true }).fill('1000,00');
    await dialog
      .getByRole('combobox', { name: 'Steuersatzvorlage für weiteren Erlös', exact: true })
      .selectOption({ label: 'Steuerfrei – 0 %' });
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(revenue.getByText('Weiterer Erlös angelegt.', { exact: true })).toBeVisible();
    await expect(revenue).toContainText('E2E Sponsoring');
    const resultSection = revenue
      .getByRole('heading', { name: 'Ergebnis', exact: true })
      .locator('..');
    await expect(
      resultSection.getByText('Operatives Ergebnis netto', { exact: true }),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(revenue.getByRole('heading', { name: 'Ergebnis', exact: true })).toBeVisible();
    const phase8MobileOverflow = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      offenders: [...document.querySelectorAll<HTMLElement>('body *')]
        .map((element) => ({
          className: element.className,
          right: Math.round(element.getBoundingClientRect().right),
          tagName: element.tagName,
        }))
        .filter((element) => element.right > window.innerWidth + 1)
        .slice(0, 10),
    }));
    expect(phase8MobileOverflow, JSON.stringify(phase8MobileOverflow)).toMatchObject({
      fits: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('Phase 9: deal template snapshot and compact rental read view', async () => {
    const event = await createEventFixture(ownerSession, 'phase-9-deal', {
      eventKind: 'THIRD_PARTY_EVENT',
    });
    await page.goto(`/o/${organizationId}/deal-templates`);
    await expect(page.getByRole('heading', { name: 'Dealvorlagen', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Neue Dealvorlage', exact: true }).click();
    const templateDialog = page.getByRole('dialog', { name: 'Dealvorlage anlegen', exact: true });
    await templateDialog.getByLabel('Name', { exact: true }).fill('E2E Vermietung');
    await templateDialog.getByLabel('Beschreibung', { exact: true }).fill('Kompakte E2E-Notiz');
    await templateDialog.getByRole('button', { name: 'Feste Miete', exact: true }).click();
    await templateDialog.getByLabel('Betrag netto €', { exact: true }).fill('1000,00');
    await templateDialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    const templateCard = page.getByRole('article', { name: 'E2E Vermietung', exact: true });
    await expect(templateCard.getByText('Kompakte E2E-Notiz', { exact: true })).toBeVisible();
    await expect(templateCard.getByText('Feste Miete', { exact: true })).toBeVisible();
    await expect(
      templateCard.getByText('1 Baustein · 0 Leistungspositionen · Version 1', { exact: true }),
    ).toBeVisible();
    await expect(templateCard.getByText('Aktiv', { exact: true })).toBeVisible();
    await expect(templateCard.getByRole('heading', { name: 'Deal-Bausteine' })).toHaveCount(0);

    const detailsToggle = templateCard.getByRole('button', { name: 'Details', exact: true });
    await expect(detailsToggle).toHaveAttribute('aria-expanded', 'false');
    await detailsToggle.press('Enter');
    await expect(
      templateCard.getByRole('button', { name: 'Weniger', exact: true }),
    ).toHaveAttribute('aria-expanded', 'true');
    const templateDetails = templateCard.locator('.deal-template-card__details');
    await expect(templateDetails.getByRole('heading', { name: 'Deal-Bausteine' })).toBeVisible();
    await expect(templateDetails.getByText('1.000,00 € netto', { exact: true })).toBeVisible();
    await expect(templateDetails.getByRole('heading', { name: 'Notiz' })).toBeVisible();
    await expect(
      templateDetails.getByRole('heading', { name: 'Separat abrechenbare Leistungen' }),
    ).toHaveCount(0);

    const templateActions = templateCard.getByRole('button', {
      name: 'Aktionen für Dealvorlage E2E Vermietung',
      exact: true,
    });
    await templateActions.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Bearbeiten', exact: true })).toBeFocused();
    await expect(page.getByRole('menuitem', { name: 'Archivieren', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(templateActions).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(event.detailPath);
    await page.getByRole('tab', { name: 'Vermietung & Deal', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Noch kein kommerzieller Deal' })).toBeVisible();
    await page.getByRole('button', { name: 'Deal anlegen', exact: true }).click();
    const dealDialog = page.getByRole('dialog', { name: 'Deal anlegen', exact: true });
    const templateSelect = dealDialog.getByRole('combobox', {
      name: 'Dealvorlage (optional)',
      exact: true,
    });
    const selectedTemplate = await templateSelect.selectOption({ label: 'E2E Vermietung' });
    expect(selectedTemplate).toHaveLength(1);
    await expect(dealDialog.getByText(/unabhängiger Snapshot übernommen/)).toBeVisible();
    await dealDialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    const customerAmount = page.getByText('Kundenbetrag Miete & Leistungen netto').locator('..');
    await expect(customerAmount).toBeVisible();
    await expect(customerAmount).toContainText('1.000,00 €');
    await expect(page.getByText('Erwarteter Location-Anteil netto')).toBeVisible();
    await expect(page.getByText('Interne Kosten netto')).toBeVisible();
    await expect(page.getByText('Erwartetes operatives Ergebnis')).toBeVisible();
    await expect(page.getByLabel('Betrag netto €', { exact: true })).toBeHidden();
    await page
      .locator('.deal-panel')
      .getByRole('button', { name: 'Bearbeiten', exact: true })
      .click();
    await expect(
      page
        .getByRole('dialog', { name: 'Deal bearbeiten', exact: true })
        .getByLabel('Betrag netto €'),
    ).toBeVisible();

    await page.goto(`/o/${organizationId}/deal-templates`);
    const lifecycleCard = page.getByRole('article', { name: 'E2E Vermietung', exact: true });
    const lifecycleActions = lifecycleCard.getByRole('button', {
      name: 'Aktionen für Dealvorlage E2E Vermietung',
      exact: true,
    });
    await lifecycleActions.click();
    await page.getByRole('menuitem', { name: 'Archivieren', exact: true }).click();
    await expect(lifecycleCard.getByText('Archiviert', { exact: true })).toBeVisible();
    await lifecycleActions.click();
    await expect(page.getByRole('menuitem', { name: 'Reaktivieren', exact: true })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Reaktivieren', exact: true }).click();
    await expect(lifecycleCard.getByText('Aktiv', { exact: true })).toBeVisible();
  });

  test('Phase 10: offer template, editable draft, immutable PDF version and mobile document list', async () => {
    const source = await createDealFixture(ownerSession, 'phase-10-offer');
    await page.goto(`/o/${organizationId}/document-templates`);
    await expect(
      page.getByRole('heading', { name: 'Dokumentvorlagen', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Neue Dokumentvorlage', exact: true }).click();
    const templateDialog = page.getByRole('dialog', {
      name: 'Dokumentvorlage anlegen',
      exact: true,
    });
    await templateDialog.getByLabel('Name', { exact: true }).fill('E2E Standardangebot');
    await templateDialog
      .getByLabel('Titelvorschlag für Angebote', { exact: true })
      .fill('Interner E2E Vorlagentitel');
    await templateDialog
      .getByLabel('Einleitung', { exact: true })
      .fill('Vielen Dank für Ihre Anfrage.');
    await templateDialog.getByRole('button', { name: 'Block hinzufügen', exact: true }).click();
    await templateDialog.getByLabel('Überschrift Block 1', { exact: true }).fill('Leistungsumfang');
    await templateDialog
      .getByLabel('Inhalt Block 1', { exact: true })
      .fill('Saal und Grundausstattung.');
    await templateDialog
      .getByLabel('Standardbedingungen', { exact: true })
      .fill('Zahlbar innerhalb von 14 Tagen.');
    await templateDialog.getByLabel('Fußzeile', { exact: true }).fill('E2E Venue · Berlin');
    await templateDialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    const templateCard = page
      .locator('.document-template-card')
      .filter({ hasText: 'E2E Standardangebot' });
    await expect(templateCard).toContainText('Interner E2E Vorlagentitel');
    await expect(templateCard).toContainText('Version 1');

    await page.goto(source.event.detailPath);
    await page.getByRole('tab', { name: 'Dokumente', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dokumente', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Dokument anlegen', exact: true }).click();
    const createDialog = page.getByRole('dialog', { name: 'Dokument anlegen', exact: true });
    await expect(
      createDialog.getByRole('option', { name: 'E2E Standardangebot · Version 1', exact: true }),
    ).toBeAttached();
    await createDialog
      .getByLabel('Angebotstitel', { exact: true })
      .fill('E2E Veranstaltungsangebot');
    await createDialog.getByRole('button', { name: 'Entwurf anlegen', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: 'E2E Veranstaltungsangebot',
        exact: true,
        level: 1,
      }),
    ).toBeVisible();
    const phase10DocumentDetailPath = new URL(page.url()).pathname;
    expect(phase10DocumentDetailPath).toContain('/documents/');
    await expect(page.getByText('Noch keine übergebene oder freigegebene Version.')).toBeVisible();

    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Dokumententwurf bearbeiten', exact: true });
    await editor.getByLabel('Gültig bis', { exact: true }).fill('2099-12-31');
    await editor
      .getByLabel('Bezeichnung Position 1', { exact: true })
      .fill('E2E Saalmiete angepasst');
    await editor
      .getByLabel('Interne Notiz - nie in Dokumentansicht oder PDF', { exact: true })
      .fill('Nur intern sichtbar');
    await editor.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
    await expect(
      page.getByText('Vom ursprünglichen Deal abweichend', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Nur intern sichtbar', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Tatsächliche PDF-Vorschau', exact: true }).click();
    const pdfPreview = page.getByLabel('Tatsächlich generierte PDF-Vorschau', { exact: true });
    await expect(pdfPreview).toBeVisible();
    await expect(
      pdfPreview.getByTitle('PDF-Vorschau des aktuellen Dokumentstands', { exact: true }),
    ).toBeVisible();
    await pdfPreview.getByRole('button', { name: 'Schließen', exact: true }).click();

    await page.getByRole('button', { name: 'PDF erstellen und übergeben', exact: true }).click();
    await expect(
      page.getByText('PDF-Version erstellt und Angebot als übergeben markiert.'),
    ).toBeVisible();
    await expect(page.getByText('Version 1', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'PDF herunterladen', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.document-workspace__meta')).toContainText(/ANG-\d{4}-\d{4}/);

    await page.goto(`/o/${organizationId}/documents?type=OFFER&status=UEBERGEBEN`);
    await expect(page.getByRole('heading', { name: 'Dokumente', exact: true })).toBeVisible();
    await expect(page.getByTestId('document-list')).toContainText('E2E Veranstaltungsangebot');
    await page.setViewportSize({ width: 390, height: 844 });
    const phase10MobileOverflow = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(phase10MobileOverflow, JSON.stringify(phase10MobileOverflow)).toMatchObject({
      fits: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('Phase 10: document cleanup uses menu actions and the archive filter', async () => {
    const draftTitle = `E2E löschbarer Dokumententwurf ${fixtureToken('document-delete')}`;
    const fixture = await createOfferFixture(ownerSession, 'document-cleanup', draftTitle);
    const archiveTitle = `E2E Archivangebot ${fixtureToken('document-archive')}`;
    await page.goto(fixture.event.detailPath);
    await page.getByRole('tab', { name: 'Dokumente', exact: true }).click();
    await page.getByRole('button', { name: 'Dokument anlegen', exact: true }).click();
    const createDialog = page.getByRole('dialog', { name: 'Dokument anlegen', exact: true });
    await createDialog.getByLabel('Angebotstitel', { exact: true }).fill(archiveTitle);
    await createDialog.getByRole('button', { name: 'Entwurf anlegen', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: archiveTitle, exact: true, level: 1 }),
    ).toBeVisible();
    const archivedDocumentId = new URL(page.url()).pathname.split('/').at(-1)!;
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Dokumententwurf bearbeiten', exact: true });
    await editor.getByLabel('Gültig bis', { exact: true }).fill('2099-04-30');
    await editor.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
    await page.getByRole('button', { name: 'PDF erstellen und übergeben', exact: true }).click();
    await expect(
      page.getByText('PDF-Version erstellt und Angebot als übergeben markiert.'),
    ).toBeVisible();

    await page.goto(`/o/${organizationId}/documents`);
    const draftRow = page.getByRole('article', { name: draftTitle, exact: true });
    await draftRow.getByRole('button', { name: /Aktionen für/ }).click();
    await page.getByRole('menuitem', { name: 'Löschen', exact: true }).click();
    const deleteDialog = page.getByRole('dialog', { name: 'Entwurf löschen', exact: true });
    await expect(deleteDialog).toContainText(draftTitle);
    await expect(deleteDialog).toContainText('nicht wiederhergestellt werden');
    await deleteDialog.getByRole('button', { name: 'Endgültig löschen', exact: true }).click();
    await expect(page.getByRole('article', { name: draftTitle, exact: true })).toHaveCount(0);

    const issuedRow = page.getByRole('article', { name: archiveTitle, exact: true });
    await issuedRow.getByRole('button', { name: /Aktionen für/ }).click();
    await page.getByRole('menuitem', { name: 'Archivieren', exact: true }).click();
    const archiveDialog = page.getByRole('dialog', { name: 'Dokument archivieren', exact: true });
    await expect(archiveDialog).toContainText(
      'PDF-Versionen, Historie, Snapshots und Dokumentnummer',
    );
    await archiveDialog.getByRole('button', { name: 'Archivieren', exact: true }).click();
    await expect(page.getByRole('article', { name: archiveTitle, exact: true })).toHaveCount(0);

    await page.getByRole('link', { name: 'Archiv anzeigen', exact: true }).click();
    const archivedRow = page.getByRole('article', { name: archiveTitle, exact: true });
    await expect(archivedRow.getByText('Archiviert', { exact: true })).toBeVisible();
    await archivedRow.getByRole('button', { name: /Aktionen für/ }).click();
    await page.getByRole('menuitem', { name: 'Wiederherstellen', exact: true }).click();
    const restoreDialog = page.getByRole('dialog', {
      name: 'Dokument wiederherstellen',
      exact: true,
    });
    await expect(restoreDialog).toContainText('keine neue PDF-Version');
    await restoreDialog.getByRole('button', { name: 'Wiederherstellen', exact: true }).click();
    await expect(page.getByText('Das Dokument wurde wiederhergestellt.')).toBeVisible();
    const restored = await page.request.get(
      new URL(
        `/api/v1/organizations/${organizationId}/documents/${archivedDocumentId}`,
        e2eBaseUrl,
      ).toString(),
    );
    expect(restored.status()).toBe(200);
    expect(await restored.json()).toMatchObject({ status: 'UEBERGEBEN', publishedVersion: 1 });
  });

  test('Phase 10: Ablauf uses the exact ordered program in browser and PDF', async () => {
    const scheduleEventResponse = await page.request.post(
      new URL(`/api/v1/organizations/${organizationId}/events`, e2eBaseUrl).toString(),
      {
        data: {
          locationId: ownerSession.locationId,
          eventKind: 'OWN_PRODUCTION',
          name: 'E2E Ablauf Regression',
          eventDate: '2099-12-31',
          startTime: '20:00',
        },
      },
    );
    expect(scheduleEventResponse.status()).toBe(201);
    const scheduleEvent = (await scheduleEventResponse.json()) as { id: string };
    const artistResponse = await page.request.post(
      new URL(`/api/v1/organizations/${organizationId}/artists`, e2eBaseUrl).toString(),
      { data: { stageName: 'Pow' } },
    );
    expect(artistResponse.status()).toBe(201);
    const artist = (await artistResponse.json()) as { id: string };
    const bookingResponse = await page.request.post(
      new URL(
        `/api/v1/organizations/${organizationId}/events/${scheduleEvent.id}/bookings`,
        e2eBaseUrl,
      ).toString(),
      {
        data: {
          artistId: artist.id,
          role: 'ARTIST',
          status: 'CONFIRMED',
          performanceStartMinutes: 20 * 60,
          performanceDurationMinutes: 45,
        },
      },
    );
    expect(bookingResponse.status()).toBe(201);
    const booking = (await bookingResponse.json()) as { id: string };
    const breakResponse = await page.request.post(
      new URL(
        `/api/v1/organizations/${organizationId}/events/${scheduleEvent.id}/program-items`,
        e2eBaseUrl,
      ).toString(),
      {
        data: {
          kind: 'BREAK',
          label: 'Pause zwischen den Sets',
          note: 'Hocker bereitstellen',
          durationMinutes: 15,
        },
      },
    );
    expect(breakResponse.status()).toBe(201);
    const breakItem = (await breakResponse.json()) as { id: string; version: number };
    const changedNote = 'Gitarre vorbereiten und Hocker bereitstellen';
    const updateBreakResponse = await page.request.patch(
      new URL(
        `/api/v1/organizations/${organizationId}/program-items/${breakItem.id}`,
        e2eBaseUrl,
      ).toString(),
      {
        data: {
          version: breakItem.version,
          label: 'Pause zwischen den Sets',
          note: changedNote,
          durationMinutes: 15,
        },
      },
    );
    expect(updateBreakResponse.status()).toBe(200);
    const secondPerformanceResponse = await page.request.post(
      new URL(
        `/api/v1/organizations/${organizationId}/events/${scheduleEvent.id}/program-items`,
        e2eBaseUrl,
      ).toString(),
      { data: { kind: 'PERFORMANCE', bookingId: booking.id, durationMinutes: 45 } },
    );
    expect(secondPerformanceResponse.status()).toBe(201);
    const productionTemplateResponse = await page.request.post(
      new URL(`/api/v1/organizations/${organizationId}/document-templates`, e2eBaseUrl).toString(),
      {
        data: {
          name: 'E2E Ablaufstandard',
          type: 'PRODUCTION_INFORMATION',
          title: 'E2E Ablauf',
          blocks: [],
          footer: null,
        },
      },
    );
    expect(productionTemplateResponse.status()).toBe(201);
    const productionTemplate = (await productionTemplateResponse.json()) as { id: string };
    const productionDocumentResponse = await page.request.post(
      new URL(
        `/api/v1/organizations/${organizationId}/events/${scheduleEvent.id}/documents`,
        e2eBaseUrl,
      ).toString(),
      {
        data: {
          type: 'PRODUCTION_INFORMATION',
          templateId: productionTemplate.id,
          title: 'E2E Auftrittsplan',
        },
      },
    );
    expect(productionDocumentResponse.status()).toBe(201);
    const productionDocument = (await productionDocumentResponse.json()) as { id: string };
    await page.goto(`/o/${organizationId}/documents/${productionDocument.id}`);
    await expect(
      page.getByRole('heading', { name: 'E2E Auftrittsplan', exact: true, level: 1 }),
    ).toBeVisible();

    const scheduleRows = page.locator('.document-schedule-table tbody tr');
    await expect(scheduleRows).toHaveCount(3);
    await expect(page.locator('.document-schedule-table thead th')).toHaveText([
      'Start',
      'Programmpunkt',
      'Dauer',
      'Notiz',
    ]);
    await expect(scheduleRows).toContainText(['Pow', 'Pause', 'Pow']);
    await expect(scheduleRows.filter({ hasText: 'Pause' })).toContainText(changedNote);
    await expect(page.getByText('Get-in Technik', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Tatsächliche PDF-Vorschau', exact: true }).click();
    await expect(
      page.getByLabel('Tatsächlich generierte PDF-Vorschau', { exact: true }),
    ).toBeVisible();
    const preview = await page.request.post(
      new URL(
        `/api/v1/organizations/${organizationId}/documents/${productionDocument.id}/preview`,
        e2eBaseUrl,
      ).toString(),
    );
    expect(preview.status()).toBe(200);
    const previewText = pdfResponseText(
      Buffer.from(await preview.body()),
      preview.headers()['content-encoding'],
    );
    expect(previewText).toContain('%PDF-');
    expect(previewText.match(/Pow/g) ?? []).toHaveLength(2);
    const firstPow = previewText.indexOf('Pow');
    const pause = previewText.indexOf(changedNote);
    const secondPow = previewText.indexOf('Pow', firstPow + 1);
    expect(previewText).toContain('PROGRAMMPUNKT');
    expect(previewText).toContain('NOTIZ');
    expect(previewText).not.toContain('PAUSE / UMBAU');
    expect(previewText).not.toContain('Get-in Technik');
    expect(previewText).not.toContain('Umbau Bühne links');
    expect(firstPow).toBeGreaterThan(-1);
    expect(pause).toBeGreaterThan(firstPow);
    expect(secondPow).toBeGreaterThan(pause);
  });

  test('Phase 1 through Phase 10: read-only authorization and logout', async ({ browser }) => {
    const eventFormat = await createEventFormatFixture(ownerSession, 'reader-navigation');
    const event = await createEventFixture(ownerSession, 'reader-navigation');
    const artist = await createArtistFixture(ownerSession, 'reader-navigation');
    await requireOk(
      await ownerSession.context.request.post(
        `/api/v1/organizations/${organizationId}/events/${event.id}/bookings`,
        {
          data: {
            artistId: artist.id,
            role: 'ARTIST',
            status: 'CONFIRMED',
            agreedFeeMinor: '20000',
            agreedFeeCurrency: 'EUR',
          },
        },
      ),
    );
    const dateOptionLabel = `E2E Reader Option ${fixtureToken('authorization')}`;
    const dateOptionResponse = await requireOk(
      await ownerSession.context.request.post(
        `/api/v1/organizations/${organizationId}/date-options`,
        {
          data: {
            label: dateOptionLabel,
            locationId: ownerSession.locationId,
            occupancyEndTime: '23:00',
            occupancyStartTime: '16:00',
            optionDate: '2097-11-12',
            validUntil: '2097-11-11T23:59:59.000Z',
          },
        },
      ),
    );
    const dateOption = (await dateOptionResponse.json()) as { id: string };
    const invited = await createReadOnlySession(browser, ownerSession, 'authorization', true);
    const { context: invitedContext, page: invitedPage } = invited;
    try {
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
      await invitedPage.getByRole('link', { name: eventFormat.name, exact: true }).click();
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
      await invitedPage.goto(`/o/${organizationId}/events/options/${dateOption.id}`);
      await expect(
        invitedPage.getByRole('heading', { name: dateOptionLabel, exact: true }),
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
      await invitedPage.goto(event.detailPath);
      await expect(
        invitedPage.getByRole('heading', { name: event.name, exact: true }),
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
          .getByRole('link', { name: artist.name, exact: true }),
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
    } finally {
      await invitedContext.close().catch(() => undefined);
    }
  });

  test('Phase 1 through Phase 10: read-only detail authorization and logout', async ({
    browser,
  }) => {
    const eventFormat = await createEventFormatFixture(ownerSession, 'reader-details');
    const event = await createEventFixture(ownerSession, 'reader-details');
    const representation = await createRepresentationFixture(ownerSession, 'reader-details');
    await requireOk(
      await ownerSession.context.request.post(
        `/api/v1/organizations/${organizationId}/artists/${representation.artist.id}/business-partners`,
        {
          data: {
            businessPartnerId: representation.partner.id,
            roleIds: [representation.agencyRoleId],
            representatives: [
              {
                businessPartnerContactId: representation.representativePartnerContactId,
                roleIds: [representation.bookingRoleId],
                isPrimary: true,
              },
            ],
          },
        },
      ),
    );
    const invited = await createReadOnlySession(browser, ownerSession, 'details');
    const { context: invitedContext, page: invitedPage } = invited;
    try {
      const forbiddenEvent = await invitedContext.request.patch(
        new URL(
          `/api/v1/organizations/${organizationId}/events/${event.id}/status`,
          invitedPage.url(),
        ).toString(),
        { data: { version: event.version, status: 'CANCELLED' } },
      );
      expect(forbiddenEvent.status()).toBe(403);
      await invitedPage.goto(eventFormat.detailPath);
      await expect(
        invitedPage.getByRole('heading', { name: eventFormat.name, exact: true }),
      ).toBeVisible();
      await invitedPage.getByRole('link', { name: 'Artists', exact: true }).click();
      await expect(
        invitedPage.getByRole('link', { name: 'Artist anlegen', exact: true }),
      ).toHaveCount(0);
      await invitedPage
        .getByRole('link', { name: representation.artist.name, exact: true })
        .click();
      const readOnlyRepresentation = invitedPage.locator('.representation-card');
      await expect(
        readOnlyRepresentation.getByRole('link', {
          name: representation.partner.name,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        readOnlyRepresentation.locator(`a[href="mailto:${representation.representative.email}"]`),
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
    } finally {
      await invitedContext.close().catch(() => undefined);
    }
  });

  test('Phase 1 through Phase 10: read-only master-data details', async ({ browser }) => {
    const contact = await createContactFixture(ownerSession, 'reader-master-contact');
    const partner = await createBusinessPartnerFixture(ownerSession, 'reader-master-partner');
    const artist = await createArtistFixture(ownerSession, 'reader-master-artist');
    const invited = await createReadOnlySession(browser, ownerSession, 'master-data');
    const { context: invitedContext, page: invitedPage } = invited;
    try {
      await invitedPage.goto(contact.detailPath);
      await expect(
        invitedPage.getByRole('heading', { name: contact.name, exact: true }),
      ).toBeVisible();
      await expect(
        invitedPage.getByRole('button', { name: 'Weitere Aktionen', exact: true }),
      ).toHaveCount(0);
      await invitedPage.goto(partner.detailPath);
      await expect(
        invitedPage.getByRole('heading', { name: partner.name, exact: true }),
      ).toBeVisible();
      await expect(
        invitedPage.getByRole('button', { name: 'Weitere Aktionen', exact: true }),
      ).toHaveCount(0);
      await invitedPage.goto(artist.detailPath);
      await expect(
        invitedPage.getByRole('heading', { name: artist.name, exact: true }),
      ).toBeVisible();
    } finally {
      await invitedContext.close().catch(() => undefined);
    }
  });

  test('Phase 1 through Phase 10: read-only finance, document and logout', async ({ browser }) => {
    const token = fixtureToken('reader-finance');
    const categoryResponse = await requireOk(
      await ownerSession.context.request.post(
        `/api/v1/organizations/${organizationId}/service-categories`,
        { data: { name: `E2E Reader Category ${token}` } },
      ),
    );
    const category = (await categoryResponse.json()) as { id: string };
    const serviceName = `E2E Reader Service ${token}`;
    const serviceResponse = await requireOk(
      await ownerSession.context.request.post(`/api/v1/organizations/${organizationId}/services`, {
        data: {
          categoryId: category.id,
          name: serviceName,
          unit: 'FLAT_RATE',
          defaultSalesPriceMinor: '45000',
        },
      }),
    );
    const service = (await serviceResponse.json()) as { id: string };
    const event = await createEventFixture(ownerSession, 'reader-finance');
    await requireOk(
      await ownerSession.context.request.post(
        `/api/v1/organizations/${organizationId}/events/${event.id}/calculation/positions`,
        {
          data: {
            name: serviceName,
            categoryName: `E2E Reader Category ${token}`,
            unit: 'FLAT_RATE',
            quantity: '1',
            purchaseUnitPriceMinor: '35000',
            salesUnitPriceMinor: '45000',
            costStatus: 'COMMITTED',
            sortOrder: 1,
          },
        },
      ),
    );
    const artist = await createArtistFixture(ownerSession, 'reader-finance');
    await requireOk(
      await ownerSession.context.request.post(
        `/api/v1/organizations/${organizationId}/events/${event.id}/bookings`,
        {
          data: {
            artistId: artist.id,
            role: 'ARTIST',
            status: 'CONFIRMED',
            agreedFeeMinor: '20000',
            agreedFeeCurrency: 'EUR',
          },
        },
      ),
    );
    const documentTitle = `E2E Reader Offer ${token}`;
    const offer = await createOfferFixture(ownerSession, 'reader-document', documentTitle);
    await page.goto(`/o/${organizationId}/documents/${offer.document.id}`);
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Dokumententwurf bearbeiten', exact: true });
    await editor.getByLabel('Gültig bis', { exact: true }).fill('2099-12-31');
    await editor.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
    await page.getByRole('button', { name: 'PDF erstellen und übergeben', exact: true }).click();
    await expect(
      page.getByText('PDF-Version erstellt und Angebot als übergeben markiert.'),
    ).toBeVisible();
    const invited = await createReadOnlySession(browser, ownerSession, 'finance-document');
    const { context: invitedContext, page: invitedPage } = invited;
    try {
      await invitedPage.goto(`/o/${organizationId}/services/${service.id}`);
      await expect(
        invitedPage.getByRole('heading', { name: serviceName, exact: true }),
      ).toBeVisible();
      await expect(invitedPage.getByText('Nicht freigegeben', { exact: true })).toBeVisible();
      await expect(
        invitedPage.getByRole('button', { name: 'Bearbeiten', exact: true }),
      ).toHaveCount(0);
      await expect(invitedPage.getByText('350,00 €', { exact: true })).toHaveCount(0);

      await invitedPage.goto(event.detailPath);
      await invitedPage.getByRole('tab', { name: 'Kalkulation', exact: true }).click();
      const readOnlyCalculation = invitedPage.locator('.calculation-panel');
      await expect(readOnlyCalculation).toContainText(serviceName);
      await expect(
        readOnlyCalculation.getByRole('button', { name: 'Zur Prüfung', exact: true }),
      ).toHaveCount(0);
      await expect(
        readOnlyCalculation.getByRole('button', { name: 'Freigeben', exact: true }),
      ).toHaveCount(0);
      const redactedResponse = await invitedContext.request.get(
        new URL(
          `/api/v1/organizations/${organizationId}/events/${event.id}/calculation`,
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

      await invitedPage.goto(`/o/${organizationId}/documents/${offer.document.id}`);
      await expect(
        invitedPage.getByRole('heading', {
          name: documentTitle,
          exact: true,
          level: 1,
        }),
      ).toBeVisible();
      await expect(
        invitedPage.getByRole('button', { name: 'Bearbeiten', exact: true }),
      ).toHaveCount(0);
      await expect(
        invitedPage.getByRole('button', { name: 'PDF erstellen und übergeben', exact: true }),
      ).toHaveCount(0);
      await expect(
        invitedPage.getByRole('button', { name: 'PDF herunterladen', exact: true }),
      ).toBeVisible();

      const forbidden = await invitedContext.request.patch(
        new URL(`/api/v1/organizations/${organizationId}`, invitedPage.url()).toString(),
        { data: { version: 2, phone: '+49 30 000000' } },
      );
      expect(forbidden.status()).toBe(403);
      await openOrganizationMenu(invitedPage);
      await invitedPage
        .locator('.workspace-account-menu__content')
        .getByRole('button', { name: 'Abmelden', exact: true })
        .press('Enter');
      await expect(
        invitedPage.getByRole('heading', { name: 'Willkommen zurück.', exact: true }),
      ).toBeVisible();
      await invitedPage.goto(`/o/${organizationId}`);
      await expect(
        invitedPage.getByRole('heading', { name: 'Willkommen zurück.', exact: true }),
      ).toBeVisible();
    } finally {
      await invitedContext.close().catch(() => undefined);
    }
  });
});
