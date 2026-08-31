'use client';

import type { components } from '@venue/api-client';
import { useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import { FormMessage } from '../form-message';
import { ActionMenu } from '../ui/action-menu';
import { Dialog } from '../ui/dialog';
import { typeLabel } from './document-list';

type Template = components['schemas']['DocumentTemplateDto'];
type Block = components['schemas']['DocumentBlockInputDto'];

export function DocumentTemplateManager({
  organizationId,
  initialTemplates,
  canWrite,
  canArchive,
}: {
  organizationId: string;
  initialTemplates: Template[];
  canWrite: boolean;
  canArchive: boolean;
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [editing, setEditing] = useState<Template | null | undefined>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const changeStatus = async (template: Template) => {
    setBusy(template.id);
    setMessage(undefined);
    try {
      const result = await createBrowserApiClient().PATCH(
        '/api/v1/organizations/{organizationId}/document-templates/{templateId}/status',
        {
          params: { path: { organizationId, templateId: template.id } },
          body: {
            version: template.version,
            status: template.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
          },
        },
      );
      const saved = requireData(result);
      setTemplates((items) => items.map((item) => (item.id === saved.id ? saved : item)));
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Der Vorlagenstatus konnte nicht geändert werden.'));
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <section className="detail-panel document-template-page">
      <header className="section-heading-row">
        <div>
          <p className="eyebrow">Dokumente</p>
          <h1>Dokumentvorlagen</h1>
          <p>Versionierte, organisationsweite Textvorlagen ohne HTML oder Skriptausführung.</p>
        </div>
        {canWrite ? (
          <button className="button" onClick={() => setEditing(null)} type="button">
            Neue Dokumentvorlage
          </button>
        ) : null}
      </header>
      {message ? <FormMessage message={message} /> : null}
      <div className="document-template-list">
        {templates.length ? (
          templates.map((template) => (
            <details className="document-template-card" key={template.id}>
              <summary>
                <span>
                  <small>{typeLabel(template.type)}</small>
                  <strong>{template.name}</strong>
                  <span>{template.title}</span>
                </span>
                <span
                  className={`status-badge status-badge--${template.status === 'ACTIVE' ? 'active' : 'archived'}`}
                >
                  {template.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
                </span>
                <small>Version {template.version}</small>
                {canWrite || canArchive ? (
                  <span onClick={(event) => event.preventDefault()}>
                    <ActionMenu
                      compact
                      label={`Aktionen für Dokumentvorlage ${template.name}`}
                      items={[
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
                                label:
                                  template.status === 'ACTIVE' ? 'Archivieren' : 'Reaktivieren',
                                onSelect: () => void changeStatus(template),
                                disabled: busy === template.id,
                              },
                            ]
                          : []),
                      ]}
                    />
                  </span>
                ) : null}
              </summary>
              <div className="document-template-card__details">
                {template.type === 'OFFER' && template.introduction ? (
                  <TemplateText label="Einleitung" value={template.introduction} />
                ) : null}
                {template.type === 'OFFER'
                  ? template.blocks.map((block, index) => (
                      <TemplateText key={index} label={block.heading} value={block.body} />
                    ))
                  : null}
                {template.type === 'OFFER' && template.standardTerms ? (
                  <TemplateText label="Bedingungen" value={template.standardTerms} />
                ) : null}
                {template.type === 'OFFER' && template.closing ? (
                  <TemplateText label="Schlussformel" value={template.closing} />
                ) : null}
                {template.footer ? <TemplateText label="Fußzeile" value={template.footer} /> : null}
              </div>
            </details>
          ))
        ) : (
          <p className="compact-empty">Noch keine Dokumentvorlagen vorhanden.</p>
        )}
      </div>
      {editing !== undefined ? (
        <TemplateEditor
          organizationId={organizationId}
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

function TemplateText({ label, value }: { label: string; value: string }) {
  return (
    <section>
      <h3>{label}</h3>
      <p className="pre-wrap">{value}</p>
    </section>
  );
}

function TemplateEditor({
  organizationId,
  template,
  onClose,
  onSaved,
}: {
  organizationId: string;
  template: Template | null;
  onClose: () => void;
  onSaved: (template: Template) => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [type, setType] = useState<Template['type']>(template?.type ?? 'OFFER');
  const [title, setTitle] = useState(template?.title ?? '');
  const [introduction, setIntroduction] = useState(template?.introduction ?? '');
  const [blocks, setBlocks] = useState<Block[]>(template?.blocks ?? []);
  const [terms, setTerms] = useState(template?.standardTerms ?? '');
  const [closing, setClosing] = useState(template?.closing ?? '');
  const [footer, setFooter] = useState(template?.footer ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const save = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const body: components['schemas']['DocumentTemplateInputDto'] = {
        name,
        type,
        title,
        introduction: type === 'OFFER' ? introduction || null : (template?.introduction ?? null),
        blocks: type === 'OFFER' ? blocks : (template?.blocks ?? []),
        standardTerms: type === 'OFFER' ? terms || null : (template?.standardTerms ?? null),
        closing: type === 'OFFER' ? closing || null : (template?.closing ?? null),
        footer: footer || null,
      };
      const client = createBrowserApiClient();
      const result = template
        ? await client.PATCH(
            '/api/v1/organizations/{organizationId}/document-templates/{templateId}',
            {
              params: { path: { organizationId, templateId: template.id } },
              body: { ...body, version: template.version },
            },
          )
        : await client.POST('/api/v1/organizations/{organizationId}/document-templates', {
            params: { path: { organizationId } },
            body,
          });
      onSaved(requireData(result));
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Die Dokumentvorlage konnte nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      size="wide"
      title={template ? 'Dokumentvorlage bearbeiten' : 'Dokumentvorlage anlegen'}
    >
      <div className="document-editor">
        <div className="form-grid">
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Dokumenttyp
            <select
              disabled={Boolean(template)}
              value={type}
              onChange={(event) => setType(event.target.value as Template['type'])}
            >
              <option value="OFFER">Angebot</option>
              <option value="PRODUCTION_INFORMATION">Ablauf</option>
            </select>
          </label>
          <label className="form-grid__wide">
            {type === 'OFFER' ? 'Titelvorschlag für Angebote' : 'Ablauftitel'}
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          {type === 'OFFER' ? (
            <label className="form-grid__wide">
              Einleitung
              <textarea
                rows={5}
                value={introduction}
                onChange={(event) => setIntroduction(event.target.value)}
              />
            </label>
          ) : null}
        </div>
        {type === 'OFFER' ? (
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
                  placeholder="Überschrift"
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
                  placeholder="Sicherer mehrzeiliger Text"
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
        <div className="form-grid">
          {type === 'OFFER' ? (
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
            <textarea rows={3} value={footer} onChange={(event) => setFooter(event.target.value)} />
          </label>
        </div>
        {message ? <FormMessage message={message} /> : null}
        <div className="button-row button-row--end">
          <button className="button button--secondary" onClick={onClose} type="button">
            Abbrechen
          </button>
          <button className="button" disabled={busy} onClick={() => void save()} type="button">
            Speichern
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function requireData<T>(result: { data?: T; error?: unknown }): T {
  if (result.data !== undefined) return result.data;
  throw result.error;
}
