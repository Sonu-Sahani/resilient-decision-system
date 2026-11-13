# DecisionFlow | Resilient Decision System

A configurable workflow decision platform built for the supplied hackathon brief. It accepts structured applications, validates inputs, evaluates configuration-driven rules, simulates an external dependency, tracks workflow state, supports safe retries and idempotent submissions, and records an explainable audit trail.

> **Scope note:** This is a hackathon-ready demonstration, not a production lending/underwriting system. The external provider is simulated. Before production use, add real identity/authentication and role-based access, secrets management, durable background jobs, distributed locking, rate limiting, observability, privacy controls, and a formal security review.

## Features mapped to the brief

| Brief requirement | Implementation |
|---|---|
| Structured input intake | `POST /api/requests`, required-field validation |
| Mandatory, threshold, conditional rules | Safe rule engine supports `required`, `threshold`, and constrained `expression` rules; config-driven type/range/email schema checks |
| Approve, reject, retry, manual review | Workflow engine with explicit lifecycle statuses |
| State and change history | MongoDB request document, timestamps, status, rule trace, append-only audit entries |
| Explainable decisions | Rule-by-rule trace, decision explanation, audit stages and workflow version |
| Dependency failure and retry | Simulated verification provider, transient/permanent failures, bounded retry count |
| Duplicate requests / idempotency | Required `Idempotency-Key` and unique MongoDB index |
| Configurability | JSON workflow config; versioned updates via `PUT /api/config` without code changes |
| API and minimal UI | Express REST API and React dashboard |
| Tests | Node test runner tests for rules, validation, approval/rejection, retry and manual review |

## Architecture

```text
React Dashboard
      | REST / JSON
      v
Express API  ---- Health + Metrics
      |
      +---- Request Controller ---- Workflow Service
      |                                  |
      |                                  +---- Config Validator / JSON Config
      |                                  +---- Idempotency Lookup
      |                                  +---- Workflow Engine
      |                                           |
      |                                           +---- Input Validation
      |                                           +---- Rules Engine (safe grammar)
      |                                           +---- Simulated Dependency
      |                                           +---- State + Audit Trail
      v
MongoDB (workflow requests, config snapshot, audit, rule trace)
```

Each request stores the workflow configuration snapshot and version used at execution time. Retrying an existing request therefore uses the same rules, even if the active workflow config has since changed. Rule expressions are parsed using a deliberately small grammar; arbitrary JavaScript is never evaluated.

## Requirements

- Node.js 20 or newer (tested with Node 22)
- npm 10+
- Docker Desktop **or** a local MongoDB 7+ instance

## Quick start (recommended: Docker MongoDB)

1. Extract the ZIP and open a terminal in the project root.
2. Create backend environment file:

   **macOS/Linux**
   ```bash
   cp backend/.env.example backend/.env
   ```
   **Windows PowerShell**
   ```powershell
   Copy-Item backend/.env.example backend/.env
   ```
3. Start MongoDB:
   ```bash
   docker compose up -d mongo
   ```
4. Install dependencies:
   ```bash
   npm install
   npm --prefix backend install
   npm --prefix frontend install
   ```
5. Start both apps from the project root:
   ```bash
   npm run dev
   ```
6. Open **http://localhost:5173**. API is at **http://localhost:5000/api**.

Alternatively, start the API and UI in separate terminals:

```bash
npm --prefix backend run dev
npm --prefix frontend run dev
```

If MongoDB is already installed locally, skip Docker. Set `MONGODB_URI` in `backend/.env` to your connection string.

## Demo walkthrough

1. Submit a normal application (income `900000`, credit score `720`, requested amount `250000`). Expected result: `APPROVED`.
2. Submit credit score `500`. Expected result: `REJECTED` with the failed credit rule in the trace.
3. Submit requested amount `700000` with a valid score. Expected result: `MANUAL_REVIEW` due to the configured amount rule.
4. To demonstrate a retry, submit through the API with `externalCheck.failuresRemaining: 1`. First attempt becomes `RETRY_PENDING`; click **Retry** in the dashboard. The next attempt succeeds.
5. To demonstrate idempotency, send the same request twice with the same `Idempotency-Key`. The second response is marked `replayed: true` and returns the original record.
6. Change a threshold in `backend/src/config/workflow.json`, increase `version`, restart the backend, and submit a new request. Existing requests retain their saved config snapshot.

## API reference

Base URL: `http://localhost:5000/api`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Service health |
| GET | `/config` | Active workflow config |
| PUT | `/config` | Update config; version must increase |
| POST | `/requests` | Submit and evaluate a request; requires `Idempotency-Key` |
| GET | `/requests?page=1&limit=25` | Paginated request history |
| GET | `/requests/:id` | Request, decision, rule trace and full audit |
| POST | `/requests/:id/retry` | Retry a `RETRY_PENDING` request |
| GET | `/metrics` | Counts by status |

If `ADMIN_API_KEY` is set in `backend/.env`, include `x-admin-key: <value>` on `PUT /config`. For a local demo with no key configured, config editing is intentionally open; do not expose that mode to a public network.

### Example request

```bash
curl -X POST http://localhost:5000/api/requests \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-application-001' \
  -d '{
    "applicantName": "Aarav Sharma",
    "email": "aarav@example.com",
    "annualIncome": 900000,
    "creditScore": 720,
    "requestedAmount": 250000,
    "externalCheck": { "failuresRemaining": 1 }
  }'
```

The browser dashboard uses a generated unique key for each new submission. For a replay test, use the same key in both API calls.

## Configuration model

Example rule types:

```json
{ "id": "name-present", "type": "required", "field": "applicantName", "message": "Applicant name is required." }
{ "id": "credit-minimum", "type": "threshold", "field": "creditScore", "operator": ">=", "value": 600, "onFail": "REJECT", "message": "Credit score must be at least 600." }
{ "id": "income-ratio", "type": "expression", "expression": "requestedAmount <= annualIncome * 5", "onFail": "MANUAL_REVIEW", "message": "Requested amount is high relative to income." }
```

`inputSchema` supports `string`, `number`, and `boolean` types, numeric bounds, string length bounds and email format. `onFail` supports `REJECT` and `MANUAL_REVIEW`. Rule evaluation is deterministic and preserves the full trace. Supported expression grammar is one field comparison against another field or numeric literal, optionally multiplied by a numeric constant.

## Hackathon presentation

See [`docs/SUBMISSION_NOTES.md`](docs/SUBMISSION_NOTES.md) for a short demo script, evaluator Q&A and limitations to disclose.

## Tests and build

```bash
npm test
npm --prefix frontend run build
```

Tests use Node's built-in test runner and do not require a live MongoDB instance. API persistence and the dashboard require MongoDB.

## Repository layout

```text
backend/
  src/config/       workflow definition
  src/controllers/ REST controllers
  src/engine/       rules and workflow execution
  src/middleware/   centralized API errors
  src/models/       MongoDB schema
  src/routes/       API routes
  src/services/     persistence, idempotency, config validation
  test/             automated tests
frontend/src/       React dashboard and styles
docs/               architecture and trade-offs
```

## Known limitations and trade-offs

- Workflow execution is synchronous in the API request. A production deployment should enqueue durable jobs and return `202 Accepted` for long-running work.
- MongoDB unique index protects idempotency at persistence time. For external side effects, use a transactional outbox/provider idempotency key and distributed coordination.
- Retry is user-triggered in this demo; production should use a durable scheduler with exponential backoff, jitter, dead-letter handling and alerting.
- Config is a local JSON file. Production should store immutable config versions in the database and manage changes through authenticated approval/audit workflows.
- The UI is an operational demo, not a secure multi-user admin console. Add authentication and authorization before deployment.
