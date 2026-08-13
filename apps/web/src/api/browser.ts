'use client';

import { createVenueApiClient } from '@venue/api-client';

import { webEnvironment } from '../config';

export function createBrowserApiClient() {
  return createVenueApiClient({ baseUrl: webEnvironment.NEXT_PUBLIC_API_BASE_URL });
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return fallback;
}
