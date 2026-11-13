# Hackathon Demo and Defence Notes

## 90-second project explanation

DecisionFlow is a configuration-driven workflow decision platform. The API accepts a structured request and an idempotency key. It validates the payload against required fields and a configurable field schema, evaluates ordered rules, invokes a simulated external verification provider, and persists the final state with a rule trace and audit events. The workflow definition is versioned and snapshotted onto each request, so a later rule update does not rewrite the reasoning behind an earlier decision. Transient provider failures enter a retry-pending state; permanent failures and exhausted retry budgets are routed to manual review.

## Live demo sequence

1. Open the dashboard and show the active workflow version and rules.
2. Submit the default example and show `APPROVED`.
3. Submit a credit score below 600 and show `REJECTED`; open Details to show the failed rule and audit event.
4. Submit an amount above the configured threshold and show `MANUAL_REVIEW`.
5. Use the Postman request `Submit application (retry demo)` with `failuresRemaining: 1`. Show `RETRY_PENDING`, then click Retry and show approval.
6. Repeat a POST using the same `Idempotency-Key`; explain that the original record is replayed rather than duplicated.
7. Explain how a config version increment changes only new requests; old requests retain their config snapshot.

## Likely evaluator questions

**Why use a config-driven engine instead of hardcoding the application workflow?**  
The engine owns execution mechanics while configuration owns fields, rules and outcomes. This reduces coupling and lets the same engine serve other business processes.

**How do you prevent duplicate requests?**  
A client-provided idempotency key is stored under a MongoDB unique index. Repeated submissions return the existing record; duplicate-key races are handled by reading the winning record.

**Is this exactly-once processing?**  
No. The implementation prevents duplicate request records. Exactly-once external side effects require provider-level idempotency and a durable outbox/worker design.

**Why not evaluate arbitrary JavaScript expressions?**  
Arbitrary evaluation is unsafe. The expression engine accepts a deliberately restricted comparison grammar and never calls `eval`.

**What happens when the external service fails?**  
Transient errors are retryable up to the configured maximum. Permanent errors and exhausted retries become manual review, with each attempt recorded.

**How would you scale it?**  
Move execution to durable queue workers, claim retry jobs atomically with leases, add exponential backoff and jitter, use shared immutable config storage, and add metrics/tracing/alerts.

## Honest limitations to disclose

- External verification is simulated, not a real third-party integration.
- Workflow execution is synchronous in the API process; no durable queue worker is included.
- Idempotency prevents duplicate persisted requests but does not provide distributed exactly-once side effects.
- The admin config key is a simple local-demo gate, not full user authentication or role-based access control.
- Unit tests cover the decision engine and config validation. A live acceptance test against MongoDB is still required before final hand-in.
