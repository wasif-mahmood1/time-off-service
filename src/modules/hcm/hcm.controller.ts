import { Body, Controller, HttpCode, HttpStatus, ParseArrayPipe, Post } from '@nestjs/common';
import { SyncBalanceDto } from '../balance/dto/sync-balance.dto';
import { BalanceSyncResult } from '../balance/balance.service';
import { SyncService } from '../sync/sync.service';

@Controller('hcm')
export class HcmController {
  constructor(private readonly syncService: SyncService) {}

  @Post('batch-balances')
  @HttpCode(HttpStatus.OK)
  batchBalances(
    @Body(new ParseArrayPipe({ items: SyncBalanceDto }))
    balances: SyncBalanceDto[]
  ): Promise<BalanceSyncResult> {
    return this.syncService.syncBalances(balances);
  }
}
