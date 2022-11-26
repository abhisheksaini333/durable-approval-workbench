# Continuous integration

The workflow builds the browser/server, runs unit contracts, and runs PostgreSQL plus the pinned Temporal test-server integration suite. Integration output is streamed into the job log, including failures. Download a run log with `gh run view RUN_ID --log > run.log` when preserving release evidence. Saved histories are also produced locally by the same integration command under `.local/histories/`.

The workflow uses checkout 3.0.2 and setup-node 3.4.1 pinned by commit. Dependency caching and the retired artifact-upload v3 endpoint are not required. The pinned application runtime is Node 16.16; hosted runner software is managed by GitHub.

Sources: [checkout 3.0.2](https://github.com/actions/checkout/releases/tag/v3.0.2), [setup-node 3.4.1](https://github.com/actions/setup-node/releases/tag/v3.4.1), [artifact v3 retirement](https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/).
