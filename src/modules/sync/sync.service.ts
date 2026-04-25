import { Injectable } from '@nestjs/common';
import { BalanceSyncResult, BalanceService } from '../balance/balance.service';
import { SyncBalanceDto } from '../balance/dto/sync-balance.dto';

@Injectable()
export class SyncService {
  constructor(private readonly balanceService: BalanceService) {}

  syncBalances(balances: SyncBalanceDto[]): Promise<BalanceSyncResult> {
    return this.balanceService.syncBalances(balances);
  }
}
