import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { URL } from 'node:url';

export interface MockHcmBalance {
  employeeId: string;
  locationId: string;
  balance: number;
  version: number;
  updatedAt: string;
}

export interface MockHcmServerOptions {
  port?: number;
  failureRate?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  initialBalances?: MockHcmBalance[];
  logRequests?: boolean;
}

interface TimeOffPayload {
  employeeId?: string;
  locationId?: string;
  daysRequested?: number;
}

const DEFAULT_PORT = 4001;
const DEFAULT_FAILURE_RATE = 0.1;
const DEFAULT_MIN_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function key(employeeId: string, locationId: string): string {
  return `${employeeId}::${locationId}`;
}

function parseInitialBalances(): MockHcmBalance[] {
  const raw = process.env.MOCK_HCM_INITIAL_BALANCES;
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as MockHcmBalance[];
  return Array.isArray(parsed) ? parsed : [];
}

export class MockHcmServer {
  private readonly balances = new Map<string, MockHcmBalance>();
  private readonly server: Server;
  private readonly failureRate: number;
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly logRequests: boolean;

  constructor(private readonly options: MockHcmServerOptions = {}) {
    this.failureRate =
      options.failureRate ?? envNumber('MOCK_HCM_FAILURE_RATE', DEFAULT_FAILURE_RATE);
    this.minDelayMs =
      options.minDelayMs ?? envNumber('MOCK_HCM_MIN_DELAY_MS', DEFAULT_MIN_DELAY_MS);
    this.maxDelayMs =
      options.maxDelayMs ?? envNumber('MOCK_HCM_MAX_DELAY_MS', DEFAULT_MAX_DELAY_MS);
    this.logRequests = options.logRequests ?? process.env.MOCK_HCM_LOG === 'true';
    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });

    this.seedBalances(options.initialBalances ?? parseInitialBalances());
  }

  start(): Promise<number> {
    const port = this.options.port ?? envNumber('MOCK_HCM_PORT', DEFAULT_PORT);

    return new Promise((resolve) => {
      this.server.listen(port, () => {
        const address = this.server.address();
        resolve(typeof address === 'object' && address ? address.port : port);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  seedBalances(balances: MockHcmBalance[]): void {
    for (const balance of balances) {
      this.balances.set(key(balance.employeeId, balance.locationId), {
        ...balance,
        updatedAt: new Date(balance.updatedAt).toISOString()
      });
    }
  }

  snapshot(): MockHcmBalance[] {
    return [...this.balances.values()].map((balance) => ({ ...balance }));
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const path = this.normalizedPath(request);
    if (request.method !== 'POST') {
      if ((request.method === 'GET' || request.method === 'HEAD') && path === '/favicon.ico') {
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method === 'GET' && (path === '/' || path === '/health')) {
        this.json(response, 200, {
          service: 'mock-hcm',
          status: 'ok',
          endpoints: {
            health: 'GET /health',
            validate: 'POST /validate',
            deduct: 'POST /deduct',
            batch: 'POST /batch'
          },
          balances: this.snapshot().length
        });
        return;
      }

      this.json(response, 405, { error: 'method_not_allowed' });
      return;
    }

    if (this.logRequests) {
      console.log(`${request.method} ${path}`);
    }

    await this.delay();

    if (this.shouldFailRandomly()) {
      this.json(response, 503, { error: 'random_failure', reason: 'mock HCM random failure' });
      return;
    }

    try {
      const body = await this.readJson(request);
      if (path === '/validate') {
        this.validate(body as TimeOffPayload, response);
        return;
      }

      if (path === '/deduct') {
        this.deduct(body as TimeOffPayload, response);
        return;
      }

      if (path === '/batch') {
        this.batch(body, response);
        return;
      }

      this.json(response, 404, { error: 'not_found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid request';
      this.json(response, 400, { error: 'bad_request', reason: message });
    }
  }

  private validate(payload: TimeOffPayload, response: ServerResponse): void {
    const parsed = this.parseTimeOffPayload(payload);
    const current = this.balances.get(key(parsed.employeeId, parsed.locationId));

    if (!current || current.balance < parsed.daysRequested) {
      this.json(response, 409, {
        valid: false,
        reason: 'insufficient HCM balance'
      });
      return;
    }

    this.json(response, 200, {
      valid: true,
      balance: current.balance,
      version: current.version,
      updatedAt: current.updatedAt
    });
  }

  private deduct(payload: TimeOffPayload, response: ServerResponse): void {
    const parsed = this.parseTimeOffPayload(payload);
    const mapKey = key(parsed.employeeId, parsed.locationId);
    const current = this.balances.get(mapKey);

    if (!current || current.balance < parsed.daysRequested) {
      this.json(response, 409, {
        success: false,
        reason: 'insufficient HCM balance'
      });
      return;
    }

    const updated: MockHcmBalance = {
      ...current,
      balance: Number((current.balance - parsed.daysRequested).toFixed(4)),
      version: current.version + 1,
      updatedAt: new Date().toISOString()
    };
    this.balances.set(mapKey, updated);

    this.json(response, 200, {
      success: true,
      externalRefId: `hcm_${randomUUID()}`,
      balance: updated.balance,
      version: updated.version,
      updatedAt: updated.updatedAt
    });
  }

  private batch(body: unknown, response: ServerResponse): void {
    if (!Array.isArray(body)) {
      throw new Error('batch payload must be an array');
    }

    const results = body.map((item) => this.upsertBalance(item as MockHcmBalance));
    this.json(response, 200, {
      accepted: results.length,
      balances: this.snapshot(),
      results
    });
  }

  private upsertBalance(balance: MockHcmBalance): {
    employeeId: string;
    locationId: string;
    action: 'inserted' | 'updated' | 'skipped';
  } {
    this.assertBalancePayload(balance);

    const mapKey = key(balance.employeeId, balance.locationId);
    const existing = this.balances.get(mapKey);
    const incomingUpdatedAt = new Date(balance.updatedAt).toISOString();

    if (!existing) {
      this.balances.set(mapKey, {
        ...balance,
        updatedAt: incomingUpdatedAt
      });
      return {
        employeeId: balance.employeeId,
        locationId: balance.locationId,
        action: 'inserted'
      };
    }

    const isNewer =
      balance.version > existing.version ||
      (balance.version === existing.version &&
        new Date(incomingUpdatedAt).getTime() > new Date(existing.updatedAt).getTime());

    if (!isNewer) {
      return {
        employeeId: balance.employeeId,
        locationId: balance.locationId,
        action: 'skipped'
      };
    }

    this.balances.set(mapKey, {
      ...balance,
      updatedAt: incomingUpdatedAt
    });

    return {
      employeeId: balance.employeeId,
      locationId: balance.locationId,
      action: 'updated'
    };
  }

  private parseTimeOffPayload(payload: TimeOffPayload): Required<TimeOffPayload> {
    if (!payload.employeeId || !payload.locationId || !payload.daysRequested) {
      throw new Error('employeeId, locationId, and daysRequested are required');
    }

    const daysRequested = Number(payload.daysRequested);
    if (!Number.isFinite(daysRequested) || daysRequested <= 0) {
      throw new Error('daysRequested must be a positive number');
    }

    return {
      employeeId: payload.employeeId,
      locationId: payload.locationId,
      daysRequested
    };
  }

  private assertBalancePayload(balance: MockHcmBalance): void {
    if (!balance.employeeId || !balance.locationId) {
      throw new Error('employeeId and locationId are required');
    }

    if (!Number.isFinite(Number(balance.balance)) || Number(balance.balance) < 0) {
      throw new Error('balance must be a non-negative number');
    }

    if (!Number.isInteger(Number(balance.version)) || Number(balance.version) < 1) {
      throw new Error('version must be a positive integer');
    }

    if (Number.isNaN(new Date(balance.updatedAt).getTime())) {
      throw new Error('updatedAt must be an ISO timestamp');
    }
  }

  private normalizedPath(request: IncomingMessage): string {
    const url = new URL(request.url ?? '/', 'http://localhost');
    return url.pathname.replace(/^\/hcm/, '') || '/';
  }

  private async readJson(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) {
      return {};
    }

    return JSON.parse(raw);
  }

  private delay(): Promise<void> {
    const min = Math.max(0, this.minDelayMs);
    const max = Math.max(min, this.maxDelayMs);
    return sleep(randomInt(min, max + 1));
  }

  private shouldFailRandomly(): boolean {
    return Math.random() < this.failureRate;
  }

  private json(response: ServerResponse, statusCode: number, payload: unknown): void {
    response.writeHead(statusCode, {
      'content-type': 'application/json'
    });
    response.end(JSON.stringify(payload));
  }
}

export function createMockHcmServer(options?: MockHcmServerOptions): MockHcmServer {
  return new MockHcmServer(options);
}

if (require.main === module) {
  const server = createMockHcmServer();
  server
    .start()
    .then((port) => {
      console.log(`Mock HCM listening on http://localhost:${port}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
