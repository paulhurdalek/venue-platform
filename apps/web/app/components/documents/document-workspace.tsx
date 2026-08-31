'use client';

import type { components } from '@venue/api-client';
import { useEffect, useState } from 'react';

import { apiErrorMessage, browserApiUrl, createBrowserApiClient } from '../../../src/api/browser';
import { FormMessage } from '../form-message';
import { ActionMenu } from '../ui/action-menu';
import { Dialog } from '../ui/dialog';
import { documentNumberLabel, formatDate, statusLabel, typeLabel } from './document-list';

type Document = components['schemas']['DocumentDto'];
type ManualDocumentStatus = Exclude<Document['status'], 'ARCHIVIERT'>;
type Position = Document['positions'][number];
type Block = Document['blocks'][number];

interface PositionDraft {
  key: string;
  id?: string;
  source: Position['source'];
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  discountType: '' | 'FIXED' | 'PERCENTAGE';
  discountValue: string;
}

interface SnapshotArtist {
  stageName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

interface DocumentContext {
  organization?: { name?: string | null; legalName?: string | null };
  event?: {
    technicalGetInTime?: string | null;
    artistGetInTime?: string | null;
    doorsTime?: string | null;
    startTime?: string | null;
    endTime?: string | null;
  };
  program?: Array<{
    programItemId?: string;
    kind?: 'PERFORMANCE' | 'BREAK';
    label?: string | null;
    note?: string | null;
    startTime?: string | null;
    durationMinutes?: number | null;
    booking?: { artist: SnapshotArtist } | null;
  }>;
}

export function DocumentWorkspace({
  initialDocument,
  organizationId,
  canWrite,
  canPublish,
}: {
  initialDocument: Document;
  organizationId: string;
  canWrite: boolean;
  canPublish: boolean;
}) {
  const [document, setDocument] = useState(initialDocument);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>();

  useEffect(
    () => () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    },
    [pdfPreviewUrl],
  );

  const previewPdf = async () => {
    setMessage(undefined);
    setBusy(true);
    try {
      const response = await fetch(
        browserApiUrl(`/api/v1/organizations/${organizationId}/documents/${document.id}/preview`),
        { method: 'POST', credentials: 'include' },
      );
      if (!response.ok) throw new Error('Die PDF-Vorschau konnte nicht erzeugt werden.');
      const url = URL.createObjectURL(await response.blob());
      setPdfPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Die PDF-Vorschau konnte nicht erzeugt werden.'));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await createBrowserApiClient().POST(
        '/api/v1/organizations/{organizationId}/documents/{documentId}/publish',
        {
          params: { path: { organizationId, documentId: document.id } },
          body: { revision: document.revision },
        },
      );
      setDocument(requireData(result));
      setMessage(
        document.type === 'OFFER'
          ? 'PDF-Version erstellt und Angebot als übergeben markiert.'
          : 'PDF-Version erstellt und Ablauf freigegeben.',
      );
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Das Dokument konnte nicht veröffentlicht werden.'));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: ManualDocumentStatus) => {
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await createBrowserApiClient().PATCH(
        '/api/v1/organizations/{organizationId}/documents/{documentId}/status',
        {
          params: { path: { organizationId, documentId: document.id } },
          body: { revision: document.revision, status },
        },
      );
      setDocument(requireData(result));
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Der Dokumentstatus konnte nicht geändert werden.'));
    } finally {
      setBusy(false);
    }
  };

  const statusItems = statusActions(document).map((item) => ({
    id: item.status,
    label: item.label,
    onSelect: () => void changeStatus(item.status),
    disabled: busy,
  }));
  return (
    <section className="detail-panel document-workspace">
      <header className="document-workspace__header">
        <div>
          <p className="eyebrow">{typeLabel(document.type)}</p>
          <h1>{document.title}</h1>
          <p className="document-workspace__meta">
            {documentNumberLabel(document.documentNumber)} · Entwurfsrevision {document.revision} ·{' '}
            {document.publishedVersion
              ? `veröffentlichte Version ${document.publishedVersion}`
              : 'noch nicht veröffentlicht'}
          </p>
          <small className="document-workspace__template-source">
            Erstellt aus Vorlage: {document.sourceTemplateName} · Version{' '}
            {document.sourceTemplateVersion}
          </small>
        </div>
        <div className="document-workspace__actions">
          <span
            className={`status-badge status-badge--document-${document.effectiveStatus.toLowerCase()}`}
          >
            {statusLabel(document.effectiveStatus)}
          </span>
          <button
            className="button button--secondary"
            onClick={() => void previewPdf()}
            type="button"
          >
            Tatsächliche PDF-Vorschau
          </button>
          {canWrite && document.status !== 'ARCHIVIERT' ? (
            <button
              className="button button--secondary"
              onClick={() => setEditing(true)}
              type="button"
            >
              Bearbeiten
            </button>
          ) : null}
          {canPublish && ['ENTWURF', 'ERSTELLT'].includes(document.status) ? (
            <button className="button" disabled={busy} onClick={() => void publish()} type="button">
              {document.type === 'OFFER'
                ? 'PDF erstellen und übergeben'
                : 'PDF erstellen und freigeben'}
            </button>
          ) : null}
          {canPublish && statusItems.length ? (
            <ActionMenu label="Weitere Dokumentaktionen" items={statusItems} />
          ) : null}
        </div>
      </header>
      {document.expired ? (
        <p className="compact-warning">
          Dieses Angebot ist anhand des Gültigkeitsdatums abgelaufen.
        </p>
      ) : null}
      {message ? <FormMessage message={message} /> : null}
      <DocumentView document={document} organizationId={organizationId} />
      {pdfPreviewUrl ? (
        <section className="document-pdf-preview" aria-label="Tatsächlich generierte PDF-Vorschau">
          <div className="section-heading-row section-heading-row--compact">
            <div>
              <p className="eyebrow">Serverseitig erzeugt</p>
              <h2>PDF-Vorschau</h2>
            </div>
            <button
              className="button button--quiet button--small"
              onClick={() => setPdfPreviewUrl(undefined)}
              type="button"
            >
              Schließen
            </button>
          </div>
          <iframe src={pdfPreviewUrl} title="PDF-Vorschau des aktuellen Dokumentstands" />
        </section>
      ) : null}
      {document.type === 'OFFER' && document.internalNote ? (
        <aside className="document-internal-note">
          <strong>Interne Notiz</strong>
          <p>{document.internalNote}</p>
          <small>Wird weder in der Dokumentansicht noch in der PDF ausgegeben.</small>
        </aside>
      ) : null}
      <VersionArchive document={document} organizationId={organizationId} />
      {editing ? (
        <DocumentEditor
          document={document}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setDocument(saved);
            setEditing(false);
            setMessage(
              document.publishedVersion
                ? 'Änderungen als neuer Entwurf gespeichert. Die historische PDF bleibt unverändert.'
                : 'Entwurf gespeichert. Es wurde keine Dokumentversion erzeugt.',
            );
          }}
          organizationId={organizationId}
        />
      ) : null}
    </section>
  );
}

function DocumentView({
  document,
  organizationId,
}: {
  document: Document;
  organizationId: string;
}) {
  const context = document.contextSnapshot as unknown as DocumentContext;
  return (
    <article className="document-preview" aria-label="Dokumentansicht">
      <div className="document-preview__masthead">
        <span>
          {context.organization?.legalName ?? context.organization?.name ?? 'Organisation'}
        </span>
        {document.type === 'OFFER' ? <small>{typeLabel(document.type)}</small> : null}
      </div>
      <div className="document-preview__body">
        <div className="document-preview__identity">
          <div>
            <h2>{document.title}</h2>
            {document.type === 'OFFER' ? (
              <p>{documentNumberLabel(document.documentNumber)}</p>
            ) : null}
          </div>
          <dl>
            <div>
              <dt>Event</dt>
              <dd>
                <a className="text-link" href={`/o/${organizationId}/events/${document.eventId}`}>
                  {document.eventName}
                </a>
              </dd>
            </div>
            <div>
              <dt>Datum</dt>
              <dd>{formatDate(document.eventDate)}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{document.locationName}</dd>
            </div>
          </dl>
        </div>
        {document.type === 'OFFER' ? (
          <>
            <Recipient document={document} />
            {document.introduction ? (
              <TextSection title="Einleitung" value={document.introduction} />
            ) : null}
            {document.blocks.map((block, index) => (
              <TextSection
                key={`${block.heading}-${index}`}
                title={block.heading}
                value={block.body}
              />
            ))}
            <OfferPositions positions={document.positions} totals={document.totals} />
            {document.standardTerms ? (
              <TextSection title="Bedingungen" value={document.standardTerms} />
            ) : null}
            {document.closing ? (
              <TextSection title="Schlussformel" value={document.closing} />
            ) : null}
          </>
        ) : (
          <ScheduleSections context={context} />
        )}
      </div>
      <footer className="document-preview__footer">
        {document.footer ?? context.organization?.name}
      </footer>
    </article>
  );
}

function Recipient({ document }: { document: Document }) {
  return (
    <section className="document-preview__section document-recipient">
      <h3>Empfänger</h3>
      <strong>{document.recipientName ?? 'Noch nicht eingetragen'}</strong>
      {document.recipientContactName ? <span>{document.recipientContactName}</span> : null}
      {document.recipientAddress ? (
        <span className="pre-wrap">{document.recipientAddress}</span>
      ) : null}
      {document.recipientEmail ? <span>{document.recipientEmail}</span> : null}
      {document.validUntil ? <small>Gültig bis {formatDate(document.validUntil)}</small> : null}
    </section>
  );
}

function TextSection({ title, value }: { title: string; value: string }) {
  return (
    <section className="document-preview__section">
      <h3>{title}</h3>
      <p className="pre-wrap">{value}</p>
    </section>
  );
}

function OfferPositions({
  positions,
  totals,
}: {
  positions: Document['positions'];
  totals: Document['totals'];
}) {
  return (
    <section className="document-preview__section">
      <h3>Angebotspositionen</h3>
      <div className="document-position-scroll">
        <table className="document-position-table">
          <thead>
            <tr>
              <th>Pos.</th>
              <th>Bezeichnung</th>
              <th>Menge</th>
              <th>Einzel netto</th>
              <th>USt.</th>
              <th>Rabatt</th>
              <th>Gesamt netto</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position, index) => (
              <tr key={position.id}>
                <td>{index + 1}</td>
                <td>
                  {position.description}
                  {position.differsFromSource ? (
                    <span className="document-deviation">Vom ursprünglichen Deal abweichend</span>
                  ) : null}
                </td>
                <td>{position.quantity}</td>
                <td>{money(position.unitPriceNetMinor)}</td>
                <td>{rate(position.taxRateBasisPoints)}</td>
                <td>{money(position.discountNetMinor)}</td>
                <td>{money(position.totalNetMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totals ? (
        <dl className="document-totals">
          <div>
            <dt>Gesamt netto</dt>
            <dd>{money(totals.totalNetMinor)}</dd>
          </div>
          {totals.taxGroups.map((group, index) => (
            <div key={index}>
              <dt>Umsatzsteuer {rate(Number(group.taxRateBasisPoints))}</dt>
              <dd>{money(String(group.taxMinor))}</dd>
            </div>
          ))}
          <div className="document-totals__grand">
            <dt>Gesamt brutto</dt>
            <dd>{money(totals.totalGrossMinor)}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

function ScheduleSections({ context }: { context: DocumentContext }) {
  const artistName = (artist: SnapshotArtist) =>
    artist?.stageName ??
    ([artist?.firstName, artist?.lastName].filter(Boolean).join(' ') || 'Auftritt');
  return (
    <>
      <section className="document-preview__section document-preview__section--schedule">
        <div className="document-position-scroll">
          <table className="document-schedule-table">
            <thead>
              <tr>
                <th>Start</th>
                <th>Programmpunkt</th>
                <th>Dauer</th>
                <th>Notiz</th>
              </tr>
            </thead>
            <tbody>
              {(context.program ?? []).map((item, index) => (
                <tr key={item.programItemId ?? `${item.kind ?? 'PERFORMANCE'}-${index}`}>
                  <td>{item.startTime ?? '–'}</td>
                  <td>
                    {item.label ??
                      (item.booking
                        ? artistName(item.booking.artist)
                        : item.kind === 'BREAK'
                          ? 'Pause'
                          : 'Auftritt')}
                  </td>
                  <td>{item.durationMinutes ? `${item.durationMinutes} Min.` : '–'}</td>
                  <td>{item.note ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function VersionArchive({
  document,
  organizationId,
}: {
  document: Document;
  organizationId: string;
}) {
  const download = async (version: Document['versions'][number]) => {
    const response = await fetch(
      browserApiUrl(
        `/api/v1/organizations/${organizationId}/documents/${document.id}/versions/${version.id}/pdf`,
      ),
      { credentials: 'include' },
    );
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${version.documentNumber}-v${version.documentVersion}.pdf`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  return (
    <section className="document-version-archive">
      <h2>Historische Versionen</h2>
      {document.versions.length ? (
        <div className="document-version-list">
          {document.versions.map((version) => (
            <div key={version.id}>
              <span>
                <strong>Version {version.documentVersion}</strong>
                <small>
                  {statusLabel(version.status)} ·{' '}
                  {new Date(version.createdAt).toLocaleString('de-DE')} ·{' '}
                  {Math.ceil(version.pdfSize / 1024)} KB
                </small>
              </span>
              <button
                className="button button--secondary button--small"
                onClick={() => void download(version)}
                type="button"
              >
                PDF herunterladen
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="compact-empty">Noch keine übergebene oder freigegebene Version.</p>
      )}
    </section>
  );
}

function DocumentEditor({
  document,
  organizationId,
  onClose,
  onSaved,
}: {
  document: Document;
  organizationId: string;
  onClose: () => void;
  onSaved: (document: Document) => void;
}) {
  const [title, setTitle] = useState(document.title);
  const [introduction, setIntroduction] = useState(document.introduction ?? '');
  const [blocks, setBlocks] = useState<Block[]>(document.blocks);
  const [terms, setTerms] = useState(document.standardTerms ?? '');
  const [closing, setClosing] = useState(document.closing ?? '');
  const [footer, setFooter] = useState(document.footer ?? '');
  const [recipientName, setRecipientName] = useState(document.recipientName ?? '');
  const [recipientContact, setRecipientContact] = useState(document.recipientContactName ?? '');
  const [recipientEmail, setRecipientEmail] = useState(document.recipientEmail ?? '');
  const [recipientAddress, setRecipientAddress] = useState(document.recipientAddress ?? '');
  const [validUntil, setValidUntil] = useState(document.validUntil ?? '');
  const [internalNote, setInternalNote] = useState(document.internalNote ?? '');
  const [discountType, setDiscountType] = useState<'' | 'FIXED' | 'PERCENTAGE'>(
    document.totalDiscountType ?? '',
  );
  const [discountValue, setDiscountValue] = useState(
    document.totalDiscountType === 'FIXED'
      ? euros(document.totalDiscountFixedMinor)
      : String((document.totalDiscountPercentageBasisPoints ?? 0) / 100),
  );
  const [positions, setPositions] = useState<PositionDraft[]>(
    document.positions.map((position) => ({
      key: position.id,
      id: position.id,
      source: position.source,
      description: position.description,
      quantity: position.quantity,
      unitPrice: euros(position.unitPriceNetMinor),
      taxRate: String(position.taxRateBasisPoints / 100),
      discountType: position.discountType ?? '',
      discountValue:
        position.discountType === 'FIXED'
          ? euros(position.discountFixedMinor)
          : String((position.discountPercentageBasisPoints ?? 0) / 100),
    })),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const save = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const body: components['schemas']['UpdateDocumentDto'] = {
        revision: document.revision,
        title,
        introduction: introduction || null,
        blocks,
        standardTerms: terms || null,
        closing: closing || null,
        footer: footer || null,
        recipientName: document.type === 'OFFER' ? recipientName || null : null,
        recipientContactName: document.type === 'OFFER' ? recipientContact || null : null,
        recipientEmail: document.type === 'OFFER' ? recipientEmail || null : null,
        recipientAddress: document.type === 'OFFER' ? recipientAddress || null : null,
        validUntil: document.type === 'OFFER' ? validUntil || null : null,
        internalNote: internalNote || null,
        totalDiscountType: discountType || null,
        totalDiscountFixedMinor: discountType === 'FIXED' ? minor(discountValue) : null,
        totalDiscountPercentageBasisPoints:
          discountType === 'PERCENTAGE' ? basis(discountValue) : null,
        positions: positions.map((position) => ({
          ...(position.id ? { id: position.id } : {}),
          source: position.source,
          description: position.description,
          quantity: position.quantity,
          unitPriceNetMinor: minor(position.unitPrice) ?? '0',
          taxRateBasisPoints: basis(position.taxRate, 100_000),
          discountType: position.discountType || null,
          discountFixedMinor:
            position.discountType === 'FIXED' ? minor(position.discountValue) : null,
          discountPercentageBasisPoints:
            position.discountType === 'PERCENTAGE' ? basis(position.discountValue) : null,
        })),
      };
      const result = await createBrowserApiClient().PATCH(
        '/api/v1/organizations/{organizationId}/documents/{documentId}',
        { params: { path: { organizationId, documentId: document.id } }, body },
      );
      onSaved(requireData(result));
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Der Dokumententwurf konnte nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  };
  const move = (index: number, direction: -1 | 1) =>
    setPositions((items) => {
      const target = index + direction;
      if (target < 0 || target >= items.length) return items;
      const next = [...items];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  return (
    <Dialog open onClose={onClose} size="wide" title="Dokumententwurf bearbeiten">
      <div className="document-editor">
        <div className="form-grid">
          <label className="form-grid__wide">
            Titel
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          {document.type === 'OFFER' ? (
            <>
              <label>
                Empfänger
                <input
                  value={recipientName}
                  onChange={(event) => setRecipientName(event.target.value)}
                />
              </label>
              <label>
                Ansprechpartner
                <input
                  value={recipientContact}
                  onChange={(event) => setRecipientContact(event.target.value)}
                />
              </label>
              <label>
                E-Mail
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                />
              </label>
              <label>
                Gültig bis
                <input
                  type="date"
                  value={validUntil}
                  onChange={(event) => setValidUntil(event.target.value)}
                />
              </label>
              <label className="form-grid__wide">
                Empfängeradresse
                <textarea
                  rows={3}
                  value={recipientAddress}
                  onChange={(event) => setRecipientAddress(event.target.value)}
                />
              </label>
            </>
          ) : null}
          {document.type === 'OFFER' ? (
            <label className="form-grid__wide">
              Einleitung
              <textarea
                rows={5}
                value={introduction}
                onChange={(event) => setIntroduction(event.target.value)}
              />
            </label>
          ) : null}
          {document.type === 'PRODUCTION_INFORMATION' ? (
            <p className="form-hint form-grid__wide">
              Beim Speichern wird dieser Ablauf gezielt aus dem aktuellen Auftrittsplan
              aktualisiert. Bookings und Programmpunkte bleiben unverändert.
            </p>
          ) : null}
        </div>
        {document.type === 'OFFER' ? (
          <section className="document-editor__section">
            <div className="section-heading-row section-heading-row--compact">
              <h3>Inhalts- und Hinweisblöcke</h3>
              <button
                className="button button--secondary button--small"
                onClick={() => setBlocks((items) => [...items, { heading: '', body: '' }])}
                type="button"
              >
                Block hinzufügen
              </button>
            </div>
            {blocks.map((block, index) => (
              <div className="document-block-editor" key={index}>
                <input
                  aria-label={`Überschrift Block ${index + 1}`}
                  value={block.heading}
                  onChange={(event) =>
                    setBlocks((items) =>
                      items.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, heading: event.target.value } : item,
                      ),
                    )
                  }
                />
                <textarea
                  aria-label={`Inhalt Block ${index + 1}`}
                  rows={4}
                  value={block.body}
                  onChange={(event) =>
                    setBlocks((items) =>
                      items.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, body: event.target.value } : item,
                      ),
                    )
                  }
                />
                <button
                  className="button button--quiet button--small"
                  onClick={() =>
                    setBlocks((items) => items.filter((_, itemIndex) => itemIndex !== index))
                  }
                  type="button"
                >
                  Entfernen
                </button>
              </div>
            ))}
          </section>
        ) : null}
        {document.type === 'OFFER' ? (
          <section className="document-editor__section">
            <div className="section-heading-row section-heading-row--compact">
              <h3>Angebotspositionen</h3>
              <button
                className="button button--secondary button--small"
                onClick={() =>
                  setPositions((items) => [
                    ...items,
                    {
                      key: crypto.randomUUID(),
                      source: 'CUSTOM',
                      description: '',
                      quantity: '1',
                      unitPrice: '0,00',
                      taxRate: '19',
                      discountType: '',
                      discountValue: '0',
                    },
                  ])
                }
                type="button"
              >
                Position hinzufügen
              </button>
            </div>
            <div className="document-position-scroll document-position-scroll--editor">
              <table className="document-position-table document-position-table--editor">
                <thead>
                  <tr>
                    <th>Reihenfolge</th>
                    <th>Bezeichnung</th>
                    <th>Menge</th>
                    <th>Einzelpreis netto €</th>
                    <th>USt. %</th>
                    <th>Rabatt</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position, index) => (
                    <tr key={position.key}>
                      <td>
                        <div className="document-order-buttons">
                          <button
                            aria-label={`Position ${index + 1} nach oben`}
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                            type="button"
                          >
                            ↑
                          </button>
                          <button
                            aria-label={`Position ${index + 1} nach unten`}
                            disabled={index === positions.length - 1}
                            onClick={() => move(index, 1)}
                            type="button"
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td>
                        <input
                          aria-label={`Bezeichnung Position ${index + 1}`}
                          value={position.description}
                          onChange={(event) =>
                            updatePosition(setPositions, index, { description: event.target.value })
                          }
                        />
                        {position.source !== 'CUSTOM' ? (
                          <small>Deal-Snapshot</small>
                        ) : (
                          <small>Freie Position</small>
                        )}
                      </td>
                      <td>
                        <input
                          aria-label={`Menge Position ${index + 1}`}
                          value={position.quantity}
                          onChange={(event) =>
                            updatePosition(setPositions, index, { quantity: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Einzelpreis Position ${index + 1}`}
                          inputMode="decimal"
                          value={position.unitPrice}
                          onChange={(event) =>
                            updatePosition(setPositions, index, { unitPrice: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Umsatzsteuer Position ${index + 1}`}
                          inputMode="decimal"
                          value={position.taxRate}
                          onChange={(event) =>
                            updatePosition(setPositions, index, { taxRate: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Rabattstyp Position ${index + 1}`}
                          value={position.discountType}
                          onChange={(event) =>
                            updatePosition(setPositions, index, {
                              discountType: event.target.value as PositionDraft['discountType'],
                            })
                          }
                        >
                          <option value="">Kein Rabatt</option>
                          <option value="FIXED">Betrag €</option>
                          <option value="PERCENTAGE">Prozent</option>
                        </select>
                        {position.discountType ? (
                          <input
                            aria-label={`Rabattwert Position ${index + 1}`}
                            value={position.discountValue}
                            onChange={(event) =>
                              updatePosition(setPositions, index, {
                                discountValue: event.target.value,
                              })
                            }
                          />
                        ) : null}
                      </td>
                      <td>
                        <button
                          className="button button--quiet button--small"
                          onClick={() =>
                            setPositions((items) =>
                              items.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                          type="button"
                        >
                          Entfernen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-grid document-total-discount">
              <label>
                Gesamtrabatt
                <select
                  value={discountType}
                  onChange={(event) => setDiscountType(event.target.value as typeof discountType)}
                >
                  <option value="">Kein Rabatt</option>
                  <option value="FIXED">Betrag €</option>
                  <option value="PERCENTAGE">Prozent</option>
                </select>
              </label>
              {discountType ? (
                <label>
                  Rabattwert
                  <input
                    value={discountValue}
                    onChange={(event) => setDiscountValue(event.target.value)}
                  />
                </label>
              ) : null}
            </div>
          </section>
        ) : null}
        <div className="form-grid">
          {document.type === 'OFFER' ? (
            <>
              <label className="form-grid__wide">
                Standardbedingungen
                <textarea
                  rows={5}
                  value={terms}
                  onChange={(event) => setTerms(event.target.value)}
                />
              </label>
              <label className="form-grid__wide">
                Schlussformel
                <textarea
                  rows={4}
                  value={closing}
                  onChange={(event) => setClosing(event.target.value)}
                />
              </label>
            </>
          ) : null}
          <label className="form-grid__wide">
            Fußzeile
            <textarea rows={2} value={footer} onChange={(event) => setFooter(event.target.value)} />
          </label>
          {document.type === 'OFFER' ? (
            <label className="form-grid__wide">
              Interne Notiz - nie in Dokumentansicht oder PDF
              <textarea
                rows={4}
                value={internalNote}
                onChange={(event) => setInternalNote(event.target.value)}
              />
            </label>
          ) : null}
        </div>
        {message ? <FormMessage message={message} /> : null}
        <div className="button-row button-row--end">
          <button className="button button--secondary" onClick={onClose} type="button">
            Abbrechen
          </button>
          <button className="button" disabled={busy} onClick={() => void save()} type="button">
            Entwurf speichern
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function updatePosition(
  setter: React.Dispatch<React.SetStateAction<PositionDraft[]>>,
  index: number,
  patch: Partial<PositionDraft>,
) {
  setter((items) =>
    items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
  );
}

function statusActions(document: Document): Array<{ status: ManualDocumentStatus; label: string }> {
  if (document.type === 'OFFER') {
    if (document.status === 'ENTWURF')
      return [{ status: 'ERSTELLT', label: 'Als erstellt markieren' }];
    if (document.status === 'ERSTELLT') return [{ status: 'ENTWURF', label: 'Zurück in Entwurf' }];
    if (document.status === 'UEBERGEBEN')
      return [
        { status: 'ANGENOMMEN', label: 'Als angenommen markieren' },
        { status: 'ABGELEHNT', label: 'Als abgelehnt markieren' },
        ...(document.expired
          ? [{ status: 'ABGELAUFEN' as const, label: 'Als abgelaufen markieren' }]
          : []),
      ];
  }
  return [];
}

function requireData<T>(result: { data?: T; error?: unknown }): T {
  if (result.data !== undefined) return result.data;
  throw result.error;
}

function money(minorValue: string | null | undefined) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    Number(BigInt(minorValue ?? '0')) / 100,
  );
}

function rate(value: number) {
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value / 100)} %`;
}

function euros(value: string | null | undefined) {
  if (!value) return '0,00';
  return (Number(BigInt(value)) / 100).toFixed(2).replace('.', ',');
}

function minor(value: string) {
  const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(value.trim());
  return match
    ? (BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0')).toString()
    : null;
}

function basis(value: string, maximum = 10_000) {
  const parsed = Math.round(Number(value.replace(',', '.')) * 100);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(maximum, parsed)) : 0;
}
