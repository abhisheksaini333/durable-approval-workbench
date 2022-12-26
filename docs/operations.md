# Operating Switchboard

## Local lifecycle

Use Node 16.16, Python 3, Docker Compose and at least 3 GB available Docker memory. On Apple Silicon the pinned Temporal and identity containers use amd64 emulation. First Keycloak startup imports the realm and can take several minutes.

```sh
python3 scripts/bootstrap.py
npm ci --no-audit --no-fund
npm run build
docker compose --env-file .local/docker.env -p switchboard-2022 up -d
python3 scripts/local.py start
python3 scripts/demo.py
```

The bootstrap is repeatable: it keeps existing generated passwords and writes private files with mode 0600. Do not replace the credentials file while keeping the existing database/identity volumes. Demo users and passwords are in `.local/credentials.json`; they are never printed by setup. The host launcher checks PostgreSQL/Temporal readiness and identity discovery before reporting ready.

| Endpoint | Port | Purpose |
| --- | ---: | --- |
| Approval desk/API | 4900 | Use `http://localhost:4900` for matching OIDC redirects |
| Keycloak | 4901 | Realm `switchboard` |
| PostgreSQL | 4902 | Registry, provider and Temporal databases |
| Provisioning service | 4903 | Internal authenticated effects |
| Temporal gRPC | 4904 | Local workflow transport |

`requester` creates requests; `security` and `commercial` approve in order; `operator` sees tenant-wide work and can cancel. `self-review` and `outsider` exercise access boundaries. Realm direct password grants exist for the CLI demo; browser sign-in uses authorization code plus PKCE.

Stop only this application with:

```sh
python3 scripts/local.py stop
docker compose --env-file .local/docker.env -p switchboard-2022 stop
```

Volumes retain registry entries, effects, identities and workflow histories. Avoid `down -v` when preserving work. The host process launcher records owned process groups, checks their command identity, sends SIGTERM and allows 15 seconds to drain.

## Failures and recovery

- **API reply lost:** retry the same submission or decision. The UI retains its operation identity until a result is confirmed. Do not invent a new identity for an ambiguous prior attempt.
- **Worker stopped:** requests remain pending in Temporal. Signals can still be accepted. Restart the worker on the same namespace/task queue; the durable deadline continues while it is offline.
- **Provider unavailable:** activities use 3-second HTTP deadlines, a 10-second attempt deadline, a 45-second scheduling limit and at most four attempts with 1–5 second retry intervals. Permanent provider rejections are not retried.
- **Unreviewed request:** the default reminder is five minutes and expiry is ten minutes. A reminded pending request appears in Attention. An operator can inspect/cancel; only authorized reviewers decide. There is no external email/paging connector.
- **State unavailable:** the inbox marks that entry explicitly and keeps unrelated entries available. Retry after restoring the workflow service; it does not invent a successful status.
- **Compensation failed:** inspect the audit and provider before cleanup. Export history first. Use the matching workflow/request identities from the registry entry:

```sh
npx ts-node scripts/history.ts export .local/incident-history.json WORKFLOW_ID
npx ts-node scripts/history.ts replay .local/incident-history.json
npx ts-node scripts/recover.ts WORKFLOW_ID EXPECTED_REQUEST_ID
```

Manual cleanup requires `compensation_failed` and an exact request identity. It deactivates then releases through the authenticated provider, and may safely be repeated. Provider receipts record cleanup; the workflow result remains the original incident record. The operator should retain the command output with the incident resolution.

## Configuration and inspection

`.env` accepts `DATABASE_URL`, `PROVIDER_TOKEN`, `OIDC_ISSUER`, `PUBLIC_ORIGIN`, `PROVIDER_URL`, `PORT`, `PROVIDER_PORT`, `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TASK_QUEUE`, `APPROVAL_TIMEOUT_MS` and `REMINDER_AFTER_MS`. The browser/local scripts use the default ports; custom ports require matching launcher/proxy/realm configuration. Approval deadlines must be 2 seconds to 24 hours, with reminders strictly before expiry. Keep secrets outside Git.

`GET /health` reports process liveness; `/ready` checks database and Temporal connectivity. `GET /api/metrics` requires an operator token and returns HTTP response-class counts and uptime. `.local/*.log` contains process failures; sensitive business payloads are not deliberately logged. Back up all three durable PostgreSQL databases and the identity volume consistently before infrastructure changes. This lab does not automate a production backup or retention policy.
