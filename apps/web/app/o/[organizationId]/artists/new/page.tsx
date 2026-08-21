import { activePageMembership } from '../../../../../src/api/page-access';
import { hasPermission } from '../../../../../src/api/server';
import { ArtistForm } from '../../../../components/master-data/entity-forms';

export default async function NewArtistPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(organizationId, `/o/${organizationId}/artists/new`);
  if (!membership) return null;
  if (!hasPermission(membership, 'artists.write')) {
    return (
      <section className="state-card">
        <h1>Sie dürfen keine Artists anlegen.</h1>
      </section>
    );
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Artists</p>
          <h1>Artist anlegen</h1>
          <p>Ein Künstlername oder Personenname genügt.</p>
        </div>
      </header>
      <section className="panel">
        <ArtistForm organizationId={organizationId} />
      </section>
    </>
  );
}
