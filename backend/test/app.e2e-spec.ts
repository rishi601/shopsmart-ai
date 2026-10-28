import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { RedisCacheService } from './../src/cache/redis-cache.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const prismaMock = {
      $connect: vi.fn(),
      $disconnect: vi.fn(),
      product: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      behaviorEvent: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService).useValue(prismaMock)
      .overrideProvider(RedisCacheService).useValue({ get: vi.fn().mockResolvedValue(undefined), set: vi.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/products/catalog (GET) returns paginated product results', async () => {
    await request(app.getHttpServer())
      .get('/products/catalog?page=1&limit=9')
      .expect(200)
      .expect({ items: [], pagination: { page: 1, limit: 9, total: 0, pages: 0 } });
  });

  afterEach(async () => {
    await app.close();
  });
});
