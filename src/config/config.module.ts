import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from './config.constants';
import { loadAppConfig } from './configuration';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: loadAppConfig
    }
  ],
  exports: [APP_CONFIG]
})
export class ConfigModule {}
