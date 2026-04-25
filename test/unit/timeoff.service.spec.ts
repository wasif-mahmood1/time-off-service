import { HcmDeductionException } from 'src/common/errors/domain-errors';
import { TimeOffRequest } from 'src/modules/timeoff/entities/time-off-request.entity';
import { TimeOffRequestStatus } from 'src/modules/timeoff/entities/time-off-request-status.enum';
import { TimeOffService } from 'src/modules/timeoff/timeoff.service';

describe('TimeOffService', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const requestRepository = {
    create: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn()
  };
  const balanceService = {
    decrementBalanceWithRetry: jest.fn(),
    getBalanceOrThrow: jest.fn()
  };
  const hcmService = {
    deductBalance: jest.fn(),
    validateRequest: jest.fn()
  };
  let service: TimeOffService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TimeOffService(
      requestRepository as never,
      balanceService as never,
      hcmService as never
    );

    requestRepository.create.mockImplementation((input: Partial<TimeOffRequest>) => ({
      id: 'req-1',
      externalRefId: null,
      createdAt: now,
      updatedAt: now,
      ...input
    }));
    requestRepository.save.mockImplementation(async (input: TimeOffRequest) => input);
  });

  it('creates a pending request when balance and HCM validation pass', async () => {
    requestRepository.findOne.mockResolvedValue(null);
    balanceService.getBalanceOrThrow.mockResolvedValue({ balance: 10 });
    hcmService.validateRequest.mockResolvedValue({ valid: true });

    const result = await service.requestTimeOff(
      {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        daysRequested: 3
      },
      'idem-1'
    );

    expect(result.status).toBe(TimeOffRequestStatus.PENDING);
    expect(hcmService.validateRequest).toHaveBeenCalledTimes(1);
  });

  it('immediately rejects request creation when local balance is insufficient', async () => {
    requestRepository.findOne.mockResolvedValue(null);
    balanceService.getBalanceOrThrow.mockResolvedValue({ balance: 1 });

    const result = await service.requestTimeOff(
      {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        daysRequested: 3
      },
      'idem-2'
    );

    expect(result.status).toBe(TimeOffRequestStatus.REJECTED);
    expect(hcmService.validateRequest).not.toHaveBeenCalled();
  });

  it('approves a pending request and decrements local balance', async () => {
    const pending = buildRequest(TimeOffRequestStatus.PENDING);
    requestRepository.findOne.mockResolvedValue(pending);
    hcmService.deductBalance.mockResolvedValue({
      success: true,
      externalRefId: 'hcm-123'
    });
    balanceService.decrementBalanceWithRetry.mockResolvedValue({ balance: 7 });

    const result = await service.approveRequest('req-1');

    expect(result.status).toBe(TimeOffRequestStatus.APPROVED);
    expect(result.externalRefId).toBe('hcm-123');
    expect(balanceService.decrementBalanceWithRetry).toHaveBeenCalledWith(
      'emp-1',
      'loc-1',
      3
    );
  });

  it('marks a request failed when HCM deduction fails', async () => {
    const pending = buildRequest(TimeOffRequestStatus.PENDING);
    requestRepository.findOne.mockResolvedValue(pending);
    hcmService.deductBalance.mockRejectedValue(new HcmDeductionException('timeout'));

    const result = await service.approveRequest('req-1');

    expect(result.status).toBe(TimeOffRequestStatus.FAILED);
    expect(balanceService.decrementBalanceWithRetry).not.toHaveBeenCalled();
  });

  function buildRequest(status: TimeOffRequestStatus): TimeOffRequest {
    return {
      id: 'req-1',
      employeeId: 'emp-1',
      locationId: 'loc-1',
      daysRequested: 3,
      status,
      externalRefId: null,
      idempotencyKey: 'idem-1',
      createdAt: now,
      updatedAt: now
    };
  }
});
