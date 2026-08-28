'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

type NavigationSection = { href: string; label: string };

export function WorkspaceNavigation({
  organizationId,
  organizationName,
  sections,
  children,
}: {
  organizationId: string;
  organizationName: string;
  sections: NavigationSection[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const overviewHref = `/o/${organizationId}`;

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previouslyFocused = document.activeElement;
    const focusInitialControl = window.setTimeout(() => {
      drawerRef.current?.querySelector<HTMLElement>('button, a[href]')?.focus();
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
  }, [mobileMenuOpen]);

  const isActive = (href: string) =>
    href === overviewHref
      ? pathname === overviewHref
      : pathname === href || pathname.startsWith(`${href}/`);

  const links = (onNavigate?: () => void) =>
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

  const trapDrawerFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;

    const focusable = [
      ...(drawerRef.current?.querySelectorAll<HTMLElement>(
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
        <nav aria-label="Hauptnavigation" className="workspace-nav workspace-nav--desktop">
          {links()}
        </nav>
        <div className="workspace-sidebar__account">{children}</div>
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
            ref={drawerRef}
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
            <nav aria-label="Hauptnavigation" className="workspace-nav workspace-nav--drawer">
              {links(() => setMobileMenuOpen(false))}
            </nav>
            <div className="workspace-drawer__account">{children}</div>
          </aside>
        </div>
      ) : null}
    </>
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
