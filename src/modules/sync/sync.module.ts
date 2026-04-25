import { Module } from '@nestjs/common';
import { BalanceModule } from '../balance/balance.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [BalanceModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService]
})
export class SyncModule {}
