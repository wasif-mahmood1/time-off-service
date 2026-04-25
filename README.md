# Time-Off Microservice

ReadyOn-style Time-Off Microservice built with NestJS, TypeScript, TypeORM, SQLite, Jest, and a local mock HCM server.

The service manages per-employee, per-location time-off balances while treating the HCM as the source of truth. It supports time-off request creation, HCM validation, manager approval, local balance protection, rejection, batch balance sync, retryable HCM calls, idempotency, and optimistic locking.

## Assessment Fit

This project meets the core technical requirements:

- Backend microservice using NestJS and SQLite.
- Balances are stored per `employeeId` and `locationId`.
- REST endpoints exist for time-off request lifecycle and balance sync.
- Mock HCM server is included under `mock-hcm/`.
- HCM validation and deduction are called before mutating approved local balances.
- Defensive local balance checks protect against HCM inconsistencies.
- Batch sync avoids overwriting newer local data using version and timestamp checks.
- Jest test suites cover unit, integration, and e2e flows.
- `node_modules`, build output, logs, coverage, and SQLite runtime data are excluded from submission.

Implementation note: the code is written in TypeScript, the standard NestJS language, and compiles to JavaScript for runtime.

## Technical Requirement Document

### Problem

ReadyOn is the employee-facing interface for requesting time off, while an HCM such as Workday or SAP remains the source of truth. Balance drift can happen because HCM may be updated independently through anniversaries, annual refreshes, corrections, or other systems.

The service must give employees fast feedback, let managers approve against valid data, and prevent local overspending even when external systems are unreliable or delayed.

### Goals

- Cache balances locally for fast reads.
- Validate time-off requests against the cached balance and HCM.
- Deduct balance only after manager approval and successful HCM deduction.
- Accept batch balance updates from HCM.
- Avoid stale batch updates overwriting newer data.
- Prevent concurrent approvals from overspending local balance.
- Make request creation idempotent.
- Provide a realistic mock HCM for local testing and e2e validation.

### Non-Goals

- Authentication and authorization are not implemented in this exercise.
- Production-grade migrations are not included; TypeORM `synchronize` is used for local/demo setup.
- Multi-tenant isolation is not modeled beyond employee and location dimensions.

### Architecture

```text
src/
  common/
    errors/
    filters/
    utils/
  config/
  modules/
    balance/
    hcm/
    sync/
    timeoff/
mock-hcm/
test/
  unit/
  integration/
  e2e/
```

Main modules:

- `balance`: cached balance read, upsert, validation, optimistic decrement.
- `timeoff`: request lifecycle, idempotency, approval, rejection.
- `hcm`: external HCM client and HCM-facing batch endpoint.
- `sync`: batch balance sync orchestration.
- `mock-hcm`: in-memory mock HCM server with `/validate`, `/deduct`, and `/batch`.

### Data Model

`Balance`

- `id`
- `employeeId`
- `locationId`
- `balance`
- `version`
- `updatedAt`

`TimeOffRequest`

- `id`
- `employeeId`
- `locationId`
- `daysRequested`
- `status`: `PENDING`, `APPROVED`, `REJECTED`, `FAILED`
- `externalRefId`
- `idempotencyKey`
- `createdAt`
- `updatedAt`

### Request Flow

`POST /time-off/request`

1. Requires an `Idempotency-Key` header.
2. Checks local cached balance.
3. If local balance is insufficient, creates a `REJECTED` request immediately.
4. Calls HCM validation.
5. If HCM validation succeeds, creates a `PENDING` request.
6. If the same idempotency key is replayed with the same payload, returns the original request.
7. If the same idempotency key is replayed with a different payload, returns a conflict.

### Approval Flow

`POST /time-off/:id/approve`

1. Loads the existing request.
2. Rejects invalid state transitions.
3. Calls HCM deduction.
4. If HCM deduction succeeds, decrements local balance using optimistic locking.
5. If local balance changed concurrently, retries the decrement.
6. If balance cannot be decremented safely, marks the request `FAILED`.
7. On success, marks the request `APPROVED` and stores the HCM external reference.

### Batch Sync Flow

`POST /hcm/batch-balances`

Accepts an array of balance rows. A row is inserted or updated only when it is newer than the local row:

- Higher `version` wins.
- If versions match, newer `updatedAt` wins.
- Stale rows are skipped.

### HCM Integration

The service calls:

- `POST /hcm/validate`
- `POST /hcm/deduct`

The included mock HCM accepts both prefixed and unprefixed paths:

- `POST /validate`
- `POST /deduct`
- `POST /batch`
- `POST /hcm/validate`
- `POST /hcm/deduct`
- `POST /hcm/batch`

The mock HCM:

- Stores balances in memory.
- Rejects insufficient balances.
- Deducts balance on success.
- Randomly fails based on `MOCK_HCM_FAILURE_RATE`.
- Adds artificial latency with `MOCK_HCM_MIN_DELAY_MS` and `MOCK_HCM_MAX_DELAY_MS`.

## Security And Reliability Considerations

- DTO validation uses `class-validator` and Nest global validation pipes.
- Unknown body fields are rejected.
- HCM calls use timeout and retry with exponential backoff.
- Request creation requires an idempotency key.
- Balance approval uses version-checked updates to avoid overspending.
- Batch sync defends against stale HCM payloads.
- Controllers contain no business logic.
- Errors are normalized through a global exception filter.

Recommended production additions:

- Add authentication and role-based authorization.
- Replace `synchronize` with migrations.
- Add structured logging and request correlation IDs.
- Add rate limiting on write endpoints.
- Add persistent idempotency payload hashing.
- Add a dependency vulnerability remediation plan for transitive SQLite packages.

## Setup

Requirements:

- Node.js 20.11 or newer
- npm

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

## Environment

Defaults are suitable for local development.

```text
PORT=3000
DB_PATH=./data/timeoff.sqlite
TYPEORM_SYNCHRONIZE=true
TYPEORM_DROP_SCHEMA=false
TYPEORM_LOGGING=false

HCM_BASE_URL=http://localhost:4001
HCM_TIMEOUT_MS=2000
HCM_RETRY_ATTEMPTS=3
HCM_RETRY_BASE_DELAY_MS=100

MOCK_HCM_PORT=4001
MOCK_HCM_FAILURE_RATE=0.1
MOCK_HCM_MIN_DELAY_MS=100
MOCK_HCM_MAX_DELAY_MS=500
```

Tests set `DB_PATH=:memory:` and `TYPEORM_DROP_SCHEMA=true`, so test database state is isolated and reset.

## Running Locally

Terminal 1:

```bash
npm run mock:hcm
```

Terminal 2:

```bash
npm run start:dev
```

Service URLs:

```text
Time-Off API: http://localhost:3000
Mock HCM:     http://localhost:4001
```

## API Examples

Health/discovery:

```bash
curl http://localhost:3000/
curl http://localhost:3000/health
curl http://localhost:4001/
curl http://localhost:4001/health
```

Seed ReadyOn cached balance:

```bash
curl -X POST http://localhost:3000/hcm/batch-balances \
  -H "Content-Type: application/json" \
  -d "[{\"employeeId\":\"emp-1\",\"locationId\":\"loc-1\",\"balance\":10,\"version\":1,\"updatedAt\":\"2026-01-01T00:00:00.000Z\"}]"
```

Seed mock HCM balance:

```bash
curl -X POST http://localhost:4001/batch \
  -H "Content-Type: application/json" \
  -d "[{\"employeeId\":\"emp-1\",\"locationId\":\"loc-1\",\"balance\":10,\"version\":1,\"updatedAt\":\"2026-01-01T00:00:00.000Z\"}]"
```

Get cached balance:

```bash
curl "http://localhost:3000/balances?employeeId=emp-1&locationId=loc-1"
```

Create request:

```bash
curl -X POST http://localhost:3000/time-off/request \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: emp-1-loc-1-001" \
  -d "{\"employeeId\":\"emp-1\",\"locationId\":\"loc-1\",\"daysRequested\":2}"
```

Approve request:

```bash
curl -X POST http://localhost:3000/time-off/<request-id>/approve
```

Reject request:

```bash
curl -X POST http://localhost:3000/time-off/<request-id>/reject
```

## Tests

Run all unit, integration, and e2e tests:

```bash
npm test
```

Run coverage:

```bash
npm run test:cov
```

Run e2e tests only:

```bash
npm run test:e2e
```

Other useful commands:

```bash
npm run test:unit
npm run test:integration
```

The test suite covers:

- Request within balance succeeds.
- Request exceeding balance is rejected immediately.
- Concurrent approvals do not overspend local balance.
- HCM validation failure returns an error.
- HCM deduction failure marks request as failed.
- Batch sync skips stale data and applies fresher data.
- Idempotency returns the original request on replay.
- Full lifecycle with the real mock HCM server.

Latest local validation:

```text
npm test
Test Suites: 4 passed, 4 total
Tests:       15 passed, 15 total

npm run test:e2e
Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

Latest coverage snapshot:

```text
Statements: 79.81%
Branches:   43.58%
Functions:  83.50%
Lines:      78.48%
```

Coverage is generated as proof under `coverage/`, but `coverage/` should not be included in the submission zip.

## Submission Packaging

Submit one `.zip` file containing the project source, lockfile, tests, and README. Do not include generated or heavy folders.

Exclude:

```text
node_modules/
dist/
coverage/
data/
logs/
```

PowerShell example from the parent directory:

```powershell
Compress-Archive `
  -Path timeoff-service\* `
  -DestinationPath timeoff-service.zip `
  -Force
```

Before uploading, open the zip and remove any generated folders listed above if your archive command included them.

Recommended safer packaging approach:

```powershell
$items = Get-ChildItem timeoff-service -Force |
  Where-Object { $_.Name -notin @('node_modules','dist','coverage','data','logs') }
Compress-Archive -Path $items.FullName -DestinationPath timeoff-service.zip -Force
```

## Known Gaps Before Production

- Authentication and authorization are not implemented.
- Coverage should be raised before treating this as payroll-critical production software.
- HCM retry branch coverage should be expanded.
- TypeORM `synchronize` should be replaced by migrations.
- npm audit currently reports transitive advisories through SQLite-related packages; this needs remediation or a documented risk acceptance before production.
