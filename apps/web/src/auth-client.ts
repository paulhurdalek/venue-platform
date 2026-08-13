'use client';

import { createAuthClient } from 'better-auth/react';

import { webEnvironment } from './config';

export const authClient = createAuthClient({
  baseURL: webEnvironment.NEXT_PUBLIC_API_BASE_URL,
  basePath: '/api/auth',
  fetchOptions: { credentials: 'include' },
});
