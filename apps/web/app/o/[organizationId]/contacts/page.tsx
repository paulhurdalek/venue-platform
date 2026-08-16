import { activePageMembership } from '../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../src/api/server';
import { MasterDataFilters, Pagination } from '../../../components/master-data/list-controls';

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(organizationId, `/o/${organizationId}/contacts`);
  if (!membership) return null;
  if (!hasPermission(membership, 'contacts.read'))
    return (
      <section className="state-card">
        <h1>Kontakte sind für Ihre Rolle nicht freigegeben.</h1>
      </section>
    );
  const search = await searchParams;
  const q = value(search.q);
  const status = entityStatus(value(search.status));
  const incomplete = value(search.incomplete) === 'true';
  const offset = nonNegative(value(search.offset));
  const client = await serverApiClient();
  const result = unwrap(
    await client.GET('/api/v1/organizations/{organizationId}/contacts', {
      params: {
        path: { organizationId },
        query: {
          status,
          limit: 25,
          offset,
          ...(q ? { q } : {}),
          ...(incomplete ? { incomplete: true } : {}),
        },
      },
    }),
  );
  const canWrite = hasPermission(membership, 'contacts.write');
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Stammdaten</p>
          <h1>Kontakte</h1>
          <p>Wiederverwendbare Personen für Artists und Geschäftspartner.</p>
        </div>
        {canWrite ? (
          <a className="button" href={`/o/${organizationId}/contacts/new`}>
            Kontakt anlegen
          </a>
        ) : null}
      </header>
      <section className="panel">
        <MasterDataFilters incomplete={incomplete} q={q} status={status} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Funktion</th>
                <th>Kontakt</th>
                <th>Vollständigkeit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((contact) => (
                <tr key={contact.id}>
                  <td>
                    <a className="text-link" href={`/o/${organizationId}/contacts/${contact.id}`}>
                      {contactName(contact)}
                    </a>
                  </td>
                  <td>{contact.label ?? 'Nicht angegeben'}</td>
                  <td>{contact.email ?? contact.mobile ?? contact.phone ?? 'Nicht angegeben'}</td>
                  <td>
                    {contact.incomplete ? (
                      <span className="status-badge status-badge--warning">Unvollständig</span>
                    ) : (
                      <span className="status-badge status-badge--active">Erreichbar</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge status-badge--${contact.status.toLowerCase()}`}>
                      {contact.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
                    </span>
                  </td>
                </tr>
              ))}
              {result.items.length === 0 ? (
                <tr>
                  <td colSpan={5}>Keine Kontakte für die gewählten Filter gefunden.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          basePath={`/o/${organizationId}/contacts`}
          limit={result.limit}
          offset={result.offset}
          query={{ q, status, incomplete: incomplete ? 'true' : undefined }}
          total={result.total}
        />
      </section>
    </>
  );
}

function contactName(contact: { firstName?: string | null; lastName?: string | null }) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ');
}
function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}
function entityStatus(input: string | undefined): 'ACTIVE' | 'ARCHIVED' | 'ALL' {
  return input === 'ARCHIVED' || input === 'ALL' ? input : 'ACTIVE';
}
function nonNegative(input: string | undefined) {
  const parsed = Number(input ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
