import { Body, Controller, HttpCode, HttpStatus, ParseArrayPipe, Post } from '@nestjs/common';
import { BalanceSyncResult } from '../balance/balance.service';
import { SyncBalanceDto } from '../balance/dto/sync-balance.dto';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('balances')
  @HttpCode(HttpStatus.OK)
  syncBalances(
    @Body(new ParseArrayPipe({ items: SyncBalanceDto }))
    balances: SyncBalanceDto[]
  ): Promise<BalanceSyncResult> {
    return this.syncService.syncBalances(balances);
  }
}
