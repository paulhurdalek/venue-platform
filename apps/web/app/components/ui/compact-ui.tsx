import Link from 'next/link';
import type { ReactNode } from 'react';

export function Tabs({
  label,
  tabs,
}: {
  label: string;
  tabs: Array<{ id: string; label: string; href: string; active: boolean }>;
}) {
  return (
    <nav aria-label={label} className="compact-tabs">
      <div role="tablist">
        {tabs.map((tab) => (
          <Link
            aria-current={tab.active ? 'page' : undefined}
            aria-selected={tab.active}
            className={tab.active ? 'compact-tab compact-tab--active' : 'compact-tab'}
            href={tab.href}
            key={tab.id}
            role="tab"
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function CompactNotice({
  children,
  tone = 'neutral',
  onClick,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warning' | 'success';
  onClick?: () => void;
}) {
  const className = `compact-notice compact-notice--${tone}`;
  return onClick ? (
    <button className={className} onClick={onClick} type="button">
      {children}
    </button>
  ) : (
    <p className={className}>{children}</p>
  );
}
