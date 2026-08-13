import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { AuthService } from '../auth/auth.service.js';
import { configureApiApplication } from '../bootstrap.js';
import { PrismaService } from '../database/prisma.service.js';

describe('GET /api/v1/health', () => {
  let application: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://venue:test@localhost:5433/venue_test';
    process.env.CORS_ORIGINS = 'http://localhost:3100';
    process.env.SWAGGER_UI_ENABLED = 'false';

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ database: {}, ping: async () => undefined })
      .overrideProvider(AuthService)
      .useValue({ auth: { handler: async () => new Response(null, { status: 404 }) } })
      .compile();

    application = module.createNestApplication({ bodyParser: false });
    configureApiApplication(application);
    await application.init();
  });

  afterAll(async () => {
    await application.close();
  });

  it('returns distinct application and database states', async () => {
    const response = await request(application.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      services: {
        application: { status: 'up' },
        database: { status: 'up' },
      },
    });
    expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
  });

  it('uses the safe common error envelope without internal details', async () => {
    const response = await request(application.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404);

    expect(response.body).toMatchObject({
      code: 'REQUEST_ERROR',
      message: 'Request failed',
    });
    expect(response.body.requestId).toEqual(expect.any(String));
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(response.body).not.toHaveProperty('stack');
  });
});
