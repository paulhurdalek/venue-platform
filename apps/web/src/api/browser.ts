'use client';

import { createVenueApiClient } from '@venue/api-client';

import { webEnvironment } from '../config';

export function createBrowserApiClient() {
  return createVenueApiClient({ baseUrl: webEnvironment.NEXT_PUBLIC_API_BASE_URL });
}

export function browserApiUrl(path: string): string {
  return new URL(path, webEnvironment.NEXT_PUBLIC_API_BASE_URL).toString();
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return fallback;
}

export type OccupancyConflictTarget = {
  type: 'EVENT' | 'DATE_OPTION';
  id: string;
  label: string;
  rank?: 'FIRST' | 'SECOND';
};

export function occupancyConflictTargets(error: unknown): OccupancyConflictTarget[] {
  if (!error || typeof error !== 'object' || !('details' in error)) return [];
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== 'object' || !('conflicts' in details)) return [];
  const conflicts = (details as { conflicts?: unknown }).conflicts;
  if (!Array.isArray(conflicts)) return [];
  return conflicts.filter((candidate): candidate is OccupancyConflictTarget => {
    if (!candidate || typeof candidate !== 'object') return false;
    const value = candidate as Partial<OccupancyConflictTarget>;
    return (
      (value.type === 'EVENT' || value.type === 'DATE_OPTION') &&
      typeof value.id === 'string' &&
      typeof value.label === 'string'
    );
  });
}
