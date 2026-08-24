'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import {
  formatMinorAmount,
  majorAmountToMinor,
  minorAmountToInput,
} from '../../../src/booking-utils';
import { FormMessage } from '../form-message';

type Requirement = components['schemas']['LineupRequirementDto'];
type RequirementSet = components['schemas']['LineupRequirementSetDto'];
type Role = Requirement['role'];
type DraftRequirement = {
  id?: string;
  version?: number;
  role: Role;
  customRoleLabel: string;
  requiredCount: string;
  defaultFeeAmount: string;
  defaultFeeCurrency: string;
};

export function LineupRequirements({
  canFinance,
  canWrite,
  initial,
  onChange,
  organizationId,
  resourceId,
  resourceType,
}: {
  canFinance: boolean;
  canWrite: boolean;
  initial: RequirementSet;
  onChange?: (requirements: RequirementSet) => void;
  organizationId: string;
  resourceId: string;
  resourceType: 'event' | 'event-format';
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [requirements, setRequirements] = useState(initial);
  const [drafts, setDrafts] = useState(() => initial.items.map(toDraft));

  function beginEdit() {
    setDrafts(requirements.items.map(toDraft));
    setMessage('');
    setEditing(true);
    setExpanded(true);
  }

  function cancelEdit() {
    setDrafts(requirements.items.map(toDraft));
    setMessage('');
    setEditing(false);
  }

  function update(index: number, values: Partial<DraftRequirement>) {
    setDrafts((current) =>
      current.map((draft, candidate) => (candidate === index ? { ...draft, ...values } : draft)),
    );
  }

  function move(index: number, offset: -1 | 1) {
    setDrafts((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function save() {
    setPending(true);
    setMessage('');
    const client = createBrowserApiClient();
    let body: components['schemas']['ReplaceLineupRequirementsDto'];
    try {
      body = {
        version: requirements.version,
        items: drafts.map((draft) => ({
          ...(draft.id ? { id: draft.id, version: draft.version } : {}),
          role: draft.role,
          ...(draft.role === 'OTHER' ? { customRoleLabel: draft.customRoleLabel.trim() } : {}),
          requiredCount: Number(draft.requiredCount),
          ...(canFinance && draft.defaultFeeAmount
            ? {
                defaultFeeMinor: majorAmountToMinor(
                  draft.defaultFeeAmount,
                  draft.defaultFeeCurrency,
                ),
                defaultFeeCurrency: draft.defaultFeeCurrency.toUpperCase(),
              }
            : canFinance
              ? { defaultFeeMinor: null, defaultFeeCurrency: null }
              : {}),
        })),
      };
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bitte die Geldbeträge prüfen.');
      setPending(false);
      return;
    }
    const result =
      resourceType === 'event'
        ? await client.PUT(
            '/api/v1/organizations/{organizationId}/events/{eventId}/lineup-requirements',
            {
              params: { path: { organizationId, eventId: resourceId } },
              body,
            },
          )
        : await client.PUT(
            '/api/v1/organizations/{organizationId}/event-formats/{eventFormatId}/lineup-requirements',
            {
              params: { path: { organizationId, eventFormatId: resourceId } },
              body,
            },
          );
    if (!result.data || result.error) {
      setMessage(
        apiErrorMessage(result.error, 'Die Line-up-Vorgaben konnten nicht gespeichert werden.'),
      );
      setPending(false);
      return;
    }
    setRequirements(result.data);
    onChange?.(result.data);
    setDrafts(result.data.items.map(toDraft));
    setEditing(false);
    setExpanded(false);
    setPending(false);
    setMessage('Die Line-up-Vorgaben wurden gespeichert.');
    router.refresh();
  }

  return (
    <section className="lineup-requirements" aria-labelledby={`${resourceType}-lineup-heading`}>
      <div className="compact-section-heading lineup-requirements__heading">
        <div>
          <h3 id={`${resourceType}-lineup-heading`}>Line-up-Vorgaben</h3>
          <p>
            {resourceType === 'event'
              ? 'Veranstaltungsspezifischer Snapshot; Änderungen an der Vorlage wirken hier nicht nach.'
              : 'Diese Vorgaben werden beim Anlegen einer Veranstaltung als Snapshot kopiert.'}
          </p>
        </div>
        {!editing ? (
          <div className="button-row">
            <button
              aria-expanded={expanded}
              className="button button--ghost button--compact"
              onClick={() => setExpanded((current) => !current)}
              type="button"
            >
              {expanded ? 'Einklappen' : `${requirements.items.length} Vorgaben anzeigen`}
            </button>
            {canWrite ? (
              <button
                className="button button--secondary button--compact"
                onClick={beginEdit}
                type="button"
              >
                Vorgaben bearbeiten
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="lineup-requirement-editor">
          {drafts.length === 0 ? (
            <p className="compact-empty">
              Noch keine Positionen. Legen Sie die benötigten Rollen an.
            </p>
          ) : null}
          {drafts.map((draft, index) => (
            <fieldset className="lineup-requirement-row" key={draft.id ?? `new-${index}`}>
              <legend>Position {index + 1}</legend>
              <label>
                Rolle
                <select
                  onChange={(event) => update(index, { role: event.target.value as Role })}
                  value={draft.role}
                >
                  <option value="ARTIST">Artist</option>
                  <option value="MODERATOR">Moderator</option>
                  <option value="OTHER">Sonstige Rolle</option>
                </select>
              </label>
              {draft.role === 'OTHER' ? (
                <label>
                  Rollenbezeichnung
                  <input
                    maxLength={120}
                    onChange={(event) => update(index, { customRoleLabel: event.target.value })}
                    required
                    value={draft.customRoleLabel}
                  />
                </label>
              ) : null}
              <label>
                Benötigte Anzahl
                <input
                  max={1000}
                  min={1}
                  onChange={(event) => update(index, { requiredCount: event.target.value })}
                  required
                  type="number"
                  value={draft.requiredCount}
                />
              </label>
              {canFinance ? (
                <>
                  <label>
                    Standardgage <span className="optional">optional</span>
                    <input
                      inputMode="decimal"
                      onChange={(event) => update(index, { defaultFeeAmount: event.target.value })}
                      placeholder="200,00"
                      value={draft.defaultFeeAmount}
                    />
                  </label>
                  <label>
                    Währung
                    <input
                      disabled={!draft.defaultFeeAmount}
                      maxLength={3}
                      minLength={3}
                      onChange={(event) =>
                        update(index, { defaultFeeCurrency: event.target.value })
                      }
                      value={draft.defaultFeeCurrency}
                    />
                  </label>
                </>
              ) : null}
              <div className="button-row requirement-row-actions">
                <button
                  aria-label={`Position ${index + 1} nach oben`}
                  className="button button--ghost button--compact"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  type="button"
                >
                  Nach oben
                </button>
                <button
                  aria-label={`Position ${index + 1} nach unten`}
                  className="button button--ghost button--compact"
                  disabled={index === drafts.length - 1}
                  onClick={() => move(index, 1)}
                  type="button"
                >
                  Nach unten
                </button>
                <button
                  className="button button--danger button--compact"
                  onClick={() =>
                    setDrafts((current) => current.filter((_, item) => item !== index))
                  }
                  type="button"
                >
                  Entfernen
                </button>
              </div>
            </fieldset>
          ))}
          <div className="button-row">
            <button
              className="button button--secondary button--compact"
              onClick={() =>
                setDrafts((current) => [
                  ...current,
                  {
                    role: 'ARTIST',
                    customRoleLabel: '',
                    requiredCount: '1',
                    defaultFeeAmount: '',
                    defaultFeeCurrency: 'EUR',
                  },
                ])
              }
              type="button"
            >
              Position hinzufügen
            </button>
          </div>
          <FormMessage message={message} />
          <div className="button-row">
            <button className="button" disabled={pending} onClick={save} type="button">
              {pending ? 'Speichern …' : 'Vorgaben speichern'}
            </button>
            <button
              className="button button--ghost"
              disabled={pending}
              onClick={cancelEdit}
              type="button"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : expanded && requirements.items.length > 0 ? (
        <div className="lineup-requirement-list">
          {requirements.items.map((requirement) => (
            <div className="lineup-requirement-summary" key={requirement.id}>
              <strong>{roleLabel(requirement)}</strong>
              <span>{requirement.requiredCount} benötigt</span>
              {canFinance && requirement.defaultFeeMinor ? (
                <span>
                  Standardgage:{' '}
                  {formatMinorAmount(requirement.defaultFeeMinor, requirement.defaultFeeCurrency)}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : expanded ? (
        <p className="compact-empty">
          Keine Line-up-Vorgaben hinterlegt. Es werden keine Positionen erfunden.
        </p>
      ) : null}
      {!editing ? <FormMessage message={message} /> : null}
    </section>
  );
}

function toDraft(requirement: Requirement): DraftRequirement {
  return {
    id: requirement.id,
    version: requirement.version,
    role: requirement.role,
    customRoleLabel: requirement.customRoleLabel ?? '',
    requiredCount: String(requirement.requiredCount),
    defaultFeeAmount: minorAmountToInput(
      requirement.defaultFeeMinor,
      requirement.defaultFeeCurrency ?? 'EUR',
    ),
    defaultFeeCurrency: requirement.defaultFeeCurrency ?? 'EUR',
  };
}

function roleLabel(requirement: Pick<Requirement, 'role' | 'customRoleLabel'>) {
  if (requirement.role === 'ARTIST') return 'Artists';
  if (requirement.role === 'MODERATOR') return 'Moderator';
  return requirement.customRoleLabel ?? 'Sonstige Rolle';
}
