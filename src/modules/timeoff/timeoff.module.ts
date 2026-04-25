import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceModule } from '../balance/balance.module';
import { HcmModule } from '../hcm/hcm.module';
import { TimeOffRequest } from './entities/time-off-request.entity';
import { TimeOffController } from './timeoff.controller';
import { TimeOffService } from './timeoff.service';

@Module({
  imports: [TypeOrmModule.forFeature([TimeOffRequest]), BalanceModule, HcmModule],
  controllers: [TimeOffController],
  providers: [TimeOffService],
  exports: [TimeOffService]
})
export class TimeOffModule {}
