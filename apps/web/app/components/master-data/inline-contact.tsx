'use client';

import type { components } from '@venue/api-client';

export type ContactDraft = {
  firstName: string | null;
  lastName: string | null;
  label: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  notes: string | null;
};

export type ContactMatch = components['schemas']['ContactDuplicateMatchDto'];

export function contactDraft(form: FormData): ContactDraft {
  const value = (name: string) => String(form.get(name) ?? '').trim() || null;
  return {
    firstName: value('firstName'),
    lastName: value('lastName'),
    label: value('label'),
    email: value('email'),
    phone: value('phone'),
    mobile: value('mobile'),
    notes: null,
  };
}

export function ContactFields() {
  return (
    <div className="form-grid compact-contact-form">
      <label>
        Vorname <span className="optional">optional bei Nachname</span>
        <input autoComplete="given-name" maxLength={120} name="firstName" />
      </label>
      <label>
        Nachname <span className="optional">optional bei Vorname</span>
        <input autoComplete="family-name" maxLength={120} name="lastName" />
      </label>
      <label className="form-span">
        Funktion oder Bezeichnung <span className="optional">optional</span>
        <input maxLength={160} name="label" />
      </label>
      <label>
        E-Mail <span className="optional">optional</span>
        <input autoComplete="email" name="email" type="email" />
      </label>
      <label>
        Telefon <span className="optional">optional</span>
        <input autoComplete="tel" maxLength={80} name="phone" type="tel" />
      </label>
      <label>
        Mobiltelefon <span className="optional">optional</span>
        <input maxLength={80} name="mobile" type="tel" />
      </label>
    </div>
  );
}

export function ContactMatches({
  matches,
  onReuse,
  onCreateAnyway,
  pending,
}: {
  matches: ContactMatch[];
  onReuse: (contactId: string) => void;
  onCreateAnyway?: (() => void) | undefined;
  pending: boolean;
}) {
  if (matches.length === 0) return null;
  const strong = matches.some(({ strength }) => strength === 'STRONG');
  return (
    <div className="duplicate-warning" role="alert">
      <h4>
        {strong ? 'Möglicher bestehender Kontakt gefunden' : 'Namensgleicher Kontakt gefunden'}
      </h4>
      <p>
        {strong
          ? 'Bitte verwenden Sie den vorhandenen zentralen Kontakt.'
          : 'Prüfen Sie den Treffer. Nur wenn es eine andere Person ist, legen Sie neu an.'}
      </p>
      <ul className="duplicate-match-list">
        {matches.map(({ contact, reasons }) => (
          <li key={contact.id}>
            <span>
              <strong>{contactName(contact)}</strong>
              {contact.label ? ` · ${contact.label}` : ''}
              {contact.email ? ` · ${contact.email}` : ''}
              {!contact.email && contact.mobile ? ` · ${contact.mobile}` : ''}
              {!contact.email && !contact.mobile && contact.phone ? ` · ${contact.phone}` : ''}
              <small> Treffer über {reasons.map(reasonLabel).join(', ')}</small>
            </span>
            <button
              className="button button--small button--secondary"
              disabled={pending}
              onClick={() => onReuse(contact.id)}
              type="button"
            >
              Vorhandenen Kontakt verwenden
            </button>
          </li>
        ))}
      </ul>
      {!strong && onCreateAnyway ? (
        <button className="text-button" disabled={pending} onClick={onCreateAnyway} type="button">
          Trotzdem neu anlegen
        </button>
      ) : null}
    </div>
  );
}

export function contactName(contact: {
  firstName?: string | null;
  lastName?: string | null;
}): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unbenannter Kontakt';
}

function reasonLabel(reason: 'EMAIL' | 'PHONE' | 'NAME'): string {
  if (reason === 'EMAIL') return 'E-Mail';
  if (reason === 'PHONE') return 'Telefon';
  return 'Name';
}
