import { Controller, Get, Query } from '@nestjs/common';
import { BalanceResponseDto } from './dto/balance-response.dto';
import { GetBalanceQueryDto } from './dto/get-balance-query.dto';
import { BalanceService } from './balance.service';

@Controller('balances')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get()
  getBalance(@Query() query: GetBalanceQueryDto): Promise<BalanceResponseDto> {
    return this.balanceService.getCachedBalance(query.employeeId, query.locationId);
  }
}
