'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import { FormMessage } from '../form-message';
import { Dialog } from '../ui/dialog';

type Deal = components['schemas']['DealDto'];
type Partner = components['schemas']['BusinessPartnerDto'];
type Service = components['schemas']['ServiceDto'];
type Template = components['schemas']['DealTemplateDto'];
type DealComponentInput = components['schemas']['DealComponentInputDto'];
type DealServiceInput = components['schemas']['DealServicePositionInputDto'];
interface ComponentForm {
  key: string;
  type: DealComponentInput['type'];
  label: string;
  amountNetMinor: string | null;
  minimumGuaranteeNetMinor: string | null;
  taxRateBasisPoints: number;
  locationShareBasisPoints: number | null;
  counterpartyShareBasisPoints: number | null;
  includeWkz: boolean;
}

interface DiscountForm {
  type: 'FIXED' | 'PERCENTAGE';
  fixedMinor: string | null;
  percentageBasisPoints: number | null;
}

interface ServiceForm {
  key: string;
  sourceServiceId: string | null;
  name: string;
  unit: NonNullable<DealServiceInput['unit']>;
  quantity: string;
  salesUnitPriceNetMinor: string;
  internalUnitCostNetMinor: string;
  taxRateBasisPoints: number;
  billingMode: DealServiceInput['billingMode'];
  discount: DiscountForm | undefined;
}

export function DealPanel({
  organizationId,
  eventId,
  initialDeal,
  partners,
  services,
  templates,
  canWrite,
  canChangeStatus,
  prominent,
}: {
  organizationId: string;
  eventId: string;
  initialDeal?: Deal | undefined;
  partners: Partner[];
  services: Service[];
  templates: Template[];
  canWrite: boolean;
  canChangeStatus: boolean;
  prominent: boolean;
}) {
  const router = useRouter();
  const [deal, setDeal] = useState(initialDeal);
  const [editorOpen, setEditorOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const changeStatus = async (status: Deal['status']) => {
    if (!deal) return;
    setStatusBusy(true);
    setMessage(undefined);
    try {
      const result = await createBrowserApiClient().PATCH(
        '/api/v1/organizations/{organizationId}/deals/{dealId}/status',
        {
          params: { path: { organizationId, dealId: deal.id } },
          body: { version: deal.version, status },
        },
      );
      setDeal(requireData(result));
      router.refresh();
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Der Dealstatus konnte nicht geändert werden.'));
    } finally {
      setStatusBusy(false);
    }
  };

  if (!deal) {
    return (
      <section className={`deal-panel${prominent ? ' deal-panel--prominent' : ''}`}>
        <div className="deal-panel__empty">
          <div>
            <p className="eyebrow">Vermietung &amp; Deal</p>
            <h2>Noch kein kommerzieller Deal</h2>
            <p>
              Kunde, Miete, Beteiligung und Leistungen werden unabhängig vom Eventstatus geführt.
            </p>
          </div>
          {canWrite ? (
            <button className="button" onClick={() => setEditorOpen(true)} type="button">
              Deal anlegen
            </button>
          ) : null}
        </div>
        <DealEditor
          eventId={eventId}
          onClose={() => setEditorOpen(false)}
          onSaved={(saved) => {
            setDeal(saved);
            setEditorOpen(false);
            router.refresh();
          }}
          open={editorOpen}
          organizationId={organizationId}
          partners={partners}
          services={services}
          templates={templates}
        />
      </section>
    );
  }

  const billable = deal.servicePositions.filter(
    (position) => position.billingMode === 'SEPARATELY_BILLABLE',
  );
  const included = deal.servicePositions.filter((position) => position.billingMode === 'INCLUDED');
  const nextStatuses = allowedStatuses(deal.status);
  return (
    <section className={`deal-panel${prominent ? ' deal-panel--prominent' : ''}`}>
      <header className="deal-panel__header">
        <div>
          <p className="eyebrow">Vermietung &amp; Deal</p>
          <h2>{deal.customerName}</h2>
          <p>
            {deal.contactName ?? 'Kein Ansprechpartner'} · {statusLabel(deal.status)}
            {deal.sourceTemplateName ? ` · Snapshot aus „${deal.sourceTemplateName}“` : ''}
          </p>
        </div>
        <div className="button-row">
          {canWrite ? (
            <>
              <button
                className="button button--secondary"
                onClick={() => setTemplateOpen(true)}
                type="button"
              >
                Vorlage übernehmen
              </button>
              <button className="button" onClick={() => setEditorOpen(true)} type="button">
                Bearbeiten
              </button>
            </>
          ) : null}
        </div>
      </header>

      <dl className="deal-result-grid" aria-label="Dealergebnis">
        <Result
          label="Kundenbetrag Miete & Leistungen netto"
          value={deal.summary.customerAmountNetMinor}
        />
        <Result
          label="Erwarteter Location-Anteil netto"
          value={deal.summary.expectedLocationShareNetMinor}
        />
        <Result label="Interne Kosten netto" value={deal.summary.internalCostNetMinor} />
        <Result
          label="Erwartetes operatives Ergebnis"
          value={deal.summary.expectedOperatingResultNetMinor}
          strong
        />
      </dl>

      <div className="deal-read-grid">
        <DealList title="Deal-Bausteine">
          {deal.summary.components.length ? (
            deal.summary.components.map((component) => (
              <div className="deal-read-row" key={component.id}>
                <span>
                  <strong>{component.label}</strong>
                  <small>{componentRuleLabel(component.appliedRule)}</small>
                </span>
                <span>{money(component.effectiveLocationAmountMinor)}</span>
              </div>
            ))
          ) : (
            <p className="compact-empty">Keine Deal-Bausteine.</p>
          )}
        </DealList>
        <DealList title="Separat abrechenbare Leistungen">
          <ServiceRows positions={billable} />
        </DealList>
        <DealList title="Im Deal enthalten">
          <ServiceRows positions={included} />
        </DealList>
        <DealList title="Rabatte & Berechnungsbasis">
          <div className="deal-read-row">
            <span>Positionsrabatte</span>
            <span>− {money(deal.summary.positionDiscountNetMinor)}</span>
          </div>
          <div className="deal-read-row">
            <span>Gesamtrabatt auf Leistungen</span>
            <span>− {money(deal.summary.totalDiscountNetMinor)}</span>
          </div>
          <div className="deal-read-row">
            <span>Ticket-Netto / WKZ aus Erlösplanung</span>
            <span>
              {money(deal.summary.ticketNetRevenueMinor)} / {money(deal.summary.wkzNetRevenueMinor)}
            </span>
          </div>
        </DealList>
      </div>

      {canChangeStatus && nextStatuses.length ? (
        <div className="deal-status-actions">
          <span>Status ändern:</span>
          {nextStatuses.map((status) => (
            <button
              className="button button--quiet button--small"
              disabled={statusBusy}
              key={status}
              onClick={() => void changeStatus(status)}
              type="button"
            >
              {statusLabel(status)}
            </button>
          ))}
        </div>
      ) : null}
      {message ? <FormMessage message={message} /> : null}

      <DealEditor
        deal={deal}
        eventId={eventId}
        onClose={() => setEditorOpen(false)}
        onSaved={(saved) => {
          setDeal(saved);
          setEditorOpen(false);
          router.refresh();
        }}
        open={editorOpen}
        organizationId={organizationId}
        partners={partners}
        services={services}
        templates={templates}
      />
      <TemplateApplication
        deal={deal}
        onClose={() => setTemplateOpen(false)}
        onSaved={(saved) => {
          setDeal(saved);
          setTemplateOpen(false);
          router.refresh();
        }}
        open={templateOpen}
        organizationId={organizationId}
        templates={templates}
      />
    </section>
  );
}

function DealEditor({
  open,
  onClose,
  onSaved,
  organizationId,
  eventId,
  deal,
  partners,
  services,
  templates,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (deal: Deal) => void;
  organizationId: string;
  eventId: string;
  deal?: Deal | undefined;
  partners: Partner[];
  services: Service[];
  templates: Template[];
}) {
  const [partnerId, setPartnerId] = useState(deal?.businessPartnerId ?? partners[0]?.id ?? '');
  const [contactId, setContactId] = useState(deal?.contactId ?? '');
  const [templateId, setTemplateId] = useState('');
  const [components, setComponents] = useState<ComponentForm[]>(
    () =>
      deal?.components.map((item) => ({
        key: item.id,
        type: item.type,
        label: item.label,
        amountNetMinor: euros(item.amountNetMinor),
        minimumGuaranteeNetMinor: euros(item.minimumGuaranteeNetMinor),
        taxRateBasisPoints: item.taxRateBasisPoints,
        locationShareBasisPoints: item.locationShareBasisPoints ?? null,
        counterpartyShareBasisPoints: item.counterpartyShareBasisPoints ?? null,
        includeWkz: item.includeWkz,
      })) ?? [],
  );
  const [positions, setPositions] = useState<ServiceForm[]>(
    () =>
      deal?.servicePositions.map((item) => ({
        key: item.id,
        sourceServiceId: item.sourceServiceId ?? null,
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        salesUnitPriceNetMinor: euros(item.salesUnitPriceNetMinor),
        internalUnitCostNetMinor: euros(item.internalUnitCostNetMinor),
        taxRateBasisPoints: item.taxRateBasisPoints,
        billingMode: item.billingMode,
        discount:
          item.discountType === null || item.discountType === undefined
            ? undefined
            : {
                type: item.discountType,
                fixedMinor: euros(item.discountFixedMinor),
                percentageBasisPoints: item.discountPercentageBasisPoints ?? null,
              },
      })) ?? [],
  );
  const [totalDiscount, setTotalDiscount] = useState<DiscountForm | undefined>(() =>
    deal?.totalDiscountType
      ? {
          type: deal.totalDiscountType,
          fixedMinor: euros(deal.totalDiscountFixedMinor),
          percentageBasisPoints: deal.totalDiscountPercentageBasisPoints ?? null,
        }
      : undefined,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const selectedPartner = partners.find((partner) => partner.id === partnerId);
  const contacts = selectedPartner?.contacts ?? [];

  const save = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const body =
        templateId && !deal
          ? { businessPartnerId: partnerId, contactId: contactId || null, templateId }
          : {
              businessPartnerId: partnerId,
              contactId: contactId || null,
              components: components.map(componentPayload),
              servicePositions: positions.map(servicePayload),
              totalDiscount: discountPayload(totalDiscount),
              ...(deal ? { version: deal.version } : {}),
            };
      const client = createBrowserApiClient();
      const result = deal
        ? await client.PATCH('/api/v1/organizations/{organizationId}/deals/{dealId}', {
            params: { path: { organizationId, dealId: deal.id } },
            body: body as components['schemas']['UpdateDealDto'],
          })
        : await client.POST('/api/v1/organizations/{organizationId}/events/{eventId}/deal', {
            params: { path: { organizationId, eventId } },
            body: body as components['schemas']['CreateDealDto'],
          });
      onSaved(requireData(result));
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Der Deal konnte nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      onClose={onClose}
      open={open}
      size="wide"
      title={deal ? 'Deal bearbeiten' : 'Deal anlegen'}
    >
      <div className="deal-form">
        <div className="form-grid">
          <label>
            Kunde / Veranstalter
            <select
              value={partnerId}
              onChange={(event) => {
                setPartnerId(event.target.value);
                setContactId('');
              }}
            >
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.companyName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ansprechpartner
            <select value={contactId} onChange={(event) => setContactId(event.target.value)}>
              <option value="">Ohne Ansprechpartner</option>
              {contacts.map((association) => (
                <option key={association.contact.id} value={association.contact.id}>
                  {contactLabel(association.contact)}
                </option>
              ))}
            </select>
          </label>
          {!deal ? (
            <label>
              Dealvorlage (optional)
              <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                <option value="">Ohne Vorlage</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {!templateId || deal ? (
          <>
            <EditorSection title="Deal-Bausteine">
              {components.map((component, index) => (
                <ComponentEditor
                  component={component}
                  key={component.key}
                  onChange={(next) =>
                    setComponents((items) =>
                      items.map((item, itemIndex) => (itemIndex === index ? next : item)),
                    )
                  }
                  onRemove={() =>
                    setComponents((items) => items.filter((_, itemIndex) => itemIndex !== index))
                  }
                />
              ))}
              <div className="button-row">
                <button
                  className="button button--secondary button--small"
                  onClick={() => setComponents((items) => [...items, newComponent('FIXED_RENT')])}
                  type="button"
                >
                  Feste Miete
                </button>
                <button
                  className="button button--secondary button--small"
                  onClick={() =>
                    setComponents((items) => [...items, newComponent('REVENUE_SHARE')])
                  }
                  type="button"
                >
                  Umsatzbeteiligung
                </button>
                <button
                  className="button button--secondary button--small"
                  onClick={() =>
                    setComponents((items) => [...items, newComponent('MINIMUM_GUARANTEE_SHARE')])
                  }
                  type="button"
                >
                  Mindestgarantie + Beteiligung
                </button>
              </div>
            </EditorSection>

            <EditorSection title="Leistungen">
              {positions.map((position, index) => (
                <ServiceEditor
                  key={position.key}
                  onChange={(next) =>
                    setPositions((items) =>
                      items.map((item, itemIndex) => (itemIndex === index ? next : item)),
                    )
                  }
                  onRemove={() =>
                    setPositions((items) => items.filter((_, itemIndex) => itemIndex !== index))
                  }
                  position={position}
                  services={services}
                />
              ))}
              <button
                className="button button--secondary button--small"
                disabled={!services.length}
                onClick={() => setPositions((items) => [...items, newService(services[0]!)])}
                type="button"
              >
                Leistung hinzufügen
              </button>
            </EditorSection>

            <EditorSection title="Gesamtrabatt auf separat abrechenbare Leistungen">
              <DiscountEditor
                {...(totalDiscount ? { discount: totalDiscount } : {})}
                onChange={setTotalDiscount}
              />
            </EditorSection>
          </>
        ) : (
          <p className="compact-notice compact-notice--warning">
            Die Vorlage wird beim Anlegen vollständig als unabhängiger Snapshot übernommen.
          </p>
        )}
        {message ? <FormMessage message={message} /> : null}
        <div className="button-row">
          <button
            className="button"
            disabled={busy || !partnerId}
            onClick={() => void save()}
            type="button"
          >
            {busy ? 'Speichert …' : 'Speichern'}
          </button>
          <button className="button button--quiet" disabled={busy} onClick={onClose} type="button">
            Abbrechen
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function ComponentEditor({
  component,
  onChange,
  onRemove,
}: {
  component: ComponentForm;
  onChange: (value: ComponentForm) => void;
  onRemove: () => void;
}) {
  const share = component.type !== 'FIXED_RENT';
  return (
    <div className="deal-form-row">
      <div className="form-grid">
        <label>
          Bezeichnung
          <input
            value={component.label}
            onChange={(event) => onChange({ ...component, label: event.target.value })}
          />
        </label>
        {!share ? (
          <label>
            Betrag netto €
            <input
              inputMode="decimal"
              value={component.amountNetMinor ?? ''}
              onChange={(event) => onChange({ ...component, amountNetMinor: event.target.value })}
            />
          </label>
        ) : null}
        {component.type === 'MINIMUM_GUARANTEE_SHARE' ? (
          <label>
            Mindestgarantie netto €
            <input
              inputMode="decimal"
              value={component.minimumGuaranteeNetMinor ?? ''}
              onChange={(event) =>
                onChange({ ...component, minimumGuaranteeNetMinor: event.target.value })
              }
            />
          </label>
        ) : null}
        {share ? (
          <>
            <label>
              Location-Anteil %
              <input
                inputMode="decimal"
                value={(component.locationShareBasisPoints ?? 0) / 100}
                onChange={(event) => {
                  const location = percentToBasis(event.target.value);
                  onChange({
                    ...component,
                    locationShareBasisPoints: location,
                    counterpartyShareBasisPoints: 10_000 - location,
                  });
                }}
              />
            </label>
            <label>
              Gegenpartei-Anteil %
              <input disabled value={(component.counterpartyShareBasisPoints ?? 0) / 100} />
            </label>
          </>
        ) : null}
        <label>
          Umsatzsteuer %
          <input
            inputMode="decimal"
            value={component.taxRateBasisPoints / 100}
            onChange={(event) =>
              onChange({
                ...component,
                taxRateBasisPoints: percentToBasis(event.target.value, 100_000),
              })
            }
          />
        </label>
        {share ? (
          <label className="checkbox-row">
            <input
              checked={component.includeWkz}
              onChange={(event) => onChange({ ...component, includeWkz: event.target.checked })}
              type="checkbox"
            />
            WKZ bewusst in Teilungsbasis einbeziehen
          </label>
        ) : null}
      </div>
      <button className="text-button text-button--danger" onClick={onRemove} type="button">
        Baustein entfernen
      </button>
    </div>
  );
}

function ServiceEditor({
  position,
  services,
  onChange,
  onRemove,
}: {
  position: ServiceForm;
  services: Service[];
  onChange: (value: ServiceForm) => void;
  onRemove: () => void;
}) {
  return (
    <div className="deal-form-row">
      <div className="form-grid">
        <label>
          Leistung
          <select
            value={position.sourceServiceId ?? ''}
            onChange={(event) => {
              const service = services.find((item) => item.id === event.target.value);
              if (service) onChange({ ...newService(service), key: position.key });
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
            inputMode="decimal"
            value={position.quantity}
            onChange={(event) => onChange({ ...position, quantity: event.target.value })}
          />
        </label>
        <label>
          Verkauf netto €
          <input
            inputMode="decimal"
            value={position.salesUnitPriceNetMinor ?? ''}
            onChange={(event) =>
              onChange({ ...position, salesUnitPriceNetMinor: event.target.value })
            }
          />
        </label>
        <label>
          Interne Kosten netto €
          <input
            inputMode="decimal"
            value={position.internalUnitCostNetMinor ?? ''}
            onChange={(event) =>
              onChange({ ...position, internalUnitCostNetMinor: event.target.value })
            }
          />
        </label>
        <label>
          Abrechnung
          <select
            value={position.billingMode}
            onChange={(event) =>
              onChange({
                ...position,
                billingMode: event.target.value as ServiceForm['billingMode'],
                discount: event.target.value === 'INCLUDED' ? undefined : position.discount,
              })
            }
          >
            <option value="SEPARATELY_BILLABLE">Separat abrechenbar</option>
            <option value="INCLUDED">Im Deal enthalten</option>
          </select>
        </label>
        <label>
          Umsatzsteuer %
          <input
            inputMode="decimal"
            value={position.taxRateBasisPoints / 100}
            onChange={(event) =>
              onChange({
                ...position,
                taxRateBasisPoints: percentToBasis(event.target.value, 100_000),
              })
            }
          />
        </label>
      </div>
      {position.billingMode === 'SEPARATELY_BILLABLE' ? (
        <DiscountEditor
          {...(position.discount ? { discount: position.discount } : {})}
          label="Positionsrabatt"
          onChange={(discount) => onChange({ ...position, discount })}
        />
      ) : null}
      <button className="text-button text-button--danger" onClick={onRemove} type="button">
        Leistung entfernen
      </button>
    </div>
  );
}

function DiscountEditor({
  discount,
  onChange,
  label = 'Rabatt',
}: {
  discount?: DiscountForm | undefined;
  onChange: (value: DiscountForm | undefined) => void;
  label?: string;
}) {
  return (
    <div className="deal-discount-row">
      <label>
        {label}
        <select
          value={discount?.type ?? ''}
          onChange={(event) => {
            const type = event.target.value as 'FIXED' | 'PERCENTAGE' | '';
            onChange(
              type
                ? {
                    type,
                    fixedMinor: type === 'FIXED' ? '0' : null,
                    percentageBasisPoints: type === 'PERCENTAGE' ? 0 : null,
                  }
                : undefined,
            );
          }}
        >
          <option value="">Kein Rabatt</option>
          <option value="FIXED">Fester EUR-Betrag</option>
          <option value="PERCENTAGE">Prozent</option>
        </select>
      </label>
      {discount?.type === 'FIXED' ? (
        <label>
          Betrag €
          <input
            inputMode="decimal"
            value={discount.fixedMinor ?? ''}
            onChange={(event) => onChange({ ...discount, fixedMinor: event.target.value })}
          />
        </label>
      ) : null}
      {discount?.type === 'PERCENTAGE' ? (
        <label>
          Prozent
          <input
            inputMode="decimal"
            value={(discount.percentageBasisPoints ?? 0) / 100}
            onChange={(event) =>
              onChange({ ...discount, percentageBasisPoints: percentToBasis(event.target.value) })
            }
          />
        </label>
      ) : null}
    </div>
  );
}

function TemplateApplication({
  open,
  onClose,
  onSaved,
  organizationId,
  deal,
  templates,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (deal: Deal) => void;
  organizationId: string;
  deal: Deal;
  templates: Template[];
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [preview, setPreview] = useState<components['schemas']['DealTemplatePreviewDto']>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const loadPreview = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await createBrowserApiClient().POST(
        '/api/v1/organizations/{organizationId}/deals/{dealId}/template-preview',
        {
          params: { path: { organizationId, dealId: deal.id } },
          body: { templateId, version: deal.version, confirmReplacement: false },
        },
      );
      setPreview(requireData(result));
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Die Vorschau konnte nicht geladen werden.'));
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await createBrowserApiClient().POST(
        '/api/v1/organizations/{organizationId}/deals/{dealId}/apply-template',
        {
          params: { path: { organizationId, dealId: deal.id } },
          body: { templateId, version: deal.version, confirmReplacement: true },
        },
      );
      onSaved(requireData(result));
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Die Vorlage konnte nicht übernommen werden.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog onClose={onClose} open={open} title="Dealvorlage übernehmen">
      <div className="deal-form">
        <label>
          Vorlage
          <select
            value={templateId}
            onChange={(event) => {
              setTemplateId(event.target.value);
              setPreview(undefined);
            }}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        {preview ? (
          <div className="compact-notice compact-notice--warning">
            <strong>{preview.name}</strong>
            <br />
            {preview.replacementMessage}
            <br />
            {preview.components.length} Bausteine · {preview.servicePositions.length} Leistungen
          </div>
        ) : null}
        {message ? <FormMessage message={message} /> : null}
        <div className="button-row">
          {!preview ? (
            <button
              className="button"
              disabled={busy || !templateId}
              onClick={() => void loadPreview()}
              type="button"
            >
              Vorschau anzeigen
            </button>
          ) : (
            <button className="button" disabled={busy} onClick={() => void apply()} type="button">
              Vollständigen Ersatz bestätigen
            </button>
          )}
          <button className="button button--quiet" disabled={busy} onClick={onClose} type="button">
            Abbrechen
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function DealList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="deal-read-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="deal-editor-section">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}
function Result({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'deal-result deal-result--strong' : 'deal-result'}>
      <dt>{label}</dt>
      <dd>{money(value)}</dd>
    </div>
  );
}
function ServiceRows({ positions }: { positions: Deal['servicePositions'] }) {
  return positions.length ? (
    positions.map((position) => (
      <div className="deal-read-row" key={position.id}>
        <span>
          <strong>{position.name}</strong>
          <small>
            {position.quantity} · {unitLabel(position.unit)}
          </small>
        </span>
        <span>
          {position.billingMode === 'INCLUDED'
            ? 'enthalten'
            : money(multiplyMinor(position.salesUnitPriceNetMinor, position.quantity))}
        </span>
      </div>
    ))
  ) : (
    <p className="compact-empty">Keine Positionen.</p>
  );
}

function newComponent(type: DealComponentInput['type']): ComponentForm {
  return {
    key: crypto.randomUUID(),
    type,
    label:
      type === 'FIXED_RENT'
        ? 'Feste Miete'
        : type === 'REVENUE_SHARE'
          ? 'Umsatzbeteiligung'
          : 'Mindestgarantie mit Umsatzbeteiligung',
    amountNetMinor: type === 'FIXED_RENT' ? '0' : null,
    minimumGuaranteeNetMinor: type === 'MINIMUM_GUARANTEE_SHARE' ? '0' : null,
    taxRateBasisPoints: 1_900,
    locationShareBasisPoints: type === 'FIXED_RENT' ? null : 5_000,
    counterpartyShareBasisPoints: type === 'FIXED_RENT' ? null : 5_000,
    includeWkz: false,
  };
}
function newService(service: Service): ServiceForm {
  return {
    key: crypto.randomUUID(),
    sourceServiceId: service.id,
    name: service.name,
    unit: service.unit,
    quantity: '1',
    salesUnitPriceNetMinor: euros(service.defaultSalesPriceMinor ?? '0'),
    internalUnitCostNetMinor: euros(service.preferredProvider?.purchasePriceMinor ?? '0'),
    taxRateBasisPoints: 1_900,
    billingMode: 'SEPARATELY_BILLABLE',
    discount: undefined,
  };
}
function componentPayload(item: ComponentForm): DealComponentInput {
  return {
    type: item.type,
    label: item.label,
    amountNetMinor: minor(item.amountNetMinor),
    minimumGuaranteeNetMinor: minor(item.minimumGuaranteeNetMinor),
    taxRateBasisPoints: item.taxRateBasisPoints,
    locationShareBasisPoints: item.locationShareBasisPoints,
    counterpartyShareBasisPoints: item.counterpartyShareBasisPoints,
    includeWkz: item.includeWkz,
  };
}
function servicePayload(item: ServiceForm): DealServiceInput {
  const discount = discountPayload(item.discount);
  return {
    sourceServiceId: item.sourceServiceId,
    name: item.name,
    unit: item.unit,
    quantity: item.quantity.replace(',', '.'),
    salesUnitPriceNetMinor: minor(item.salesUnitPriceNetMinor) ?? '0',
    internalUnitCostNetMinor: minor(item.internalUnitCostNetMinor) ?? '0',
    taxRateBasisPoints: item.taxRateBasisPoints,
    billingMode: item.billingMode,
    ...(discount ? { discount } : {}),
  };
}
function discountPayload(
  value?: DiscountForm,
): components['schemas']['DealDiscountInputDto'] | undefined {
  return value
    ? {
        type: value.type,
        fixedMinor: minor(value.fixedMinor),
        percentageBasisPoints: value.percentageBasisPoints,
      }
    : undefined;
}
function minor(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = value.replace(',', '.');
  const [whole = '0', fraction = ''] = normalized.split('.');
  return (
    BigInt(whole || '0') * 100n +
    BigInt(fraction.padEnd(2, '0').slice(0, 2) || '0')
  ).toString();
}
function euros(value: string | null | undefined): string {
  if (!value) return '';
  const amount = BigInt(value);
  return `${amount / 100n},${(amount % 100n).toString().padStart(2, '0')}`;
}
function percentToBasis(value: string, maximum = 10_000): number {
  const parsed = Math.round(Number(value.replace(',', '.')) * 100);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(maximum, parsed)) : 0;
}
function money(value: string) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    Number(BigInt(value)) / 100,
  );
}
function multiplyMinor(value: string, quantity: string) {
  return (BigInt(value) * BigInt(Math.round(Number(quantity) * 1_000)) + 500n) / 1_000n + '';
}
function contactLabel(contact: {
  firstName?: string | null;
  lastName?: string | null;
  label?: string | null;
}) {
  return (
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
    contact.label ||
    'Ansprechpartner'
  );
}
function statusLabel(status: Deal['status']) {
  return {
    ENTWURF: 'Entwurf',
    IN_VERHANDLUNG: 'In Verhandlung',
    VEREINBART: 'Vereinbart',
    STORNIERT: 'Storniert',
  }[status];
}
function allowedStatuses(status: Deal['status']): Deal['status'][] {
  const values: Record<Deal['status'], Deal['status'][]> = {
    ENTWURF: ['IN_VERHANDLUNG', 'STORNIERT'],
    IN_VERHANDLUNG: ['ENTWURF', 'VEREINBART', 'STORNIERT'],
    VEREINBART: ['STORNIERT'],
    STORNIERT: [],
  };
  return values[status];
}
function componentRuleLabel(rule: Deal['summary']['components'][number]['appliedRule']) {
  return {
    FIXED_RENT: 'Feste Miete',
    REVENUE_SHARE: 'Berechneter Beteiligungsanteil',
    MINIMUM_GUARANTEE: 'Mindestgarantie greift',
    CALCULATED_SHARE: 'Beteiligungsanteil über Mindestgarantie',
  }[rule];
}
function unitLabel(unit: Deal['servicePositions'][number]['unit']) {
  return {
    PIECE: 'Stück',
    HOUR: 'Stunde',
    DAY: 'Tag',
    PERSON: 'Person',
    FLAT_RATE: 'Pauschale',
    PER_GUEST: 'pro Gast',
    PER_TICKET: 'pro Ticket',
  }[unit];
}
function requireData<T>(result: { data?: T }): T {
  if (result.data === undefined)
    throw (result as { error?: unknown }).error ?? new Error('Anfrage fehlgeschlagen');
  return result.data;
}
