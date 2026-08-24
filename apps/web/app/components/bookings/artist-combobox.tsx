'use client';

import type { components } from '@venue/api-client';
import { useEffect, useId, useRef, useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import { artistDisplayLabel } from '../../../src/booking-utils';
import { FormMessage } from '../form-message';

type Artist = components['schemas']['ArtistDto'];

export function ArtistCombobox({
  canCreateArtist,
  initialArtists,
  onSelect,
  organizationId,
  selected,
}: {
  canCreateArtist: boolean;
  initialArtists: Artist[];
  onSelect: (artist: Artist | undefined) => void;
  organizationId: string;
  selected: Artist | undefined;
}) {
  const inputId = useId();
  const listId = `${inputId}-listbox`;
  const requestId = useRef(0);
  const [query, setQuery] = useState(() => (selected ? artistDisplayLabel(selected) : ''));
  const [options, setOptions] = useState(initialArtists);
  const [total, setTotal] = useState(initialArtists.length);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (selected && query === artistDisplayLabel(selected)) return;
    const timer = window.setTimeout(() => void searchArtists(query, 0, false), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function searchArtists(search: string, offset: number, append: boolean) {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    const client = createBrowserApiClient();
    const result = await client.GET('/api/v1/organizations/{organizationId}/artists', {
      credentials: 'include',
      params: {
        path: { organizationId },
        query: {
          ...(search.trim() ? { q: search.trim() } : {}),
          status: 'ACTIVE',
          limit: 25,
          offset,
        },
      },
    });
    if (currentRequest !== requestId.current) return;
    setLoading(false);
    if (!result.data || result.error) {
      setError(apiErrorMessage(result.error, 'Die Artist-Suche ist gerade nicht verfügbar.'));
      if (!append) setOptions([]);
      return;
    }
    setOptions((current) => (append ? [...current, ...result.data.items] : result.data.items));
    setTotal(result.data.total);
    setActiveIndex(result.data.items.length ? (append ? activeIndex : 0) : -1);
  }

  function choose(artist: Artist) {
    requestId.current += 1;
    setQuery(artistDisplayLabel(artist));
    setOptions((current) =>
      current.some(({ id }) => id === artist.id) ? current : [artist, ...current],
    );
    setOpen(false);
    setActiveIndex(-1);
    onSelect(artist);
  }

  function clear() {
    setQuery('');
    setOpen(true);
    onSelect(undefined);
  }

  function keyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      choose(options[activeIndex]!);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="artist-picker form-span">
      <label htmlFor={inputId}>Artist suchen und auswählen</label>
      <div className="artist-combobox">
        <input
          aria-activedescendant={
            open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-haspopup="listbox"
          autoComplete="off"
          id={inputId}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
            if (selected) onSelect(undefined);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={keyDown}
          placeholder="Künstler- oder Personenname"
          role="combobox"
          value={query}
        />
        <span className="artist-combobox__arrow" aria-hidden>
          ▾
        </span>
        {selected ? (
          <button
            aria-label="Artist-Auswahl entfernen"
            className="artist-combobox__clear"
            onClick={clear}
            type="button"
          >
            ×
          </button>
        ) : null}
        {open ? (
          <div className="artist-combobox__popover" id={listId} role="listbox">
            {options.map((artist, index) => (
              <button
                aria-selected={selected?.id === artist.id}
                className={
                  index === activeIndex ? 'artist-option artist-option--active' : 'artist-option'
                }
                id={`${listId}-option-${index}`}
                key={artist.id}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(artist)}
                role="option"
                type="button"
              >
                <span>{artistDisplayLabel(artist)}</span>
                {selected?.id === artist.id ? <strong>Ausgewählt</strong> : null}
              </button>
            ))}
            {loading ? <p className="artist-combobox__state">Artists werden geladen …</p> : null}
            {!loading && error ? <p className="artist-combobox__state">{error}</p> : null}
            {!loading && !error && options.length === 0 ? (
              <p className="artist-combobox__state">Kein passender aktiver Artist gefunden.</p>
            ) : null}
            {!loading && options.length < total ? (
              <button
                className="artist-combobox__more"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void searchArtists(query, options.length, true)}
                type="button"
              >
                Weitere Artists laden
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {selected ? (
        <p className="artist-selection" aria-live="polite">
          Ausgewählt: <strong>{artistDisplayLabel(selected)}</strong>
        </p>
      ) : null}
      {canCreateArtist ? (
        <p className="field-hint artist-create-hint">
          Kein passender Artist?{' '}
          <button className="link-button" onClick={() => setCreating(true)} type="button">
            Artist neu anlegen
          </button>
        </p>
      ) : null}
      {creating ? (
        <QuickCreateArtistDialog
          onCancel={() => setCreating(false)}
          onCreated={(artist) => {
            choose(artist);
            setCreating(false);
          }}
          organizationId={organizationId}
        />
      ) : null}
    </div>
  );
}

function QuickCreateArtistDialog({
  onCancel,
  onCreated,
  organizationId,
}: {
  onCancel: () => void;
  onCreated: (artist: Artist) => void;
  organizationId: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [matches, setMatches] = useState<Artist[]>([]);
  const [checkedStageName, setCheckedStageName] = useState('');
  const [draft, setDraft] = useState({
    stageName: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  useEffect(() => dialog.current?.showModal(), []);

  async function submit() {
    const stageName = draft.stageName.trim();
    if (!stageName) return;
    setPending(true);
    setMessage('');
    const client = createBrowserApiClient();
    if (checkedStageName !== stageName) {
      const duplicateResult = await client.GET('/api/v1/organizations/{organizationId}/artists', {
        credentials: 'include',
        params: {
          path: { organizationId },
          query: { q: stageName, status: 'ALL', limit: 25, offset: 0 },
        },
      });
      if (!duplicateResult.data || duplicateResult.error) {
        setMessage(
          apiErrorMessage(
            duplicateResult.error,
            'Mögliche Dubletten konnten nicht geprüft werden.',
          ),
        );
        setPending(false);
        return;
      }
      if (duplicateResult.data.items.length) {
        setMatches(duplicateResult.data.items);
        setCheckedStageName(stageName);
        setPending(false);
        return;
      }
    }
    const nullable = (name: Exclude<keyof typeof draft, 'stageName'>) => draft[name].trim() || null;
    const result = await client.POST('/api/v1/organizations/{organizationId}/artists', {
      credentials: 'include',
      params: { path: { organizationId } },
      body: {
        stageName,
        firstName: nullable('firstName'),
        lastName: nullable('lastName'),
        email: nullable('email'),
        phone: nullable('phone'),
      },
    });
    if (!result.data || result.error) {
      setMessage(apiErrorMessage(result.error, 'Der Artist konnte nicht angelegt werden.'));
      setPending(false);
      return;
    }
    onCreated(result.data);
  }

  return (
    <dialog
      aria-labelledby="quick-artist-heading"
      className="confirmation-dialog quick-artist-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialog}
    >
      <div
        className="confirmation-dialog__content form-grid"
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void submit();
          }
        }}
      >
        <div className="form-span">
          <p className="eyebrow">Direkt im Booking</p>
          <h2 id="quick-artist-heading">Artist neu anlegen</h2>
          <p>Der Künstlername reicht aus. Das Bookingformular bleibt im Hintergrund erhalten.</p>
        </div>
        <label className="form-span">
          Künstlername
          <input
            maxLength={200}
            name="stageName"
            onChange={(event) =>
              setDraft((current) => ({ ...current, stageName: event.target.value }))
            }
            required
            value={draft.stageName}
          />
        </label>
        <label>
          Vorname <span className="optional">optional</span>
          <input
            maxLength={120}
            name="firstName"
            onChange={(event) =>
              setDraft((current) => ({ ...current, firstName: event.target.value }))
            }
            value={draft.firstName}
          />
        </label>
        <label>
          Nachname <span className="optional">optional</span>
          <input
            maxLength={120}
            name="lastName"
            onChange={(event) =>
              setDraft((current) => ({ ...current, lastName: event.target.value }))
            }
            value={draft.lastName}
          />
        </label>
        <label>
          E-Mail <span className="optional">optional</span>
          <input
            name="email"
            onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
            type="email"
            value={draft.email}
          />
        </label>
        <label>
          Telefon <span className="optional">optional</span>
          <input
            maxLength={80}
            name="phone"
            onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
            type="tel"
            value={draft.phone}
          />
        </label>
        {matches.length ? (
          <div className="duplicate-artists form-span" role="alert">
            <strong>Mögliche Dubletten</strong>
            <p>Wählen Sie einen vorhandenen aktiven Artist oder legen Sie bewusst neu an.</p>
            {matches.map((artist) => (
              <div className="duplicate-artist" key={artist.id}>
                <span>
                  {artistDisplayLabel(artist)}
                  {artist.status === 'ARCHIVED' ? ' · archiviert' : ''}
                </span>
                {artist.status === 'ACTIVE' ? (
                  <button
                    className="button button--ghost button--compact"
                    onClick={() => onCreated(artist)}
                    type="button"
                  >
                    Diesen auswählen
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="form-span">
          <FormMessage message={message} />
          <div className="button-row confirmation-dialog__actions">
            <button
              className="button"
              disabled={pending || !draft.stageName.trim()}
              onClick={() => void submit()}
              type="button"
            >
              {pending
                ? 'Prüfen …'
                : matches.length
                  ? 'Trotzdem neu anlegen'
                  : 'Prüfen und anlegen'}
            </button>
            <button
              className="button button--ghost"
              disabled={pending}
              onClick={onCancel}
              type="button"
            >
              Abbrechen
            </button>
          </div>
          {matches.length === 0 ? null : (
            <p className="field-hint">
              Nach der Anlage können Sie das vollständige Profil direkt aus dem Booking öffnen.
            </p>
          )}
        </div>
      </div>
    </dialog>
  );
}
