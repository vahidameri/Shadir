# ASUS PostgreSQL rollout for Madar

- Date: 2026-11-16
- Upstream: `e34716ee7e7dad23ec448040bfa84cb17255e9fb`
- Compose project: `vahid-madar`
- Private web origin: `127.0.0.1:4181` on the host
- Database volume: `vahid-madar_db-data`

- Added Docker build, Compose services, PostgreSQL-backed Node runtime, startup and smoke scripts, and a deployment runbook.
- Updated the login provider and form to use the same-origin API for the Docker build. Original Google builds use the existing sign-in flow.
- Docker Compose built the TypeScript/Vite frontend and brought up both services healthy. The PostgreSQL service and its volume belong to this Compose project.
- Remote verification passed HTTP, local admin login, unauthenticated access rejection, foreign-session rejection against port 4182, a temporary project write, app and database restart, project persistence, project deletion and logout.
- A fresh SSH tunnel returned HTTP 200 for the HTML and JavaScript bundle, and `/healthz` reported ready.
- Six deployed files matched the checkout by SHA-256: Dockerfile, compose.yaml, package-lock.json, deploy/server.mjs, and the two frontend files changed for login.
- Production npm dependency audit reported zero findings. The build dependency audit reported one high and one moderate finding in the upstream dependency set. Browser interaction was outside the executed checks.
- No upstream Graphify snapshot was present. Offline Graphify produced 36 nodes and 35 edges for `deploy/`. A focused query found the route transaction, app context and PostgreSQL dependency in source. Machine graph and report were included.
- Owner deferred import from Google Sheets. The running database holds the initial admin, app metadata and smoke-test audit entries. Google integrations, external domains and CDN publication remain pending. Initial credentials are stored only on the server.

Start and access instructions are in [the deployment runbook](../../deploy/README.md).
