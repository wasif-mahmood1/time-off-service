import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';
import { Balance } from './entities/balance.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Balance])],
  controllers: [BalanceController],
  providers: [BalanceService],
  exports: [BalanceService]
})
export class BalanceModule {}
