'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import {
  formatMinorAmount,
  majorAmountToMinor,
  minorAmountToInput,
} from '../../../src/booking-utils';
import { serviceUnitOptions, unitLabel } from '../../../src/services/service-unit-labels';
import { FormMessage } from '../form-message';
import { ActionMenu } from '../ui/action-menu';
import { Dialog } from '../ui/dialog';

type Category = components['schemas']['ServiceCategoryDto'];
type Service = components['schemas']['ServiceDto'];
type Provider = components['schemas']['ServiceProviderPriceDto'];
type Partner = components['schemas']['BusinessPartnerDto'];

function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

export function ServiceForm({
  organizationId,
  categories,
  service,
}: {
  organizationId: string;
  categories: Category[];
  service?: Service;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const amount = String(form.get('salesPrice') ?? '');
      const body = {
        categoryId: String(form.get('categoryId')),
        name: String(form.get('name') ?? '').trim(),
        unit: String(form.get('unit')) as Service['unit'],
        defaultSalesPriceMinor: majorAmountToMinor(amount, 'EUR'),
        internalNote: String(form.get('internalNote') ?? '').trim() || null,
      };
      const client = createBrowserApiClient();
      const result = service
        ? await client.PATCH('/api/v1/organizations/{organizationId}/services/{serviceId}', {
            credentials: 'include',
            params: { path: { organizationId, serviceId: service.id } },
            body: { ...body, version: service.version },
          })
        : await client.POST('/api/v1/organizations/{organizationId}/services', {
            credentials: 'include',
            params: { path: { organizationId } },
            body,
          });
      if (!result.data || result.error) {
        setMessage(apiErrorMessage(result.error, 'Die Leistung konnte nicht gespeichert werden.'));
        setPending(false);
        return;
      }
      if (!service) {
        router.push(`/o/${organizationId}/services/${result.data.id}`);
        return;
      }
      setMessage('Die Leistung wurde gespeichert.');
      setPending(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Der Betrag ist ungültig.');
      setPending(false);
    }
  }

  return (
    <form className="form-grid form-stack" onSubmit={submit}>
      <label>
        Bezeichnung
        <input defaultValue={service?.name ?? ''} maxLength={200} name="name" required />
      </label>
      <label>
        Kategorie
        <select defaultValue={service?.categoryId ?? ''} name="categoryId" required>
          <option disabled value="">
            Kategorie wählen
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Abrechnungseinheit
        <select defaultValue={service?.unit ?? 'PIECE'} name="unit">
          {serviceUnitOptions.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Standard-Verkaufspreis <span className="optional">optional · netto</span>
        <div className="money-input">
          <input
            defaultValue={minorAmountToInput(service?.defaultSalesPriceMinor, 'EUR')}
            inputMode="decimal"
            name="salesPrice"
            placeholder="200,00"
          />
          <span>€</span>
        </div>
      </label>
      <label className="form-span">
        Interne Notiz <span className="optional">optional</span>
        <textarea
          defaultValue={service?.internalNote ?? ''}
          maxLength={5000}
          name="internalNote"
          rows={3}
        />
      </label>
      <div className="form-span">
        <FormMessage message={message} success={message?.includes('gespeichert')} />
        <div className="button-row form-actions">
          <button className="button" disabled={!hydrated || pending} type="submit">
            {pending ? 'Speichern …' : service ? 'Änderungen speichern' : 'Leistung anlegen'}
          </button>
          <a
            className="button button--secondary"
            href={
              service
                ? `/o/${organizationId}/services/${service.id}`
                : `/o/${organizationId}/services`
            }
          >
            Abbrechen
          </a>
        </div>
      </div>
    </form>
  );
}

export function CategoryManager({
  organizationId,
  initialCategories,
  canWrite,
  canArchive,
}: {
  organizationId: string;
  initialCategories: Category[];
  canWrite: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [categories, setCategories] = useState(initialCategories);
  const [editing, setEditing] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    const result = await createBrowserApiClient().POST(
      '/api/v1/organizations/{organizationId}/service-categories',
      {
        credentials: 'include',
        params: { path: { organizationId } },
        body: { name: String(form.get('name') ?? '').trim() },
      },
    );
    if (!result.data || result.error)
      setMessage(apiErrorMessage(result.error, 'Die Kategorie konnte nicht angelegt werden.'));
    else {
      setCategories((items) =>
        [...items, result.data!].sort((a, b) => a.name.localeCompare(b.name)),
      );
      formElement.reset();
      setMessage('Kategorie angelegt.');
    }
    setPending(false);
  }

  async function update(category: Category, form: FormData) {
    setPending(true);
    const result = await createBrowserApiClient().PATCH(
      '/api/v1/organizations/{organizationId}/service-categories/{categoryId}',
      {
        credentials: 'include',
        params: { path: { organizationId, categoryId: category.id } },
        body: { version: category.version, name: String(form.get('name') ?? '').trim() },
      },
    );
    if (!result.data || result.error)
      setMessage(apiErrorMessage(result.error, 'Die Kategorie konnte nicht gespeichert werden.'));
    else {
      setCategories((items) =>
        items.map((item) => (item.id === category.id ? result.data! : item)),
      );
      setEditing(undefined);
      setMessage('Kategorie gespeichert.');
    }
    setPending(false);
  }

  async function status(category: Category) {
    setPending(true);
    const result = await createBrowserApiClient().PATCH(
      '/api/v1/organizations/{organizationId}/service-categories/{categoryId}/status',
      {
        credentials: 'include',
        params: { path: { organizationId, categoryId: category.id } },
        body: {
          version: category.version,
          status: category.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
        },
      },
    );
    if (!result.data || result.error)
      setMessage(apiErrorMessage(result.error, 'Der Status konnte nicht geändert werden.'));
    else {
      setCategories((items) =>
        items.map((item) => (item.id === category.id ? result.data! : item)),
      );
      setMessage(category.status === 'ACTIVE' ? 'Kategorie archiviert.' : 'Kategorie reaktiviert.');
      router.refresh();
    }
    setPending(false);
  }

  return (
    <div className="service-manager">
      {canWrite ? (
        <form className="compact-create-form" onSubmit={create}>
          <label>
            Neue Kategorie
            <input maxLength={160} name="name" required />
          </label>
          <button className="button" disabled={!hydrated || pending}>
            Anlegen
          </button>
        </form>
      ) : null}
      <FormMessage
        message={message}
        success={
          message?.includes('gespeichert') ||
          message?.includes('angelegt') ||
          message?.includes('archiviert') ||
          message?.includes('reaktiviert')
        }
      />
      <div className="table-wrap">
        <table className="master-data-table">
          <thead>
            <tr>
              <th>Kategorie</th>
              <th>Status</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td data-label="Kategorie">
                  {editing === category.id ? (
                    <form
                      id={`category-${category.id}`}
                      action={(form) => void update(category, form)}
                    >
                      <input defaultValue={category.name} name="name" required />
                    </form>
                  ) : (
                    category.name
                  )}
                </td>
                <td data-label="Status">
                  <span className={`status-badge status-badge--${category.status.toLowerCase()}`}>
                    {category.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
                  </span>
                </td>
                <td data-label="Aktionen">
                  <div className="button-row">
                    {canWrite ? (
                      editing === category.id ? (
                        <>
                          <button
                            className="button button--small"
                            disabled={pending}
                            form={`category-${category.id}`}
                          >
                            Speichern
                          </button>
                          <button
                            className="button button--quiet"
                            onClick={() => setEditing(undefined)}
                            type="button"
                          >
                            Abbrechen
                          </button>
                        </>
                      ) : (
                        <button
                          className="button button--quiet"
                          onClick={() => setEditing(category.id)}
                          type="button"
                        >
                          Bearbeiten
                        </button>
                      )
                    ) : null}
                    {canArchive ? (
                      <button
                        className="button button--quiet"
                        disabled={pending}
                        onClick={() => void status(category)}
                        type="button"
                      >
                        {category.status === 'ACTIVE' ? 'Archivieren' : 'Reaktivieren'}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ServiceDetailManager({
  organizationId,
  service,
  categories,
  partners,
  canWrite,
  canArchive,
  canPurchase,
}: {
  organizationId: string;
  service: Service;
  categories: Category[];
  partners: Partner[];
  canWrite: boolean;
  canArchive: boolean;
  canPurchase: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [addingProvider, setAddingProvider] = useState(false);
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function setServiceStatus() {
    if (service.status === 'ACTIVE' && !window.confirm('Diese Leistung wirklich archivieren?'))
      return;
    setPending(true);
    const result = await createBrowserApiClient().PATCH(
      '/api/v1/organizations/{organizationId}/services/{serviceId}/status',
      {
        credentials: 'include',
        params: { path: { organizationId, serviceId: service.id } },
        body: {
          version: service.version,
          status: service.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
        },
      },
    );
    if (!result.data || result.error)
      setMessage(apiErrorMessage(result.error, 'Der Status konnte nicht geändert werden.'));
    else {
      setMessage(service.status === 'ACTIVE' ? 'Leistung archiviert.' : 'Leistung reaktiviert.');
      router.refresh();
    }
    setPending(false);
  }

  return (
    <>
      <header className="page-heading page-heading--detail">
        <div>
          <p className="eyebrow">Leistung</p>
          <h1>{service.name}</h1>
          <p className="page-heading__summary">
            {service.categoryName} · {unitLabel(service.unit)}
          </p>
        </div>
        <div className="detail-heading-actions">
          <span className={`status-badge status-badge--${service.status.toLowerCase()}`}>
            {service.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
          </span>
          {canWrite && service.status === 'ACTIVE' && !editing ? (
            <button className="button" onClick={() => setEditing(true)} type="button">
              Bearbeiten
            </button>
          ) : null}
          {canArchive ? (
            <ActionMenu
              items={[
                {
                  id: 'status',
                  label: service.status === 'ACTIVE' ? 'Archivieren' : 'Reaktivieren',
                  danger: service.status === 'ACTIVE',
                  disabled: pending,
                  onSelect: () => void setServiceStatus(),
                },
              ]}
              label={`Weitere Aktionen für ${service.name}`}
            />
          ) : null}
        </div>
      </header>
      <section className="panel detail-panel">
        <header className="panel__heading panel__heading--compact">
          <div>
            <h2>{editing ? 'Leistung bearbeiten' : 'Leistungsdaten'}</h2>
          </div>
        </header>
        <FormMessage
          message={message}
          success={message?.includes('archiviert') || message?.includes('reaktiviert')}
        />
        {editing ? (
          <div>
            <ServiceForm
              categories={categories}
              organizationId={organizationId}
              service={service}
            />
            <button
              className="button button--quiet"
              onClick={() => setEditing(false)}
              type="button"
            >
              Bearbeitung schließen
            </button>
          </div>
        ) : (
          <div>
            <dl className="detail-fields">
              <div>
                <dt>Status</dt>
                <dd>{service.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}</dd>
              </div>
              <div>
                <dt>Standard-Verkaufspreis</dt>
                <dd>
                  {service.defaultSalesPriceMinor === undefined
                    ? 'Nicht freigegeben'
                    : (formatMinorAmount(service.defaultSalesPriceMinor, 'EUR') ??
                      'Nicht hinterlegt')}
                </dd>
              </div>
              <div>
                <dt>Einheit</dt>
                <dd>{unitLabel(service.unit)}</dd>
              </div>
              {service.internalNote ? (
                <div className="detail-field--wide">
                  <dt>Interne Notiz</dt>
                  <dd>{service.internalNote}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        )}
      </section>
      <section className="panel">
        <header className="section-heading">
          <div>
            <p className="eyebrow">Einkauf</p>
            <h2>Dienstleisterpreise</h2>
          </div>
          {canWrite && canPurchase && service.status === 'ACTIVE' ? (
            <button
              className="button button--secondary"
              onClick={() => setAddingProvider(true)}
              type="button"
            >
              Dienstleisterpreis hinzufügen
            </button>
          ) : null}
        </header>
        {canWrite && canPurchase && service.status === 'ACTIVE' ? (
          <Dialog
            eyebrow="Leistung"
            onClose={() => setAddingProvider(false)}
            open={addingProvider}
            title="Dienstleisterpreis hinzufügen"
          >
            <ProviderForm
              onComplete={() => setAddingProvider(false)}
              organizationId={organizationId}
              partners={partners}
              serviceId={service.id}
            />
          </Dialog>
        ) : null}
        <ProviderTable
          canArchive={canArchive && canPurchase}
          canPurchase={canPurchase}
          organizationId={organizationId}
          providers={service.providerPrices ?? []}
        />
      </section>
    </>
  );
}

function ProviderForm({
  organizationId,
  serviceId,
  partners,
  onComplete,
}: {
  organizationId: string;
  serviceId: string;
  partners: Partner[];
  onComplete: () => void;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const result = await createBrowserApiClient().POST(
        '/api/v1/organizations/{organizationId}/services/{serviceId}/provider-prices',
        {
          credentials: 'include',
          params: { path: { organizationId, serviceId } },
          body: {
            businessPartnerId: String(form.get('partnerId')),
            purchasePriceMinor: majorAmountToMinor(String(form.get('purchasePrice') ?? ''), 'EUR'),
            preferred: form.get('preferred') === 'on',
            internalNote: String(form.get('note') ?? '').trim() || null,
          },
        },
      );
      if (!result.data || result.error)
        setMessage(
          apiErrorMessage(result.error, 'Der Dienstleister konnte nicht hinzugefügt werden.'),
        );
      else {
        setMessage('Dienstleister hinzugefügt.');
        formElement.reset();
        onComplete();
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Der Betrag ist ungültig.');
    }
    setPending(false);
  }
  return (
    <form className="compact-provider-form" onSubmit={submit}>
      <label>
        Dienstleister
        <select name="partnerId" required>
          <option value="">Auswählen</option>
          {partners.map((partner) => (
            <option key={partner.id} value={partner.id}>
              {partner.companyName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Einkaufspreis
        <input inputMode="decimal" name="purchasePrice" placeholder="350,00" />
      </label>
      <label className="checkbox-row">
        <input name="preferred" type="checkbox" />
        Bevorzugt
      </label>
      <label>
        Notiz
        <input name="note" />
      </label>
      <button className="button" disabled={!hydrated || pending}>
        Hinzufügen
      </button>
      <FormMessage message={message} success={message?.includes('hinzugefügt')} />
    </form>
  );
}

function ProviderTable({
  organizationId,
  providers,
  canArchive,
  canPurchase,
}: {
  organizationId: string;
  providers: Provider[];
  canArchive: boolean;
  canPurchase: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  async function status(provider: Provider) {
    const result = await createBrowserApiClient().PATCH(
      '/api/v1/organizations/{organizationId}/service-provider-prices/{providerPriceId}/status',
      {
        credentials: 'include',
        params: { path: { organizationId, providerPriceId: provider.id } },
        body: {
          version: provider.version,
          status: provider.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
        },
      },
    );
    if (!result.data || result.error)
      setMessage(apiErrorMessage(result.error, 'Der Status konnte nicht geändert werden.'));
    else router.refresh();
  }
  if (!canPurchase)
    return <p className="muted">Einkaufspreise sind für Ihre Rolle nicht freigegeben.</p>;
  if (providers.length === 0)
    return <p className="empty-state">Noch keine Dienstleisterpreise hinterlegt.</p>;
  return (
    <>
      <FormMessage message={message} />
      <div className="table-wrap">
        <table className="master-data-table">
          <thead>
            <tr>
              <th>Dienstleister</th>
              <th>Einkauf</th>
              <th>Bevorzugt</th>
              <th>Status</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.id}>
                <td>{provider.businessPartnerName}</td>
                <td>
                  {formatMinorAmount(provider.purchasePriceMinor, 'EUR') ?? 'Nicht hinterlegt'}
                </td>
                <td>{provider.preferred ? 'Ja' : 'Nein'}</td>
                <td>{provider.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}</td>
                <td>
                  {canArchive ? (
                    <ActionMenu
                      compact
                      items={[
                        {
                          id: 'status',
                          label: provider.status === 'ACTIVE' ? 'Archivieren' : 'Reaktivieren',
                          danger: provider.status === 'ACTIVE',
                          onSelect: () => void status(provider),
                        },
                      ]}
                      label={`Aktionen für Dienstleisterpreis ${provider.businessPartnerName}`}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
