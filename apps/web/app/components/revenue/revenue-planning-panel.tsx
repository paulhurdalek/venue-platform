'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';

import {
  formatMinorAmount,
  majorAmountToMinor,
  minorAmountToInput,
} from '../../../src/booking-utils';
import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import {
  ticketingBreakdownText,
  ticketProviderSummary,
  ticketTaxMinor,
} from '../../../src/revenue/ticketing-breakdown';
import { FormMessage } from '../form-message';
import { ActionMenu } from '../ui/action-menu';
import { Dialog } from '../ui/dialog';

type RevenuePlan = components['schemas']['RevenuePlanDto'];
type Tier = components['schemas']['TicketPriceTierDto'];
type Component = components['schemas']['TicketPriceComponentDto'];
type AdditionalRevenue = components['schemas']['AdditionalRevenueDto'];
type Artist = components['schemas']['ArtistDto'];
type Partner = components['schemas']['BusinessPartnerDto'];
type AllocationInput = components['schemas']['RevenueAllocationInputDto'];
type TaxRateTemplate = components['schemas']['TaxRateTemplateDto'];
type TicketProviderTemplate = components['schemas']['TicketProviderTemplateDto'];
type CalculationTemplate = components['schemas']['CalculationTemplateDto'];
type CalculationTemplatePreview = components['schemas']['CalculationTemplatePreviewDto'];
type InvalidTemplateRecipient = {
  allocationId: string;
  componentName: string;
  recipientName: string;
};

type Editor =
  | { kind: 'tier'; value?: Tier }
  | { kind: 'component'; tierId: string; value?: Component }
  | { kind: 'additional'; value?: AdditionalRevenue };

type AllocationDraft = {
  recipientType: AllocationInput['recipientType'];
  recipientId: string;
  externalName: string;
  allocationType: AllocationInput['allocationType'];
  value: string;
};

export function RevenueWorkspace({
  organizationId,
  plan,
  artists,
  partners,
  canWrite,
  taxRates,
  providerTemplates,
  calculationTemplates,
  eventDate,
  locationName,
  children,
}: {
  organizationId: string;
  plan: RevenuePlan;
  artists: Artist[];
  partners: Partner[];
  canWrite: boolean;
  taxRates: TaxRateTemplate[];
  providerTemplates: TicketProviderTemplate[];
  calculationTemplates: CalculationTemplate[];
  eventDate: string;
  locationName: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor>();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [templateMode, setTemplateMode] = useState<'apply' | 'save'>();
  const [ticketingBreakdownOpen, setTicketingBreakdownOpen] = useState(false);
  const activeTiers = plan.ticketTiers.filter((tier) => tier.status === 'ACTIVE');
  const activeAdditional = plan.additionalRevenues.filter((revenue) => revenue.status === 'ACTIVE');
  const totals = plan.totals;

  async function updateExpectedGuests(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get('expectedGuestCount') ?? '').trim();
    setPending(true);
    setMessage(undefined);
    const result = await createBrowserApiClient().PATCH(
      '/api/v1/organizations/{organizationId}/events/{eventId}/revenue-plan/expected-guests',
      {
        credentials: 'include',
        params: { path: { organizationId, eventId: plan.eventId } },
        body: { eventVersion: plan.eventVersion, expectedGuestCount: raw ? Number(raw) : null },
      },
    );
    if (!result.data || result.error) {
      setMessage(
        apiErrorMessage(result.error, 'Die erwartete Gästezahl konnte nicht gespeichert werden.'),
      );
    } else {
      setMessage('Erwartete Gästezahl gespeichert.');
      router.refresh();
    }
    setPending(false);
  }

  async function setStatus(
    kind: 'tier' | 'component' | 'additional',
    id: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    if (status === 'ARCHIVED' && !window.confirm('Diesen Eintrag archivieren?')) return;
    setPending(true);
    setMessage(undefined);
    const client = createBrowserApiClient();
    const result =
      kind === 'tier'
        ? await client.PATCH(
            '/api/v1/organizations/{organizationId}/ticket-price-tiers/{tierId}/status',
            {
              credentials: 'include',
              params: { path: { organizationId, tierId: id } },
              body: { version, status },
            },
          )
        : kind === 'component'
          ? await client.PATCH(
              '/api/v1/organizations/{organizationId}/ticket-price-components/{componentId}/status',
              {
                credentials: 'include',
                params: { path: { organizationId, componentId: id } },
                body: { version, status },
              },
            )
          : await client.PATCH(
              '/api/v1/organizations/{organizationId}/additional-revenues/{revenueId}/status',
              {
                credentials: 'include',
                params: { path: { organizationId, revenueId: id } },
                body: { version, status },
              },
            );
    if (!result.data || result.error) {
      setMessage(apiErrorMessage(result.error, 'Der Status konnte nicht geändert werden.'));
    } else {
      setMessage(status === 'ARCHIVED' ? 'Eintrag archiviert.' : 'Eintrag reaktiviert.');
      router.refresh();
    }
    setPending(false);
  }

  async function move(
    kind: 'tier' | 'component' | 'additional',
    id: string,
    version: number,
    direction: 'UP' | 'DOWN',
  ) {
    setPending(true);
    setMessage(undefined);
    const client = createBrowserApiClient();
    const result =
      kind === 'tier'
        ? await client.PATCH(
            '/api/v1/organizations/{organizationId}/ticket-price-tiers/{tierId}/order',
            {
              credentials: 'include',
              params: { path: { organizationId, tierId: id } },
              body: { version, direction },
            },
          )
        : kind === 'component'
          ? await client.PATCH(
              '/api/v1/organizations/{organizationId}/ticket-price-components/{componentId}/order',
              {
                credentials: 'include',
                params: { path: { organizationId, componentId: id } },
                body: { version, direction },
              },
            )
          : await client.PATCH(
              '/api/v1/organizations/{organizationId}/additional-revenues/{revenueId}/order',
              {
                credentials: 'include',
                params: { path: { organizationId, revenueId: id } },
                body: { version, direction },
              },
            );
    if (!result.data || result.error)
      setMessage(apiErrorMessage(result.error, 'Die Reihenfolge konnte nicht geändert werden.'));
    else {
      setMessage('Reihenfolge gespeichert.');
      router.refresh();
    }
    setPending(false);
  }

  return (
    <section className="revenue-workspace" aria-labelledby="revenue-workspace-title">
      <h2 className="sr-only" id="revenue-workspace-title">
        Erlösplanung und Ticketpreise
      </h2>
      {canWrite ? (
        <div className="button-row revenue-template-actions">
          <button
            className="button button--secondary button--small"
            onClick={() => setTemplateMode('apply')}
            type="button"
          >
            Kalkulationsvorlage übernehmen
          </button>
          <button
            className="button button--quiet button--small"
            onClick={() => setTemplateMode('save')}
            type="button"
          >
            Als Kalkulationsvorlage speichern
          </button>
        </div>
      ) : null}
      <div className="revenue-summary-strip" aria-label="Kompakte Ergebnisübersicht">
        <span className={`status-badge status-badge--${plan.calculationStatus.toLowerCase()}`}>
          Kalkulation: {calculationStatusLabel(plan.calculationStatus)}
        </span>
        <SummaryValue
          label="Ticketumsatz Endkunden brutto"
          value={totals.ticketEndCustomerGrossMinor}
        />
        <SummaryValue label="Eigener Ticket-Erlös netto" value={totals.ownTicketRevenueNetMinor} />
        <SummaryValue label="Weitere Erlöse netto" value={totals.additionalRevenueNetMinor} />
        <SummaryValue label="Phase-7-Kosten netto" value={totals.phase7PlannedCostNetMinor} />
        <SummaryValue
          label="Operatives Ergebnis netto"
          value={totals.operatingResultNetMinor}
          result
        />
      </div>
      <FormMessage
        message={message}
        success={
          message?.includes('gespeichert') ||
          message?.includes('archiviert') ||
          message?.includes('reaktiviert')
        }
      />
      {totals.approvalBlockers.length ? (
        <div className="compact-notice compact-notice--warning" role="status">
          <strong>Freigabe noch gesperrt</strong>
          <ul>
            {totals.approvalBlockers.map((blocker) => (
              <li key={`${blocker.code}:${blocker.targetId}`}>{blocker.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="revenue-primary-grid">
        <div className="revenue-section" aria-labelledby="costs-title">
          <h3 id="costs-title">Kosten</h3>
          <p className="field-hint">{totals.costBasisLabel}</p>
          {children}
        </div>

        <div className="revenue-section" aria-labelledby="tickets-title">
          <div className="section-heading section-heading--compact">
            <div>
              <h3 id="tickets-title">Tickets &amp; Erlöse</h3>
              <p className="field-hint">
                {totals.expectedTickets} Tickets erwartet · {totals.expectedPayingTickets} zahlend
              </p>
            </div>
            <div className="button-row">
              <button
                className="button button--secondary button--small"
                onClick={() => setTicketingBreakdownOpen(true)}
                type="button"
              >
                Ticketing-Aufschlüsselung erstellen
              </button>
              {canWrite ? (
                <button
                  className="button button--small"
                  onClick={() => setEditor({ kind: 'tier' })}
                  type="button"
                >
                  Ticketstufe hinzufügen
                </button>
              ) : null}
            </div>
          </div>
          <form className="expected-guests-form" onSubmit={updateExpectedGuests}>
            <label>
              Erwartete Gästezahl
              <input
                defaultValue={plan.expectedGuestCount ?? ''}
                disabled={!canWrite || pending}
                inputMode="numeric"
                min={0}
                name="expectedGuestCount"
                placeholder="Noch offen"
                step={1}
                type="number"
              />
            </label>
            {canWrite ? (
              <button className="button button--small" disabled={pending}>
                Speichern
              </button>
            ) : null}
            <span className="field-hint">
              Planwert, nicht Location-Kapazität oder Ist-Besucherzahl.
            </span>
          </form>
          {activeTiers.length ? (
            <div
              aria-label="Ticketpreis-Stufen, horizontal scrollbare Tabelle"
              className="revenue-table-wrap"
              role="region"
              tabIndex={0}
            >
              <table className="revenue-table">
                <thead>
                  <tr>
                    <th>Ticketstufe</th>
                    <th className="numeric">Menge</th>
                    <th className="numeric">Grundpreis netto</th>
                    <th className="numeric">Grundpreis brutto</th>
                    <th className="numeric">Endkundenpreis</th>
                    <th className="numeric">Gesamt brutto</th>
                    <th>
                      <span className="sr-only">Aktionen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeTiers.map((tier, tierIndex) => (
                    <TicketTierRows
                      canWrite={canWrite}
                      key={tier.id}
                      onAddComponent={() => setEditor({ kind: 'component', tierId: tier.id })}
                      onArchive={() => void setStatus('tier', tier.id, tier.version, 'ARCHIVED')}
                      onEdit={() => setEditor({ kind: 'tier', value: tier })}
                      onMove={(direction) => void move('tier', tier.id, tier.version, direction)}
                      canMoveDown={tierIndex < activeTiers.length - 1}
                      canMoveUp={tierIndex > 0}
                      onEditComponent={(component) =>
                        setEditor({ kind: 'component', tierId: tier.id, value: component })
                      }
                      onArchiveComponent={(component) =>
                        void setStatus('component', component.id, component.version, 'ARCHIVED')
                      }
                      onMoveComponent={(component, direction) =>
                        void move('component', component.id, component.version, direction)
                      }
                      tier={tier}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="compact-empty">Noch keine Ticketpreis-Stufen geplant.</p>
          )}
        </div>
      </div>

      <details className="revenue-section revenue-subsection" aria-labelledby="additional-title">
        <summary>
          <div>
            <strong id="additional-title">Weitere Erlöse</strong>
            <p className="field-hint">Ohne Ticketgrundpreise und Ticket-Preisbestandteile.</p>
          </div>
          <span>{activeAdditional.length} Positionen</span>
        </summary>
        <div className="revenue-subsection__body">
          <div className="section-heading section-heading--compact">
            <span className="field-hint">Geplante und bestätigte zusätzliche Erlöse</span>
            {canWrite ? (
              <button
                className="button button--small"
                onClick={() => setEditor({ kind: 'additional' })}
                type="button"
              >
                Erlös hinzufügen
              </button>
            ) : null}
          </div>
          {activeAdditional.length ? (
            <div
              aria-label="Weitere Erlöse, horizontal scrollbare Tabelle"
              className="revenue-table-wrap"
              role="region"
              tabIndex={0}
            >
              <table className="revenue-table">
                <thead>
                  <tr>
                    <th>Bezeichnung</th>
                    <th>Berechnung</th>
                    <th>Status</th>
                    <th className="numeric">Netto</th>
                    <th className="numeric">Brutto</th>
                    <th>
                      <span className="sr-only">Aktionen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeAdditional.map((revenue, revenueIndex) => (
                    <tr key={revenue.id}>
                      <td>
                        <strong>{revenue.name}</strong>
                        {revenue.note ? <span className="table-note">{revenue.note}</span> : null}
                      </td>
                      <td>
                        {additionalTypeLabel(revenue.calculationType)}
                        {revenue.resolvedQuantity !== null ? ` · ${revenue.resolvedQuantity}` : ''}
                      </td>
                      <td>
                        {revenue.confirmationStatus === 'CONFIRMED' ? 'Bestätigt' : 'Geplant'}
                      </td>
                      <td className="numeric">{money(revenue.totalNetMinor)}</td>
                      <td className="numeric">{money(revenue.totalGrossMinor)}</td>
                      <td>
                        {canWrite ? (
                          <ActionMenu
                            compact
                            label={`Aktionen für ${revenue.name}`}
                            items={[
                              ...(revenueIndex > 0
                                ? [
                                    {
                                      id: 'up',
                                      label: 'Nach oben',
                                      onSelect: () =>
                                        void move(
                                          'additional',
                                          revenue.id,
                                          revenue.version,
                                          'UP' as const,
                                        ),
                                    },
                                  ]
                                : []),
                              ...(revenueIndex < activeAdditional.length - 1
                                ? [
                                    {
                                      id: 'down',
                                      label: 'Nach unten',
                                      onSelect: () =>
                                        void move(
                                          'additional',
                                          revenue.id,
                                          revenue.version,
                                          'DOWN' as const,
                                        ),
                                    },
                                  ]
                                : []),
                              {
                                id: 'edit',
                                label: 'Bearbeiten',
                                onSelect: () => setEditor({ kind: 'additional', value: revenue }),
                              },
                              {
                                id: 'archive',
                                label: 'Archivieren',
                                danger: true,
                                onSelect: () =>
                                  void setStatus(
                                    'additional',
                                    revenue.id,
                                    revenue.version,
                                    'ARCHIVED',
                                  ),
                              },
                            ]}
                          />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="compact-empty">Noch keine weiteren Erlöse geplant.</p>
          )}
        </div>
      </details>

      <div className="revenue-section" aria-labelledby="result-title">
        <h3 id="result-title">Ergebnis</h3>
        <div className="revenue-result-grid">
          <ResultValue label="Ticketgrundumsatz netto" value={totals.ticketBaseNetMinor} />
          <ResultValue
            label="Eigene Ticket-Erlösanteile netto"
            value={totals.ownTicketRevenueNetMinor}
          />
          <ResultValue
            label="Artist-/Partner-Anteile brutto"
            value={totals.artistPartnerShareGrossMinor}
          />
          <ResultValue
            label="Externe Durchlaufposten brutto"
            value={totals.externalPassThroughGrossMinor}
          />
          <ResultValue label="Weitere Erlöse netto" value={totals.additionalRevenueNetMinor} />
          <ResultValue label="Geplante Kosten netto" value={totals.phase7PlannedCostNetMinor} />
          <ResultValue
            label="Operatives Ergebnis netto"
            value={totals.operatingResultNetMinor}
            strong
          />
        </div>
        <details className="revenue-derivation">
          <summary>Herleitung und Abgrenzung anzeigen</summary>
          <p>
            Das operative Ergebnis enthält Ticketgrundumsatz netto, ausschließlich die der eigenen
            Organisation zugeordneten Preisbestandteil-Anteile und weitere Erlöse netto, abzüglich
            der unveränderten Phase-7-Kostenbasis. Artist-/Partner-Anteile und externe
            Durchlaufposten sind sichtbar, aber keine Club-Marge.
          </p>
        </details>
      </div>

      <Dialog
        eyebrow="Erlösplanung"
        onClose={() => setEditor(undefined)}
        open={Boolean(editor)}
        size={editor?.kind === 'component' ? 'wide' : 'default'}
        title={editorTitle(editor)}
      >
        {editor?.kind === 'tier' ? (
          <TierForm
            providerTemplates={providerTemplates}
            taxRates={taxRates}
            organizationId={organizationId}
            plan={plan}
            tier={editor.value}
            onDone={(nextMessage) => {
              setEditor(undefined);
              setMessage(nextMessage);
              router.refresh();
            }}
          />
        ) : null}
        {editor?.kind === 'component' ? (
          <ComponentForm
            artists={artists}
            component={editor.value}
            organizationId={organizationId}
            partners={partners}
            taxRates={taxRates}
            tierId={editor.tierId}
            onDone={(nextMessage) => {
              setEditor(undefined);
              setMessage(nextMessage);
              router.refresh();
            }}
          />
        ) : null}
        {editor?.kind === 'additional' ? (
          <AdditionalRevenueForm
            organizationId={organizationId}
            plan={plan}
            revenue={editor.value}
            taxRates={taxRates}
            onDone={(nextMessage) => {
              setEditor(undefined);
              setMessage(nextMessage);
              router.refresh();
            }}
          />
        ) : null}
      </Dialog>
      <Dialog
        eyebrow="Ticketing-Übergabe"
        onClose={() => setTicketingBreakdownOpen(false)}
        open={ticketingBreakdownOpen}
        size="wide"
        title="Ticketing-Aufschlüsselung"
      >
        <TicketingBreakdown eventDate={eventDate} locationName={locationName} plan={plan} />
      </Dialog>
      <Dialog
        eyebrow="Kalkulationsvorlagen"
        onClose={() => setTemplateMode(undefined)}
        open={Boolean(templateMode)}
        title={
          templateMode === 'save'
            ? 'Event-Kalkulation als Vorlage speichern'
            : 'Kalkulationsvorlage übernehmen'
        }
      >
        {templateMode === 'apply' ? (
          <ApplyCalculationTemplateForm
            calculationTemplates={calculationTemplates}
            organizationId={organizationId}
            plan={plan}
            onDone={(nextMessage) => {
              setTemplateMode(undefined);
              setMessage(nextMessage);
              router.refresh();
            }}
          />
        ) : null}
        {templateMode === 'save' ? (
          <SaveCalculationTemplateForm
            organizationId={organizationId}
            plan={plan}
            onDone={(nextMessage) => {
              setTemplateMode(undefined);
              setMessage(nextMessage);
              router.refresh();
            }}
          />
        ) : null}
      </Dialog>
    </section>
  );
}

function TicketTierRows({
  tier,
  canWrite,
  onEdit,
  onArchive,
  onAddComponent,
  onEditComponent,
  onArchiveComponent,
  onMove,
  onMoveComponent,
  canMoveUp,
  canMoveDown,
}: {
  tier: Tier;
  canWrite: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onAddComponent: () => void;
  onEditComponent: (component: Component) => void;
  onArchiveComponent: (component: Component) => void;
  onMove: (direction: 'UP' | 'DOWN') => void;
  onMoveComponent: (component: Component, direction: 'UP' | 'DOWN') => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const activeComponents = tier.components.filter((component) => component.status === 'ACTIVE');
  return (
    <>
      <tr>
        <td>
          <strong>{tier.name}</strong>
          {tier.baseTaxRateBasisPoints != null ? (
            <span className="table-note">
              USt. {formatBasisPoints(tier.baseTaxRateBasisPoints)}
            </span>
          ) : (
            <span className="table-note table-note--warning">Preis fehlt</span>
          )}
        </td>
        <td className="numeric">{tier.expectedQuantity}</td>
        <td className="numeric">{money(tier.baseNetUnitMinor)}</td>
        <td className="numeric">{money(tier.baseGrossUnitMinor)}</td>
        <td className="numeric">
          <strong>{money(tier.endCustomerUnitGrossMinor)}</strong>
        </td>
        <td className="numeric">{money(tier.totalEndCustomerGrossMinor)}</td>
        <td>
          {canWrite ? (
            <ActionMenu
              compact
              label={`Aktionen für ${tier.name}`}
              items={[
                ...(canMoveUp
                  ? [{ id: 'up', label: 'Nach oben', onSelect: () => onMove('UP' as const) }]
                  : []),
                ...(canMoveDown
                  ? [{ id: 'down', label: 'Nach unten', onSelect: () => onMove('DOWN' as const) }]
                  : []),
                { id: 'edit', label: 'Bearbeiten', onSelect: onEdit },
                {
                  id: 'component',
                  label: 'Preisstruktur-Position hinzufügen',
                  onSelect: onAddComponent,
                },
                { id: 'archive', label: 'Archivieren', danger: true, onSelect: onArchive },
              ]}
            />
          ) : null}
        </td>
      </tr>
      <tr className="revenue-detail-row">
        <td colSpan={7}>
          <details>
            <summary>
              {activeComponents.length} Preisstruktur-Positionen und Empfänger-Aufteilungen
            </summary>
            {activeComponents.length ? (
              <div className="component-list">
                {activeComponents.map((component, componentIndex) => (
                  <div className="component-row" key={component.id}>
                    <div>
                      <strong>{component.name}</strong>
                      <span>
                        {component.amountType === 'PERCENTAGE'
                          ? `${formatBasisPoints(component.percentageRateBasisPoints ?? 0)} vom Ticketgrundpreis brutto`
                          : 'Fester Betrag'}{' '}
                        · USt. {formatBasisPoints(component.taxRateBasisPoints)} ·{' '}
                        {component.guestPays
                          ? 'Gast zahlt zusätzlich'
                          : 'nicht zusätzlich vom Gast getragen'}
                      </span>
                    </div>
                    <div className="numeric">
                      <strong>{money(component.grossUnitMinor)}</strong>
                      <span>brutto je Ticket</span>
                    </div>
                    <div>
                      {component.allocationComplete ? (
                        <span className="status-badge">Aufteilung vollständig</span>
                      ) : (
                        <span className="status-badge status-badge--warning">
                          Aufteilung unvollständig
                        </span>
                      )}
                    </div>
                    {canWrite ? (
                      <ActionMenu
                        compact
                        label={`Aktionen für ${component.name}`}
                        items={[
                          ...(componentIndex > 0
                            ? [
                                {
                                  id: 'up',
                                  label: 'Nach oben',
                                  onSelect: () => onMoveComponent(component, 'UP' as const),
                                },
                              ]
                            : []),
                          ...(componentIndex < activeComponents.length - 1
                            ? [
                                {
                                  id: 'down',
                                  label: 'Nach unten',
                                  onSelect: () => onMoveComponent(component, 'DOWN' as const),
                                },
                              ]
                            : []),
                          {
                            id: 'edit',
                            label: 'Bearbeiten',
                            onSelect: () => onEditComponent(component),
                          },
                          {
                            id: 'archive',
                            label: 'Archivieren',
                            danger: true,
                            onSelect: () => onArchiveComponent(component),
                          },
                        ]}
                      />
                    ) : null}
                    <ul>
                      {component.allocations.map((allocation) => (
                        <li key={allocation.id}>
                          {allocation.recipientName}: {money(allocation.resolvedGrossUnitMinor)}{' '}
                          brutto (
                          {allocation.recipientType === 'ORGANIZATION'
                            ? 'eigener Erlös'
                            : allocation.recipientType === 'EXTERNAL'
                              ? 'Durchlaufposten'
                              : 'Fremd-/Auszahlungsanteil'}
                          )
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="compact-empty">
                Keine Preisstruktur-Positionen. Der Endkundenpreis entspricht dem Ticketgrundpreis
                brutto.
              </p>
            )}
          </details>
        </td>
      </tr>
    </>
  );
}

function TicketingBreakdown({
  plan,
  eventDate,
  locationName,
}: {
  plan: RevenuePlan;
  eventDate: string;
  locationName: string;
}) {
  const [copyMessage, setCopyMessage] = useState<string>();
  const tiers = plan.ticketTiers.filter((tier) => tier.status === 'ACTIVE');
  const providerSummary = ticketProviderSummary(tiers);

  async function copyBreakdown() {
    try {
      await navigator.clipboard.writeText(ticketingBreakdownText(plan, eventDate, locationName));
      setCopyMessage('Aufschlüsselung kopiert.');
    } catch {
      setCopyMessage('Die Aufschlüsselung konnte nicht kopiert werden.');
    }
  }

  return (
    <div className="ticketing-breakdown">
      <div className="ticketing-breakdown__toolbar">
        <p className="field-hint">
          Gemeinsame Übergabeübersicht aller aktiven Ticketstufen dieser Veranstaltung.
        </p>
        <button className="button button--small" onClick={() => void copyBreakdown()} type="button">
          Als Text kopieren
        </button>
      </div>
      {copyMessage ? <p role="status">{copyMessage}</p> : null}
      <header className="ticketing-breakdown__event">
        <h3>{plan.eventName}</h3>
        <dl>
          <div>
            <dt>Datum</dt>
            <dd>{formatEventDate(eventDate)}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{locationName}</dd>
          </div>
          {providerSummary ? (
            <div>
              <dt>Ticketanbieter</dt>
              <dd>{providerSummary}</dd>
            </div>
          ) : null}
        </dl>
        <p className="ticketing-shipping-note">
          Versand separat beziehungsweise abhängig von der Versandart, sofern nicht im Ticketpreis
          enthalten.
        </p>
      </header>
      {tiers.length ? (
        <div className="ticketing-breakdown__tiers">
          {tiers.map((tier) => {
            const components = tier.components.filter((component) => component.status === 'ACTIVE');
            return (
              <section
                className="ticketing-tier"
                key={tier.id}
                aria-labelledby={`ticketing-${tier.id}`}
              >
                <header>
                  <h4 id={`ticketing-${tier.id}`}>{tier.name}</h4>
                  <span>{tier.expectedQuantity} Tickets</span>
                  {tier.sourceTicketProviderNameSnapshot ? (
                    <span>{tier.sourceTicketProviderNameSnapshot}</span>
                  ) : null}
                </header>
                <dl className="ticketing-price-lines">
                  <TicketingLine label="Grundpreis netto" value={tier.baseNetUnitMinor} />
                  <TicketingLine
                    label={`Umsatzsteuer ${formatBasisPoints(tier.baseTaxRateBasisPoints ?? 0)}`}
                    value={ticketTaxMinor(tier)}
                  />
                  <TicketingLine
                    emphasize
                    label="Grundpreis brutto"
                    value={tier.baseGrossUnitMinor}
                  />
                </dl>
                <div className="ticketing-price-structure">
                  <h5>Preisstruktur</h5>
                  {components.length ? (
                    <dl className="ticketing-price-lines">
                      {components.map((component) => (
                        <TicketingLine
                          {...(!component.guestPays
                            ? { hint: 'Nicht zusätzlich vom Gast getragen' }
                            : {})}
                          key={component.id}
                          label={component.name}
                          value={component.grossUnitMinor}
                        />
                      ))}
                    </dl>
                  ) : (
                    <p className="compact-empty">Keine zusätzlichen Preisstruktur-Positionen.</p>
                  )}
                </div>
                <dl className="ticketing-price-lines ticketing-price-lines--total">
                  <TicketingLine
                    emphasize
                    label="Ticketpreis für den Ticketanbieter"
                    value={tier.endCustomerUnitGrossMinor}
                  />
                </dl>
                <div className="ticketing-checkout-note">
                  <h5>Zusätzliche Checkout-Gebühren</h5>
                  <p>
                    Im Event nicht separat ausgewiesen; gegebenenfalls vom Ticketanbieter ergänzen.
                  </p>
                </div>
                <dl className="ticketing-price-lines ticketing-price-lines--guest-total">
                  <TicketingLine
                    emphasize
                    label="Vom Gast zu zahlen"
                    value={tier.endCustomerUnitGrossMinor}
                  />
                </dl>
                <p className="ticketing-shipping-note">zzgl. Versand, sofern zutreffend</p>
              </section>
            );
          })}
        </div>
      ) : (
        <p className="compact-empty">Keine aktiven Ticketstufen vorhanden.</p>
      )}
    </div>
  );
}

function TicketingLine({
  label,
  value,
  hint,
  emphasize = false,
}: {
  label: string;
  value: string | null | undefined;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div className={emphasize ? 'ticketing-price-line--emphasized' : undefined}>
      <dt>
        {label}
        {hint ? <small>{hint}</small> : null}
      </dt>
      <dd>{money(value)}</dd>
    </div>
  );
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function TierForm({
  organizationId,
  plan,
  tier,
  taxRates,
  providerTemplates,
  onDone,
}: {
  organizationId: string;
  plan: RevenuePlan;
  tier?: Tier | undefined;
  taxRates: TaxRateTemplate[];
  providerTemplates: TicketProviderTemplate[];
  onDone: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [addInitialComponent, setAddInitialComponent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const amount = majorAmountToMinor(String(form.get('basePrice') ?? ''), 'EUR');
      const baseTaxRateTemplateId = String(form.get('baseTaxRateTemplateId') ?? '').trim();
      const componentAmount = addInitialComponent
        ? majorAmountToMinor(String(form.get('componentAmount') ?? ''), 'EUR')
        : null;
      const body = {
        name: String(form.get('name') ?? '').trim(),
        expectedQuantity: Number(form.get('expectedQuantity')),
        baseInputType: amount === null ? null : (String(form.get('inputType')) as 'NET' | 'GROSS'),
        baseInputMinor: amount,
        baseTaxRateTemplateId: amount === null ? null : baseTaxRateTemplateId,
        sourceTicketProviderTemplateId: tier
          ? null
          : String(form.get('sourceTicketProviderTemplateId') ?? '').trim() || null,
        components:
          !tier && addInitialComponent
            ? [
                {
                  name: String(form.get('componentName') ?? '').trim(),
                  amountType: 'FIXED' as const,
                  percentageRateBasisPoints: null,
                  inputType: String(form.get('componentInputType')) as 'NET' | 'GROSS',
                  inputAmountMinor: componentAmount,
                  taxRateTemplateId: String(form.get('componentTaxRateTemplateId') ?? ''),
                  guestPays: true,
                  allocations: [
                    {
                      recipientType: 'ORGANIZATION' as const,
                      artistId: null,
                      businessPartnerId: null,
                      externalRecipientName: null,
                      allocationType: 'PERCENTAGE' as const,
                      percentageBasisPoints: 10_000,
                      fixedAmountMinor: null,
                    },
                  ],
                },
              ]
            : [],
      };
      const client = createBrowserApiClient();
      const result = tier
        ? await client.PATCH('/api/v1/organizations/{organizationId}/ticket-price-tiers/{tierId}', {
            credentials: 'include',
            params: { path: { organizationId, tierId: tier.id } },
            body: { ...body, version: tier.version },
          })
        : await client.POST(
            '/api/v1/organizations/{organizationId}/events/{eventId}/revenue-plan/ticket-tiers',
            {
              credentials: 'include',
              params: { path: { organizationId, eventId: plan.eventId } },
              body,
            },
          );
      if (!result.data || result.error)
        setMessage(
          apiErrorMessage(result.error, 'Die Ticketstufe konnte nicht gespeichert werden.'),
        );
      else onDone(tier ? 'Ticketstufe gespeichert.' : 'Ticketstufe angelegt.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Die Eingabe ist ungültig.');
    }
    setPending(false);
  }
  return (
    <form className="form-grid" onSubmit={submit}>
      <label>
        Bezeichnung
        <input
          aria-label="Bezeichnung der Ticketstufe"
          autoFocus
          defaultValue={tier?.name ?? ''}
          maxLength={160}
          name="name"
          required
        />
      </label>
      <label>
        Erwartete Menge
        <input
          defaultValue={tier?.expectedQuantity ?? 0}
          min={0}
          name="expectedQuantity"
          required
          step={1}
          type="number"
        />
      </label>
      <label>
        Eingabeart
        <select
          aria-label="Eingabeart für Ticketgrundpreis"
          defaultValue={tier?.baseInputType ?? 'GROSS'}
          name="inputType"
        >
          <option value="GROSS">Brutto</option>
          <option value="NET">Netto</option>
        </select>
      </label>
      <label>
        Ticketgrundpreis <span className="optional">leer = unvollständig</span>
        <div className="money-input">
          <input
            aria-label="Ticketgrundpreis €"
            defaultValue={minorAmountToInput(tier?.baseInputMinor, 'EUR')}
            inputMode="decimal"
            name="basePrice"
          />
          <span>€</span>
        </div>
      </label>
      <label>
        Steuersatzvorlage
        <select
          aria-label="Steuersatzvorlage für Ticketgrundpreis"
          defaultValue={tier?.baseTaxRateTemplateId ?? ''}
          name="baseTaxRateTemplateId"
        >
          <option value="">Steuersatz wählen</option>
          {taxRates.map((tax) => (
            <option key={tax.id} value={tax.id}>
              {tax.name}
            </option>
          ))}
        </select>
      </label>
      {!tier ? (
        <label>
          Ticketanbieter-Vorlage <span className="optional">optional</span>
          <select name="sourceTicketProviderTemplateId">
            <option value="">Keine Anbieter-Vorlage</option>
            {providerTemplates.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Die Preisstruktur wird als unabhängiger Snapshot kopiert.
          </span>
        </label>
      ) : null}
      {!tier ? (
        <fieldset className="form-span">
          <legend>Preisstruktur</legend>
          <label className="checkbox-row">
            <input
              checked={addInitialComponent}
              onChange={(event) => setAddInitialComponent(event.target.checked)}
              type="checkbox"
            />{' '}
            Erste Preisstruktur-Position direkt mit der Ticketstufe anlegen
          </label>
          {addInitialComponent ? (
            <div className="form-grid nested-grid">
              <label>
                Bezeichnung
                <input
                  aria-label="Bezeichnung der ersten Preisstruktur-Position"
                  maxLength={160}
                  name="componentName"
                  required
                />
              </label>
              <label>
                Betrag €
                <input aria-label="Betrag €" inputMode="decimal" name="componentAmount" required />
              </label>
              <label>
                Eingabeart
                <select
                  aria-label="Eingabeart der ersten Preisstruktur-Position"
                  defaultValue="GROSS"
                  name="componentInputType"
                >
                  <option value="GROSS">Brutto</option>
                  <option value="NET">Netto</option>
                </select>
              </label>
              <label>
                Steuersatzvorlage
                <select
                  aria-label="Steuersatzvorlage für erste Preisstruktur-Position"
                  name="componentTaxRateTemplateId"
                  required
                >
                  <option value="">Steuersatz wählen</option>
                  {taxRates.map((tax) => (
                    <option key={tax.id} value={tax.id}>
                      {tax.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="field-hint form-span">
                Die Erstposition wird vollständig dem Club zugeordnet und kann anschließend
                detailliert bearbeitet werden.
              </p>
            </div>
          ) : null}
        </fieldset>
      ) : null}
      <p className="field-hint form-span">
        Netto-/Brutto-Gegenwert und Endkundenpreis werden serverseitig berechnet.
      </p>
      <FormMessage message={message} />
      <div className="button-row form-span">
        <button className="button" disabled={pending}>
          {pending ? 'Speichern …' : 'Speichern'}
        </button>
      </div>
    </form>
  );
}

function ComponentForm({
  organizationId,
  tierId,
  component,
  artists,
  partners,
  taxRates,
  onDone,
}: {
  organizationId: string;
  tierId: string;
  component?: Component | undefined;
  artists: Artist[];
  partners: Partner[];
  taxRates: TaxRateTemplate[];
  onDone: (message: string) => void;
}) {
  const [amountType, setAmountType] = useState<'FIXED' | 'PERCENTAGE'>(
    component?.amountType ?? 'FIXED',
  );
  const [allocations, setAllocations] = useState<AllocationDraft[]>(() =>
    component
      ? component.allocations.map((allocation) => ({
          recipientType: allocation.recipientType as AllocationDraft['recipientType'],
          recipientId: allocation.recipientId ?? '',
          externalName: allocation.recipientType === 'EXTERNAL' ? allocation.recipientName : '',
          allocationType: allocation.allocationType as AllocationDraft['allocationType'],
          value:
            allocation.allocationType === 'FIXED'
              ? minorAmountToInput(allocation.fixedAmountMinor, 'EUR')
              : basisPointsInput(allocation.percentageBasisPoints ?? 0),
        }))
      : [
          {
            recipientType: 'ORGANIZATION',
            recipientId: '',
            externalName: '',
            allocationType: 'PERCENTAGE',
            value: '100',
          },
        ],
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  function updateAllocation(index: number, patch: Partial<AllocationDraft>) {
    setAllocations((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const body = {
        name: String(form.get('name') ?? '').trim(),
        amountType,
        percentageRateBasisPoints:
          amountType === 'PERCENTAGE'
            ? parseBasisPoints(String(form.get('percentage') ?? ''))
            : null,
        inputType: String(form.get('inputType')) as 'NET' | 'GROSS',
        inputAmountMinor:
          amountType === 'FIXED'
            ? majorAmountToMinor(String(form.get('amount') ?? ''), 'EUR')
            : null,
        taxRateTemplateId: String(form.get('taxRateTemplateId') ?? ''),
        guestPays: form.get('guestPays') === 'on',
        allocations: allocations.map((allocation) => ({
          recipientType: allocation.recipientType,
          artistId: allocation.recipientType === 'ARTIST' ? allocation.recipientId : null,
          businessPartnerId:
            allocation.recipientType === 'BUSINESS_PARTNER' ? allocation.recipientId : null,
          externalRecipientName:
            allocation.recipientType === 'EXTERNAL' ? allocation.externalName.trim() : null,
          allocationType: allocation.allocationType,
          percentageBasisPoints:
            allocation.allocationType === 'PERCENTAGE' ? parseBasisPoints(allocation.value) : null,
          fixedAmountMinor:
            allocation.allocationType === 'FIXED'
              ? majorAmountToMinor(allocation.value, 'EUR')
              : null,
        })),
      };
      const client = createBrowserApiClient();
      const result = component
        ? await client.PATCH(
            '/api/v1/organizations/{organizationId}/ticket-price-components/{componentId}',
            {
              credentials: 'include',
              params: { path: { organizationId, componentId: component.id } },
              body: { ...body, version: component.version },
            },
          )
        : await client.POST(
            '/api/v1/organizations/{organizationId}/ticket-price-tiers/{tierId}/components',
            { credentials: 'include', params: { path: { organizationId, tierId } }, body },
          );
      if (!result.data || result.error)
        setMessage(
          apiErrorMessage(
            result.error,
            'Die Preisstruktur-Position konnte nicht gespeichert werden.',
          ),
        );
      else
        onDone(
          component ? 'Preisstruktur-Position gespeichert.' : 'Preisstruktur-Position angelegt.',
        );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Die Eingabe ist ungültig.');
    }
    setPending(false);
  }
  return (
    <form className="form-grid" onSubmit={submit}>
      <label>
        Bezeichnung
        <input
          autoFocus
          defaultValue={component?.name ?? ''}
          maxLength={160}
          name="name"
          required
        />
      </label>
      <label>
        Berechnungsart
        <select
          onChange={(event) => setAmountType(event.target.value as typeof amountType)}
          value={amountType}
        >
          <option value="FIXED">Fester Betrag</option>
          <option value="PERCENTAGE">Prozentsatz</option>
        </select>
      </label>
      {amountType === 'FIXED' ? (
        <label>
          Betrag
          <div className="money-input">
            <input
              aria-label="Betrag €"
              defaultValue={minorAmountToInput(component?.inputAmountMinor, 'EUR')}
              inputMode="decimal"
              name="amount"
              required
            />
            <span>€</span>
          </div>
        </label>
      ) : (
        <label>
          Prozentsatz
          <div className="money-input">
            <input
              defaultValue={basisPointsInput(component?.percentageRateBasisPoints ?? 0)}
              inputMode="decimal"
              name="percentage"
              required
            />
            <span>%</span>
          </div>
          <span className="field-hint">Sichtbare Basis: Ticketgrundpreis brutto.</span>
        </label>
      )}
      <label>
        Eingabeart / Ergebnisart
        <select defaultValue={component?.inputType ?? 'GROSS'} name="inputType">
          <option value="GROSS">Brutto</option>
          <option value="NET">Netto</option>
        </select>
      </label>
      <label>
        Steuersatzvorlage
        <select
          aria-label="Steuersatzvorlage für Preisstruktur-Position"
          defaultValue={component?.taxRateTemplateId ?? ''}
          name="taxRateTemplateId"
          required
        >
          <option value="">Steuersatz wählen</option>
          {taxRates.map((tax) => (
            <option key={tax.id} value={tax.id}>
              {tax.name}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox-row form-span">
        <input defaultChecked={component?.guestPays ?? true} name="guestPays" type="checkbox" />{' '}
        Gast zahlt diesen Preisbestandteil zusätzlich
      </label>
      <fieldset className="form-span allocation-editor">
        <legend>Empfänger-Aufteilungen</legend>
        <p className="field-hint">
          Die aufgelösten Brutto-Anteile müssen zusammen exakt dem Preisbestandteil entsprechen.
        </p>
        {allocations.map((allocation, index) => (
          <div className="allocation-row" key={index}>
            <label>
              Empfängerart
              <select
                aria-label={`Empfängerart der Aufteilung ${index + 1}`}
                onChange={(event) =>
                  updateAllocation(index, {
                    recipientType: event.target.value as AllocationDraft['recipientType'],
                    recipientId: '',
                    externalName: '',
                  })
                }
                value={allocation.recipientType}
              >
                <option value="ORGANIZATION">Eigene Organisation / Club</option>
                <option value="ARTIST">Artist</option>
                <option value="BUSINESS_PARTNER">Geschäftspartner</option>
                <option value="EXTERNAL">Externer Dritter</option>
              </select>
            </label>
            {allocation.recipientType === 'ARTIST' ? (
              <label>
                Artist
                <select
                  aria-label={`Artist der Aufteilung ${index + 1}`}
                  onChange={(event) => updateAllocation(index, { recipientId: event.target.value })}
                  required
                  value={allocation.recipientId}
                >
                  <option value="">Artist wählen</option>
                  {artists.map((artist) => (
                    <option key={artist.id} value={artist.id}>
                      {artistLabel(artist)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {allocation.recipientType === 'BUSINESS_PARTNER' ? (
              <label>
                Geschäftspartner
                <select
                  aria-label={`Geschäftspartner der Aufteilung ${index + 1}`}
                  onChange={(event) => updateAllocation(index, { recipientId: event.target.value })}
                  required
                  value={allocation.recipientId}
                >
                  <option value="">Partner wählen</option>
                  {partners.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.companyName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {allocation.recipientType === 'EXTERNAL' ? (
              <label>
                Externe Bezeichnung
                <input
                  aria-label={`Externe Bezeichnung der Aufteilung ${index + 1}`}
                  maxLength={160}
                  onChange={(event) =>
                    updateAllocation(index, { externalName: event.target.value })
                  }
                  required
                  value={allocation.externalName}
                />
              </label>
            ) : null}
            <label>
              Aufteilung
              <select
                aria-label={`Berechnungsart der Aufteilung ${index + 1}`}
                onChange={(event) =>
                  updateAllocation(index, {
                    allocationType: event.target.value as AllocationDraft['allocationType'],
                    value: '',
                  })
                }
                value={allocation.allocationType}
              >
                <option value="PERCENTAGE">Prozentsatz</option>
                <option value="FIXED">Fester Bruttobetrag</option>
              </select>
            </label>
            <label>
              {allocation.allocationType === 'PERCENTAGE' ? 'Prozent' : 'Bruttobetrag'}
              <div className="money-input">
                <input
                  aria-label={`${allocation.allocationType === 'PERCENTAGE' ? 'Prozent' : 'Bruttobetrag'} der Aufteilung ${index + 1}`}
                  inputMode="decimal"
                  onChange={(event) => updateAllocation(index, { value: event.target.value })}
                  required
                  value={allocation.value}
                />
                <span>{allocation.allocationType === 'PERCENTAGE' ? '%' : '€'}</span>
              </div>
            </label>
            <button
              aria-label={`Aufteilung ${index + 1} entfernen`}
              className="button button--quiet"
              disabled={allocations.length === 1}
              onClick={() =>
                setAllocations((current) => current.filter((_, itemIndex) => itemIndex !== index))
              }
              type="button"
            >
              Entfernen
            </button>
          </div>
        ))}
        <button
          className="button button--secondary button--small"
          onClick={() =>
            setAllocations((current) => [
              ...current,
              {
                recipientType: 'ORGANIZATION',
                recipientId: '',
                externalName: '',
                allocationType: 'PERCENTAGE',
                value: '',
              },
            ])
          }
          type="button"
        >
          Empfänger hinzufügen
        </button>
      </fieldset>
      <FormMessage message={message} />
      <div className="button-row form-span">
        <button className="button" disabled={pending}>
          {pending ? 'Speichern …' : 'Speichern'}
        </button>
      </div>
    </form>
  );
}

function AdditionalRevenueForm({
  organizationId,
  plan,
  revenue,
  taxRates,
  onDone,
}: {
  organizationId: string;
  plan: RevenuePlan;
  revenue?: AdditionalRevenue | undefined;
  taxRates: TaxRateTemplate[];
  onDone: (message: string) => void;
}) {
  const [type, setType] = useState<AdditionalRevenue['calculationType']>(
    revenue?.calculationType ?? 'FIXED',
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const percentage = type === 'PERCENT_TICKET_BASE_NET';
      const body = {
        name: String(form.get('name') ?? '').trim(),
        calculationType: type,
        inputType: String(form.get('inputType')) as 'NET' | 'GROSS',
        inputAmountMinor: percentage
          ? null
          : majorAmountToMinor(String(form.get('amount') ?? ''), 'EUR'),
        percentageRateBasisPoints: percentage
          ? parseBasisPoints(String(form.get('percentage') ?? ''))
          : null,
        taxRateTemplateId: String(form.get('taxRateTemplateId') ?? ''),
        confirmationStatus: String(form.get('confirmationStatus')) as 'PLANNED' | 'CONFIRMED',
        note: String(form.get('note') ?? '').trim() || null,
      };
      const client = createBrowserApiClient();
      const result = revenue
        ? await client.PATCH(
            '/api/v1/organizations/{organizationId}/additional-revenues/{revenueId}',
            {
              credentials: 'include',
              params: { path: { organizationId, revenueId: revenue.id } },
              body: { ...body, version: revenue.version },
            },
          )
        : await client.POST(
            '/api/v1/organizations/{organizationId}/events/{eventId}/revenue-plan/additional-revenues',
            {
              credentials: 'include',
              params: { path: { organizationId, eventId: plan.eventId } },
              body,
            },
          );
      if (!result.data || result.error)
        setMessage(apiErrorMessage(result.error, 'Der Erlös konnte nicht gespeichert werden.'));
      else onDone(revenue ? 'Weiterer Erlös gespeichert.' : 'Weiterer Erlös angelegt.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Die Eingabe ist ungültig.');
    }
    setPending(false);
  }
  return (
    <form className="form-grid" onSubmit={submit}>
      <label>
        Bezeichnung
        <input autoFocus defaultValue={revenue?.name ?? ''} maxLength={160} name="name" required />
      </label>
      <label>
        Berechnungsart
        <select
          name="calculationType"
          onChange={(event) => setType(event.target.value as typeof type)}
          value={type}
        >
          <option value="FIXED">Fixer Betrag</option>
          <option value="PER_EXPECTED_GUEST">Pro erwartetem Gast</option>
          <option value="PER_PAYING_TICKET">Pro zahlendem Ticket</option>
          <option value="PERCENT_TICKET_BASE_NET">Prozent vom Ticketgrundumsatz netto</option>
        </select>
      </label>
      {type === 'PERCENT_TICKET_BASE_NET' ? (
        <label>
          Prozentsatz
          <div className="money-input">
            <input
              defaultValue={basisPointsInput(revenue?.percentageRateBasisPoints ?? 0)}
              inputMode="decimal"
              name="percentage"
              required
            />
            <span>%</span>
          </div>
        </label>
      ) : (
        <label>
          {type === 'FIXED' ? 'Betrag' : 'Betrag je Einheit'}
          <div className="money-input">
            <input
              aria-label="Betrag €"
              defaultValue={minorAmountToInput(revenue?.inputAmountMinor, 'EUR')}
              inputMode="decimal"
              name="amount"
              required
            />
            <span>€</span>
          </div>
        </label>
      )}
      <label>
        Eingabeart
        <select defaultValue={revenue?.inputType ?? 'NET'} name="inputType">
          <option value="NET">Netto</option>
          <option value="GROSS">Brutto</option>
        </select>
      </label>
      <label>
        Steuersatzvorlage
        <select
          aria-label="Steuersatzvorlage für weiteren Erlös"
          defaultValue={revenue?.taxRateTemplateId ?? ''}
          name="taxRateTemplateId"
          required
        >
          <option value="">Steuersatz wählen</option>
          {taxRates.map((tax) => (
            <option key={tax.id} value={tax.id}>
              {tax.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Status
        <select defaultValue={revenue?.confirmationStatus ?? 'PLANNED'} name="confirmationStatus">
          <option value="PLANNED">Geplant</option>
          <option value="CONFIRMED">Bestätigt</option>
        </select>
      </label>
      <label className="form-span">
        Notiz <span className="optional">optional</span>
        <textarea defaultValue={revenue?.note ?? ''} maxLength={5000} name="note" rows={3} />
      </label>
      <FormMessage message={message} />
      <div className="button-row form-span">
        <button className="button" disabled={pending}>
          {pending ? 'Speichern …' : 'Speichern'}
        </button>
      </div>
    </form>
  );
}

function ApplyCalculationTemplateForm({
  organizationId,
  plan,
  calculationTemplates,
  onDone,
}: {
  organizationId: string;
  plan: RevenuePlan;
  calculationTemplates: CalculationTemplate[];
  onDone: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState<CalculationTemplatePreview>();
  const [resolutions, setResolutions] = useState<Record<string, 'REMOVE' | 'ORGANIZATION'>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  async function loadPreview() {
    if (!selectedId) return;
    setPending(true);
    setMessage(undefined);
    const result = await createBrowserApiClient().POST(
      '/api/v1/organizations/{organizationId}/events/{eventId}/revenue-plan/calculation-template-preview',
      {
        credentials: 'include',
        params: { path: { organizationId, eventId: plan.eventId } },
        body: { calculationTemplateId: selectedId },
      },
    );
    if (!result.data || result.error)
      setMessage(apiErrorMessage(result.error, 'Die Vorschau konnte nicht geladen werden.'));
    else {
      setPreview(result.data);
      setResolutions(
        Object.fromEntries(
          (result.data.invalidRecipients as InvalidTemplateRecipient[]).map((item) => [
            item.allocationId,
            'REMOVE',
          ]),
        ),
      );
    }
    setPending(false);
  }

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage(undefined);
    const result = await createBrowserApiClient().POST(
      '/api/v1/organizations/{organizationId}/events/{eventId}/revenue-plan/apply-calculation-template',
      {
        credentials: 'include',
        params: { path: { organizationId, eventId: plan.eventId } },
        body: {
          calculationTemplateId: preview.templateId,
          calculationVersion: plan.calculationVersion,
          confirmReplacement:
            !preview.replacementRequired || form.get('confirmReplacement') === 'on',
          recipientResolutions: (
            preview.invalidRecipients as unknown as InvalidTemplateRecipient[]
          ).map((item) =>
            resolutions[item.allocationId] === 'ORGANIZATION'
              ? {
                  allocationId: item.allocationId,
                  action: 'REPLACE' as const,
                  recipientType: 'ORGANIZATION' as const,
                }
              : { allocationId: item.allocationId, action: 'REMOVE' as const },
          ),
        },
      },
    );
    if (!result.data || result.error)
      setMessage(apiErrorMessage(result.error, 'Die Vorlage konnte nicht übernommen werden.'));
    else
      onDone(
        preview.replacementRequired
          ? 'Vorhandene Erlösplanung vollständig durch die Vorlage ersetzt.'
          : 'Kalkulationsvorlage übernommen.',
      );
    setPending(false);
  }

  return (
    <form className="form-grid" onSubmit={apply}>
      <label className="form-span">
        Kalkulationsvorlage
        <select
          onChange={(event) => {
            setSelectedId(event.target.value);
            setPreview(undefined);
          }}
          required
          value={selectedId}
        >
          <option value="">Vorlage auswählen</option>
          {calculationTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      {!preview ? (
        <button
          className="button button--secondary"
          disabled={!selectedId || pending}
          onClick={() => void loadPreview()}
          type="button"
        >
          Vorschau laden
        </button>
      ) : (
        <>
          <div className="snapshot-note form-span">
            <strong>{preview.templateName}</strong>
            <span>
              {preview.tierCount} Ticketstufen · {preview.componentCount} Preisstruktur-Positionen ·{' '}
              {preview.additionalRevenueCount} weitere Erlöse
            </span>
          </div>
          {preview.replacementRequired ? (
            <label className="checkbox-row form-span compact-notice compact-notice--warning">
              <input name="confirmReplacement" required type="checkbox" />
              Vorhandene Erlösplanung vollständig ersetzen. Es wird nichts zusammengeführt oder
              doppelt angelegt.
            </label>
          ) : (
            <p className="field-hint form-span">
              Die leere Erlösplanung wird mit dem Vorlagen-Snapshot gefüllt.
            </p>
          )}
          {(preview.invalidRecipients as unknown as InvalidTemplateRecipient[]).map((item) => (
            <label className="form-span" key={item.allocationId}>
              Ungültiger Empfänger „{item.recipientName}“ in {item.componentName}
              <select
                onChange={(event) =>
                  setResolutions((current) => ({
                    ...current,
                    [item.allocationId]: event.target.value as 'REMOVE' | 'ORGANIZATION',
                  }))
                }
                value={resolutions[item.allocationId] ?? 'REMOVE'}
              >
                <option value="REMOVE">Aufteilung entfernen</option>
                <option value="ORGANIZATION">Durch eigene Organisation ersetzen</option>
              </select>
            </label>
          ))}
          <button className="button" disabled={pending}>
            Vorlage übernehmen
          </button>
        </>
      )}
      <FormMessage message={message} />
    </form>
  );
}

function SaveCalculationTemplateForm({
  organizationId,
  plan,
  onDone,
}: {
  organizationId: string;
  plan: RevenuePlan;
  onDone: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage(undefined);
    const result = await createBrowserApiClient().POST(
      '/api/v1/organizations/{organizationId}/revenue-templates/calculations/from-event/{eventId}',
      {
        credentials: 'include',
        params: { path: { organizationId, eventId: plan.eventId } },
        body: {
          name: String(form.get('name') ?? '').trim(),
          description: String(form.get('description') ?? '').trim() || null,
        },
      },
    );
    if (!result.data || result.error)
      setMessage(
        apiErrorMessage(result.error, 'Die Kalkulationsvorlage konnte nicht gespeichert werden.'),
      );
    else onDone('Kalkulationsvorlage gespeichert.');
    setPending(false);
  }
  return (
    <form className="form-grid" onSubmit={submit}>
      <label>
        Vorlagenname
        <input autoFocus maxLength={200} name="name" required />
      </label>
      <label className="form-span">
        Beschreibung <span className="optional">optional</span>
        <textarea maxLength={5000} name="description" rows={3} />
      </label>
      <p className="field-hint form-span">
        Ticketstufen, Preisstruktur, Aufteilungen, weitere Erlöse und erwartete Gästezahl werden als
        unabhängige Vorlage gespeichert.
      </p>
      <FormMessage message={message} />
      <button className="button" disabled={pending}>
        Vorlage speichern
      </button>
    </form>
  );
}

function SummaryValue({
  label,
  value,
  result = false,
}: {
  label: string;
  value: string;
  result?: boolean;
}) {
  return (
    <div
      className={
        result ? 'revenue-summary-value revenue-summary-value--result' : 'revenue-summary-value'
      }
    >
      <span>{label}</span>
      <strong>{money(value)}</strong>
    </div>
  );
}
function ResultValue({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={strong ? 'revenue-result-strong' : undefined}>{money(value)}</dd>
    </div>
  );
}
function money(value: string | null | undefined) {
  return formatMinorAmount(value, 'EUR') ?? '—';
}
function calculationStatusLabel(status: RevenuePlan['calculationStatus']) {
  return { DRAFT: 'Entwurf', REVIEW: 'Zur Prüfung', APPROVED: 'Freigegeben' }[status];
}
function additionalTypeLabel(type: AdditionalRevenue['calculationType']) {
  return {
    FIXED: 'Fixer Betrag',
    PER_EXPECTED_GUEST: 'Pro erwartetem Gast',
    PER_PAYING_TICKET: 'Pro zahlendem Ticket',
    PERCENT_TICKET_BASE_NET: 'Prozent vom Ticketgrundumsatz netto',
  }[type];
}
function editorTitle(editor?: Editor) {
  if (!editor) return 'Erlösplanung';
  if (editor.kind === 'tier')
    return editor.value ? 'Ticketstufe bearbeiten' : 'Ticketstufe anlegen';
  if (editor.kind === 'component')
    return editor.value ? 'Preisstruktur-Position bearbeiten' : 'Preisstruktur-Position anlegen';
  return editor.value ? 'Weiteren Erlös bearbeiten' : 'Weiteren Erlös anlegen';
}
function artistLabel(artist: Artist) {
  return (
    artist.stageName ?? ([artist.firstName, artist.lastName].filter(Boolean).join(' ') || 'Artist')
  );
}
function parseBasisPoints(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new Error('Prozentwerte dürfen höchstens zwei Nachkommastellen haben.');
  const result = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(result) || result > 100_000)
    throw new Error('Der Prozentwert ist außerhalb des zulässigen Bereichs.');
  return result;
}
function basisPointsInput(value: number) {
  const whole = Math.floor(value / 100);
  const fraction = String(value % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole},${fraction}` : String(whole);
}
function formatBasisPoints(value: number) {
  return `${basisPointsInput(value)} %`;
}
