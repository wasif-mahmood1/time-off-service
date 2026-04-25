import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { AppConfig } from './app-config.interface';

const DEFAULT_PORT = 3000;
const DEFAULT_HCM_BASE_URL = 'http://localhost:4001';
const DEFAULT_HCM_TIMEOUT_MS = 2000;
const DEFAULT_HCM_RETRY_ATTEMPTS = 3;
const DEFAULT_HCM_RETRY_BASE_DELAY_MS = 100;

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function databasePathFromEnv(): string {
  const configured = process.env.DB_PATH;
  if (configured === ':memory:') {
    return configured;
  }

  return resolve(configured ?? join(process.cwd(), 'data', 'timeoff.sqlite'));
}

export function ensureSqliteDirectory(databasePath: string): void {
  if (databasePath === ':memory:') {
    return;
  }

  mkdirSync(dirname(databasePath), { recursive: true });
}

export function loadAppConfig(): AppConfig {
  return {
    port: numberFromEnv('PORT', DEFAULT_PORT),
    database: {
      path: databasePathFromEnv(),
      synchronize: booleanFromEnv('TYPEORM_SYNCHRONIZE', true),
      dropSchema: booleanFromEnv('TYPEORM_DROP_SCHEMA', false),
      logging: booleanFromEnv('TYPEORM_LOGGING', false)
    },
    hcm: {
      baseUrl: process.env.HCM_BASE_URL ?? DEFAULT_HCM_BASE_URL,
      timeoutMs: numberFromEnv('HCM_TIMEOUT_MS', DEFAULT_HCM_TIMEOUT_MS),
      retryAttempts: numberFromEnv('HCM_RETRY_ATTEMPTS', DEFAULT_HCM_RETRY_ATTEMPTS),
      retryBaseDelayMs: numberFromEnv(
        'HCM_RETRY_BASE_DELAY_MS',
        DEFAULT_HCM_RETRY_BASE_DELAY_MS
      )
    }
  };
}
