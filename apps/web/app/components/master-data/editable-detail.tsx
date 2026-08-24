'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

import { FormMessage } from '../form-message';

type EditContextValue = {
  cancel: () => void;
  complete: (message: string) => void;
};

const EditContext = createContext<EditContextValue | undefined>(undefined);

export function EditableDetail({
  id,
  eyebrow,
  title,
  summary,
  badges,
  canEdit,
  sectionTitle,
  editTitle = 'Stammdaten bearbeiten',
  updatedLabel,
  priorityContent,
  secondaryActions,
  view,
  children,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  summary?: ReactNode;
  badges?: ReactNode;
  canEdit: boolean;
  sectionTitle: string;
  editTitle?: string;
  updatedLabel?: string;
  priorityContent?: ReactNode;
  secondaryActions?: ReactNode;
  view: ReactNode;
  children?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [success, setSuccess] = useState<string>();
  const editorId = `${id}-editor`;

  useEffect(() => setHydrated(true), []);

  function cancel() {
    setEditing(false);
  }

  function complete(message: string) {
    setSuccess(message);
    setEditing(false);
  }

  return (
    <EditContext.Provider value={{ cancel, complete }}>
      <header className="page-heading page-heading--detail">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {summary ? <div className="page-heading__summary">{summary}</div> : null}
        </div>
        <div className="detail-heading-actions">
          {badges ? <div className="heading-badges">{badges}</div> : null}
          {canEdit && !editing ? (
            <button
              aria-controls={editorId}
              aria-expanded={false}
              className="button"
              disabled={!hydrated}
              onClick={() => {
                setSuccess(undefined);
                setEditing(true);
              }}
              type="button"
            >
              Bearbeiten
            </button>
          ) : null}
          {!editing ? secondaryActions : null}
        </div>
      </header>
      {success ? (
        <div className="detail-success">
          <FormMessage message={success} success />
        </div>
      ) : null}
      {priorityContent}
      <section className="panel detail-panel" id={editorId}>
        <div className="panel__heading panel__heading--compact">
          <div>
            <h2>{editing ? editTitle : sectionTitle}</h2>
            {updatedLabel ? <p>{updatedLabel}</p> : null}
          </div>
        </div>
        {editing ? children : view}
      </section>
    </EditContext.Provider>
  );
}

export function EditCancelAction({ fallbackHref }: { fallbackHref: string }) {
  const editContext = useContext(EditContext);
  if (!editContext) {
    return (
      <a className="button button--secondary" href={fallbackHref}>
        Abbrechen
      </a>
    );
  }
  return (
    <button className="button button--secondary" onClick={editContext.cancel} type="button">
      Abbrechen
    </button>
  );
}

export function useDetailEdit() {
  return useContext(EditContext);
}
