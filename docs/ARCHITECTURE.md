# Architecture and Engineering Decisions

## 1. Problem framing

The platform separates *what a workflow decides* (configuration) from *how a workflow runs* (engine). A single configured workflow demonstrates application approval, but the same runtime can execute vendor, employee or document workflows by changing required fields and rules.

## 2. Components

- **Intake/API:** accepts JSON, requires an idempotency key, returns a persisted request and replay indicator.
- **Configuration service:** validates workflow identity, version, required fields, rule IDs, rule types, operators and failure actions. Updates are written atomically using a temporary file and rename.
- **Rule engine:** deterministic evaluator for required, threshold and constrained expression rules. It does not use `eval` or execute user-provided JavaScript.
- **Workflow engine:** owns stage transitions, dependency invocation, retry counting, final outcomes and audit events.
- **Persistence:** MongoDB stores the request, input, config snapshot, workflow version, rule trace, status and audit trail.
- **Dashboard:** submits sample applications, summarizes statuses, lists execution history and exposes retry for retryable work.

## 3. Data flow

1. Client sends a request with `Idempotency-Key`.
2. API checks for an existing key. Existing records are returned as replays.
3. The active workflow config is loaded and validated. A snapshot is copied onto the request.
4. Required fields are checked. Invalid requests are rejected with a validation audit event.
5. Rules execute in configured order. Each rule emits a trace record; a reject takes precedence over manual review.
6. If rules permit progression, the external verification adapter runs.
7. Success finalizes as `APPROVED`. Transient failure becomes `RETRY_PENDING` until the retry budget is exhausted; permanent failure or exhausted budget becomes `MANUAL_REVIEW`.
8. The request and audit history are persisted. A retry uses the original config snapshot.

## 4. State model

| State | Meaning | Allowed next state in this implementation |
|---|---|---|
| `PENDING` | Accepted, not yet evaluated | `PROCESSING`, `REJECTED`, `MANUAL_REVIEW` |
| `PROCESSING` | External dependency in progress | `APPROVED`, `RETRY_PENDING`, `MANUAL_REVIEW` |
| `RETRY_PENDING` | Transient dependency error; retry allowed | `PROCESSING`, `MANUAL_REVIEW` |
| `APPROVED` | All rules and dependency passed | Terminal |
| `REJECTED` | Required input or reject rule failed | Terminal |
| `MANUAL_REVIEW` | Human decision required | Terminal in this demo |

## 5. Idempotency and consistency

The client supplies a stable idempotency key for one logical submission. MongoDB enforces a unique index. The service checks before processing and handles duplicate-key races by reading the winner. This prevents duplicate records. It does **not** guarantee exactly-once external side effects in a distributed production system; use provider-level idempotency plus an outbox/worker pattern for that guarantee.

Mongoose optimistic concurrency is enabled on documents. A production retry worker should additionally claim work atomically (for example, conditional `findOneAndUpdate` with a lease) to prevent two workers retrying the same record concurrently.

## 6. Retry and failure policy

The simulated dependency returns success, transient failure or permanent failure. Transient errors increment `retryCount`; a request remains `RETRY_PENDING` while budget remains. A permanent error or exhausted budget routes to manual review. The demo exposes a manual retry action. Production should implement exponential backoff, jitter, maximum elapsed time, dead-letter queues, retry ownership/leases, metrics and alerts.

## 7. Audit and explainability

Audit events include timestamp, stage, action, message and structured details. Rule trace captures rule ID, type, pass/fail and configured failure action. The request stores the workflow version and exact configuration snapshot used, allowing an evaluator to understand why a historical decision was made even after active rules change.

## 8. Configuration changes

The JSON config is intentionally small and human-readable. The API rejects duplicate rule IDs, unsupported rule types/operators, invalid failure actions and non-incrementing versions. Writes use temp-file + rename to avoid partially written JSON. For multiple API instances, move configuration to a database with immutable version documents and an approval process; local filesystem config is not shared across replicas.

## 9. API surface

- `POST /api/requests`
- `GET /api/requests?page=&limit=&status=`
- `GET /api/requests/:id`
- `POST /api/requests/:id/retry`
- `GET /api/config`
- `PUT /api/config`
- `GET /api/metrics`
- `GET /api/health`

Config writes can be protected by `ADMIN_API_KEY` (`x-admin-key` header). This is a lightweight local-demo gate, not a substitute for identity-based authorization.

## 10. Testing strategy

Automated unit tests cover threshold and expression evaluation, unsupported expression rejection, missing required fields, approval, rule rejection, manual review, transient dependency failure, retry exhaustion and permanent dependency failure. Config validation tests cover valid configuration, duplicate IDs, unsupported rule types and invalid operators. A live acceptance pass should additionally verify MongoDB persistence, duplicate-key replay, pagination, config version changes and UI retry behavior.

## 11. Scaling considerations

- Run stateless API replicas behind a load balancer.
- Move workflow execution to durable queue workers; persist state before acknowledging acceptance.
- Use atomic leases/claims for retry work and provider idempotency keys for external calls.
- Store immutable workflow definitions in a database or config service with cache invalidation.
- Add indexes for status/createdAt and idempotency key; add retention/archival policy for audit records.
- Add structured logs, distributed tracing, metrics, alerting, circuit breakers and rate limits.
- Partition high-volume audit/event data and consider an append-only event store if audit throughput grows substantially.

## 12. Trade-offs and assumptions

- **Synchronous execution:** simpler to run and explain in a hackathon; queue-based execution is more resilient at scale.
- **MongoDB document aggregate:** request, trace and audit stay together for straightforward retrieval; very large histories may require separate event storage.
- **JSON config:** easy to inspect and change; unsuitable for multi-instance config management.
- **Constrained expressions:** safer than arbitrary scripts; complex workflows may eventually need a typed expression DSL or BPMN-compatible engine.
- **Manual retry:** transparent for a demo; scheduled retry is preferable in production.
