import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root(): Record<string, unknown> {
    return this.healthResponse();
  }

  @Get('health')
  health(): Record<string, unknown> {
    return this.healthResponse();
  }

  private healthResponse(): Record<string, unknown> {
    return {
      service: 'timeoff-service',
      status: 'ok',
      endpoints: {
        health: 'GET /health',
        getBalance: 'GET /balances?employeeId=&locationId=',
        requestTimeOff: 'POST /time-off/request',
        approveRequest: 'POST /time-off/:id/approve',
        rejectRequest: 'POST /time-off/:id/reject',
        batchBalances: 'POST /hcm/batch-balances'
      }
    };
  }
}
