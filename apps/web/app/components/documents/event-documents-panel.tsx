'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import { FormMessage } from '../form-message';
import { Dialog } from '../ui/dialog';
import { documentNumberLabel, formatDate, statusLabel, typeLabel } from './document-list';

type Document = components['schemas']['DocumentDto'];
type Template = components['schemas']['DocumentTemplateDto'];

export function EventDocumentsPanel({
  organizationId,
  eventId,
  eventName,
  initialDocuments,
  templates,
  canWrite,
}: {
  organizationId: string;
  eventId: string;
  eventName: string;
  initialDocuments: Document[];
  templates: Template[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [creating, setCreating] = useState(false);
  return (
    <section className="detail-panel event-documents-panel">
      <header className="section-heading-row">
        <div>
          <p className="eyebrow">Veranstaltung</p>
          <h2>Dokumente</h2>
          <p>Angebote und schlanke zeitliche Abläufe für dieses Event.</p>
        </div>
        {canWrite ? (
          <button className="button" onClick={() => setCreating(true)} type="button">
            Dokument anlegen
          </button>
        ) : null}
      </header>
      {documents.length ? (
        <div className="event-document-list">
          {documents.map((document) => (
            <a
              className="event-document-item"
              href={`/o/${organizationId}/documents/${document.id}`}
              key={document.id}
            >
              <span>
                <small>{typeLabel(document.type)}</small>
                <strong>{documentNumberLabel(document.documentNumber)}</strong>
                <span>{document.recipientName ?? document.title}</span>
              </span>
              <span>
                <span
                  className={`status-badge status-badge--document-${document.effectiveStatus.toLowerCase()}`}
                >
                  {statusLabel(document.effectiveStatus)}
                </span>
                <small>
                  {document.validUntil
                    ? `Gültig bis ${formatDate(document.validUntil)}`
                    : `Version ${document.publishedVersion || '–'}`}
                </small>
              </span>
            </a>
          ))}
        </div>
      ) : (
        <p className="compact-empty">Noch keine Dokumente für diese Veranstaltung.</p>
      )}
      {creating ? (
        <CreateDocumentDialog
          eventId={eventId}
          eventName={eventName}
          organizationId={organizationId}
          templates={templates}
          onClose={() => setCreating(false)}
          onCreated={(document) => {
            setDocuments((items) => [document, ...items]);
            setCreating(false);
            router.push(`/o/${organizationId}/documents/${document.id}`);
          }}
        />
      ) : null}
    </section>
  );
}

function CreateDocumentDialog({
  organizationId,
  eventId,
  eventName,
  templates,
  onClose,
  onCreated,
}: {
  organizationId: string;
  eventId: string;
  eventName: string;
  templates: Template[];
  onClose: () => void;
  onCreated: (document: Document) => void;
}) {
  const firstType = templates[0]?.type ?? 'OFFER';
  const [type, setType] = useState<Template['type']>(firstType);
  const [templateId, setTemplateId] = useState(
    templates.find((template) => template.type === firstType)?.id ?? '',
  );
  const [title, setTitle] = useState(defaultTitle(firstType, eventName));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const matching = templates.filter((template) => template.type === type);
  const create = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await createBrowserApiClient().POST(
        '/api/v1/organizations/{organizationId}/events/{eventId}/documents',
        {
          params: { path: { organizationId, eventId } },
          body: { type, templateId, title },
        },
      );
      onCreated(requireData(result));
    } catch (error) {
      setMessage(
        apiErrorMessage(
          error,
          type === 'OFFER'
            ? 'Das Angebot konnte nicht angelegt werden. Prüfen Sie, ob ein aktiver Deal vorhanden ist.'
            : 'Der Ablauf konnte nicht angelegt werden.',
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Dokument anlegen">
      <div className="form-stack">
        <label>
          Dokumenttyp
          <select
            value={type}
            onChange={(event) => {
              const next = event.target.value as Template['type'];
              setType(next);
              setTemplateId(templates.find((template) => template.type === next)?.id ?? '');
              setTitle(defaultTitle(next, eventName));
            }}
          >
            <option value="OFFER">Angebot</option>
            <option value="PRODUCTION_INFORMATION">Ablauf</option>
          </select>
        </label>
        <label>
          {type === 'OFFER' ? 'Angebotstitel' : 'Ablauftitel'}
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Dokumentvorlage
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            <option value="">Vorlage auswählen</option>
            {matching.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} · Version {template.version}
              </option>
            ))}
          </select>
        </label>
        <p className="form-hint">
          Die Vorlage wird vollständig kopiert. Spätere Vorlagenänderungen wirken sich nicht auf
          dieses Dokument aus.
        </p>
        {matching.length === 0 ? (
          <p className="compact-warning">
            Für diesen Dokumenttyp ist keine aktive Vorlage vorhanden.
          </p>
        ) : null}
        {message ? <FormMessage message={message} /> : null}
        <div className="button-row button-row--end">
          <button className="button button--secondary" onClick={onClose} type="button">
            Abbrechen
          </button>
          <button
            className="button"
            disabled={busy || !templateId || !title.trim()}
            onClick={() => void create()}
            type="button"
          >
            Entwurf anlegen
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function defaultTitle(type: Template['type'], eventName: string) {
  return type === 'OFFER' ? `Vermietungsangebot für ${eventName}` : `Ablauf für ${eventName}`;
}

function requireData<T>(result: { data?: T; error?: unknown }): T {
  if (result.data !== undefined) return result.data;
  throw result.error;
}
