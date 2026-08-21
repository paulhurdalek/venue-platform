import type { ReactNode } from 'react';

export function DetailSections({ children }: { children: ReactNode }) {
  return <div className="detail-sections">{children}</div>;
}

export function DetailSection({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={wide ? 'info-section info-section--wide' : 'info-section'}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function DetailFields({ children }: { children: ReactNode }) {
  return <dl className="detail-fields">{children}</dl>;
}

export function DetailField({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'detail-field detail-field--wide' : 'detail-field'}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function ContactChannels({
  contact,
  emptyMessage = 'Keine Kontaktwege hinterlegt.',
  compact = false,
}: {
  contact: {
    email?: string | null | undefined;
    phone?: string | null | undefined;
    mobile?: string | null | undefined;
  };
  emptyMessage?: string | null;
  compact?: boolean;
}) {
  if (!contact.email && !contact.phone && !contact.mobile) {
    return emptyMessage ? <p className="compact-empty">{emptyMessage}</p> : null;
  }
  return (
    <dl className={compact ? 'contact-channels contact-channels--compact' : 'contact-channels'}>
      {contact.email ? (
        <div>
          <dt>E-Mail</dt>
          <dd>
            <a href={`mailto:${contact.email}`}>{contact.email}</a>
          </dd>
        </div>
      ) : null}
      {contact.phone ? (
        <div>
          <dt>Telefon</dt>
          <dd>
            <a href={`tel:${phoneHref(contact.phone)}`}>{contact.phone}</a>
          </dd>
        </div>
      ) : null}
      {contact.mobile ? (
        <div>
          <dt>Mobil</dt>
          <dd>
            <a href={`tel:${phoneHref(contact.mobile)}`}>{contact.mobile}</a>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

export function SafeWebLink({ href, children }: { href: string; children?: ReactNode }) {
  const safeHref = safeWebHref(href);
  if (!safeHref) return <span>{children ?? href}</span>;
  return (
    <a href={safeHref} rel="noopener noreferrer" target="_blank">
      {children ?? href}
    </a>
  );
}

export function CompactEmpty({ children }: { children: ReactNode }) {
  return <p className="compact-empty">{children}</p>;
}

export function formatAddress(value: {
  addressLine1?: string | null | undefined;
  addressLine2?: string | null | undefined;
  postalCode?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  countryCode?: string | null | undefined;
}): string | undefined {
  const cityLine = [value.postalCode, value.city].filter(Boolean).join(' ');
  const address = [value.addressLine1, value.addressLine2, cityLine, value.state, value.countryCode]
    .filter(Boolean)
    .join(', ');
  return address || undefined;
}

export function phoneHref(value: string): string {
  return value.replace(/[^+\d]/g, '');
}

function safeWebHref(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
