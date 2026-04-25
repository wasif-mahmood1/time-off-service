import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { HcmController } from './hcm.controller';
import { HcmService } from './hcm.service';

@Module({
  imports: [SyncModule],
  controllers: [HcmController],
  providers: [HcmService],
  exports: [HcmService]
})
export class HcmModule {}
