import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../database/prisma.service.js';
import { hashToken } from './security.functions.js';

@Injectable()
export class RateLimitService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(ConfigService)
    private readonly config: ConfigService,
  ) {}

  async consume(scope: string, identifier: string): Promise<void> {
    const key = `app:${scope}:${hashToken(identifier)}`;
    const now = BigInt(Date.now());
    const windowSeconds = this.config.getOrThrow<number>('RATE_LIMIT_WINDOW_SECONDS');
    const cutoff = now - BigInt(windowSeconds * 1000);
    const maximum = this.config.getOrThrow<number>('SENSITIVE_RATE_LIMIT_MAX');
    const rows = await this.prisma.database.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "auth_rate_limit" ("key", "count", "last_request")
      VALUES (${key}, 1, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "auth_rate_limit"."last_request" < ${cutoff} THEN 1
          ELSE "auth_rate_limit"."count" + 1
        END,
        "last_request" = ${now}
      RETURNING "count"
    `;

    if ((rows[0]?.count ?? maximum + 1) > maximum) {
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Zu viele Anfragen. Bitte später erneut versuchen.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
