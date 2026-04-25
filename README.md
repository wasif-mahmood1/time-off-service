Got it — here’s a **short, clean, human-written README in Markdown**:

---

# Time-Off Microservice

A simple NestJS service to manage employee time-off requests.
It uses SQLite for local balance caching and a mock HCM service as the source of truth.

---

## Features

* Create and manage time-off requests
* Validate balance before request
* Sync with external HCM system
* Deduct balance on approval
* Idempotent request handling
* Unit, integration, and e2e tests

---

## Requirements

* Node.js 20+
* npm

---

## Setup

```bash
npm install
```

---

## Run Locally

Start both services in separate terminals:

```bash
# Terminal 1 - Mock HCM
npm run mock:hcm

# Terminal 2 - API
npm run start:dev
```

**URLs**

* API: [http://localhost:3000](http://localhost:3000)
* Mock HCM: [http://localhost:4001](http://localhost:4001)

---

## Quick Test

```bash
# Seed local cache
curl -X POST http://localhost:3000/hcm/batch-balances \
  -H "Content-Type: application/json" \
  -d '[{"employeeId":"emp-1","locationId":"loc-1","balance":10}]'

# Seed mock HCM
curl -X POST http://localhost:4001/batch \
  -H "Content-Type: application/json" \
  -d '[{"employeeId":"emp-1","locationId":"loc-1","balance":10}]'

# Create request
curl -X POST http://localhost:3000/time-off/request \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: req-1" \
  -d '{"employeeId":"emp-1","locationId":"loc-1","daysRequested":2}'
```

---

## Tests

```bash
npm test
```

---

## Notes

* HCM is the source of truth
* SQLite is used as a local cache
* Uses TypeORM `synchronize` (not for production)

---
