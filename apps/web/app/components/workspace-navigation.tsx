'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from 'react';

type NavigationSection = { href: string; label: string };

type NavigationProps = {
  organizationId: string;
  organizationName: string;
  userName: string;
  userEmail: string;
  workSections: NavigationSection[];
  masterDataSections: NavigationSection[];
  templateSections: NavigationSection[];
  children: ReactNode;
};

export function WorkspaceNavigation({
  organizationId,
  organizationName,
  userName,
  userEmail,
  workSections,
  masterDataSections,
  templateSections,
  children,
}: NavigationProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [masterDataOpen, setMasterDataOpen] = useState(true);
  const [templatesOpen, setTemplatesOpen] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [restoredStorageKey, setRestoredStorageKey] = useState<string | null>(null);
  const drawerId = useId();
  const masterDataStorageKey = `venue-platform:navigation:${organizationId}:${userEmail}:master-data`;
  const templatesStorageKey = `venue-platform:navigation:${organizationId}:${userEmail}:templates`;
  const overviewHref = `/o/${organizationId}`;
  const masterDataActive = sectionIsActive(masterDataSections, pathname, overviewHref);
  const templatesActive = sectionIsActive(templateSections, pathname, overviewHref);
  const accountActive = pathname.startsWith(`/o/${organizationId}/settings/`);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const savedMasterData = window.localStorage.getItem(masterDataStorageKey);
    const savedTemplates = window.localStorage.getItem(templatesStorageKey);
    setMasterDataOpen(savedMasterData !== 'collapsed');
    setTemplatesOpen(savedTemplates !== 'collapsed');
    setRestoredStorageKey(`${masterDataStorageKey}:${templatesStorageKey}`);
  }, [masterDataStorageKey, templatesStorageKey]);

  useEffect(() => {
    if (restoredStorageKey !== `${masterDataStorageKey}:${templatesStorageKey}`) return;
    window.localStorage.setItem(masterDataStorageKey, masterDataOpen ? 'expanded' : 'collapsed');
    window.localStorage.setItem(templatesStorageKey, templatesOpen ? 'expanded' : 'collapsed');
  }, [
    masterDataOpen,
    masterDataStorageKey,
    restoredStorageKey,
    templatesOpen,
    templatesStorageKey,
  ]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previouslyFocused = document.activeElement;
    const focusInitialControl = window.setTimeout(() => {
      document.getElementById(drawerId)?.querySelector<HTMLElement>('button, a[href]')?.focus();
    }, 0);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.clearTimeout(focusInitialControl);
      document.removeEventListener('keydown', closeOnEscape);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [drawerId, mobileMenuOpen]);

  const isActive = (href: string) =>
    href === overviewHref
      ? pathname === overviewHref
      : pathname === href || pathname.startsWith(`${href}/`);

  const renderLinks = (sections: NavigationSection[], onNavigate?: () => void) =>
    sections.map((section) => {
      const active = isActive(section.href);
      return (
        <Link
          aria-current={active ? 'page' : undefined}
          className={
            active ? 'workspace-nav__link workspace-nav__link--active' : 'workspace-nav__link'
          }
          href={section.href}
          key={section.href}
          {...(onNavigate ? { onClick: onNavigate } : {})}
        >
          {section.label}
        </Link>
      );
    });

  const renderNavigation = (onNavigate?: () => void) => {
    const currentMasterDataOpen = masterDataActive || masterDataOpen;
    const currentTemplatesOpen = templatesActive || templatesOpen;
    return (
      <nav aria-label="Hauptnavigation" className="workspace-nav">
        <NavigationLabel>Arbeiten</NavigationLabel>
        <div className="workspace-nav__links">{renderLinks(workSections, onNavigate)}</div>
        <NavigationGroup
          active={masterDataActive}
          label="Stammdaten"
          onToggle={() => setMasterDataOpen((open) => !open)}
          open={currentMasterDataOpen}
        >
          {renderLinks(masterDataSections, onNavigate)}
        </NavigationGroup>
        <NavigationGroup
          active={templatesActive}
          label="Vorlagen"
          onToggle={() => setTemplatesOpen((open) => !open)}
          open={currentTemplatesOpen}
        >
          {renderLinks(templateSections, onNavigate)}
        </NavigationGroup>
      </nav>
    );
  };

  const renderAccountMenu = (onNavigate?: () => void) => {
    const open = accountActive || accountOpen;
    return (
      <section className="workspace-account-menu">
        <button
          aria-expanded={open}
          aria-label={`${organizationName}: ${userName || userEmail}. Organisationsmenü`}
          className={
            accountActive
              ? 'workspace-account-menu__trigger workspace-account-menu__trigger--active'
              : 'workspace-account-menu__trigger'
          }
          onClick={() => setAccountOpen((current) => !current)}
          type="button"
        >
          <span className="workspace-account-menu__identity">
            <strong>{organizationName}</strong>
            <span>{userName || userEmail}</span>
          </span>
          <span aria-hidden="true" className="workspace-nav__chevron">
            {open ? '▾' : '▸'}
          </span>
        </button>
        {open ? (
          <div className="workspace-account-menu__content" onClick={onNavigate}>
            {children}
          </div>
        ) : null}
      </section>
    );
  };

  const trapDrawerFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;

    const focusable = [
      ...(document
        .getElementById(drawerId)
        ?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? []),
    ];
    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <aside aria-label="Anwendungsnavigation" className="workspace-sidebar">
        <Brand organizationId={organizationId} organizationName={organizationName} />
        <p className="workspace-product-label">Venue Platform</p>
        {renderNavigation()}
        <div className="workspace-sidebar__account">{renderAccountMenu()}</div>
      </aside>

      <header className="workspace-mobile-header">
        <Brand organizationId={organizationId} organizationName={organizationName} />
        <button
          aria-controls={drawerId}
          aria-expanded={mobileMenuOpen}
          className="button button--secondary workspace-menu-button"
          onClick={() => setMobileMenuOpen(true)}
          type="button"
        >
          Menü öffnen
        </button>
      </header>

      {mobileMenuOpen ? (
        <div
          className="workspace-drawer-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMobileMenuOpen(false);
          }}
        >
          <aside
            aria-labelledby={`${drawerId}-title`}
            aria-modal="true"
            className="workspace-drawer"
            id={drawerId}
            onKeyDown={trapDrawerFocus}
            role="dialog"
          >
            <div className="workspace-drawer__header">
              <div>
                <strong id={`${drawerId}-title`}>Venue Platform</strong>
                <span>{organizationName}</span>
              </div>
              <button
                aria-label="Menü schließen"
                className="button button--quiet workspace-drawer__close"
                onClick={() => setMobileMenuOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            {renderNavigation(() => setMobileMenuOpen(false))}
            <div className="workspace-drawer__account">
              {renderAccountMenu(() => setMobileMenuOpen(false))}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function NavigationLabel({ children }: { children: ReactNode }) {
  return <p className="workspace-nav__label">{children}</p>;
}

function NavigationGroup({
  active,
  children,
  label,
  onToggle,
  open,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onToggle: () => void;
  open: boolean;
}) {
  return (
    <section
      className={
        active ? 'workspace-nav__group workspace-nav__group--active' : 'workspace-nav__group'
      }
    >
      <button
        aria-expanded={open}
        className="workspace-nav__group-trigger"
        onClick={onToggle}
        type="button"
      >
        <span>{label}</span>
        <span aria-hidden="true" className="workspace-nav__chevron">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div className="workspace-nav__links workspace-nav__links--nested">{children}</div>
      ) : null}
    </section>
  );
}

function sectionIsActive(sections: NavigationSection[], pathname: string, overviewHref: string) {
  return sections.some((section) =>
    section.href === overviewHref
      ? pathname === overviewHref
      : pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
}

function Brand({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  return (
    <Link className="workspace-brand" href={`/o/${organizationId}`}>
      <span className="brand-mark" aria-hidden="true">
        VP
      </span>
      <span>
        <strong>{organizationName}</strong>
        <small>Verwaltung</small>
      </span>
    </Link>
  );
}
