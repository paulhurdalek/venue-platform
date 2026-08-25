'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { Fragment, useRef, useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import {
  formatMinorAmount,
  majorAmountToMinor,
  minorAmountToInput,
} from '../../../src/booking-utils';
import { serviceUnitOptions, unitLabel } from '../../../src/services/service-unit-labels';
import { FormMessage } from '../form-message';
import { ActionMenu, type ActionMenuItem } from '../ui/action-menu';
import { CompactNotice } from '../ui/compact-ui';
import { Dialog } from '../ui/dialog';

type Service = components['schemas']['ServiceDto'];
type FormatService = components['schemas']['EventFormatServiceDto'];
type Calculation = components['schemas']['EventCalculationDto'];
type Position = components['schemas']['EventServicePositionDto'];
type CatalogPricePreview = components['schemas']['EventPositionCatalogPricePreviewDto'];
type Partner = components['schemas']['BusinessPartnerDto'];
type BookingCost = components['schemas']['BookingCostDto'];

type PositionDraft = {
  quantity: string;
  providerId: string;
  purchasePrice: string;
  salesPrice: string;
  costStatus: Position['costStatus'];
  note: string;
};

export function FormatServicesPanel({
  organizationId,
  eventFormatId,
  initial,
  services,
  canWrite,
  canArchive,
  canPurchase,
  canSales,
}: {
  organizationId: string;
  eventFormatId: string;
  initial: FormatService[];
  services: Service[];
  canWrite: boolean;
  canArchive: boolean;
  canPurchase: boolean;
  canSales: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(services[0]?.id ?? '');
  const [editingId, setEditingId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const selected = services.find((service) => service.id === selectedId);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await createBrowserApiClient().POST(
        '/api/v1/organizations/{organizationId}/event-formats/{eventFormatId}/services',
        {
          credentials: 'include',
          params: { path: { organizationId, eventFormatId } },
          body: {
            serviceId: String(form.get('serviceId')),
            quantity: String(form.get('quantity') ?? ''),
            providerBusinessPartnerId: String(form.get('providerId') ?? '') || null,
            ...(canPurchase
              ? {
                  purchasePriceOverrideMinor: majorAmountToMinor(
                    String(form.get('purchaseOverride') ?? ''),
                    'EUR',
                  ),
                }
              : {}),
            ...(canSales
              ? {
                  salesPriceOverrideMinor: majorAmountToMinor(
                    String(form.get('salesOverride') ?? ''),
                    'EUR',
                  ),
                }
              : {}),
            sortOrder: initial.filter((item) => item.status === 'ACTIVE').length + 1,
          },
        },
      );
      if (!result.data || result.error)
        setMessage(
          apiErrorMessage(result.error, 'Die Leistungsvorgabe konnte nicht angelegt werden.'),
        );
      else {
        setMessage('Leistungsvorgabe angelegt.');
        setAdding(false);
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ein Preis ist ungültig.');
    }
    setPending(false);
  }
  async function archive(item: FormatService) {
    if (
      item.status === 'ACTIVE' &&
      !window.confirm(`„${item.serviceName}“ aus der Vorlage entfernen?`)
    ) {
      return;
    }
    setPending(true);
    const result = await createBrowserApiClient().PATCH(
      '/api/v1/organizations/{organizationId}/event-format-services/{formatServiceId}/status',
      {
        credentials: 'include',
        params: { path: { organizationId, formatServiceId: item.id } },
        body: { version: item.version, status: item.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' },
      },
    );
    if (!result.data || result.error)
      setMessage(apiErrorMessage(result.error, 'Der Status konnte nicht geändert werden.'));
    else router.refresh();
    setPending(false);
  }
  async function update(item: FormatService, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await createBrowserApiClient().PATCH(
        '/api/v1/organizations/{organizationId}/event-format-services/{formatServiceId}',
        {
          credentials: 'include',
          params: { path: { organizationId, formatServiceId: item.id } },
          body: {
            version: item.version,
            serviceId: String(form.get('serviceId')),
            quantity: String(form.get('quantity') ?? ''),
            providerBusinessPartnerId: String(form.get('providerId') ?? '') || null,
            ...(canPurchase
              ? {
                  purchasePriceOverrideMinor: majorAmountToMinor(
                    String(form.get('purchaseOverride') ?? ''),
                    'EUR',
                  ),
                }
              : {}),
            ...(canSales
              ? {
                  salesPriceOverrideMinor: majorAmountToMinor(
                    String(form.get('salesOverride') ?? ''),
                    'EUR',
                  ),
                }
              : {}),
            sortOrder: Number(form.get('sortOrder')),
          },
        },
      );
      if (!result.data || result.error) {
        setMessage(
          apiErrorMessage(result.error, 'Die Leistungsvorgabe konnte nicht gespeichert werden.'),
        );
      } else {
        setEditingId(undefined);
        setMessage('Leistungsvorgabe gespeichert.');
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ein Preis ist ungültig.');
    }
    setPending(false);
  }
  return (
    <section className="panel service-subpanel">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Vorlage</p>
          <h2>Leistungen</h2>
          <p>Aktuelle Katalogwerte werden erst beim Erstellen einer Veranstaltung aufgelöst.</p>
        </div>
        {canWrite ? (
          <button
            className="button button--secondary"
            onClick={() => setAdding(true)}
            type="button"
          >
            Leistung hinzufügen
          </button>
        ) : null}
      </header>
      <FormMessage message={message} success={message?.includes('angelegt')} />
      {initial.length ? (
        <div className="service-position-list">
          {initial.map((item) => (
            <article className="service-position-card" key={item.id}>
              {editingId === item.id ? (
                <FormatServiceEditForm
                  canPurchase={canPurchase}
                  canSales={canSales}
                  item={item}
                  onCancel={() => setEditingId(undefined)}
                  onSubmit={(event) => void update(item, event)}
                  pending={pending}
                  services={services}
                />
              ) : (
                <>
                  <div>
                    <strong>
                      {item.sortOrder}. {item.serviceName}
                    </strong>
                    <small>
                      {item.categoryName} · {item.quantity} {unitLabel(item.unit)}
                    </small>
                    {item.serviceStatus === 'ARCHIVED' || item.providerStatus === 'ARCHIVED' ? (
                      <span className="compact-warning">
                        Korrektur vor neuer Eventanlage erforderlich
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <span>{item.providerName ?? 'Kein Dienstleister'}</span>
                    <small>
                      Einkauf:{' '}
                      {item.resolvedPurchasePriceMinor === undefined
                        ? 'nicht freigegeben'
                        : (formatMinorAmount(item.resolvedPurchasePriceMinor, 'EUR') ??
                          'nicht hinterlegt')}{' '}
                      · Verkauf:{' '}
                      {item.resolvedSalesPriceMinor === undefined
                        ? 'nicht freigegeben'
                        : (formatMinorAmount(item.resolvedSalesPriceMinor, 'EUR') ??
                          'nicht hinterlegt')}
                    </small>
                  </div>
                  <div className="button-row">
                    {canWrite || canArchive ? (
                      <ActionMenu
                        compact
                        items={[
                          ...(canWrite && item.status === 'ACTIVE'
                            ? [
                                {
                                  id: 'edit',
                                  label: 'Bearbeiten',
                                  onSelect: () => setEditingId(item.id),
                                },
                              ]
                            : []),
                          ...(canArchive
                            ? [
                                {
                                  id: 'status',
                                  label: item.status === 'ACTIVE' ? 'Entfernen' : 'Reaktivieren',
                                  danger: item.status === 'ACTIVE',
                                  disabled: pending,
                                  onSelect: () => void archive(item),
                                },
                              ]
                            : []),
                        ]}
                        label={`Aktionen für ${item.serviceName}`}
                      />
                    ) : null}
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">Keine Leistungsvorgaben hinterlegt.</p>
      )}
      {canWrite ? (
        <Dialog
          eyebrow="Veranstaltungsformat"
          onClose={() => setAdding(false)}
          open={adding}
          title="Leistung hinzufügen"
        >
          {services.length ? (
            <form className="form-grid form-stack" onSubmit={create}>
              <label>
                Leistung
                <select
                  name="serviceId"
                  onChange={(event) => setSelectedId(event.target.value)}
                  value={selectedId}
                >
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Menge
                <input defaultValue="1" inputMode="decimal" name="quantity" required />
              </label>
              <label>
                Dienstleister
                <select name="providerId">
                  <option value="">Bevorzugten verwenden</option>
                  {selected?.providerPrices
                    ?.filter((provider) => provider.status === 'ACTIVE')
                    .map((provider) => (
                      <option key={provider.id} value={provider.businessPartnerId}>
                        {provider.businessPartnerName}
                      </option>
                    ))}
                </select>
              </label>
              {canPurchase ? (
                <label>
                  Einkaufs-Override <span className="optional">leer = Katalog</span>
                  <div className="money-input">
                    <input inputMode="decimal" name="purchaseOverride" />
                    <span>€</span>
                  </div>
                </label>
              ) : null}
              {canSales ? (
                <label>
                  Verkaufs-Override <span className="optional">leer = Katalog</span>
                  <div className="money-input">
                    <input inputMode="decimal" name="salesOverride" />
                    <span>€</span>
                  </div>
                </label>
              ) : null}
              <button className="button" disabled={pending}>
                Hinzufügen
              </button>
            </form>
          ) : (
            <p>Keine aktive Katalogleistung verfügbar.</p>
          )}
        </Dialog>
      ) : null}
    </section>
  );
}

function FormatServiceEditForm({
  item,
  services,
  canPurchase,
  canSales,
  pending,
  onSubmit,
  onCancel,
}: {
  item: FormatService;
  services: Service[];
  canPurchase: boolean;
  canSales: boolean;
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const availableServices: Array<Pick<Service, 'id' | 'name' | 'providerPrices'>> = services.some(
    (service) => service.id === item.serviceId,
  )
    ? services
    : [
        {
          id: item.serviceId,
          name: `${item.serviceName} (archiviert)`,
          providerPrices: [],
        },
        ...services,
      ];
  const [serviceId, setServiceId] = useState(item.serviceId);
  const service = availableServices.find((candidate) => candidate.id === serviceId);
  return (
    <form className="form-grid form-stack service-position-edit" onSubmit={onSubmit}>
      <label>
        Leistung
        <select
          name="serviceId"
          onChange={(event) => setServiceId(event.target.value)}
          value={serviceId}
        >
          {availableServices.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Menge
        <input defaultValue={item.quantity} inputMode="decimal" name="quantity" required />
      </label>
      <label>
        Reihenfolge
        <input defaultValue={item.sortOrder} min={1} name="sortOrder" required type="number" />
      </label>
      <label>
        Dienstleister
        <select defaultValue={item.providerBusinessPartnerId ?? ''} name="providerId">
          <option value="">Bevorzugten verwenden</option>
          {service?.providerPrices
            ?.filter((provider) => provider.status === 'ACTIVE')
            .map((provider) => (
              <option key={provider.id} value={provider.businessPartnerId}>
                {provider.businessPartnerName}
              </option>
            ))}
        </select>
      </label>
      {canPurchase ? (
        <label>
          Einkaufs-Override <span className="optional">leer = Katalog</span>
          <div className="money-input">
            <input
              defaultValue={minorAmountToInput(item.purchasePriceOverrideMinor, 'EUR')}
              inputMode="decimal"
              name="purchaseOverride"
            />
            <span>€</span>
          </div>
        </label>
      ) : null}
      {canSales ? (
        <label>
          Verkaufs-Override <span className="optional">leer = Katalog</span>
          <div className="money-input">
            <input
              defaultValue={minorAmountToInput(item.salesPriceOverrideMinor, 'EUR')}
              inputMode="decimal"
              name="salesOverride"
            />
            <span>€</span>
          </div>
        </label>
      ) : null}
      <div className="button-row form-span">
        <button className="button button--small" disabled={pending}>
          Speichern
        </button>
        <button className="button button--quiet" onClick={onCancel} type="button">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

export function CalculationPanel({
  organizationId,
  calculation,
  services,
  partners,
  canWrite,
  canPurchase,
  canSales,
  canApprove,
}: {
  organizationId: string;
  calculation: Calculation;
  services: Service[];
  partners: Partner[];
  canWrite: boolean;
  canPurchase: boolean;
  canSales: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const worksheetRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, PositionDraft>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [addMode, setAddMode] = useState<'catalog' | 'custom'>();
  const [catalogPricePreview, setCatalogPricePreview] = useState<CatalogPricePreview>();
  const activePositions = calculation.positions.filter((position) => position.status === 'ACTIVE');
  const groupedPositions = groupPositions(activePositions);
  const missingIds = new Set([
    ...(canPurchase ? calculation.totals.missingPurchasePricePositionIds : []),
    ...(canSales ? calculation.totals.missingSalesPricePositionIds : []),
  ]);
  const missingCount = missingIds.size;

  function beginWorksheetEdit(positionId?: string) {
    if (!editing) {
      setDrafts(
        Object.fromEntries(
          activePositions.map((position) => [position.id, positionDraft(position)]),
        ),
      );
      setDirtyIds(new Set());
      setEditing(true);
      setMessage(undefined);
    }
    if (positionId) focusPosition(positionId);
  }

  function cancelWorksheetEdit() {
    setEditing(false);
    setDrafts({});
    setDirtyIds(new Set());
    setMessage(undefined);
  }

  function updateDraft<K extends keyof PositionDraft>(id: string, key: K, value: PositionDraft[K]) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? positionDraft(activePositions.find((item) => item.id === id)!)),
        [key]: value,
      },
    }));
    setDirtyIds((current) => new Set(current).add(id));
  }

  async function saveWorksheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dirtyIds.size === 0) {
      cancelWorksheetEdit();
      return;
    }
    setPending(true);
    setMessage(undefined);
    const remaining = new Set(dirtyIds);
    const client = createBrowserApiClient();
    for (const position of activePositions.filter((item) => dirtyIds.has(item.id))) {
      const draft = drafts[position.id];
      if (!draft) continue;
      try {
        const result = await client.PATCH(
          '/api/v1/organizations/{organizationId}/event-service-positions/{positionId}',
          {
            credentials: 'include',
            params: { path: { organizationId, positionId: position.id } },
            body: {
              version: position.version,
              quantity: draft.quantity,
              providerBusinessPartnerId: draft.providerId || null,
              ...(canPurchase
                ? { purchaseUnitPriceMinor: majorAmountToMinor(draft.purchasePrice, 'EUR') }
                : {}),
              ...(canSales
                ? { salesUnitPriceMinor: majorAmountToMinor(draft.salesPrice, 'EUR') }
                : {}),
              costStatus: draft.costStatus,
              note: draft.note.trim() || null,
            },
          },
        );
        if (!result.data || result.error) {
          setMessage(
            apiErrorMessage(result.error, `„${position.name}“ konnte nicht gespeichert werden.`),
          );
          setDirtyIds(remaining);
          setPending(false);
          router.refresh();
          focusPosition(position.id);
          return;
        }
        remaining.delete(position.id);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Ein Betrag ist ungültig.');
        setDirtyIds(remaining);
        setPending(false);
        focusPosition(position.id);
        return;
      }
    }
    setPending(false);
    setEditing(false);
    setDrafts({});
    setDirtyIds(new Set());
    setMessage('Änderungen gespeichert.');
    router.refresh();
  }

  function focusPosition(positionId: string) {
    requestAnimationFrame(() => {
      const row = worksheetRef.current?.querySelector<HTMLElement>(
        `[data-position-id="${positionId}"]`,
      );
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row?.querySelector<HTMLElement>('input, select, button, [tabindex]')?.focus();
    });
  }

  function focusFirstMissing() {
    setCollapsedGroups(new Set());
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = worksheetRef.current?.querySelector<HTMLElement>(
          '[data-missing-price="true"]',
        );
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target?.querySelector<HTMLElement>('input')?.focus();
        if (!target?.contains(document.activeElement)) target?.focus();
      }),
    );
  }

  function toggleGroup(group: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  async function add(event: FormEvent<HTMLFormElement>, custom: boolean) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const body = {
        ...(custom
          ? {
              name: String(form.get('name') ?? '').trim(),
              categoryName: String(form.get('categoryName') ?? '').trim(),
              unit: String(form.get('unit')) as Position['unit'],
            }
          : { sourceServiceId: String(form.get('serviceId')) }),
        quantity: String(form.get('quantity') ?? ''),
        providerBusinessPartnerId: String(form.get('providerId') ?? '') || null,
        ...(canPurchase
          ? {
              purchaseUnitPriceMinor: majorAmountToMinor(
                String(form.get('purchasePrice') ?? ''),
                'EUR',
              ),
            }
          : {}),
        ...(canSales
          ? { salesUnitPriceMinor: majorAmountToMinor(String(form.get('salesPrice') ?? ''), 'EUR') }
          : {}),
        costStatus: String(form.get('costStatus') ?? 'PLANNED') as Position['costStatus'],
        sortOrder: activePositions.length + 1,
        note: String(form.get('note') ?? '').trim() || null,
      };
      const result = await createBrowserApiClient().POST(
        '/api/v1/organizations/{organizationId}/events/{eventId}/calculation/positions',
        {
          credentials: 'include',
          params: { path: { organizationId, eventId: calculation.eventId } },
          body,
        },
      );
      if (!result.data || result.error)
        setMessage(apiErrorMessage(result.error, 'Die Position konnte nicht angelegt werden.'));
      else {
        setMessage('Position angelegt.');
        setAddMode(undefined);
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ein Betrag ist ungültig.');
    }
    setPending(false);
  }
  async function archive(position: Position) {
    if (!window.confirm(`„${position.name}“ aus der Kalkulation entfernen?`)) return;
    setPending(true);
    const result = await createBrowserApiClient().PATCH(
      '/api/v1/organizations/{organizationId}/event-service-positions/{positionId}/status',
      {
        credentials: 'include',
        params: { path: { organizationId, positionId: position.id } },
        body: { version: position.version, status: 'ARCHIVED' },
      },
    );
    if (!result.data || result.error)
      setMessage(apiErrorMessage(result.error, 'Die Position konnte nicht entfernt werden.'));
    else router.refresh();
    setPending(false);
  }
  async function previewCatalogPrices(position: Position) {
    setPending(true);
    setCatalogPricePreview(undefined);
    const result = await createBrowserApiClient().GET(
      '/api/v1/organizations/{organizationId}/event-service-positions/{positionId}/catalog-price-preview',
      {
        credentials: 'include',
        params: { path: { organizationId, positionId: position.id } },
      },
    );
    if (!result.data || result.error) {
      setMessage(apiErrorMessage(result.error, 'Die Katalogpreise konnten nicht geprüft werden.'));
    } else {
      setCatalogPricePreview(result.data);
      setMessage(undefined);
    }
    setPending(false);
  }
  async function applyCatalogPrices(position: Position) {
    setPending(true);
    const result = await createBrowserApiClient().PATCH(
      '/api/v1/organizations/{organizationId}/event-service-positions/{positionId}/catalog-prices',
      {
        credentials: 'include',
        params: { path: { organizationId, positionId: position.id } },
        body: { version: position.version },
      },
    );
    if (!result.data || result.error) {
      setMessage(
        apiErrorMessage(result.error, 'Die Katalogpreise konnten nicht übernommen werden.'),
      );
    } else {
      setCatalogPricePreview(undefined);
      setMessage('Katalogpreise übernommen.');
      router.refresh();
    }
    setPending(false);
  }
  async function status(next: Calculation['status']) {
    setPending(true);
    const result = await createBrowserApiClient().PATCH(
      '/api/v1/organizations/{organizationId}/events/{eventId}/calculation/status',
      {
        credentials: 'include',
        params: { path: { organizationId, eventId: calculation.eventId } },
        body: { version: calculation.version, status: next, note: null },
      },
    );
    if (!result.data || result.error)
      setMessage(
        apiErrorMessage(result.error, 'Der Kalkulationsstatus konnte nicht geändert werden.'),
      );
    else {
      setMessage(next === 'APPROVED' ? 'Kalkulation freigegeben.' : 'Kalkulationsstatus geändert.');
      router.refresh();
    }
    setPending(false);
  }

  const statusActions: ActionMenuItem[] = [];
  if (calculation.status === 'DRAFT' && canWrite) {
    statusActions.push({
      id: 'review',
      label: 'Zur Prüfung geben',
      onSelect: () => void status('REVIEW'),
    });
  }
  if (calculation.status === 'REVIEW' && canWrite) {
    statusActions.push({
      id: 'draft',
      label: 'Zurück zu Entwurf',
      onSelect: () => void status('DRAFT'),
    });
  }
  if (calculation.status === 'REVIEW' && canApprove) {
    statusActions.push({
      id: 'approve',
      label: calculation.totals.incomplete ? 'Freigeben (Preise fehlen)' : 'Freigeben',
      disabled: pending || calculation.totals.incomplete,
      onSelect: () => void status('APPROVED'),
    });
  }
  if (calculation.status === 'APPROVED' && canWrite) {
    statusActions.push({
      id: 'reopen',
      label: 'Freigabe zurücknehmen',
      danger: true,
      onSelect: () => void status('DRAFT'),
    });
  }

  return (
    <section className="calculation-panel calculation-workspace">
      <header className="section-heading calculation-toolbar">
        <div>
          <p className="eyebrow">Veranstaltung</p>
          <h2>Kalkulation</h2>
        </div>
        <div className="calculation-toolbar__actions">
          {canWrite && !editing ? (
            <button
              className="button"
              disabled={pending}
              onClick={() => beginWorksheetEdit()}
              type="button"
            >
              Bearbeiten
            </button>
          ) : null}
          {canWrite && !editing ? (
            <ActionMenu
              items={[
                {
                  id: 'catalog',
                  label: 'Aus Leistungskatalog',
                  disabled: services.length === 0,
                  onSelect: () => setAddMode('catalog'),
                },
                {
                  id: 'custom',
                  label: 'Individuelle Position',
                  onSelect: () => setAddMode('custom'),
                },
              ]}
              label="Neue Kalkulationsposition auswählen"
              secondary
              triggerContent={
                <>
                  Position hinzufügen <span aria-hidden="true">▾</span>
                </>
              }
            />
          ) : null}
          {statusActions.length ? (
            <ActionMenu items={statusActions} label="Weitere Kalkulationsaktionen" />
          ) : null}
        </div>
      </header>
      <FormMessage
        message={message}
        success={
          message?.includes('angelegt') ||
          message?.includes('gespeichert') ||
          message?.includes('freigegeben') ||
          message?.includes('geändert') ||
          message?.includes('übernommen')
        }
      />
      {missingCount > 0 ? (
        <CompactNotice onClick={focusFirstMissing} tone="warning">
          {missingCount} {missingCount === 1 ? 'Position benötigt' : 'Positionen benötigen'} noch
          einen Preis. Zur ersten betroffenen Zelle springen.
        </CompactNotice>
      ) : calculation.totals.incomplete ? (
        <CompactNotice tone="warning">
          Benötigte Preise fehlen. Details sind mit Ihrer Preisberechtigung nicht sichtbar.
        </CompactNotice>
      ) : null}
      <CalculationSummary calculation={calculation} canPurchase={canPurchase} canSales={canSales} />
      <form className="calculation-sheet-form" onSubmit={saveWorksheet} ref={worksheetRef}>
        <div className="calculation-sheet-wrap">
          <table className="calculation-sheet">
            <thead>
              <tr>
                <th className="calculation-sheet__sticky" scope="col">
                  Pos.
                </th>
                <th scope="col">Kategorie</th>
                <th scope="col">Bezeichnung</th>
                <th scope="col">Dienstleister / Herkunft</th>
                <th className="numeric" scope="col">
                  Menge
                </th>
                <th scope="col">Einheit</th>
                {canPurchase ? (
                  <th className="numeric" scope="col">
                    EK / Einheit
                  </th>
                ) : null}
                {canPurchase ? (
                  <th className="numeric" scope="col">
                    EK gesamt
                  </th>
                ) : null}
                {canSales ? (
                  <th className="numeric" scope="col">
                    VK / Einheit
                  </th>
                ) : null}
                {canSales ? (
                  <th className="numeric" scope="col">
                    VK gesamt
                  </th>
                ) : null}
                <th scope="col">Kostenstatus</th>
                <th className="calculation-sheet__actions" scope="col">
                  Aktionen
                </th>
              </tr>
            </thead>
            {calculation.bookingCosts.length ? (
              <BookingCostRows
                canPurchase={canPurchase}
                canSales={canSales}
                collapsed={collapsedGroups.has('booking-costs')}
                costs={calculation.bookingCosts}
                eventId={calculation.eventId}
                onToggle={() => toggleGroup('booking-costs')}
                organizationId={organizationId}
              />
            ) : null}
            {groupedPositions.map(([group, positions]) => (
              <PositionGroupRows
                canPurchase={canPurchase}
                canSales={canSales}
                canWrite={canWrite}
                {...(catalogPricePreview ? { catalogPricePreview } : {})}
                collapsed={collapsedGroups.has(group)}
                drafts={drafts}
                editing={editing}
                group={group}
                key={group}
                missingPurchaseIds={new Set(calculation.totals.missingPurchasePricePositionIds)}
                missingSalesIds={new Set(calculation.totals.missingSalesPricePositionIds)}
                onApplyCatalogPrices={applyCatalogPrices}
                onArchive={archive}
                onCancelCatalogPricePreview={() => setCatalogPricePreview(undefined)}
                onEdit={beginWorksheetEdit}
                onPreviewCatalogPrices={previewCatalogPrices}
                onToggle={() => toggleGroup(group)}
                onUpdateDraft={updateDraft}
                partners={partners}
                pending={pending}
                positions={positions}
                services={services}
              />
            ))}
          </table>
        </div>
        {activePositions.length === 0 && calculation.bookingCosts.length === 0 ? (
          <p className="compact-empty calculation-empty">Noch keine Kalkulationspositionen.</p>
        ) : null}
        {editing ? (
          <div className="calculation-edit-bar">
            <span>
              {dirtyIds.size
                ? `${dirtyIds.size} ${dirtyIds.size === 1 ? 'Position geändert' : 'Positionen geändert'} · nicht gespeichert`
                : 'Bearbeitungsmodus · noch keine Änderungen'}
            </span>
            <div className="button-row">
              <button className="button" disabled={pending} type="submit">
                {pending ? 'Speichern …' : 'Speichern'}
              </button>
              <button
                className="button button--secondary"
                disabled={pending}
                onClick={cancelWorksheetEdit}
                type="button"
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : null}
      </form>
      {canWrite ? (
        <Dialog
          eyebrow="Kalkulation"
          onClose={() => setAddMode(undefined)}
          open={Boolean(addMode)}
          title={addMode === 'custom' ? 'Individuelle Position' : 'Aus Leistungskatalog'}
        >
          {addMode ? (
            <PositionForm
              canPurchase={canPurchase}
              canSales={canSales}
              {...(addMode === 'custom' ? { custom: true } : {})}
              onSubmit={(event) => add(event, addMode === 'custom')}
              partners={partners}
              services={services}
            />
          ) : null}
        </Dialog>
      ) : null}
      {calculation.history.length ? (
        <details className="history-panel">
          <summary>Statushistorie</summary>
          <ol>
            {calculation.history.map((entry) => (
              <li key={entry.id}>
                {new Date(entry.changedAt).toLocaleString('de-DE')} ·{' '}
                {calculationStatusLabel(entry.previousStatus)} →{' '}
                {calculationStatusLabel(entry.newStatus)} · {entry.actorName}
                {entry.reason ? ` · ${entry.reason}` : ''}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

function CalculationSummary({
  calculation,
  canPurchase,
  canSales,
}: {
  calculation: Calculation;
  canPurchase: boolean;
  canSales: boolean;
}) {
  const totals = calculation.totals;
  return (
    <dl className="calculation-summary calculation-summary--worksheet">
      {canPurchase ? (
        <>
          <div>
            <dt>Voraussichtliche Gesamtkosten</dt>
            <dd>{formatMinorAmount(totals.estimatedCostMinor, 'EUR') ?? '—'}</dd>
          </div>
          <div>
            <dt>Davon verbindlich</dt>
            <dd>{formatMinorAmount(totals.committedCostMinor, 'EUR') ?? '—'}</dd>
          </div>
          <div>
            <dt>Noch nicht verbindlich</dt>
            <dd>{formatMinorAmount(totals.plannedCostMinor, 'EUR') ?? '—'}</dd>
          </div>
        </>
      ) : null}
      {canSales ? (
        <>
          <div>
            <dt>VK Leistungen</dt>
            <dd>{formatMinorAmount(totals.serviceSalesValueMinor, 'EUR') ?? '—'}</dd>
          </div>
          <div>
            <dt>Marge Leistungen</dt>
            <dd>{formatMinorAmount(totals.serviceMarginMinor, 'EUR') ?? '—'}</dd>
          </div>
        </>
      ) : null}
      <div>
        <dt>Freigabestatus</dt>
        <dd>
          <span className="status-badge">{calculationStatusLabel(calculation.status)}</span>
        </dd>
      </div>
    </dl>
  );
}

function BookingCostRows({
  costs,
  collapsed,
  onToggle,
  organizationId,
  eventId,
  canPurchase,
  canSales,
}: {
  costs: BookingCost[];
  collapsed: boolean;
  onToggle: () => void;
  organizationId: string;
  eventId: string;
  canPurchase: boolean;
  canSales: boolean;
}) {
  const subtotal = sumMinor(costs.map((cost) => cost.amountMinor));
  const columnCount = 8 + (canPurchase ? 2 : 0) + (canSales ? 2 : 0);
  return (
    <tbody className="calculation-sheet__group">
      <tr className="calculation-group-row">
        <th colSpan={columnCount} scope="rowgroup">
          <button aria-expanded={!collapsed} onClick={onToggle} type="button">
            <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span> Bookings und Gagen
          </button>
          {canPurchase ? (
            <strong>Zwischensumme {formatMinorAmount(subtotal, 'EUR') ?? '—'}</strong>
          ) : null}
        </th>
      </tr>
      {!collapsed
        ? costs.map((cost, index) => (
            <tr className="calculation-sheet__readonly" key={cost.id}>
              <td className="calculation-sheet__sticky" data-label="Position">
                B{index + 1}
              </td>
              <td data-label="Kategorie">Booking</td>
              <td data-label="Bezeichnung">
                <strong>{cost.label}</strong>
                <small>{cost.artistName}</small>
              </td>
              <td data-label="Herkunft">Booking · schreibgeschützt</td>
              <td className="numeric" data-label="Menge">
                1
              </td>
              <td data-label="Einheit">Pauschal</td>
              {canPurchase ? (
                <td className="numeric readonly-cell" data-label="EK / Einheit">
                  {formatMinorAmount(cost.amountMinor, 'EUR') ?? '—'}
                </td>
              ) : null}
              {canPurchase ? (
                <td className="numeric readonly-cell" data-label="EK gesamt">
                  {formatMinorAmount(cost.amountMinor, 'EUR') ?? '—'}
                </td>
              ) : null}
              {canSales ? (
                <td className="numeric readonly-cell" data-label="VK / Einheit">
                  —
                </td>
              ) : null}
              {canSales ? (
                <td className="numeric readonly-cell" data-label="VK gesamt">
                  —
                </td>
              ) : null}
              <td data-label="Kostenstatus">
                {cost.costStatus === 'COMMITTED' ? 'Verbindlich' : 'Geplant'}
              </td>
              <td className="calculation-sheet__actions" data-label="Aktionen">
                <a
                  className="text-link"
                  href={`/o/${organizationId}/events/${eventId}?tab=bookings#booking-${cost.bookingId}`}
                >
                  Zum Booking
                </a>
              </td>
            </tr>
          ))
        : null}
    </tbody>
  );
}

function PositionGroupRows({
  group,
  positions,
  collapsed,
  onToggle,
  editing,
  drafts,
  onUpdateDraft,
  services,
  partners,
  canWrite,
  canPurchase,
  canSales,
  pending,
  missingPurchaseIds,
  missingSalesIds,
  catalogPricePreview,
  onEdit,
  onArchive,
  onPreviewCatalogPrices,
  onApplyCatalogPrices,
  onCancelCatalogPricePreview,
}: {
  group: string;
  positions: Position[];
  collapsed: boolean;
  onToggle: () => void;
  editing: boolean;
  drafts: Record<string, PositionDraft>;
  onUpdateDraft: <K extends keyof PositionDraft>(
    id: string,
    key: K,
    value: PositionDraft[K],
  ) => void;
  services: Service[];
  partners: Partner[];
  canWrite: boolean;
  canPurchase: boolean;
  canSales: boolean;
  pending: boolean;
  missingPurchaseIds: Set<string>;
  missingSalesIds: Set<string>;
  catalogPricePreview?: CatalogPricePreview;
  onEdit: (positionId?: string) => void;
  onArchive: (position: Position) => Promise<void>;
  onPreviewCatalogPrices: (position: Position) => Promise<void>;
  onApplyCatalogPrices: (position: Position) => Promise<void>;
  onCancelCatalogPricePreview: () => void;
}) {
  const purchaseSubtotal = sumMinor(positions.map((position) => position.purchaseTotalMinor));
  const salesSubtotal = sumMinor(positions.map((position) => position.salesTotalMinor));
  const columnCount = 8 + (canPurchase ? 2 : 0) + (canSales ? 2 : 0);
  return (
    <tbody className="calculation-sheet__group">
      <tr className="calculation-group-row">
        <th colSpan={columnCount} scope="rowgroup">
          <button aria-expanded={!collapsed} onClick={onToggle} type="button">
            <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span> {group}
          </button>
          <span className="calculation-group-row__totals">
            {canPurchase ? (
              <strong>EK {formatMinorAmount(purchaseSubtotal, 'EUR') ?? '—'}</strong>
            ) : null}
            {canSales ? <strong>VK {formatMinorAmount(salesSubtotal, 'EUR') ?? '—'}</strong> : null}
          </span>
        </th>
      </tr>
      {!collapsed
        ? positions.map((position) => {
            const draft = drafts[position.id] ?? positionDraft(position);
            const providers = providerOptions(position, services, partners);
            const purchaseMissing = canPurchase && missingPurchaseIds.has(position.id);
            const salesMissing = canSales && missingSalesIds.has(position.id);
            const canRefreshPurchase = position.source !== 'CUSTOM' && purchaseMissing;
            const canRefreshSales = position.source !== 'CUSTOM' && salesMissing;
            const showCatalogPriceAction = canWrite && (canRefreshPurchase || canRefreshSales);
            const preview =
              catalogPricePreview?.positionId === position.id ? catalogPricePreview : undefined;
            const menuItems: ActionMenuItem[] = [
              { id: 'edit', label: 'Bearbeiten', onSelect: () => onEdit(position.id) },
              ...(showCatalogPriceAction
                ? [
                    {
                      id: 'catalog',
                      label: 'Preise aus Katalog übernehmen',
                      onSelect: () => void onPreviewCatalogPrices(position),
                    },
                  ]
                : []),
              {
                id: 'remove',
                label: 'Entfernen',
                danger: true,
                onSelect: () => void onArchive(position),
              },
            ];
            return (
              <Fragment key={position.id}>
                <tr data-position-id={position.id}>
                  <td className="calculation-sheet__sticky" data-label="Position">
                    {position.sortOrder}
                  </td>
                  <td data-label="Kategorie">{position.categoryName}</td>
                  <td data-label="Bezeichnung">
                    <strong title={position.name}>{position.name}</strong>
                    <small>{sourceLabel(position.source)}</small>
                    {editing ? (
                      <details className="calculation-more-fields">
                        <summary>Weitere Angaben</summary>
                        <label>
                          Notiz
                          <input
                            onChange={(event) =>
                              onUpdateDraft(position.id, 'note', event.target.value)
                            }
                            value={draft.note}
                          />
                        </label>
                      </details>
                    ) : position.note ? (
                      <small title={position.note}>{position.note}</small>
                    ) : null}
                  </td>
                  <td data-label="Dienstleister / Herkunft">
                    {editing ? (
                      <select
                        aria-label={`Dienstleister für ${position.name}`}
                        onChange={(event) =>
                          onUpdateDraft(position.id, 'providerId', event.target.value)
                        }
                        value={draft.providerId}
                      >
                        <option value="">Kein Dienstleister</option>
                        {providers.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        {position.providerName ?? '—'}
                        <small>{sourceLabel(position.source)}</small>
                      </>
                    )}
                  </td>
                  <td className="numeric" data-label="Menge">
                    {editing ? (
                      <input
                        aria-label={`Menge für ${position.name}`}
                        inputMode="decimal"
                        onChange={(event) =>
                          onUpdateDraft(position.id, 'quantity', event.target.value)
                        }
                        required
                        value={draft.quantity}
                      />
                    ) : (
                      position.quantity
                    )}
                  </td>
                  <td data-label="Einheit">{unitLabel(position.unit)}</td>
                  {canPurchase ? (
                    <td
                      className={`numeric${purchaseMissing ? ' missing-price-cell' : ''}`}
                      data-label="EK / Einheit"
                      data-missing-price={purchaseMissing ? 'true' : undefined}
                      tabIndex={purchaseMissing && !editing ? -1 : undefined}
                    >
                      {editing ? (
                        <div className="money-input money-input--sheet">
                          <input
                            aria-label={`Einkaufspreis pro Einheit für ${position.name}`}
                            inputMode="decimal"
                            onChange={(event) =>
                              onUpdateDraft(position.id, 'purchasePrice', event.target.value)
                            }
                            value={draft.purchasePrice}
                          />
                          <span>€</span>
                        </div>
                      ) : (
                        (formatMinorAmount(position.purchaseUnitPriceMinor, 'EUR') ?? 'Preis fehlt')
                      )}
                    </td>
                  ) : null}
                  {canPurchase ? (
                    <td className="numeric readonly-cell" data-label="EK gesamt">
                      <output>
                        {formatMinorAmount(position.purchaseTotalMinor, 'EUR') ?? '—'}
                      </output>
                    </td>
                  ) : null}
                  {canSales ? (
                    <td
                      className={`numeric${salesMissing ? ' missing-price-cell' : ''}`}
                      data-label="VK / Einheit"
                      data-missing-price={salesMissing ? 'true' : undefined}
                      tabIndex={salesMissing && !editing ? -1 : undefined}
                    >
                      {editing ? (
                        <div className="money-input money-input--sheet">
                          <input
                            aria-label={`Verkaufspreis pro Einheit für ${position.name}`}
                            inputMode="decimal"
                            onChange={(event) =>
                              onUpdateDraft(position.id, 'salesPrice', event.target.value)
                            }
                            value={draft.salesPrice}
                          />
                          <span>€</span>
                        </div>
                      ) : (
                        (formatMinorAmount(position.salesUnitPriceMinor, 'EUR') ?? 'Preis fehlt')
                      )}
                    </td>
                  ) : null}
                  {canSales ? (
                    <td className="numeric readonly-cell" data-label="VK gesamt">
                      <output>{formatMinorAmount(position.salesTotalMinor, 'EUR') ?? '—'}</output>
                    </td>
                  ) : null}
                  <td data-label="Kostenstatus">
                    {editing ? (
                      <select
                        aria-label={`Kostenstatus für ${position.name}`}
                        onChange={(event) =>
                          onUpdateDraft(
                            position.id,
                            'costStatus',
                            event.target.value as Position['costStatus'],
                          )
                        }
                        value={draft.costStatus}
                      >
                        <option value="PLANNED">Geplant</option>
                        <option value="COMMITTED">Verbindlich</option>
                      </select>
                    ) : position.costStatus === 'COMMITTED' ? (
                      'Verbindlich'
                    ) : (
                      'Geplant'
                    )}
                  </td>
                  <td className="calculation-sheet__actions" data-label="Aktionen">
                    {canWrite && !editing ? (
                      <ActionMenu
                        compact
                        items={menuItems}
                        label={`Aktionen für ${position.name}`}
                      />
                    ) : null}
                  </td>
                </tr>
                {preview ? (
                  <tr className="catalog-preview-row">
                    <td colSpan={columnCount}>
                      <CatalogPricePreviewRow
                        canPurchase={canPurchase}
                        canSales={canSales}
                        onApply={() => void onApplyCatalogPrices(position)}
                        onCancel={onCancelCatalogPricePreview}
                        pending={pending}
                        position={position}
                        preview={preview}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })
        : null}
    </tbody>
  );
}

function CatalogPricePreviewRow({
  position,
  preview,
  canPurchase,
  canSales,
  pending,
  onApply,
  onCancel,
}: {
  position: Position;
  preview: CatalogPricePreview;
  canPurchase: boolean;
  canSales: boolean;
  pending: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const canApply = preview.purchaseWillBeApplied || preview.salesWillBeApplied;
  return (
    <div
      aria-label="Vorschau der Katalogpreis-Übernahme"
      className="catalog-price-preview"
      role="dialog"
    >
      <strong>Vorschau für {position.name}</strong>
      <span>
        {canPurchase && position.purchaseUnitPriceMinor === null
          ? `EK ${preview.purchaseWillBeApplied ? formatMinorAmount(preview.purchaseUnitPriceMinor, 'EUR') : 'nicht verfügbar'}`
          : null}
        {canSales && position.salesUnitPriceMinor === null
          ? ` · VK ${preview.salesWillBeApplied ? formatMinorAmount(preview.salesUnitPriceMinor, 'EUR') : 'nicht verfügbar'}`
          : null}
        {preview.providerWillBeApplied ? ` · Dienstleister ${preview.providerName}` : ''}
      </span>
      <small>Bereits hinterlegte Preise bleiben unverändert.</small>
      <div className="button-row">
        <button
          className="button button--small"
          disabled={pending || !canApply}
          onClick={onApply}
          type="button"
        >
          Übernehmen
        </button>
        <button
          className="button button--quiet"
          disabled={pending}
          onClick={onCancel}
          type="button"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function groupPositions(positions: Position[]): Array<[string, Position[]]> {
  const groups = new Map<string, Position[]>();
  for (const position of [...positions].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  )) {
    const group = position.categoryName.trim() || 'Sonstige Leistungen';
    groups.set(group, [...(groups.get(group) ?? []), position]);
  }
  return [...groups.entries()];
}

function positionDraft(position: Position): PositionDraft {
  return {
    quantity: position.quantity,
    providerId: position.providerBusinessPartnerId ?? '',
    purchasePrice: minorAmountToInput(position.purchaseUnitPriceMinor, 'EUR'),
    salesPrice: minorAmountToInput(position.salesUnitPriceMinor, 'EUR'),
    costStatus: position.costStatus,
    note: position.note ?? '',
  };
}

function providerOptions(position: Position, services: Service[], partners: Partner[]) {
  const service = services.find((candidate) => candidate.id === position.sourceServiceId);
  const options =
    position.source === 'CUSTOM'
      ? partners.map((partner) => ({ id: partner.id, label: partner.companyName }))
      : (service?.providerPrices ?? [])
          .filter((provider) => provider.status === 'ACTIVE')
          .map((provider) => ({
            id: provider.businessPartnerId,
            label: provider.businessPartnerName,
          }));
  if (
    position.providerBusinessPartnerId &&
    !options.some((provider) => provider.id === position.providerBusinessPartnerId)
  ) {
    options.unshift({
      id: position.providerBusinessPartnerId,
      label: `${position.providerName ?? 'Bisheriger Dienstleister'} (historisch)`,
    });
  }
  return options;
}

function sourceLabel(source: Position['source']) {
  if (source === 'EVENT_FORMAT') return 'Format-Snapshot';
  if (source === 'SERVICE_CATALOG') return 'Leistungskatalog';
  return 'Individuell';
}

function sumMinor(values: Array<string | null | undefined>): string | undefined {
  const known = values.filter((value): value is string => value !== null && value !== undefined);
  if (known.length === 0) return undefined;
  return known.reduce((sum, value) => sum + BigInt(value), 0n).toString();
}

function PositionForm({
  custom,
  services,
  partners,
  canPurchase,
  canSales,
  onSubmit,
}: {
  custom?: boolean;
  services: Service[];
  partners: Partner[];
  canPurchase: boolean;
  canSales: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const initialDefaults = catalogPositionDefaults(services[0]);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [providerId, setProviderId] = useState(custom ? '' : initialDefaults.providerId);
  const [purchasePrice, setPurchasePrice] = useState(
    custom ? '' : minorAmountToInput(initialDefaults.purchasePriceMinor, 'EUR'),
  );
  const [salesPrice, setSalesPrice] = useState(
    custom ? '' : minorAmountToInput(initialDefaults.salesPriceMinor, 'EUR'),
  );
  const service = services.find((candidate) => candidate.id === serviceId);
  const providerOptions = custom
    ? partners.map((partner) => ({ id: partner.id, label: partner.companyName }))
    : (service?.providerPrices ?? [])
        .filter((provider) => provider.status === 'ACTIVE')
        .map((provider) => ({
          id: provider.businessPartnerId,
          label: provider.businessPartnerName,
        }));
  function selectService(nextServiceId: string) {
    const nextService = services.find((candidate) => candidate.id === nextServiceId);
    const defaults = catalogPositionDefaults(nextService);
    setServiceId(nextServiceId);
    setProviderId(defaults.providerId);
    setPurchasePrice(minorAmountToInput(defaults.purchasePriceMinor, 'EUR'));
    setSalesPrice(minorAmountToInput(defaults.salesPriceMinor, 'EUR'));
  }
  function selectProvider(nextProviderId: string) {
    setProviderId(nextProviderId);
    const provider = service?.providerPrices?.find(
      (candidate) =>
        candidate.status === 'ACTIVE' && candidate.businessPartnerId === nextProviderId,
    );
    setPurchasePrice(minorAmountToInput(provider?.purchasePriceMinor, 'EUR'));
  }
  return (
    <form className="form-grid form-stack" onSubmit={onSubmit}>
      {custom ? (
        <>
          <label>
            Bezeichnung
            <input name="name" required />
          </label>
          <label>
            Kategorie
            <input name="categoryName" required />
          </label>
          <label>
            Einheit
            <select name="unit">
              {serviceUnitOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <label>
          Leistung
          <select
            name="serviceId"
            onChange={(event) => selectService(event.target.value)}
            required
            value={serviceId}
          >
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Menge
        <input defaultValue="1" inputMode="decimal" name="quantity" required />
      </label>
      <label>
        Dienstleister
        <select
          name="providerId"
          onChange={(event) => selectProvider(event.target.value)}
          value={providerId}
        >
          <option value="">{custom ? 'Kein Dienstleister' : 'Dienstleister auswählen'}</option>
          {providerOptions.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}
            </option>
          ))}
        </select>
      </label>
      {canPurchase ? (
        <label>
          Einkaufs-Einzelpreis{' '}
          <div className="money-input">
            <input
              inputMode="decimal"
              name="purchasePrice"
              onChange={(event) => setPurchasePrice(event.target.value)}
              value={purchasePrice}
            />
            <span>€</span>
          </div>
        </label>
      ) : null}
      {canSales ? (
        <label>
          Verkaufs-Einzelpreis{' '}
          <div className="money-input">
            <input
              inputMode="decimal"
              name="salesPrice"
              onChange={(event) => setSalesPrice(event.target.value)}
              value={salesPrice}
            />
            <span>€</span>
          </div>
        </label>
      ) : null}
      {!custom && (canPurchase || canSales) ? (
        <p className="form-span compact-note">
          Preise aus dem Katalog sind vorbelegt und können für diese Position überschrieben werden.
        </p>
      ) : null}
      <label>
        Kostenstatus
        <select name="costStatus">
          <option value="PLANNED">Geplant</option>
          <option value="COMMITTED">Verbindlich</option>
        </select>
      </label>
      <label>
        Notiz
        <input name="note" />
      </label>
      <button className="button">Position anlegen</button>
    </form>
  );
}

function catalogPositionDefaults(service?: Service) {
  const activeProviders = (service?.providerPrices ?? []).filter(
    (provider) => provider.status === 'ACTIVE' && provider.businessPartnerStatus === 'ACTIVE',
  );
  const provider =
    activeProviders.find((candidate) => candidate.preferred) ??
    (activeProviders.length === 1 ? activeProviders[0] : undefined);
  return {
    providerId: provider?.businessPartnerId ?? '',
    purchasePriceMinor: provider?.purchasePriceMinor,
    salesPriceMinor: service?.defaultSalesPriceMinor,
  };
}
function calculationStatusLabel(status: Calculation['status']) {
  return { DRAFT: 'Entwurf', REVIEW: 'Zur Prüfung', APPROVED: 'Freigegeben' }[status];
}
