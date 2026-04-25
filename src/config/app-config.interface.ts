export interface HcmClientConfig {
  baseUrl: string;
  timeoutMs: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
}

export interface DatabaseConfig {
  path: string;
  synchronize: boolean;
  dropSchema: boolean;
  logging: boolean;
}

export interface AppConfig {
  port: number;
  database: DatabaseConfig;
  hcm: HcmClientConfig;
}
