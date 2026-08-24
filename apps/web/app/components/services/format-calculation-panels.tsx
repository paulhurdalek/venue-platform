'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import {
  formatMinorAmount,
  majorAmountToMinor,
  minorAmountToInput,
} from '../../../src/booking-utils';
import { serviceUnitOptions, unitLabel } from '../../../src/services/service-unit-labels';
import { FormMessage } from '../form-message';

type Service = components['schemas']['ServiceDto'];
type FormatService = components['schemas']['EventFormatServiceDto'];
type Calculation = components['schemas']['EventCalculationDto'];
type Position = components['schemas']['EventServicePositionDto'];
type CatalogPricePreview = components['schemas']['EventPositionCatalogPricePreviewDto'];
type Partner = components['schemas']['BusinessPartnerDto'];

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
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ein Preis ist ungültig.');
    }
    setPending(false);
  }
  async function archive(item: FormatService) {
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
                    {canWrite && item.status === 'ACTIVE' ? (
                      <button
                        className="button button--quiet"
                        onClick={() => setEditingId(item.id)}
                        type="button"
                      >
                        Bearbeiten
                      </button>
                    ) : null}
                    {canArchive ? (
                      <button
                        className="button button--quiet"
                        disabled={pending}
                        onClick={() => void archive(item)}
                        type="button"
                      >
                        {item.status === 'ACTIVE' ? 'Entfernen' : 'Reaktivieren'}
                      </button>
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
        <details className="inline-editor">
          <summary>Leistung hinzufügen</summary>
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
        </details>
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
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [editingPositionId, setEditingPositionId] = useState<string>();
  const [catalogPricePreview, setCatalogPricePreview] = useState<CatalogPricePreview>();
  const activePositions = calculation.positions.filter((position) => position.status === 'ACTIVE');
  const catalogPositions = activePositions.filter((position) => position.source !== 'CUSTOM');
  const customPositions = activePositions.filter((position) => position.source === 'CUSTOM');
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
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ein Betrag ist ungültig.');
    }
    setPending(false);
  }
  async function archive(position: Position) {
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
  async function updatePosition(position: Position, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await createBrowserApiClient().PATCH(
        '/api/v1/organizations/{organizationId}/event-service-positions/{positionId}',
        {
          credentials: 'include',
          params: { path: { organizationId, positionId: position.id } },
          body: {
            version: position.version,
            ...(position.source === 'CUSTOM'
              ? {
                  name: String(form.get('name') ?? '').trim(),
                  categoryName: String(form.get('categoryName') ?? '').trim(),
                  unit: String(form.get('unit')) as Position['unit'],
                }
              : {}),
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
              ? {
                  salesUnitPriceMinor: majorAmountToMinor(
                    String(form.get('salesPrice') ?? ''),
                    'EUR',
                  ),
                }
              : {}),
            costStatus: String(form.get('costStatus')) as Position['costStatus'],
            sortOrder: Number(form.get('sortOrder')),
            note: String(form.get('note') ?? '').trim() || null,
          },
        },
      );
      if (!result.data || result.error) {
        setMessage(apiErrorMessage(result.error, 'Die Position konnte nicht gespeichert werden.'));
      } else {
        setEditingPositionId(undefined);
        setMessage('Position gespeichert.');
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ein Betrag ist ungültig.');
    }
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
  return (
    <section className="panel calculation-panel">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Veranstaltung</p>
          <h2>Kalkulation</h2>
          <p>
            Status: <strong>{calculationStatusLabel(calculation.status)}</strong> · Version{' '}
            {calculation.version}
          </p>
        </div>
        <div className="button-row">
          {calculation.status === 'DRAFT' && canWrite ? (
            <button
              className="button button--secondary"
              disabled={pending}
              onClick={() => void status('REVIEW')}
              type="button"
            >
              Zur Prüfung
            </button>
          ) : null}
          {calculation.status === 'REVIEW' && canWrite ? (
            <button
              className="button button--secondary"
              disabled={pending}
              onClick={() => void status('DRAFT')}
              type="button"
            >
              Zurück zu Entwurf
            </button>
          ) : null}
          {calculation.status === 'REVIEW' && canApprove ? (
            <button
              className="button"
              disabled={pending || calculation.totals.incomplete}
              onClick={() => void status('APPROVED')}
              type="button"
            >
              Freigeben
            </button>
          ) : null}
          {calculation.status === 'APPROVED' && canWrite ? (
            <button
              className="button button--secondary"
              disabled={pending}
              onClick={() => void status('DRAFT')}
              type="button"
            >
              Freigabe zurücknehmen
            </button>
          ) : null}
        </div>
      </header>
      <FormMessage
        message={message}
        success={
          message?.includes('angelegt') ||
          message?.includes('freigegeben') ||
          message?.includes('geändert') ||
          message?.includes('übernommen')
        }
      />
      {calculation.totals.incomplete ? (
        <p className="compact-warning">
          Mindestens ein benötigter Preis ist nicht hinterlegt. Eine Freigabe ist erst nach Klärung
          möglich.
        </p>
      ) : null}
      <CalculationSummary calculation={calculation} canPurchase={canPurchase} canSales={canSales} />
      <CalculationGroup
        title="Bookingkosten"
        empty="Keine kalkulationswirksamen Bookingbeträge hinterlegt."
      >
        {calculation.bookingCosts.map((cost) => (
          <article className="calculation-row calculation-row--readonly" key={cost.id}>
            <div>
              <strong>
                {cost.label} · {cost.artistName}
              </strong>
              <small>
                {cost.costStatus === 'COMMITTED' ? 'Verbindlich' : 'Geplant'} · Bearbeitung im
                Booking
              </small>
            </div>
            <div>
              {canPurchase ? (
                formatMinorAmount(cost.amountMinor, 'EUR')
              ) : (
                <span className="muted">Nicht freigegeben</span>
              )}
              <br />
              <a
                className="text-link"
                href={`/o/${organizationId}/events/${calculation.eventId}#booking-${cost.bookingId}`}
              >
                Zum Booking
              </a>
            </div>
          </article>
        ))}
      </CalculationGroup>
      <CalculationGroup
        title="Leistungen aus Format oder Katalog"
        empty="Keine Katalogleistungen in der Kalkulation."
      >
        {catalogPositions.map((position) => (
          <PositionRow
            canPurchase={canPurchase}
            canSales={canSales}
            canWrite={canWrite}
            editing={editingPositionId === position.id}
            key={position.id}
            {...(catalogPricePreview?.positionId === position.id ? { catalogPricePreview } : {})}
            onArchive={archive}
            onApplyCatalogPrices={() => void applyCatalogPrices(position)}
            onCancelEdit={() => setEditingPositionId(undefined)}
            onCancelCatalogPricePreview={() => setCatalogPricePreview(undefined)}
            onEdit={() => setEditingPositionId(position.id)}
            onPreviewCatalogPrices={() => void previewCatalogPrices(position)}
            onSubmit={(event) => void updatePosition(position, event)}
            partners={partners}
            pending={pending}
            position={position}
            services={services}
          />
        ))}
      </CalculationGroup>
      <CalculationGroup
        title="Individuelle Veranstaltungspositionen"
        empty="Keine individuellen Positionen."
      >
        {customPositions.map((position) => (
          <PositionRow
            canPurchase={canPurchase}
            canSales={canSales}
            canWrite={canWrite}
            editing={editingPositionId === position.id}
            key={position.id}
            onArchive={archive}
            onCancelEdit={() => setEditingPositionId(undefined)}
            onEdit={() => setEditingPositionId(position.id)}
            onSubmit={(event) => void updatePosition(position, event)}
            partners={partners}
            pending={pending}
            position={position}
            services={services}
          />
        ))}
      </CalculationGroup>
      {canWrite ? (
        <div className="calculation-add-grid">
          <details className="inline-editor">
            <summary>Aus Leistungskatalog hinzufügen</summary>
            <PositionForm
              canPurchase={canPurchase}
              canSales={canSales}
              onSubmit={(event) => add(event, false)}
              partners={partners}
              services={services}
            />
          </details>
          <details className="inline-editor">
            <summary>Individuelle Position anlegen</summary>
            <PositionForm
              canPurchase={canPurchase}
              canSales={canSales}
              custom
              onSubmit={(event) => add(event, true)}
              partners={partners}
              services={services}
            />
          </details>
        </div>
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
    <dl className="calculation-summary">
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
            <dt>Verkaufswert Leistungen</dt>
            <dd>{formatMinorAmount(totals.serviceSalesValueMinor, 'EUR') ?? '—'}</dd>
          </div>
          <div>
            <dt>Kalkulierte Marge Leistungen</dt>
            <dd>{formatMinorAmount(totals.serviceMarginMinor, 'EUR') ?? '—'}</dd>
          </div>
        </>
      ) : null}
    </dl>
  );
}
function CalculationGroup({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="calculation-group">
      <h3>{title}</h3>
      {has ? children : <p className="muted">{empty}</p>}
    </section>
  );
}
function PositionRow({
  position,
  services,
  partners,
  canWrite,
  canPurchase,
  canSales,
  editing,
  onEdit,
  onCancelEdit,
  onSubmit,
  onArchive,
  pending,
  catalogPricePreview,
  onPreviewCatalogPrices,
  onApplyCatalogPrices,
  onCancelCatalogPricePreview,
}: {
  position: Position;
  services: Service[];
  partners: Partner[];
  canWrite: boolean;
  canPurchase: boolean;
  canSales: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onArchive: (position: Position) => Promise<void>;
  pending: boolean;
  catalogPricePreview?: CatalogPricePreview;
  onPreviewCatalogPrices?: () => void;
  onApplyCatalogPrices?: () => void;
  onCancelCatalogPricePreview?: () => void;
}) {
  if (editing) {
    const service = services.find((candidate) => candidate.id === position.sourceServiceId);
    const providerOptions =
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
      !providerOptions.some((provider) => provider.id === position.providerBusinessPartnerId)
    ) {
      providerOptions.unshift({
        id: position.providerBusinessPartnerId,
        label: `${position.providerName ?? 'Bisheriger Dienstleister'} (historisch)`,
      });
    }
    return (
      <article className="calculation-row calculation-row--editing">
        <form className="form-grid form-stack" onSubmit={onSubmit}>
          {position.source === 'CUSTOM' ? (
            <>
              <label>
                Bezeichnung
                <input defaultValue={position.name} name="name" required />
              </label>
              <label>
                Kategorie
                <input defaultValue={position.categoryName} name="categoryName" required />
              </label>
              <label>
                Einheit
                <select defaultValue={position.unit} name="unit">
                  {serviceUnitOptions.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <p className="form-span compact-note">
              Snapshot aus {position.source === 'EVENT_FORMAT' ? 'Format' : 'Leistungskatalog'} ·{' '}
              Stammdaten bleiben unverändert.
            </p>
          )}
          <label>
            Menge
            <input defaultValue={position.quantity} inputMode="decimal" name="quantity" required />
          </label>
          <label>
            Reihenfolge
            <input
              defaultValue={position.sortOrder}
              min={1}
              name="sortOrder"
              required
              type="number"
            />
          </label>
          <label>
            Dienstleister
            <select defaultValue={position.providerBusinessPartnerId ?? ''} name="providerId">
              <option value="">Kein Dienstleister</option>
              {providerOptions.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>
          {canPurchase ? (
            <label>
              Einkaufs-Einzelpreis
              <div className="money-input">
                <input
                  defaultValue={minorAmountToInput(position.purchaseUnitPriceMinor, 'EUR')}
                  inputMode="decimal"
                  name="purchasePrice"
                />
                <span>€</span>
              </div>
            </label>
          ) : null}
          {canSales ? (
            <label>
              Verkaufs-Einzelpreis
              <div className="money-input">
                <input
                  defaultValue={minorAmountToInput(position.salesUnitPriceMinor, 'EUR')}
                  inputMode="decimal"
                  name="salesPrice"
                />
                <span>€</span>
              </div>
            </label>
          ) : null}
          <label>
            Kostenstatus
            <select defaultValue={position.costStatus} name="costStatus">
              <option value="PLANNED">Geplant</option>
              <option value="COMMITTED">Verbindlich</option>
            </select>
          </label>
          <label className="form-span">
            Notiz <span className="optional">optional</span>
            <input defaultValue={position.note ?? ''} name="note" />
          </label>
          <div className="button-row form-span">
            <button className="button button--small">Speichern</button>
            <button className="button button--quiet" onClick={onCancelEdit} type="button">
              Abbrechen
            </button>
          </div>
        </form>
      </article>
    );
  }
  const canRefreshPurchase =
    position.source !== 'CUSTOM' && canPurchase && position.purchaseUnitPriceMinor === null;
  const canRefreshSales =
    position.source !== 'CUSTOM' && canSales && position.salesUnitPriceMinor === null;
  const showCatalogPriceAction = canWrite && (canRefreshPurchase || canRefreshSales);
  const previewCanApply = Boolean(
    catalogPricePreview?.purchaseWillBeApplied || catalogPricePreview?.salesWillBeApplied,
  );
  return (
    <article className="calculation-row">
      <div>
        <strong>
          {position.sortOrder}. {position.name}
        </strong>
        <small>
          {position.categoryName} · {position.quantity} {unitLabel(position.unit)} ·{' '}
          {position.costStatus === 'COMMITTED' ? 'Verbindlich' : 'Geplant'}
        </small>
        <small>
          {position.providerName ?? 'Kein Dienstleister'} ·{' '}
          {position.source === 'EVENT_FORMAT'
            ? 'Format-Snapshot'
            : position.source === 'SERVICE_CATALOG'
              ? 'Katalog'
              : 'Individuell'}
        </small>
      </div>
      <div className="calculation-row__values">
        {canPurchase ? (
          <span>
            Einkauf {formatMinorAmount(position.purchaseTotalMinor, 'EUR') ?? 'nicht hinterlegt'}
          </span>
        ) : null}
        {canSales ? (
          <span>
            Verkauf {formatMinorAmount(position.salesTotalMinor, 'EUR') ?? 'nicht hinterlegt'}
          </span>
        ) : null}
        {canWrite ? (
          <div className="button-row">
            {showCatalogPriceAction ? (
              <button
                className="button button--quiet"
                disabled={pending}
                onClick={onPreviewCatalogPrices}
                type="button"
              >
                Preise aus Katalog übernehmen
              </button>
            ) : null}
            <button className="button button--quiet" onClick={onEdit} type="button">
              Bearbeiten
            </button>
            <button
              className="button button--quiet"
              onClick={() => void onArchive(position)}
              type="button"
            >
              Entfernen
            </button>
          </div>
        ) : null}
        {catalogPricePreview ? (
          <div
            aria-label="Vorschau der Katalogpreis-Übernahme"
            className="compact-note"
            role="dialog"
          >
            <strong>Diese fehlenden Werte werden eingesetzt:</strong>
            <ul>
              {canRefreshPurchase ? (
                <li>
                  Einkauf:{' '}
                  {catalogPricePreview.purchaseWillBeApplied
                    ? formatMinorAmount(catalogPricePreview.purchaseUnitPriceMinor, 'EUR')
                    : 'kein aktueller Katalogpreis'}
                </li>
              ) : null}
              {canRefreshSales ? (
                <li>
                  Verkauf:{' '}
                  {catalogPricePreview.salesWillBeApplied
                    ? formatMinorAmount(catalogPricePreview.salesUnitPriceMinor, 'EUR')
                    : 'kein aktueller Katalogpreis'}
                </li>
              ) : null}
              {catalogPricePreview.providerWillBeApplied ? (
                <li>Dienstleister: {catalogPricePreview.providerName}</li>
              ) : null}
            </ul>
            <small>Bereits hinterlegte Preise bleiben unverändert.</small>
            <div className="button-row">
              <button
                className="button button--small"
                disabled={pending || !previewCanApply}
                onClick={onApplyCatalogPrices}
                type="button"
              >
                Übernahme bestätigen
              </button>
              <button
                className="button button--quiet"
                disabled={pending}
                onClick={onCancelCatalogPricePreview}
                type="button"
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
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
