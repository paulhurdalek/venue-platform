'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import { FormMessage } from '../form-message';
import { ActionMenu } from '../ui/action-menu';
import { Dialog } from '../ui/dialog';

type Document = components['schemas']['DocumentDto'];
type PendingAction = { document: Document; kind: 'archive' | 'delete' | 'restore' };

export function DocumentList({
  canPublish,
  canWrite,
  documents,
  organizationId,
}: {
  canPublish: boolean;
  canWrite: boolean;
  documents: Document[];
  organizationId: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pendingAction, setPendingAction] = useState<PendingAction>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const runPendingAction = async () => {
    if (!pendingAction) return;
    const { document, kind } = pendingAction;
    setBusy(true);
    setMessage(undefined);
    try {
      const client = createBrowserApiClient();
      if (kind === 'delete') {
        const result = await client.DELETE(
          '/api/v1/organizations/{organizationId}/documents/{documentId}',
          {
            params: { path: { organizationId, documentId: document.id } },
            body: { revision: document.revision },
          },
        );
        if (!result.response.ok) throw new Error('Das Löschen des Dokuments ist fehlgeschlagen.');
      } else {
        const result = await client.POST(
          kind === 'archive'
            ? '/api/v1/organizations/{organizationId}/documents/{documentId}/archive'
            : '/api/v1/organizations/{organizationId}/documents/{documentId}/restore',
          {
            params: { path: { organizationId, documentId: document.id } },
            body: { revision: document.revision },
          },
        );
        if (!result.response.ok) {
          throw new Error('Die Archivierungsaktion ist fehlgeschlagen.');
        }
      }
      setPendingAction(undefined);
      setMessage(actionSuccessMessage(kind));
      router.refresh();
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Die Dokumentaktion konnte nicht ausgeführt werden.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {message ? <FormMessage message={message} /> : null}
      {documents.length ? (
        <div className="document-list" data-testid="document-list">
          <div className="document-list__head" aria-hidden="true">
            <span>Typ / Dokument</span>
            <span>Event / Empfänger</span>
            <span>Status / Version</span>
            <span>Gültigkeit / Erstellt</span>
            <span />
          </div>
          {documents.map((document) => {
            const open = expanded.has(document.id);
            const href = `/o/${organizationId}/documents/${document.id}`;
            const canDelete = document.status === 'ENTWURF' && document.versions.length === 0;
            const items = [
              {
                id: 'open',
                label: 'Dokument öffnen',
                onSelect: () => router.push(href),
              },
              {
                id: 'event',
                label: 'Event öffnen',
                onSelect: () => router.push(`/o/${organizationId}/events/${document.eventId}`),
              },
              ...(canWrite && canDelete
                ? [
                    {
                      id: 'delete',
                      label: 'Löschen',
                      danger: true,
                      onSelect: () => setPendingAction({ document, kind: 'delete' as const }),
                    },
                  ]
                : []),
              ...(canPublish && document.status === 'ARCHIVIERT'
                ? [
                    {
                      id: 'restore',
                      label: 'Wiederherstellen',
                      onSelect: () => setPendingAction({ document, kind: 'restore' as const }),
                    },
                  ]
                : canPublish
                  ? [
                      {
                        id: 'archive',
                        label: 'Archivieren',
                        onSelect: () => setPendingAction({ document, kind: 'archive' as const }),
                      },
                    ]
                  : []),
            ];
            return (
              <article className="document-row" key={document.id} aria-label={document.title}>
                <div className="document-row__grid">
                  <div>
                    <span className="document-type-label">{typeLabel(document.type)}</span>
                    <a className="text-link document-row__title" href={href}>
                      {documentNumberLabel(document.documentNumber)}
                    </a>
                    <small>{document.title}</small>
                  </div>
                  <div>
                    <a
                      className="text-link"
                      href={`/o/${organizationId}/events/${document.eventId}`}
                    >
                      {document.eventName}
                    </a>
                    <small>{document.recipientName ?? document.locationName}</small>
                  </div>
                  <div>
                    <span
                      className={`status-badge status-badge--document-${document.effectiveStatus.toLowerCase()}`}
                    >
                      {statusLabel(document.effectiveStatus)}
                    </span>
                    <small>
                      {document.publishedVersion
                        ? `Version ${document.publishedVersion}`
                        : 'Noch nicht versioniert'}
                    </small>
                  </div>
                  <div>
                    <span>
                      {document.validUntil
                        ? `bis ${formatDate(document.validUntil)}`
                        : 'Keine Frist'}
                    </span>
                    <small>{new Date(document.createdAt).toLocaleString('de-DE')}</small>
                  </div>
                  <div className="document-row__actions">
                    <button
                      aria-expanded={open}
                      className="button button--quiet button--small"
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (next.has(document.id)) next.delete(document.id);
                          else next.add(document.id);
                          return next;
                        })
                      }
                      type="button"
                    >
                      {open ? 'Weniger' : 'Details'}
                    </button>
                    <ActionMenu
                      compact
                      label={`Aktionen für ${documentNumberLabel(document.documentNumber)}`}
                      items={items}
                    />
                  </div>
                </div>
                {open ? (
                  <div className="document-row__details">
                    <dl>
                      <div>
                        <dt>Vorlage</dt>
                        <dd>
                          {document.sourceTemplateName} · Version {document.sourceTemplateVersion}
                        </dd>
                      </div>
                      <div>
                        <dt>Location</dt>
                        <dd>{document.locationName}</dd>
                      </div>
                      <div>
                        <dt>Entwurfsrevision</dt>
                        <dd>{document.revision}</dd>
                      </div>
                      <div>
                        <dt>Letzte Ausgabe</dt>
                        <dd>
                          {document.lastPublishedAt
                            ? new Date(document.lastPublishedAt).toLocaleString('de-DE')
                            : 'Noch nicht erstellt'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="compact-empty">Keine Dokumente für diese Filter.</p>
      )}
      {pendingAction ? (
        <DocumentActionDialog
          busy={busy}
          document={pendingAction.document}
          kind={pendingAction.kind}
          onClose={() => setPendingAction(undefined)}
          onConfirm={() => void runPendingAction()}
        />
      ) : null}
    </>
  );
}

function DocumentActionDialog({
  busy,
  document,
  kind,
  onClose,
  onConfirm,
}: PendingAction & { busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const title =
    kind === 'delete'
      ? 'Entwurf löschen'
      : kind === 'archive'
        ? 'Dokument archivieren'
        : 'Dokument wiederherstellen';
  return (
    <Dialog open onClose={onClose} title={title}>
      <div className="form-stack">
        <p>
          <strong>{document.title}</strong>
        </p>
        {kind === 'delete' ? (
          <p className="compact-warning">
            Dieser Entwurf wird endgültig gelöscht und kann nicht wiederhergestellt werden.
          </p>
        ) : kind === 'archive' ? (
          <p>PDF-Versionen, Historie, Snapshots und Dokumentnummer bleiben vollständig erhalten.</p>
        ) : (
          <p>
            Das Dokument erscheint wieder in der normalen Liste. Es wird keine neue PDF-Version
            erzeugt.
          </p>
        )}
        <div className="button-row button-row--end">
          <button
            className="button button--secondary"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Abbrechen
          </button>
          <button
            className={kind === 'delete' ? 'button button--danger' : 'button'}
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {kind === 'delete'
              ? 'Endgültig löschen'
              : kind === 'archive'
                ? 'Archivieren'
                : 'Wiederherstellen'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function actionSuccessMessage(kind: PendingAction['kind']) {
  return {
    delete: 'Der Dokumententwurf wurde endgültig gelöscht.',
    archive: 'Das Dokument wurde archiviert. PDF-Versionen und Historie bleiben erhalten.',
    restore: 'Das Dokument wurde wiederhergestellt.',
  }[kind];
}

export function typeLabel(type: Document['type']) {
  return type === 'OFFER' ? 'Angebot' : 'Ablauf';
}

export function documentNumberLabel(value: string | null | undefined) {
  return value ?? 'Entwurf - Nummer folgt bei Übergabe';
}

export function statusLabel(status: Document['effectiveStatus']) {
  return {
    ENTWURF: 'Entwurf',
    ERSTELLT: 'Erstellt',
    UEBERGEBEN: 'Übergeben',
    ANGENOMMEN: 'Angenommen',
    ABGELEHNT: 'Abgelehnt',
    ABGELAUFEN: 'Abgelaufen',
    FREIGEGEBEN: 'Freigegeben',
    ARCHIVIERT: 'Archiviert',
  }[status];
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
