import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Balance } from 'src/modules/balance/entities/balance.entity';
import { TimeOffRequest } from 'src/modules/timeoff/entities/time-off-request.entity';
import { AppConfig } from './app-config.interface';
import { ensureSqliteDirectory } from './configuration';

export function createTypeOrmOptions(config: AppConfig): TypeOrmModuleOptions {
  ensureSqliteDirectory(config.database.path);

  return {
    type: 'sqlite',
    database: config.database.path,
    entities: [Balance, TimeOffRequest],
    synchronize: config.database.synchronize,
    dropSchema: config.database.dropSchema,
    logging: config.database.logging
  };
}
