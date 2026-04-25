import { InsufficientBalanceException } from 'src/common/errors/domain-errors';
import { BalanceService } from 'src/modules/balance/balance.service';
import { Balance } from 'src/modules/balance/entities/balance.entity';

describe('BalanceService', () => {
  const repository = {
    findOne: jest.fn()
  };

  const service = new BalanceService(repository as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates that a balance can cover the requested days', async () => {
    const balance = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      balance: 8
    } as Balance;
    repository.findOne.mockResolvedValue(balance);

    await expect(
      service.validateSufficientBalance('emp-1', 'loc-1', 4)
    ).resolves.toBe(balance);
  });

  it('rejects a request when cached balance is insufficient', async () => {
    repository.findOne.mockResolvedValue({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      balance: 2
    });

    await expect(
      service.validateSufficientBalance('emp-1', 'loc-1', 3)
    ).rejects.toBeInstanceOf(InsufficientBalanceException);
  });
});
