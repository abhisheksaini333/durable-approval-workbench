# Verified behavior

The release checks exercised the application with Node 16.16, PostgreSQL 13.5, Temporal server 1.17.1, the TypeScript SDK 1.0.0 and real Keycloak 18.0.2 sign-in.

| Check | Result | Reproduce |
| --- | --- | --- |
| Domain/API/identity/transport contracts | 45 passed | `npm test` |
| Server and browser build | passed | `npm run build` |
| PostgreSQL and pinned Temporal test-server integration | 23 passed | `npm run test:integration` |
| Actual Temporal server recovery/failure/load scenarios | 6 passed | `npm run test:runtime` |
| Real identity and browser journeys | 3 passed | `npm run test:e2e` |
| Signed CLI onboarding | approved, two decision receipts, reserved and activated | `python3 scripts/demo.py` |

The runtime scenarios stop/restart a worker, queue a decision while it is absent, save/replay that history, interrupt provider availability, lose a reply after its durable write, cancel an in-flight request, expose incomplete compensation, repeat manual cleanup, reject invalid actors and preserve expiry while a worker is offline. Twelve concurrent workflows completed with 24 logical effects in **3452 ms**, with worker activity/workflow concurrency limited to four. This is a local smoke measurement, not a production capacity forecast.

Independent regressions also reproduced and closed two recovery bugs: queued approval plus cancellation now finishes cancelled without effects; a 20-entry inbox with no worker now returns explicit unavailable state in about 3.5 seconds, inside the browser's ten-second deadline. The final browser suite confirms the selected inbox badge and detail view agree after approval, retry keys survive interrupted submissions, cancellation is explicit and mobile layouts do not overflow horizontally.

Browser runs use an installed Chrome executable through Playwright 1.24.1. The pinned test-server installer verifies the published 1.14.0 binary archive checksum, rather than using an unversioned download. Hosted CI runs the build and database/test-server suites; the Docker runtime and real identity/browser checks are separately reproducible local acceptance checks.

Generated reports live in ignored `artifacts/`; saved histories are private under `.local/histories/`. The checked-in screenshot comes from the real browser journey. No cloud customer accounts or production providers were used. Network security hardening, production backup/retention and external paging remain deployment responsibilities described in the runbook.
