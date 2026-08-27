'use client';

import type { components } from '@venue/api-client';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import { majorAmountToMinor, minorAmountToInput } from '../../../src/booking-utils';
import { FormMessage } from '../form-message';
import { ActionMenu } from '../ui/action-menu';
import { Dialog } from '../ui/dialog';

type TaxRate = components['schemas']['TaxRateTemplateDto'];
type Provider = components['schemas']['TicketProviderTemplateDto'];
type Calculation = components['schemas']['CalculationTemplateDto'];
type Artist = components['schemas']['ArtistDto'];
type Partner = components['schemas']['BusinessPartnerDto'];
type TemplateStatus = 'ACTIVE' | 'ARCHIVED';

type AllocationDraft = {
  key: string;
  recipientType: 'ORGANIZATION' | 'ARTIST' | 'BUSINESS_PARTNER' | 'EXTERNAL';
  recipientId: string;
  externalName: string;
  allocationType: 'PERCENTAGE' | 'FIXED';
  value: string;
};

type ComponentDraft = {
  key: string;
  name: string;
  amountType: 'FIXED' | 'PERCENTAGE';
  value: string;
  inputType: 'NET' | 'GROSS';
  taxRateTemplateId: string;
  guestPays: boolean;
  allocations: AllocationDraft[];
};

type ProviderDraft = {
  name: string;
  description: string;
  components: ComponentDraft[];
};

type TierDraft = {
  key: string;
  name: string;
  expectedQuantity: string;
  baseInputType: 'NET' | 'GROSS';
  baseAmount: string;
  baseTaxRateTemplateId: string;
  sourceTicketProviderTemplateId: string;
  components: ComponentDraft[];
};

type AdditionalDraft = {
  key: string;
  name: string;
  calculationType: 'FIXED' | 'PER_EXPECTED_GUEST' | 'PER_PAYING_TICKET' | 'PERCENT_TICKET_BASE_NET';
  inputType: 'NET' | 'GROSS';
  value: string;
  taxRateTemplateId: string;
  confirmationStatus: 'PLANNED' | 'CONFIRMED';
  note: string;
};

type CalculationDraft = {
  name: string;
  description: string;
  expectedGuestCount: string;
  tiers: TierDraft[];
  additionalRevenues: AdditionalDraft[];
};

type RawAllocation = {
  recipientType: AllocationDraft['recipientType'];
  artistId?: string | null;
  businessPartnerId?: string | null;
  externalRecipientName?: string | null;
  allocationType: AllocationDraft['allocationType'];
  percentageBasisPoints?: number | null;
  fixedAmountMinor?: string | null;
};

type RawComponent = {
  name: string;
  amountType: ComponentDraft['amountType'];
  percentageRateBasisPoints?: number | null;
  inputType: ComponentDraft['inputType'];
  inputAmountMinor?: string | null;
  taxRateTemplateId: string;
  guestPays: boolean;
  allocations?: RawAllocation[];
};

type RawTier = {
  name: string;
  expectedQuantity: number;
  baseInputType?: TierDraft['baseInputType'] | null;
  baseInputMinor?: string | null;
  baseTaxRateTemplateId?: string | null;
  sourceTicketProviderTemplateId?: string | null;
  components?: RawComponent[];
};

type RawAdditional = {
  name: string;
  calculationType: AdditionalDraft['calculationType'];
  inputType: AdditionalDraft['inputType'];
  inputAmountMinor?: string | null;
  percentageRateBasisPoints?: number | null;
  taxRateTemplateId: string;
  confirmationStatus: AdditionalDraft['confirmationStatus'];
  note?: string | null;
};

const key = () => crypto.randomUUID();
const percentToBasisPoints = (value: string) => Math.round(Number(value.replace(',', '.')) * 100);
const basisPointsToPercent = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : String(value / 100).replace('.', ',');

function emptyAllocation(): AllocationDraft {
  return {
    key: key(),
    recipientType: 'ORGANIZATION',
    recipientId: '',
    externalName: '',
    allocationType: 'PERCENTAGE',
    value: '100',
  };
}

function emptyComponent(taxRateTemplateId = ''): ComponentDraft {
  return {
    key: key(),
    name: '',
    amountType: 'FIXED',
    value: '',
    inputType: 'GROSS',
    taxRateTemplateId,
    guestPays: true,
    allocations: [emptyAllocation()],
  };
}

function rawComponent(value: RawComponent): ComponentDraft {
  return {
    key: key(),
    name: value.name,
    amountType: value.amountType,
    value:
      value.amountType === 'PERCENTAGE'
        ? basisPointsToPercent(value.percentageRateBasisPoints)
        : minorAmountToInput(value.inputAmountMinor, 'EUR'),
    inputType: value.inputType,
    taxRateTemplateId: value.taxRateTemplateId,
    guestPays: value.guestPays,
    allocations: (value.allocations ?? []).map((allocation) => ({
      key: key(),
      recipientType: allocation.recipientType,
      recipientId: allocation.artistId ?? allocation.businessPartnerId ?? '',
      externalName: allocation.externalRecipientName ?? '',
      allocationType: allocation.allocationType,
      value:
        allocation.allocationType === 'PERCENTAGE'
          ? basisPointsToPercent(allocation.percentageBasisPoints)
          : minorAmountToInput(allocation.fixedAmountMinor, 'EUR'),
    })),
  };
}

function componentBody(component: ComponentDraft) {
  return {
    name: component.name.trim(),
    amountType: component.amountType,
    percentageRateBasisPoints:
      component.amountType === 'PERCENTAGE' ? percentToBasisPoints(component.value) : null,
    inputType: component.inputType,
    inputAmountMinor:
      component.amountType === 'FIXED' ? majorAmountToMinor(component.value, 'EUR') : null,
    taxRateTemplateId: component.taxRateTemplateId,
    guestPays: component.guestPays,
    allocations: component.allocations.map((allocation) => ({
      recipientType: allocation.recipientType,
      artistId: allocation.recipientType === 'ARTIST' ? allocation.recipientId : null,
      businessPartnerId:
        allocation.recipientType === 'BUSINESS_PARTNER' ? allocation.recipientId : null,
      externalRecipientName:
        allocation.recipientType === 'EXTERNAL' ? allocation.externalName.trim() : null,
      allocationType: allocation.allocationType,
      percentageBasisPoints:
        allocation.allocationType === 'PERCENTAGE' ? percentToBasisPoints(allocation.value) : null,
      fixedAmountMinor:
        allocation.allocationType === 'FIXED' ? majorAmountToMinor(allocation.value, 'EUR') : null,
    })),
  };
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function RevenueTemplateManager({
  organizationId,
  taxRates: initialTaxRates,
  providerTemplates: initialProviders,
  calculationTemplates: initialCalculations,
  artists,
  partners,
  canWrite,
  canArchive,
}: {
  organizationId: string;
  taxRates: TaxRate[];
  providerTemplates: Provider[];
  calculationTemplates: Calculation[];
  artists: Artist[];
  partners: Partner[];
  canWrite: boolean;
  canArchive: boolean;
}) {
  const [taxRates, setTaxRates] = useState(initialTaxRates);
  const [providers, setProviders] = useState(initialProviders);
  const [calculations, setCalculations] = useState(initialCalculations);
  const [editingTax, setEditingTax] = useState<TaxRate>();
  const [providerDialog, setProviderDialog] = useState<Provider>();
  const [providerOpen, setProviderOpen] = useState(false);
  const [calculationDialog, setCalculationDialog] = useState<Calculation>();
  const [calculationOpen, setCalculationOpen] = useState(false);
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const activeTaxes = useMemo(() => taxRates.filter((tax) => tax.status === 'ACTIVE'), [taxRates]);
  const activeProviders = useMemo(
    () => providers.filter((provider) => provider.status === 'ACTIVE'),
    [providers],
  );

  async function saveTax(event: FormEvent<HTMLFormElement>, existing?: TaxRate) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setMessage(undefined);
    const body = {
      name: String(form.get('name') ?? '').trim(),
      rateBasisPoints: percentToBasisPoints(String(form.get('rate') ?? '')),
    };
    const client = createBrowserApiClient();
    const result = existing
      ? await client.PATCH(
          '/api/v1/organizations/{organizationId}/revenue-templates/tax-rates/{templateId}',
          {
            credentials: 'include',
            params: { path: { organizationId, templateId: existing.id } },
            body: { ...body, version: existing.version },
          },
        )
      : await client.POST('/api/v1/organizations/{organizationId}/revenue-templates/tax-rates', {
          credentials: 'include',
          params: { path: { organizationId } },
          body,
        });
    if (!result.data || result.error) {
      setMessage(apiErrorMessage(result.error, 'Der Steuersatz konnte nicht gespeichert werden.'));
    } else {
      setTaxRates((items) =>
        existing
          ? items.map((item) => (item.id === existing.id ? result.data! : item))
          : [...items, result.data!],
      );
      setEditingTax(undefined);
      if (!existing) formElement.reset();
      setMessage(
        'Steuersatz gespeichert. Bereits übernommene Momentaufnahmen bleiben unverändert.',
      );
    }
    setPending(false);
  }

  async function setStatus(
    type: 'tax-rates' | 'ticket-providers' | 'calculations',
    template: TaxRate | Provider | Calculation,
  ) {
    const status: TemplateStatus = template.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
    setPending(true);
    const path =
      type === 'tax-rates'
        ? '/api/v1/organizations/{organizationId}/revenue-templates/tax-rates/{templateId}/status'
        : type === 'ticket-providers'
          ? '/api/v1/organizations/{organizationId}/revenue-templates/ticket-providers/{templateId}/status'
          : '/api/v1/organizations/{organizationId}/revenue-templates/calculations/{templateId}/status';
    const result = await createBrowserApiClient().PATCH(path, {
      credentials: 'include',
      params: { path: { organizationId, templateId: template.id } },
      body: { version: template.version, status },
    });
    if (!result.data || result.error) {
      setMessage(apiErrorMessage(result.error, 'Der Vorlagenstatus konnte nicht geändert werden.'));
    } else if (type === 'tax-rates') {
      const updated = result.data as unknown as TaxRate;
      setTaxRates((items) => items.map((item) => (item.id === template.id ? updated : item)));
      setMessage(status === 'ACTIVE' ? 'Steuersatz reaktiviert.' : 'Steuersatz archiviert.');
    } else if (type === 'ticket-providers') {
      const updated = result.data as unknown as Provider;
      setProviders((items) => items.map((item) => (item.id === template.id ? updated : item)));
      setMessage(
        status === 'ACTIVE' ? 'Ticketanbieter reaktiviert.' : 'Ticketanbieter archiviert.',
      );
    } else {
      const updated = result.data as unknown as Calculation;
      setCalculations((items) => items.map((item) => (item.id === template.id ? updated : item)));
      setMessage(
        status === 'ACTIVE'
          ? 'Kalkulationsvorlage reaktiviert.'
          : 'Kalkulationsvorlage archiviert.',
      );
    }
    setPending(false);
  }

  async function duplicate(type: 'provider' | 'calculation', template: Provider | Calculation) {
    setPending(true);
    const result =
      type === 'provider'
        ? await createBrowserApiClient().POST(
            '/api/v1/organizations/{organizationId}/revenue-templates/ticket-providers/{templateId}/duplicate',
            {
              credentials: 'include',
              params: { path: { organizationId, templateId: template.id } },
              body: {},
            },
          )
        : await createBrowserApiClient().POST(
            '/api/v1/organizations/{organizationId}/revenue-templates/calculations/{templateId}/duplicate',
            {
              credentials: 'include',
              params: { path: { organizationId, templateId: template.id } },
              body: {},
            },
          );
    if (!result.data || result.error) {
      setMessage(apiErrorMessage(result.error, 'Die Vorlage konnte nicht dupliziert werden.'));
    } else if (type === 'provider') {
      setProviders((items) => [...items, result.data as unknown as Provider]);
      setMessage('Ticketanbieter-Vorlage dupliziert.');
    } else {
      setCalculations((items) => [...items, result.data as unknown as Calculation]);
      setMessage('Kalkulationsvorlage dupliziert.');
    }
    setPending(false);
  }

  return (
    <div className="revenue-template-page">
      <FormMessage message={message} success={Boolean(message && !message.includes('nicht'))} />

      <section className="panel revenue-template-section" aria-labelledby="tax-title">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Steuer</p>
            <h2 id="tax-title">Steuersatz-Vorlagen</h2>
            <p>Die Auswahl wird beim Übernehmen als unveränderliche Momentaufnahme gespeichert.</p>
          </div>
        </div>
        {canWrite ? (
          <form className="compact-create-form" onSubmit={(event) => void saveTax(event)}>
            <label>
              Bezeichnung
              <input maxLength={160} name="name" placeholder="z. B. Sondersteuersatz" required />
            </label>
            <label>
              Steuersatz in %
              <input inputMode="decimal" name="rate" placeholder="19" required />
            </label>
            <button className="button" disabled={pending} type="submit">
              Anlegen
            </button>
          </form>
        ) : null}
        <div className="table-wrap" role="region" aria-label="Steuersatz-Vorlagen" tabIndex={0}>
          <table className="master-data-table">
            <thead>
              <tr>
                <th>Bezeichnung</th>
                <th>Satz</th>
                <th>Status</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {taxRates.map((tax) => (
                <tr key={tax.id}>
                  <td data-label="Bezeichnung">
                    {editingTax?.id === tax.id ? (
                      <form id={`tax-${tax.id}`} onSubmit={(event) => void saveTax(event, tax)}>
                        <input
                          aria-label={`Bezeichnung für ${tax.name}`}
                          defaultValue={tax.name}
                          name="name"
                          required
                        />
                        <input
                          aria-label={`Steuersatz für ${tax.name} in Prozent`}
                          defaultValue={basisPointsToPercent(tax.rateBasisPoints)}
                          inputMode="decimal"
                          name="rate"
                          required
                        />
                      </form>
                    ) : (
                      tax.name
                    )}
                  </td>
                  <td data-label="Satz">{basisPointsToPercent(tax.rateBasisPoints)} %</td>
                  <td data-label="Status">
                    <StatusBadge status={tax.status} />
                  </td>
                  <td data-label="Aktionen">
                    <ActionMenu
                      label={`Aktionen für ${tax.name}`}
                      items={[
                        ...(canWrite && tax.status === 'ACTIVE'
                          ? [
                              {
                                id: 'edit',
                                label: 'Bearbeiten',
                                onSelect: () => setEditingTax(tax),
                              },
                            ]
                          : []),
                        ...(editingTax?.id === tax.id
                          ? [
                              {
                                id: 'save',
                                label: 'Speichern',
                                onSelect: () =>
                                  (
                                    document.getElementById(
                                      `tax-${tax.id}`,
                                    ) as HTMLFormElement | null
                                  )?.requestSubmit(),
                              },
                              {
                                id: 'cancel',
                                label: 'Abbrechen',
                                onSelect: () => setEditingTax(undefined),
                              },
                            ]
                          : []),
                        ...(canArchive
                          ? [
                              {
                                id: 'status',
                                label: tax.status === 'ACTIVE' ? 'Archivieren' : 'Reaktivieren',
                                danger: tax.status === 'ACTIVE',
                                disabled: pending,
                                onSelect: () => void setStatus('tax-rates', tax),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <TemplateList
        canArchive={canArchive}
        canWrite={canWrite}
        emptyText="Noch keine Ticketanbieter-Vorlage vorhanden."
        eyebrow="Vertriebswege"
        items={providers}
        onCreate={() => {
          setProviderDialog(undefined);
          setProviderOpen(true);
        }}
        onDuplicate={(item) => void duplicate('provider', item)}
        onEdit={(item) => {
          setProviderDialog(item);
          setProviderOpen(true);
        }}
        onStatus={(item) => void setStatus('ticket-providers', item)}
        renderSummary={(item) =>
          `${item.components.length} Preisstruktur-${item.components.length === 1 ? 'Position' : 'Positionen'}`
        }
        title="Ticketanbieter-Vorlagen"
      />

      <TemplateList
        canArchive={canArchive}
        canWrite={canWrite}
        emptyText="Noch keine Kalkulationsvorlage vorhanden."
        eyebrow="Wiederkehrende Planung"
        items={calculations}
        onCreate={() => {
          setCalculationDialog(undefined);
          setCalculationOpen(true);
        }}
        onDuplicate={(item) => void duplicate('calculation', item)}
        onEdit={(item) => {
          setCalculationDialog(item);
          setCalculationOpen(true);
        }}
        onStatus={(item) => void setStatus('calculations', item)}
        renderSummary={(item) =>
          `${item.tiers.length} Ticketstufen · ${item.additionalRevenues.length} weitere Erlöse${item.expectedGuestCount === null ? '' : ` · ${item.expectedGuestCount} Gäste`}`
        }
        title="Kalkulationsvorlagen"
      />

      <ProviderDialog
        artists={artists}
        existing={providerDialog}
        onClose={() => setProviderOpen(false)}
        onSaved={(saved) => {
          setProviders((items) =>
            providerDialog
              ? items.map((item) => (item.id === saved.id ? saved : item))
              : [...items, saved],
          );
          setProviderOpen(false);
          setMessage('Ticketanbieter-Vorlage gespeichert.');
        }}
        open={providerOpen}
        organizationId={organizationId}
        partners={partners}
        taxRates={activeTaxes}
      />
      <CalculationDialog
        artists={artists}
        existing={calculationDialog}
        onClose={() => setCalculationOpen(false)}
        onSaved={(saved) => {
          setCalculations((items) =>
            calculationDialog
              ? items.map((item) => (item.id === saved.id ? saved : item))
              : [...items, saved],
          );
          setCalculationOpen(false);
          setMessage('Kalkulationsvorlage gespeichert.');
        }}
        open={calculationOpen}
        organizationId={organizationId}
        partners={partners}
        providerTemplates={activeProviders}
        taxRates={activeTaxes}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: TemplateStatus }) {
  return (
    <span className={`status-badge status-badge--${status.toLowerCase()}`}>
      {status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
    </span>
  );
}

function TemplateList<T extends Provider | Calculation>({
  eyebrow,
  title,
  items,
  emptyText,
  canWrite,
  canArchive,
  onCreate,
  onEdit,
  onDuplicate,
  onStatus,
  renderSummary,
}: {
  eyebrow: string;
  title: string;
  items: T[];
  emptyText: string;
  canWrite: boolean;
  canArchive: boolean;
  onCreate: () => void;
  onEdit: (item: T) => void;
  onDuplicate: (item: T) => void;
  onStatus: (item: T) => void;
  renderSummary: (item: T) => string;
}) {
  return (
    <section className="panel revenue-template-section">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {canWrite ? (
          <button className="button" onClick={onCreate} type="button">
            Vorlage anlegen
          </button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="empty-state">{emptyText}</p>
      ) : (
        <div className="template-card-grid">
          {items.map((item) => (
            <article className="template-card" key={item.id}>
              <div className="template-card__heading">
                <div>
                  <h3>{item.name}</h3>
                  <p>{renderSummary(item)}</p>
                </div>
                <StatusBadge status={item.status} />
              </div>
              {item.description ? <p>{item.description}</p> : null}
              <div className="template-card__footer">
                <span>Version {item.version}</span>
                <ActionMenu
                  label={`Aktionen für ${item.name}`}
                  items={[
                    ...(canWrite && item.status === 'ACTIVE'
                      ? [
                          {
                            id: 'edit',
                            label: 'Ansehen und bearbeiten',
                            onSelect: () => onEdit(item),
                          },
                          {
                            id: 'duplicate',
                            label: 'Duplizieren',
                            onSelect: () => onDuplicate(item),
                          },
                        ]
                      : []),
                    ...(canArchive
                      ? [
                          {
                            id: 'status',
                            label: item.status === 'ACTIVE' ? 'Archivieren' : 'Reaktivieren',
                            danger: item.status === 'ACTIVE',
                            onSelect: () => onStatus(item),
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProviderDialog({
  open,
  existing,
  organizationId,
  taxRates,
  artists,
  partners,
  onClose,
  onSaved,
}: {
  open: boolean;
  existing: Provider | undefined;
  organizationId: string;
  taxRates: TaxRate[];
  artists: Artist[];
  partners: Partner[];
  onClose: () => void;
  onSaved: (provider: Provider) => void;
}) {
  const raw = existing?.components as unknown as RawComponent[] | undefined;
  const [draft, setDraft] = useState<ProviderDraft>(() => ({
    name: existing?.name ?? '',
    description: existing?.description ?? '',
    components: raw?.map(rawComponent) ?? [],
  }));
  const [identity, setIdentity] = useState(existing?.id ?? 'new');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  if ((existing?.id ?? 'new') !== identity) {
    setIdentity(existing?.id ?? 'new');
    setDraft({
      name: existing?.name ?? '',
      description: existing?.description ?? '',
      components:
        (existing?.components as unknown as RawComponent[] | undefined)?.map(rawComponent) ?? [],
    });
    setMessage(undefined);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    try {
      const body = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        components: draft.components.map(componentBody),
      };
      const client = createBrowserApiClient();
      const result = existing
        ? await client.PATCH(
            '/api/v1/organizations/{organizationId}/revenue-templates/ticket-providers/{templateId}',
            {
              credentials: 'include',
              params: { path: { organizationId, templateId: existing.id } },
              body: { ...body, version: existing.version },
            },
          )
        : await client.POST(
            '/api/v1/organizations/{organizationId}/revenue-templates/ticket-providers',
            { credentials: 'include', params: { path: { organizationId } }, body },
          );
      if (!result.data || result.error)
        setMessage(
          apiErrorMessage(
            result.error,
            'Die Ticketanbieter-Vorlage konnte nicht gespeichert werden.',
          ),
        );
      else onSaved(result.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bitte prüfen Sie die Beträge.');
    }
    setPending(false);
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="wide"
      title={existing ? `${existing.name} bearbeiten` : 'Ticketanbieter-Vorlage anlegen'}
    >
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <label>
            Name
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
            />
          </label>
          <label className="form-span">
            Beschreibung <span className="optional">optional</span>
            <textarea
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              rows={2}
            />
          </label>
        </div>
        <div className="nested-editor-heading">
          <div>
            <h3>Preisstruktur</h3>
            <p>Die Reihenfolge wird von oben nach unten übernommen.</p>
          </div>
          <button
            className="button button--secondary"
            onClick={() =>
              setDraft({
                ...draft,
                components: [...draft.components, emptyComponent(taxRates[0]?.id)],
              })
            }
            type="button"
          >
            Position hinzufügen
          </button>
        </div>
        <ComponentEditor
          artists={artists}
          components={draft.components}
          onChange={(components) => setDraft({ ...draft, components })}
          partners={partners}
          taxRates={taxRates}
        />
        <FormMessage message={message} />
        <div className="button-row form-actions">
          <button className="button" disabled={pending} type="submit">
            {pending ? 'Speichern …' : 'Vorlage speichern'}
          </button>
          <button className="button button--secondary" onClick={onClose} type="button">
            Abbrechen
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function CalculationDialog({
  open,
  existing,
  organizationId,
  taxRates,
  providerTemplates,
  artists,
  partners,
  onClose,
  onSaved,
}: {
  open: boolean;
  existing: Calculation | undefined;
  organizationId: string;
  taxRates: TaxRate[];
  providerTemplates: Provider[];
  artists: Artist[];
  partners: Partner[];
  onClose: () => void;
  onSaved: (calculation: Calculation) => void;
}) {
  const createDraft = (): CalculationDraft => ({
    name: existing?.name ?? '',
    description: existing?.description ?? '',
    expectedGuestCount:
      existing?.expectedGuestCount === null || existing?.expectedGuestCount === undefined
        ? ''
        : String(existing.expectedGuestCount),
    tiers: ((existing?.tiers as unknown as RawTier[] | undefined) ?? []).map((tier) => ({
      key: key(),
      name: tier.name,
      expectedQuantity: String(tier.expectedQuantity),
      baseInputType: tier.baseInputType ?? 'GROSS',
      baseAmount: minorAmountToInput(tier.baseInputMinor, 'EUR'),
      baseTaxRateTemplateId: tier.baseTaxRateTemplateId ?? taxRates[0]?.id ?? '',
      sourceTicketProviderTemplateId: tier.sourceTicketProviderTemplateId ?? '',
      components: (tier.components ?? []).map(rawComponent),
    })),
    additionalRevenues: (
      (existing?.additionalRevenues as unknown as RawAdditional[] | undefined) ?? []
    ).map((item) => ({
      key: key(),
      name: item.name,
      calculationType: item.calculationType,
      inputType: item.inputType,
      value:
        item.calculationType === 'PERCENT_TICKET_BASE_NET'
          ? basisPointsToPercent(item.percentageRateBasisPoints)
          : minorAmountToInput(item.inputAmountMinor, 'EUR'),
      taxRateTemplateId: item.taxRateTemplateId,
      confirmationStatus: item.confirmationStatus,
      note: item.note ?? '',
    })),
  });
  const [draft, setDraft] = useState<CalculationDraft>(createDraft);
  const [identity, setIdentity] = useState(existing?.id ?? 'new');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  if ((existing?.id ?? 'new') !== identity) {
    setIdentity(existing?.id ?? 'new');
    setDraft(createDraft());
    setMessage(undefined);
  }
  function setTier(index: number, tier: TierDraft) {
    setDraft({
      ...draft,
      tiers: draft.tiers.map((item, itemIndex) => (itemIndex === index ? tier : item)),
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    try {
      const body = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        expectedGuestCount:
          draft.expectedGuestCount === '' ? null : Number(draft.expectedGuestCount),
        tiers: draft.tiers.map((tier) => ({
          name: tier.name.trim(),
          expectedQuantity: Number(tier.expectedQuantity),
          baseInputType: tier.baseInputType,
          baseInputMinor: majorAmountToMinor(tier.baseAmount, 'EUR'),
          baseTaxRateTemplateId: tier.baseTaxRateTemplateId,
          sourceTicketProviderTemplateId: tier.sourceTicketProviderTemplateId || null,
          components: tier.components.map(componentBody),
        })),
        additionalRevenues: draft.additionalRevenues.map((item) => ({
          name: item.name.trim(),
          calculationType: item.calculationType,
          inputType: item.inputType,
          inputAmountMinor:
            item.calculationType === 'PERCENT_TICKET_BASE_NET'
              ? null
              : majorAmountToMinor(item.value, 'EUR'),
          percentageRateBasisPoints:
            item.calculationType === 'PERCENT_TICKET_BASE_NET'
              ? percentToBasisPoints(item.value)
              : null,
          taxRateTemplateId: item.taxRateTemplateId,
          confirmationStatus: item.confirmationStatus,
          note: item.note.trim() || null,
        })),
      };
      const client = createBrowserApiClient();
      const result = existing
        ? await client.PATCH(
            '/api/v1/organizations/{organizationId}/revenue-templates/calculations/{templateId}',
            {
              credentials: 'include',
              params: { path: { organizationId, templateId: existing.id } },
              body: { ...body, version: existing.version },
            },
          )
        : await client.POST(
            '/api/v1/organizations/{organizationId}/revenue-templates/calculations',
            { credentials: 'include', params: { path: { organizationId } }, body },
          );
      if (!result.data || result.error)
        setMessage(
          apiErrorMessage(result.error, 'Die Kalkulationsvorlage konnte nicht gespeichert werden.'),
        );
      else onSaved(result.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bitte prüfen Sie die Beträge.');
    }
    setPending(false);
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="wide"
      title={existing ? `${existing.name} bearbeiten` : 'Kalkulationsvorlage anlegen'}
    >
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <label>
            Name
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
            />
          </label>
          <label>
            Erwartete Gäste <span className="optional">optional</span>
            <input
              min={0}
              type="number"
              value={draft.expectedGuestCount}
              onChange={(event) => setDraft({ ...draft, expectedGuestCount: event.target.value })}
            />
          </label>
          <label className="form-span">
            Beschreibung <span className="optional">optional</span>
            <textarea
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              rows={2}
            />
          </label>
        </div>
        <div className="nested-editor-heading">
          <div>
            <h3>Ticketstufen und Preisstrukturen</h3>
            <p>Die Listenreihenfolge wird automatisch gespeichert.</p>
          </div>
          <button
            className="button button--secondary"
            onClick={() =>
              setDraft({
                ...draft,
                tiers: [
                  ...draft.tiers,
                  {
                    key: key(),
                    name: '',
                    expectedQuantity: '0',
                    baseInputType: 'GROSS',
                    baseAmount: '',
                    baseTaxRateTemplateId: taxRates[0]?.id ?? '',
                    sourceTicketProviderTemplateId: '',
                    components: [],
                  },
                ],
              })
            }
            type="button"
          >
            Ticketstufe hinzufügen
          </button>
        </div>
        {draft.tiers.map((tier, index) => (
          <fieldset className="nested-editor-card" key={tier.key}>
            <legend>Ticketstufe {index + 1}</legend>
            <div className="nested-editor-actions">
              <button
                aria-label={`Ticketstufe ${index + 1} nach oben`}
                className="button button--quiet"
                disabled={index === 0}
                onClick={() => setDraft({ ...draft, tiers: move(draft.tiers, index, -1) })}
                type="button"
              >
                ↑
              </button>
              <button
                aria-label={`Ticketstufe ${index + 1} nach unten`}
                className="button button--quiet"
                disabled={index === draft.tiers.length - 1}
                onClick={() => setDraft({ ...draft, tiers: move(draft.tiers, index, 1) })}
                type="button"
              >
                ↓
              </button>
              <button
                className="button button--quiet"
                onClick={() =>
                  setDraft({
                    ...draft,
                    tiers: draft.tiers.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
                type="button"
              >
                Entfernen
              </button>
            </div>
            <div className="form-grid">
              <label>
                Bezeichnung
                <input
                  aria-label={`Bezeichnung Ticketstufe ${index + 1}`}
                  value={tier.name}
                  onChange={(event) => setTier(index, { ...tier, name: event.target.value })}
                  required
                />
              </label>
              <label>
                Erwartete Menge
                <input
                  min={0}
                  type="number"
                  value={tier.expectedQuantity}
                  onChange={(event) =>
                    setTier(index, { ...tier, expectedQuantity: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Grundpreis €
                <input
                  aria-label={`Grundpreis Ticketstufe ${index + 1} in Euro`}
                  inputMode="decimal"
                  value={tier.baseAmount}
                  onChange={(event) => setTier(index, { ...tier, baseAmount: event.target.value })}
                  required
                />
              </label>
              <label>
                Eingabeart
                <select
                  value={tier.baseInputType}
                  onChange={(event) =>
                    setTier(index, {
                      ...tier,
                      baseInputType: event.target.value as TierDraft['baseInputType'],
                    })
                  }
                >
                  <option value="GROSS">Brutto</option>
                  <option value="NET">Netto</option>
                </select>
              </label>
              <label>
                Steuersatz
                <select
                  value={tier.baseTaxRateTemplateId}
                  onChange={(event) =>
                    setTier(index, { ...tier, baseTaxRateTemplateId: event.target.value })
                  }
                  required
                >
                  <option value="">Steuersatz wählen</option>
                  {taxRates.map((tax) => (
                    <option key={tax.id} value={tax.id}>
                      {tax.name} · {basisPointsToPercent(tax.rateBasisPoints)} %
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ticketanbieter <span className="optional">optional</span>
                <select
                  value={tier.sourceTicketProviderTemplateId}
                  onChange={(event) => {
                    const id = event.target.value;
                    const provider = providerTemplates.find((item) => item.id === id);
                    setTier(index, {
                      ...tier,
                      sourceTicketProviderTemplateId: id,
                      components: provider
                        ? (provider.components as unknown as RawComponent[]).map(rawComponent)
                        : tier.components,
                    });
                  }}
                >
                  <option value="">Keine Vorlage</option>
                  {providerTemplates.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="nested-editor-heading nested-editor-heading--small">
              <h4>Preisstruktur</h4>
              <button
                className="button button--quiet"
                onClick={() =>
                  setTier(index, {
                    ...tier,
                    components: [...tier.components, emptyComponent(taxRates[0]?.id)],
                  })
                }
                type="button"
              >
                Position hinzufügen
              </button>
            </div>
            <ComponentEditor
              artists={artists}
              components={tier.components}
              onChange={(components) => setTier(index, { ...tier, components })}
              partners={partners}
              taxRates={taxRates}
            />
          </fieldset>
        ))}
        <div className="nested-editor-heading">
          <h3>Weitere Erlöse</h3>
          <button
            className="button button--secondary"
            onClick={() =>
              setDraft({
                ...draft,
                additionalRevenues: [
                  ...draft.additionalRevenues,
                  {
                    key: key(),
                    name: '',
                    calculationType: 'FIXED',
                    inputType: 'GROSS',
                    value: '',
                    taxRateTemplateId: taxRates[0]?.id ?? '',
                    confirmationStatus: 'PLANNED',
                    note: '',
                  },
                ],
              })
            }
            type="button"
          >
            Erlös hinzufügen
          </button>
        </div>
        {draft.additionalRevenues.map((item, index) => (
          <fieldset className="nested-editor-card" key={item.key}>
            <legend>Weiterer Erlös {index + 1}</legend>
            <div className="nested-editor-actions">
              <button
                aria-label={`Erlös ${index + 1} nach oben`}
                className="button button--quiet"
                disabled={index === 0}
                onClick={() =>
                  setDraft({
                    ...draft,
                    additionalRevenues: move(draft.additionalRevenues, index, -1),
                  })
                }
                type="button"
              >
                ↑
              </button>
              <button
                aria-label={`Erlös ${index + 1} nach unten`}
                className="button button--quiet"
                disabled={index === draft.additionalRevenues.length - 1}
                onClick={() =>
                  setDraft({
                    ...draft,
                    additionalRevenues: move(draft.additionalRevenues, index, 1),
                  })
                }
                type="button"
              >
                ↓
              </button>
              <button
                className="button button--quiet"
                onClick={() =>
                  setDraft({
                    ...draft,
                    additionalRevenues: draft.additionalRevenues.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  })
                }
                type="button"
              >
                Entfernen
              </button>
            </div>
            <div className="form-grid">
              <label>
                Bezeichnung
                <input
                  value={item.name}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      additionalRevenues: draft.additionalRevenues.map((entry, itemIndex) =>
                        itemIndex === index ? { ...entry, name: event.target.value } : entry,
                      ),
                    })
                  }
                  required
                />
              </label>
              <label>
                Berechnung
                <select
                  value={item.calculationType}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      additionalRevenues: draft.additionalRevenues.map((entry, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...entry,
                              calculationType: event.target
                                .value as AdditionalDraft['calculationType'],
                            }
                          : entry,
                      ),
                    })
                  }
                >
                  <option value="FIXED">Festbetrag</option>
                  <option value="PER_EXPECTED_GUEST">Je erwarteten Gast</option>
                  <option value="PER_PAYING_TICKET">Je zahlendem Ticket</option>
                  <option value="PERCENT_TICKET_BASE_NET">
                    Prozent vom Ticketgrundpreis netto
                  </option>
                </select>
              </label>
              <label>
                {item.calculationType === 'PERCENT_TICKET_BASE_NET' ? 'Prozentsatz %' : 'Betrag €'}
                <input
                  inputMode="decimal"
                  value={item.value}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      additionalRevenues: draft.additionalRevenues.map((entry, itemIndex) =>
                        itemIndex === index ? { ...entry, value: event.target.value } : entry,
                      ),
                    })
                  }
                  required
                />
              </label>
              <label>
                Steuersatz
                <select
                  value={item.taxRateTemplateId}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      additionalRevenues: draft.additionalRevenues.map((entry, itemIndex) =>
                        itemIndex === index
                          ? { ...entry, taxRateTemplateId: event.target.value }
                          : entry,
                      ),
                    })
                  }
                  required
                >
                  {taxRates.map((tax) => (
                    <option key={tax.id} value={tax.id}>
                      {tax.name} · {basisPointsToPercent(tax.rateBasisPoints)} %
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
        ))}
        <FormMessage message={message} />
        <div className="button-row form-actions">
          <button className="button" disabled={pending} type="submit">
            {pending ? 'Speichern …' : 'Kalkulationsvorlage speichern'}
          </button>
          <button className="button button--secondary" onClick={onClose} type="button">
            Abbrechen
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ComponentEditor({
  components,
  taxRates,
  artists,
  partners,
  onChange,
}: {
  components: ComponentDraft[];
  taxRates: TaxRate[];
  artists: Artist[];
  partners: Partner[];
  onChange: (components: ComponentDraft[]) => void;
}) {
  const update = (index: number, value: ComponentDraft) =>
    onChange(components.map((item, itemIndex) => (itemIndex === index ? value : item)));
  return (
    <div className="nested-editor-list">
      {components.length === 0 ? (
        <p className="empty-state">Keine Preisstruktur-Positionen.</p>
      ) : (
        components.map((component, index) => (
          <fieldset className="nested-editor-card nested-editor-card--inner" key={component.key}>
            <legend>Position {index + 1}</legend>
            <div className="nested-editor-actions">
              <button
                aria-label={`Preisstruktur-Position ${index + 1} nach oben`}
                className="button button--quiet"
                disabled={index === 0}
                onClick={() => onChange(move(components, index, -1))}
                type="button"
              >
                ↑
              </button>
              <button
                aria-label={`Preisstruktur-Position ${index + 1} nach unten`}
                className="button button--quiet"
                disabled={index === components.length - 1}
                onClick={() => onChange(move(components, index, 1))}
                type="button"
              >
                ↓
              </button>
              <button
                className="button button--quiet"
                onClick={() => onChange(components.filter((_, itemIndex) => itemIndex !== index))}
                type="button"
              >
                Entfernen
              </button>
            </div>
            <div className="form-grid">
              <label>
                Bezeichnung
                <input
                  value={component.name}
                  onChange={(event) => update(index, { ...component, name: event.target.value })}
                  placeholder="z. B. VVK-Gebühr"
                  required
                />
              </label>
              <label>
                Berechnungsart
                <select
                  value={component.amountType}
                  onChange={(event) =>
                    update(index, {
                      ...component,
                      amountType: event.target.value as ComponentDraft['amountType'],
                    })
                  }
                >
                  <option value="FIXED">Festbetrag</option>
                  <option value="PERCENTAGE">Prozent vom Ticketgrundpreis brutto</option>
                </select>
              </label>
              <label>
                {component.amountType === 'FIXED' ? 'Betrag €' : 'Prozentsatz %'}
                <input
                  inputMode="decimal"
                  value={component.value}
                  onChange={(event) => update(index, { ...component, value: event.target.value })}
                  required
                />
              </label>
              <label>
                Eingabeart
                <select
                  value={component.inputType}
                  onChange={(event) =>
                    update(index, {
                      ...component,
                      inputType: event.target.value as ComponentDraft['inputType'],
                    })
                  }
                >
                  <option value="GROSS">Brutto</option>
                  <option value="NET">Netto</option>
                </select>
              </label>
              <label>
                Steuersatz
                <select
                  value={component.taxRateTemplateId}
                  onChange={(event) =>
                    update(index, { ...component, taxRateTemplateId: event.target.value })
                  }
                  required
                >
                  <option value="">Steuersatz wählen</option>
                  {taxRates.map((tax) => (
                    <option key={tax.id} value={tax.id}>
                      {tax.name} · {basisPointsToPercent(tax.rateBasisPoints)} %
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label">
                <input
                  checked={component.guestPays}
                  onChange={(event) =>
                    update(index, { ...component, guestPays: event.target.checked })
                  }
                  type="checkbox"
                />{' '}
                Gast trägt diese Position
              </label>
            </div>
            <div className="nested-editor-heading nested-editor-heading--small">
              <h4>Empfänger-Aufteilungen</h4>
              <button
                className="button button--quiet"
                onClick={() =>
                  update(index, {
                    ...component,
                    allocations: [...component.allocations, emptyAllocation()],
                  })
                }
                type="button"
              >
                Empfänger hinzufügen
              </button>
            </div>
            {component.allocations.map((allocation, allocationIndex) => (
              <div className="allocation-editor" key={allocation.key}>
                <label>
                  Empfänger
                  <select
                    aria-label={`Empfängertyp für Position ${index + 1}, Aufteilung ${allocationIndex + 1}`}
                    value={allocation.recipientType}
                    onChange={(event) =>
                      update(index, {
                        ...component,
                        allocations: component.allocations.map((item, itemIndex) =>
                          itemIndex === allocationIndex
                            ? {
                                ...item,
                                recipientType: event.target
                                  .value as AllocationDraft['recipientType'],
                                recipientId: '',
                                externalName: '',
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value="ORGANIZATION">Eigene Organisation</option>
                    <option value="ARTIST">Artist</option>
                    <option value="BUSINESS_PARTNER">Geschäftspartner</option>
                    <option value="EXTERNAL">Externer Empfänger</option>
                  </select>
                </label>
                {allocation.recipientType === 'ARTIST' ? (
                  <label>
                    Artist
                    <select
                      value={allocation.recipientId}
                      onChange={(event) =>
                        update(index, {
                          ...component,
                          allocations: component.allocations.map((item, itemIndex) =>
                            itemIndex === allocationIndex
                              ? { ...item, recipientId: event.target.value }
                              : item,
                          ),
                        })
                      }
                      required
                    >
                      <option value="">Artist wählen</option>
                      {artists.map((artist) => (
                        <option key={artist.id} value={artist.id}>
                          {artist.stageName ??
                            [artist.firstName, artist.lastName].filter(Boolean).join(' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : allocation.recipientType === 'BUSINESS_PARTNER' ? (
                  <label>
                    Geschäftspartner
                    <select
                      value={allocation.recipientId}
                      onChange={(event) =>
                        update(index, {
                          ...component,
                          allocations: component.allocations.map((item, itemIndex) =>
                            itemIndex === allocationIndex
                              ? { ...item, recipientId: event.target.value }
                              : item,
                          ),
                        })
                      }
                      required
                    >
                      <option value="">Partner wählen</option>
                      {partners.map((partner) => (
                        <option key={partner.id} value={partner.id}>
                          {partner.companyName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : allocation.recipientType === 'EXTERNAL' ? (
                  <label>
                    Externe Bezeichnung
                    <input
                      value={allocation.externalName}
                      onChange={(event) =>
                        update(index, {
                          ...component,
                          allocations: component.allocations.map((item, itemIndex) =>
                            itemIndex === allocationIndex
                              ? { ...item, externalName: event.target.value }
                              : item,
                          ),
                        })
                      }
                      required
                    />
                  </label>
                ) : (
                  <span className="allocation-editor__organization">Organisation</span>
                )}
                <label>
                  Aufteilung
                  <select
                    value={allocation.allocationType}
                    onChange={(event) =>
                      update(index, {
                        ...component,
                        allocations: component.allocations.map((item, itemIndex) =>
                          itemIndex === allocationIndex
                            ? {
                                ...item,
                                allocationType: event.target
                                  .value as AllocationDraft['allocationType'],
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value="PERCENTAGE">Prozent</option>
                    <option value="FIXED">Festbetrag</option>
                  </select>
                </label>
                <label>
                  {allocation.allocationType === 'PERCENTAGE' ? 'Anteil %' : 'Anteil €'}
                  <input
                    inputMode="decimal"
                    value={allocation.value}
                    onChange={(event) =>
                      update(index, {
                        ...component,
                        allocations: component.allocations.map((item, itemIndex) =>
                          itemIndex === allocationIndex
                            ? { ...item, value: event.target.value }
                            : item,
                        ),
                      })
                    }
                    required
                  />
                </label>
                <button
                  aria-label={`Aufteilung ${allocationIndex + 1} entfernen`}
                  className="button button--quiet"
                  onClick={() =>
                    update(index, {
                      ...component,
                      allocations: component.allocations.filter(
                        (_, itemIndex) => itemIndex !== allocationIndex,
                      ),
                    })
                  }
                  type="button"
                >
                  Entfernen
                </button>
              </div>
            ))}
          </fieldset>
        ))
      )}
    </div>
  );
}
