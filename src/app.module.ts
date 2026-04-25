import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceModule } from './modules/balance/balance.module';
import { HcmModule } from './modules/hcm/hcm.module';
import { SyncModule } from './modules/sync/sync.module';
import { TimeOffModule } from './modules/timeoff/timeoff.module';
import { APP_CONFIG } from './config/config.constants';
import { AppConfig } from './config/app-config.interface';
import { ConfigModule } from './config/config.module';
import { createTypeOrmOptions } from './config/database.config';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createTypeOrmOptions(config)
    }),
    BalanceModule,
    SyncModule,
    HcmModule,
    TimeOffModule
  ],
  controllers: [AppController]
})
export class AppModule {}
