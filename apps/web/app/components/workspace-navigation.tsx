'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function WorkspaceNavigation({
  organizationId,
  sections,
}: {
  organizationId: string;
  sections: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();
  const overviewHref = `/o/${organizationId}`;

  return (
    <nav aria-label="Hauptnavigation" className="workspace-nav">
      {sections.map((section) => {
        const active =
          section.href === overviewHref
            ? pathname === overviewHref
            : pathname === section.href || pathname.startsWith(`${section.href}/`);
        return (
          <Link
            aria-current={active ? 'page' : undefined}
            className={
              active ? 'workspace-nav__link workspace-nav__link--active' : 'workspace-nav__link'
            }
            href={section.href}
            key={section.href}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
