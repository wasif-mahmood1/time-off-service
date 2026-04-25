import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HcmDeductionException } from 'src/common/errors/domain-errors';
import { configureApp } from 'src/app.bootstrap';
import { AppModule } from 'src/app.module';
import { HcmService } from 'src/modules/hcm/hcm.service';
import { TimeOffRequestStatus } from 'src/modules/timeoff/entities/time-off-request-status.enum';

describe('Time-off API integration', () => {
  let app: INestApplication;
  const hcmService = {
    deductBalance: jest.fn(),
    validateRequest: jest.fn()
  };

  beforeEach(async () => {
    process.env.DB_PATH = ':memory:';
    process.env.TYPEORM_DROP_SCHEMA = 'true';
    process.env.TYPEORM_SYNCHRONIZE = 'true';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(HcmService)
      .useValue(hcmService)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    jest.clearAllMocks();
    hcmService.validateRequest.mockResolvedValue({ valid: true });
    hcmService.deductBalance.mockImplementation(async () => ({
      success: true,
      externalRefId: `hcm-${Math.random().toString(16).slice(2)}`
    }));
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a pending request within balance', async () => {
    await seedBalance('emp-1', 'loc-1', 8, 1);

    const response = await request(app.getHttpServer())
      .post('/time-off/request')
      .set('Idempotency-Key', 'within-balance')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        daysRequested: 3
      })
      .expect(201);

    expect(response.body.status).toBe(TimeOffRequestStatus.PENDING);
    expect(hcmService.validateRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects a request exceeding local balance without calling HCM', async () => {
    await seedBalance('emp-1', 'loc-1', 2, 1);

    const response = await request(app.getHttpServer())
      .post('/time-off/request')
      .set('Idempotency-Key', 'exceeds-balance')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        daysRequested: 3
      })
      .expect(201);

    expect(response.body.status).toBe(TimeOffRequestStatus.REJECTED);
    expect(hcmService.validateRequest).not.toHaveBeenCalled();
  });

  it('prevents overspending when approvals run concurrently', async () => {
    await seedBalance('emp-1', 'loc-1', 5, 1);
    const first = await createPendingRequest('emp-1', 'loc-1', 3, 'concurrent-1');
    const second = await createPendingRequest('emp-1', 'loc-1', 3, 'concurrent-2');

    const [firstApproval, secondApproval] = await Promise.all([
      request(app.getHttpServer()).post(`/time-off/${first.id}/approve`),
      request(app.getHttpServer()).post(`/time-off/${second.id}/approve`)
    ]);

    expect([firstApproval.status, secondApproval.status]).toEqual([200, 200]);
    expect([firstApproval.body.status, secondApproval.body.status].sort()).toEqual([
      TimeOffRequestStatus.APPROVED,
      TimeOffRequestStatus.FAILED
    ]);

    const balance = await request(app.getHttpServer())
      .get('/balances')
      .query({ employeeId: 'emp-1', locationId: 'loc-1' })
      .expect(200);

    expect(balance.body.balance).toBe(2);
  });

  it('returns an error when HCM validation fails', async () => {
    await seedBalance('emp-1', 'loc-1', 8, 1);
    hcmService.validateRequest.mockResolvedValue({
      valid: false,
      reason: 'policy rejected by HCM'
    });

    const response = await request(app.getHttpServer())
      .post('/time-off/request')
      .set('Idempotency-Key', 'hcm-validation-fails')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        daysRequested: 3
      })
      .expect(502);

    expect(response.body.message).toContain('policy rejected by HCM');
  });

  it('marks approval failed when HCM deduction fails', async () => {
    await seedBalance('emp-1', 'loc-1', 8, 1);
    const pending = await createPendingRequest('emp-1', 'loc-1', 3, 'deduct-fails');
    hcmService.deductBalance.mockRejectedValue(new HcmDeductionException('HCM timeout'));

    const response = await request(app.getHttpServer())
      .post(`/time-off/${pending.id}/approve`)
      .expect(200);

    expect(response.body.status).toBe(TimeOffRequestStatus.FAILED);

    const balance = await request(app.getHttpServer())
      .get('/balances')
      .query({ employeeId: 'emp-1', locationId: 'loc-1' })
      .expect(200);

    expect(balance.body.balance).toBe(8);
  });

  it('skips stale batch sync rows and applies fresher rows', async () => {
    await seedBalance('emp-1', 'loc-1', 8, 2, '2026-01-02T00:00:00.000Z');

    const stale = await request(app.getHttpServer())
      .post('/hcm/batch-balances')
      .send([
        {
          employeeId: 'emp-1',
          locationId: 'loc-1',
          balance: 2,
          version: 1,
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ])
      .expect(200);

    expect(stale.body.skipped).toBe(1);

    const afterStale = await request(app.getHttpServer())
      .get('/balances')
      .query({ employeeId: 'emp-1', locationId: 'loc-1' })
      .expect(200);

    expect(afterStale.body.balance).toBe(8);

    const fresh = await request(app.getHttpServer())
      .post('/hcm/batch-balances')
      .send([
        {
          employeeId: 'emp-1',
          locationId: 'loc-1',
          balance: 11,
          version: 3,
          updatedAt: '2026-01-03T00:00:00.000Z'
        }
      ])
      .expect(200);

    expect(fresh.body.updated).toBe(1);

    const afterFresh = await request(app.getHttpServer())
      .get('/balances')
      .query({ employeeId: 'emp-1', locationId: 'loc-1' })
      .expect(200);

    expect(afterFresh.body.balance).toBe(11);
  });

  it('returns the original request for repeated idempotency keys', async () => {
    await seedBalance('emp-1', 'loc-1', 8, 1);

    const payload = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      daysRequested: 3
    };

    const first = await request(app.getHttpServer())
      .post('/time-off/request')
      .set('Idempotency-Key', 'same-key')
      .send(payload)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/time-off/request')
      .set('Idempotency-Key', 'same-key')
      .send(payload)
      .expect(201);

    expect(second.body.id).toBe(first.body.id);
    expect(hcmService.validateRequest).toHaveBeenCalledTimes(1);
  });

  async function seedBalance(
    employeeId: string,
    locationId: string,
    balance: number,
    version: number,
    updatedAt = '2026-01-01T00:00:00.000Z'
  ): Promise<void> {
    await request(app.getHttpServer())
      .post('/hcm/batch-balances')
      .send([
        {
          employeeId,
          locationId,
          balance,
          version,
          updatedAt
        }
      ])
      .expect(200);
  }

  async function createPendingRequest(
    employeeId: string,
    locationId: string,
    daysRequested: number,
    idempotencyKey: string
  ): Promise<{ id: string }> {
    const response = await request(app.getHttpServer())
      .post('/time-off/request')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        employeeId,
        locationId,
        daysRequested
      })
      .expect(201);

    expect(response.body.status).toBe(TimeOffRequestStatus.PENDING);
    return response.body as { id: string };
  }
});
