import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DatabaseClient, TransactionClient } from '@venue/database';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins';

import { PrismaService } from '../database/prisma.service.js';

type AuthDatabase = DatabaseClient | TransactionClient;

@Injectable()
export class AuthService {
  readonly auth: ReturnType<AuthService['createForDatabase']>;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(PrismaService)
    prisma: PrismaService,
  ) {
    this.auth = this.createForDatabase(prisma.database);
  }

  createForTransaction(
    transaction: TransactionClient,
  ): ReturnType<AuthService['createForDatabase']> {
    return this.createForDatabase(transaction);
  }

  private createForDatabase(database: AuthDatabase) {
    const production = this.config.getOrThrow<string>('NODE_ENV') === 'production';
    const currentSecret = this.config.getOrThrow<string>('BETTER_AUTH_SECRET');
    const previousSecret = this.config.get<string>('BETTER_AUTH_SECRET_PREVIOUS');
    const secrets = [
      { version: 2, value: currentSecret },
      ...(previousSecret ? [{ version: 1, value: previousSecret }] : []),
    ];
    const rateWindow = this.config.getOrThrow<number>('RATE_LIMIT_WINDOW_SECONDS');

    return betterAuth({
      appName: 'Venue Platform',
      baseURL: this.config.getOrThrow<string>('AUTH_PUBLIC_BASE_URL'),
      basePath: '/api/auth',
      database: prismaAdapter(database as Parameters<typeof prismaAdapter>[0], {
        provider: 'postgresql',
        transaction: false,
      }),
      emailAndPassword: {
        enabled: true,
        disableSignUp: true,
        requireEmailVerification: false,
        minPasswordLength: this.config.getOrThrow<number>('PASSWORD_MIN_LENGTH'),
        maxPasswordLength: 128,
        autoSignIn: false,
      },
      session: {
        expiresIn: this.config.getOrThrow<number>('SESSION_DURATION_SECONDS'),
        updateAge: Math.min(
          86_400,
          Math.floor(this.config.getOrThrow<number>('SESSION_DURATION_SECONDS') / 4),
        ),
      },
      rateLimit: {
        enabled: true,
        storage: 'database',
        window: rateWindow,
        max: this.config.getOrThrow<number>('RATE_LIMIT_MAX_REQUESTS'),
        customRules: {
          '/sign-in/email': {
            window: rateWindow,
            max: this.config.getOrThrow<number>('AUTH_SIGN_IN_RATE_LIMIT_MAX'),
          },
          '/sign-up/email': {
            window: rateWindow,
            max: 1,
          },
        },
      },
      trustedOrigins: this.config.getOrThrow<string[]>('CORS_ORIGINS'),
      secrets,
      advanced: {
        useSecureCookies: production,
        defaultCookieAttributes: {
          httpOnly: true,
          secure: production,
          sameSite: 'lax',
          path: '/',
        },
        database: {
          generateId: 'uuid',
        },
      },
      plugins: [
        admin({
          defaultRole: 'user',
        }),
      ],
      logger: { disabled: true },
      telemetry: { enabled: false },
    });
  }
}
