import Link from 'next/link';

import type { OccupancyConflictTarget } from '../../../src/api/browser';

export function OccupancyConflictLinks({
  organizationId,
  conflicts,
}: {
  organizationId: string;
  conflicts: OccupancyConflictTarget[];
}) {
  if (conflicts.length === 0) return null;
  return (
    <div className="occupancy-conflicts">
      <strong>Kollidierende Planung öffnen:</strong>
      <ul>
        {conflicts.map((conflict) => (
          <li key={`${conflict.type}:${conflict.id}`}>
            <Link
              className="text-link"
              href={
                conflict.type === 'EVENT'
                  ? `/o/${organizationId}/events/${conflict.id}`
                  : `/o/${organizationId}/events/options/${conflict.id}`
              }
            >
              {conflict.label} ·{' '}
              {conflict.type === 'EVENT'
                ? 'Veranstaltung'
                : conflict.rank === 'SECOND'
                  ? '2. Option'
                  : '1. Option'}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
