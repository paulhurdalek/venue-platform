'use client';

import type { components } from '@venue/api-client';
import { useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import {
  basisPoints,
  dealTemplateSummary,
  discountLabel,
  money,
  positionMeta,
} from '../../../src/deals/deal-template-view';
import { FormMessage } from '../form-message';
import { ActionMenu } from '../ui/action-menu';
import { Dialog } from '../ui/dialog';

type Template = components['schemas']['DealTemplateDto'];
type Service = components['schemas']['ServiceDto'];
type ComponentInput = components['schemas']['DealComponentInputDto'];
type ServiceInput = components['schemas']['DealServicePositionInputDto'];

interface ComponentDraft {
  key: string;
  type: ComponentInput['type'];
  label: string;
  amount: string;
  minimum: string;
  locationShare: number;
  tax: number;
  includeWkz: boolean;
}

interface PositionDraft {
  key: string;
  serviceId: string;
  quantity: string;
  sales: string;
  internal: string;
  tax: number;
  billingMode: ServiceInput['billingMode'];
}

export function DealTemplateManager({
  organizationId,
  initialTemplates,
  services,
  canWrite,
  canArchive,
}: {
  organizationId: string;
  initialTemplates: Template[];
  services: Service[];
  canWrite: boolean;
  canArchive: boolean;
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [editing, setEditing] = useState<Template | null | undefined>();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [statusBusyId, setStatusBusyId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const changeStatus = async (template: Template) => {
    setMessage(undefined);
    setStatusBusyId(template.id);
    const status = template.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
    try {
      const result = await createBrowserApiClient().PATCH(
        '/api/v1/organizations/{organizationId}/deal-templates/{templateId}/status',
        {
          params: { path: { organizationId, templateId: template.id } },
          body: { version: template.version, status },
        },
      );
      const saved = requireData(result);
      setTemplates((items) => items.map((item) => (item.id === saved.id ? saved : item)));
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Der Vorlagenstatus konnte nicht geändert werden.'));
    } finally {
      setStatusBusyId(undefined);
    }
  };
  const toggleExpanded = (templateId: string) =>
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  return (
    <section className="detail-panel revenue-template-section">
      <header className="section-heading-row">
        <div>
          <p className="eyebrow">Vermietung &amp; Deal</p>
          <h1>Dealvorlagen</h1>
          <p>Organisationsweite Eingabehilfen ohne Live-Verknüpfung zu bestehenden Deals.</p>
        </div>
        {canWrite ? (
          <button className="button" onClick={() => setEditing(null)} type="button">
            Neue Dealvorlage
          </button>
        ) : null}
      </header>
      {message ? <FormMessage message={message} /> : null}
      <div className="deal-template-list">
        {templates.length ? (
          templates.map((template) => {
            const expanded = expandedIds.has(template.id);
            const titleId = `deal-template-title-${template.id}`;
            const detailsId = `deal-template-details-${template.id}`;
            const actionItems = [
              ...(canWrite
                ? [
                    {
                      id: 'edit',
                      label: 'Bearbeiten',
                      onSelect: () => setEditing(template),
                    },
                  ]
                : []),
              ...(canArchive
                ? [
                    {
                      id: 'status',
                      label: template.status === 'ACTIVE' ? 'Archivieren' : 'Reaktivieren',
                      onSelect: () => void changeStatus(template),
                      danger: template.status === 'ACTIVE',
                      disabled: statusBusyId === template.id,
                    },
                  ]
                : []),
            ];
            return (
              <article aria-labelledby={titleId} className="deal-template-card" key={template.id}>
                <div className="deal-template-card__header">
                  <div className="deal-template-card__intro">
                    <h2 id={titleId}>{template.name}</h2>
                    {template.description ? (
                      <p className="deal-template-card__description">{template.description}</p>
                    ) : null}
                    <p className="deal-template-card__summary">
                      {dealTemplateSummary(template.components)}
                    </p>
                    <small>
                      {countLabel(template.components.length, 'Baustein', 'Bausteine')} ·{' '}
                      {countLabel(
                        template.servicePositions.length,
                        'Leistungsposition',
                        'Leistungspositionen',
                      )}{' '}
                      · Version {template.version}
                    </small>
                  </div>
                  <span
                    className={`status-badge status-badge--${template.status === 'ACTIVE' ? 'active' : 'archived'}`}
                  >
                    {template.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
                  </span>
                  <button
                    aria-controls={detailsId}
                    aria-expanded={expanded}
                    className="deal-template-card__toggle"
                    onClick={() => toggleExpanded(template.id)}
                    type="button"
                  >
                    <span>{expanded ? 'Weniger' : 'Details'}</span>
                    <span aria-hidden="true" className="deal-template-card__chevron">
                      ⌄
                    </span>
                  </button>
                  {actionItems.length ? (
                    <ActionMenu
                      compact
                      items={actionItems}
                      label={`Aktionen für Dealvorlage ${template.name}`}
                    />
                  ) : null}
                </div>
                {expanded ? <DealTemplateDetails id={detailsId} template={template} /> : null}
              </article>
            );
          })
        ) : (
          <p className="compact-empty">Noch keine Dealvorlagen vorhanden.</p>
        )}
      </div>
      {editing !== undefined ? (
        <TemplateEditor
          organizationId={organizationId}
          services={services}
          template={editing}
          onClose={() => setEditing(undefined)}
          onSaved={(saved) => {
            setTemplates((items) =>
              items.some((item) => item.id === saved.id)
                ? items.map((item) => (item.id === saved.id ? saved : item))
                : [...items, saved],
            );
            setEditing(undefined);
          }}
        />
      ) : null}
    </section>
  );
}

function DealTemplateDetails({ id, template }: { id: string; template: Template }) {
  const billable = template.servicePositions.filter(
    (position) => position.billingMode === 'SEPARATELY_BILLABLE',
  );
  const included = template.servicePositions.filter(
    (position) => position.billingMode === 'INCLUDED',
  );
  const discountedPositions = template.servicePositions.filter((position) =>
    discountLabel(
      position.discountType,
      position.discountFixedMinor,
      position.discountPercentageBasisPoints,
    ),
  );
  const totalDiscount = discountLabel(
    template.totalDiscountType,
    template.totalDiscountFixedMinor,
    template.totalDiscountPercentageBasisPoints,
  );
  const hasDetails =
    template.components.length > 0 ||
    billable.length > 0 ||
    included.length > 0 ||
    discountedPositions.length > 0 ||
    totalDiscount !== null ||
    Boolean(template.description);

  return (
    <div className="deal-template-card__details" id={id}>
      {template.components.length ? (
        <section className="deal-template-detail-section">
          <h3>Deal-Bausteine</h3>
          <div className="deal-template-component-list">
            {template.components.map((component) => (
              <div className="deal-template-component" key={component.id}>
                <strong>{component.label}</strong>
                {component.type === 'FIXED_RENT' ? (
                  <dl>
                    <DetailValue
                      label="Feste Miete"
                      value={`${money(component.amountNetMinor)} netto`}
                    />
                    <DetailValue
                      label="Umsatzsteuer"
                      value={`${basisPoints(component.taxRateBasisPoints)} %`}
                    />
                  </dl>
                ) : (
                  <dl>
                    {component.type === 'MINIMUM_GUARANTEE_SHARE' ? (
                      <DetailValue
                        label="Mindestgarantie"
                        value={`${money(component.minimumGuaranteeNetMinor)} netto`}
                      />
                    ) : null}
                    <DetailValue
                      label="Umsatzbeteiligung"
                      value={`${basisPoints(component.locationShareBasisPoints)} % Location / ${basisPoints(component.counterpartyShareBasisPoints)} % Gegenpartei`}
                    />
                    <DetailValue label="Beteiligungsbasis" value="Ticket-Nettoerlös" />
                    <DetailValue
                      label="WKZ"
                      value={component.includeWkz ? 'Einbezogen' : 'Nicht einbezogen'}
                    />
                  </dl>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {billable.length ? (
        <TemplateServiceSection positions={billable} title="Separat abrechenbare Leistungen" />
      ) : null}
      {included.length ? (
        <TemplateServiceSection positions={included} title="Im Deal enthaltene Leistungen" />
      ) : null}
      {discountedPositions.length || totalDiscount ? (
        <section className="deal-template-detail-section">
          <h3>Rabatte</h3>
          <dl className="deal-template-discount-list">
            {discountedPositions.map((position) => (
              <DetailValue
                key={position.id}
                label={`Positionsrabatt · ${position.name}`}
                value={discountLabel(
                  position.discountType,
                  position.discountFixedMinor,
                  position.discountPercentageBasisPoints,
                )!}
              />
            ))}
            {totalDiscount ? <DetailValue label="Gesamtrabatt" value={totalDiscount} /> : null}
          </dl>
        </section>
      ) : null}
      {template.description ? (
        <section className="deal-template-detail-section deal-template-detail-section--note">
          <h3>Notiz</h3>
          <p>{template.description}</p>
        </section>
      ) : null}
      {!hasDetails ? <p className="compact-empty">Keine weiteren Angaben hinterlegt.</p> : null}
    </div>
  );
}

function TemplateServiceSection({
  positions,
  title,
}: {
  positions: Template['servicePositions'];
  title: string;
}) {
  return (
    <section className="deal-template-detail-section">
      <h3>{title}</h3>
      <div className="deal-template-service-list">
        {positions.map((position) => (
          <div className="deal-template-service" key={position.id}>
            <span>
              <strong>{position.name}</strong>
              <small>{positionMeta(position)}</small>
            </span>
            <span>
              {position.billingMode === 'INCLUDED'
                ? `${money(position.internalUnitCostNetMinor)} interne Kosten je Einheit`
                : `${money(position.salesUnitPriceNetMinor)} netto je Einheit`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function TemplateEditor({
  organizationId,
  template,
  services,
  onClose,
  onSaved,
}: {
  organizationId: string;
  template: Template | null;
  services: Service[];
  onClose: () => void;
  onSaved: (template: Template) => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [components, setComponents] = useState<ComponentDraft[]>(
    () =>
      template?.components.map((item) => ({
        key: item.id,
        type: item.type,
        label: item.label,
        amount: euros(item.amountNetMinor),
        minimum: euros(item.minimumGuaranteeNetMinor),
        locationShare: (item.locationShareBasisPoints ?? 5_000) / 100,
        tax: item.taxRateBasisPoints / 100,
        includeWkz: item.includeWkz,
      })) ?? [],
  );
  const [positions, setPositions] = useState<PositionDraft[]>(
    () =>
      template?.servicePositions.map((item) => ({
        key: item.id,
        serviceId: item.sourceServiceId ?? '',
        quantity: item.quantity,
        sales: euros(item.salesUnitPriceNetMinor),
        internal: euros(item.internalUnitCostNetMinor),
        tax: item.taxRateBasisPoints / 100,
        billingMode: item.billingMode,
      })) ?? [],
  );
  const [discountType, setDiscountType] = useState<'' | 'FIXED' | 'PERCENTAGE'>(
    template?.totalDiscountType ?? '',
  );
  const [discountValue, setDiscountValue] = useState(
    template?.totalDiscountType === 'FIXED'
      ? euros(template.totalDiscountFixedMinor)
      : String((template?.totalDiscountPercentageBasisPoints ?? 0) / 100),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const save = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const body: components['schemas']['DealTemplateInputDto'] = {
        name,
        description: description || null,
        components: components.map((item) => ({
          type: item.type,
          label: item.label,
          amountNetMinor: item.type === 'FIXED_RENT' ? minor(item.amount) : null,
          minimumGuaranteeNetMinor:
            item.type === 'MINIMUM_GUARANTEE_SHARE' ? minor(item.minimum) : null,
          taxRateBasisPoints: basis(item.tax, 100_000),
          locationShareBasisPoints: item.type === 'FIXED_RENT' ? null : basis(item.locationShare),
          counterpartyShareBasisPoints:
            item.type === 'FIXED_RENT' ? null : 10_000 - basis(item.locationShare),
          includeWkz: item.type === 'FIXED_RENT' ? false : item.includeWkz,
        })),
        servicePositions: positions.map((item) => {
          const service = services.find((candidate) => candidate.id === item.serviceId)!;
          return {
            sourceServiceId: service.id,
            name: service.name,
            unit: service.unit,
            quantity: item.quantity,
            salesUnitPriceNetMinor: minor(item.sales) ?? '0',
            internalUnitCostNetMinor: minor(item.internal) ?? '0',
            taxRateBasisPoints: basis(item.tax, 100_000),
            billingMode: item.billingMode,
          };
        }),
        ...(discountType
          ? {
              totalDiscount:
                discountType === 'FIXED'
                  ? { type: 'FIXED', fixedMinor: minor(discountValue), percentageBasisPoints: null }
                  : {
                      type: 'PERCENTAGE',
                      fixedMinor: null,
                      percentageBasisPoints: basis(Number(discountValue)),
                    },
            }
          : {}),
      };
      const client = createBrowserApiClient();
      const result = template
        ? await client.PATCH('/api/v1/organizations/{organizationId}/deal-templates/{templateId}', {
            params: { path: { organizationId, templateId: template.id } },
            body: { ...body, version: template.version },
          })
        : await client.POST('/api/v1/organizations/{organizationId}/deal-templates', {
            params: { path: { organizationId } },
            body,
          });
      onSaved(requireData(result));
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Die Dealvorlage konnte nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  };
  const addComponent = (type: ComponentInput['type']) =>
    setComponents((items) => [
      ...items,
      {
        key: crypto.randomUUID(),
        type,
        label:
          type === 'FIXED_RENT'
            ? 'Feste Miete'
            : type === 'REVENUE_SHARE'
              ? 'Umsatzbeteiligung'
              : 'Mindestgarantie mit Umsatzbeteiligung',
        amount: '0,00',
        minimum: '0,00',
        locationShare: 50,
        tax: 19,
        includeWkz: false,
      },
    ]);
  return (
    <Dialog
      onClose={onClose}
      open
      size="wide"
      title={template ? 'Dealvorlage bearbeiten' : 'Dealvorlage anlegen'}
    >
      <div className="deal-form">
        <div className="form-grid">
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Beschreibung
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </div>
        <fieldset className="deal-editor-section">
          <legend>Deal-Bausteine</legend>
          {components.map((item, index) => (
            <div className="deal-form-row" key={item.key}>
              <div className="form-grid">
                <label>
                  Bezeichnung
                  <input
                    value={item.label}
                    onChange={(event) =>
                      setComponents((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, label: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                {item.type === 'FIXED_RENT' ? (
                  <label>
                    Betrag netto €
                    <input
                      value={item.amount}
                      onChange={(event) =>
                        setComponents((rows) =>
                          rows.map((row, i) =>
                            i === index ? { ...row, amount: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </label>
                ) : (
                  <label>
                    Location-Anteil %
                    <input
                      value={item.locationShare}
                      onChange={(event) =>
                        setComponents((rows) =>
                          rows.map((row, i) =>
                            i === index
                              ? { ...row, locationShare: Number(event.target.value) }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                )}
                {item.type === 'MINIMUM_GUARANTEE_SHARE' ? (
                  <label>
                    Mindestgarantie netto €
                    <input
                      value={item.minimum}
                      onChange={(event) =>
                        setComponents((rows) =>
                          rows.map((row, i) =>
                            i === index ? { ...row, minimum: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </label>
                ) : null}
                <label>
                  Umsatzsteuer %
                  <input
                    value={item.tax}
                    onChange={(event) =>
                      setComponents((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, tax: Number(event.target.value) } : row,
                        ),
                      )
                    }
                  />
                </label>
                {item.type !== 'FIXED_RENT' ? (
                  <label className="checkbox-row">
                    <input
                      checked={item.includeWkz}
                      onChange={(event) =>
                        setComponents((rows) =>
                          rows.map((row, i) =>
                            i === index ? { ...row, includeWkz: event.target.checked } : row,
                          ),
                        )
                      }
                      type="checkbox"
                    />
                    WKZ einbeziehen
                  </label>
                ) : null}
              </div>
              <button
                className="text-button text-button--danger"
                onClick={() => setComponents((rows) => rows.filter((_, i) => i !== index))}
                type="button"
              >
                Entfernen
              </button>
            </div>
          ))}
          <div className="button-row">
            <button
              className="button button--secondary button--small"
              onClick={() => addComponent('FIXED_RENT')}
              type="button"
            >
              Feste Miete
            </button>
            <button
              className="button button--secondary button--small"
              onClick={() => addComponent('REVENUE_SHARE')}
              type="button"
            >
              Umsatzbeteiligung
            </button>
            <button
              className="button button--secondary button--small"
              onClick={() => addComponent('MINIMUM_GUARANTEE_SHARE')}
              type="button"
            >
              Garantie + Beteiligung
            </button>
          </div>
        </fieldset>
        <fieldset className="deal-editor-section">
          <legend>Leistungspositionen</legend>
          {positions.map((item, index) => (
            <div className="deal-form-row" key={item.key}>
              <div className="form-grid">
                <label>
                  Leistung
                  <select
                    value={item.serviceId}
                    onChange={(event) => {
                      const service = services.find(
                        (candidate) => candidate.id === event.target.value,
                      )!;
                      setPositions((rows) =>
                        rows.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                serviceId: service.id,
                                sales: euros(service.defaultSalesPriceMinor ?? '0'),
                                internal: euros(
                                  service.preferredProvider?.purchasePriceMinor ?? '0',
                                ),
                              }
                            : row,
                        ),
                      );
                    }}
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
                  <input
                    value={item.quantity}
                    onChange={(event) =>
                      setPositions((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, quantity: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Verkauf netto €
                  <input
                    value={item.sales}
                    onChange={(event) =>
                      setPositions((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, sales: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Interne Kosten netto €
                  <input
                    value={item.internal}
                    onChange={(event) =>
                      setPositions((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, internal: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Abrechnung
                  <select
                    value={item.billingMode}
                    onChange={(event) =>
                      setPositions((rows) =>
                        rows.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                billingMode: event.target.value as PositionDraft['billingMode'],
                              }
                            : row,
                        ),
                      )
                    }
                  >
                    <option value="SEPARATELY_BILLABLE">Separat abrechenbar</option>
                    <option value="INCLUDED">Im Deal enthalten</option>
                  </select>
                </label>
              </div>
              <button
                className="text-button text-button--danger"
                onClick={() => setPositions((rows) => rows.filter((_, i) => i !== index))}
                type="button"
              >
                Entfernen
              </button>
            </div>
          ))}
          {services.length ? (
            <button
              className="button button--secondary button--small"
              onClick={() => {
                const service = services[0]!;
                setPositions((items) => [
                  ...items,
                  {
                    key: crypto.randomUUID(),
                    serviceId: service.id,
                    quantity: '1',
                    sales: euros(service.defaultSalesPriceMinor ?? '0'),
                    internal: euros(service.preferredProvider?.purchasePriceMinor ?? '0'),
                    tax: 19,
                    billingMode: 'SEPARATELY_BILLABLE',
                  },
                ]);
              }}
              type="button"
            >
              Leistung hinzufügen
            </button>
          ) : null}
        </fieldset>
        <fieldset className="deal-editor-section">
          <legend>Gesamtrabatt</legend>
          <div className="form-grid">
            <label>
              Rabattart
              <select
                value={discountType}
                onChange={(event) => setDiscountType(event.target.value as typeof discountType)}
              >
                <option value="">Kein Rabatt</option>
                <option value="FIXED">Fester EUR-Betrag</option>
                <option value="PERCENTAGE">Prozent</option>
              </select>
            </label>
            {discountType ? (
              <label>
                {discountType === 'FIXED' ? 'Betrag €' : 'Prozent'}
                <input
                  value={discountValue}
                  onChange={(event) => setDiscountValue(event.target.value)}
                />
              </label>
            ) : null}
          </div>
        </fieldset>
        {message ? <FormMessage message={message} /> : null}
        <div className="button-row">
          <button
            className="button"
            disabled={busy || !name.trim()}
            onClick={() => void save()}
            type="button"
          >
            {busy ? 'Speichert …' : 'Speichern'}
          </button>
          <button className="button button--quiet" onClick={onClose} type="button">
            Abbrechen
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function minor(value: string): string | null {
  if (!value) return null;
  const [whole = '0', fraction = ''] = value.replace(',', '.').split('.');
  return (
    BigInt(whole || '0') * 100n +
    BigInt(fraction.padEnd(2, '0').slice(0, 2) || '0')
  ).toString();
}
function euros(value: string | null | undefined): string {
  if (!value) return '0,00';
  const amount = BigInt(value);
  return `${amount / 100n},${(amount % 100n).toString().padStart(2, '0')}`;
}
function basis(value: number, maximum = 10_000) {
  return Math.max(0, Math.min(maximum, Math.round(value * 100)));
}
function requireData<T>(result: { data?: T }): T {
  if (result.data === undefined)
    throw (result as { error?: unknown }).error ?? new Error('Anfrage fehlgeschlagen');
  return result.data;
}
