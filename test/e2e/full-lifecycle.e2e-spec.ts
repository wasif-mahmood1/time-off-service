import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from 'src/app.bootstrap';
import { AppModule } from 'src/app.module';
import { TimeOffRequestStatus } from 'src/modules/timeoff/entities/time-off-request-status.enum';
import { createMockHcmServer, MockHcmServer } from '../../mock-hcm/server';

describe('Time-off full lifecycle e2e', () => {
  let app: INestApplication;
  let mockHcm: MockHcmServer;
  let mockHcmBaseUrl: string;

  beforeAll(async () => {
    const updatedAt = '2026-01-01T00:00:00.000Z';
    mockHcm = createMockHcmServer({
      port: 0,
      failureRate: 0,
      minDelayMs: 1,
      maxDelayMs: 5,
      initialBalances: [
        {
          employeeId: 'emp-e2e',
          locationId: 'loc-e2e',
          balance: 10,
          version: 1,
          updatedAt
        }
      ]
    });
    const hcmPort = await mockHcm.start();
    mockHcmBaseUrl = `http://127.0.0.1:${hcmPort}`;

    process.env.DB_PATH = ':memory:';
    process.env.TYPEORM_DROP_SCHEMA = 'true';
    process.env.TYPEORM_SYNCHRONIZE = 'true';
    process.env.HCM_BASE_URL = mockHcmBaseUrl;
    process.env.HCM_RETRY_ATTEMPTS = '3';
    process.env.HCM_RETRY_BASE_DELAY_MS = '5';
    process.env.HCM_TIMEOUT_MS = '1000';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    await request(app.getHttpServer())
      .post('/hcm/batch-balances')
      .send([
        {
          employeeId: 'emp-e2e',
          locationId: 'loc-e2e',
          balance: 10,
          version: 1,
          updatedAt
        }
      ])
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
    await mockHcm.stop();
  });

  it('submits, approves, deducts HCM, and updates cached balance', async () => {
    const submitted = await request(app.getHttpServer())
      .post('/time-off/request')
      .set('Idempotency-Key', 'e2e-lifecycle')
      .send({
        employeeId: 'emp-e2e',
        locationId: 'loc-e2e',
        daysRequested: 4
      })
      .expect(201);

    expect(submitted.body.status).toBe(TimeOffRequestStatus.PENDING);

    const approved = await request(app.getHttpServer())
      .post(`/time-off/${submitted.body.id}/approve`)
      .expect(200);

    expect(approved.body.status).toBe(TimeOffRequestStatus.APPROVED);
    expect(approved.body.externalRefId).toMatch(/^hcm_/);

    const balance = await request(app.getHttpServer())
      .get('/balances')
      .query({ employeeId: 'emp-e2e', locationId: 'loc-e2e' })
      .expect(200);

    expect(balance.body.balance).toBe(6);
    expect(mockHcm.snapshot()[0].balance).toBe(6);
  });

  it('ignores browser favicon requests on the mock HCM server', async () => {
    await request(mockHcmBaseUrl).get('/favicon.ico').expect(204);
  });
});
