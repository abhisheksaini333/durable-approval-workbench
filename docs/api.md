# API contract

All `/api` routes require a verified bearer token. Mutation requests from browsers must use the configured origin. JSON bodies are limited to 16 KiB; authenticated mutations are limited to 30 per actor per minute. Problems use `application/problem+json` with status, code, detail and a trace ID.

| Method/path | Input | Outcome |
| --- | --- | --- |
| `GET /api/session` | token | verified actor and roles |
| `POST /api/requests` | `Idempotency-Key`, `{customer, plan, seats}` | 202 plus stable request ID |
| `GET /api/requests?limit=20&cursor=...` | limit 1–50 and optional cursor | scoped entries, snapshots or explicit unavailability, next cursor |
| `GET /api/requests/:id` | request UUID | workflow snapshot |
| `POST /api/requests/:id/decisions` | `{id, stage, choice, note, revision}` | 202 transport acknowledgement; poll snapshot for receipt |
| `POST /api/requests/:id/cancel` | `{}` | 202 transport acknowledgement; poll final state |
| `GET /api/metrics` | operator token | HTTP classes and uptime |

Plans are `standard` or `enterprise`; seats range from 1 to 1,000; customer names are nonempty up to 120 characters. Decisions use `approve`/`reject`, `security`/`commercial`, the observed revision and a note up to 500 characters. The API derives the actor from the verified token. IDs are bounded canonical identifiers; URL request IDs are UUIDs.

An idempotency key is scoped to tenant/requester. Identical retries return the original request; altered payloads conflict. A decision ID identifies one exact actor/stage/choice/note/revision. Its receipt records accepted/rejected with a reason. Keep the ID when retrying an uncertain response. `404` also hides requests outside the actor's visibility; `503` means workflow state/startup could not be confirmed. A decision's 202 response must not be presented as a confirmed approval.

Requester-only users see their own entries. Tenant reviewers/operators can inspect tenant work. Reviewers must match the current stage, cannot approve their own request, and cannot decide after expiry. Owners or operators can cancel pending/provisioning work.
