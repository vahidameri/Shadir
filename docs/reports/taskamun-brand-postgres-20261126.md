# Taskamun brand and PostgreSQL connection

Base release: fcecbf782ef8d4c0cff698cae5bd74c1635e0f59.
Target: the Docker site at https://taskamun.ir/.

- index.html, src/lib/brand.ts, src/App.tsx, src/components/Login.tsx, src/components/Layout.tsx and apps-script/Code.gs update site titles and wordmarks. The login subtitle keeps the department wording after removal of the old brand prefix.
- src/lib/api.ts pins the Docker build to its same-origin API and prevents old browser config from redirecting requests to the former Apps Script deployment. Docker API failures no longer instruct users to install Apps Script.
- src/components/Import.tsx removes direct Sheet URL import. Paste and CSV remain available. README.md and deploy/README.md describe the production PostgreSQL path and historical one-time migration.
- The Docker PostgreSQL schema and data were not changed. The in-process compatibility adapter still runs shared handlers. The archived Apps Script deployment and its generated HTML are outside the production rollout.

Checks run:
- Production-mode TypeScript and Vite build passed with VITE_API_URL=/api.
- Four existing Node Google sign-in unit tests passed.
- Isolated PostgreSQL 16 and Node deployment: anonymous read rejected; a password session created a synthetic project; the row was verified in PostgreSQL via SQL, retrieved after web and DB restarts, deleted, and the session was revoked.
- Chrome at 375, 768 and 1440 px: localized login titles, subtitle and wordmark; on desktop, real local password sign-in and import sources with a pre-seeded obsolete API config. No external Sheets or old API requests and no page errors during these checks. CSV and paste controls were checked; no import batch was submitted.
- Deploy Graphify: 70 nodes and 84 edges, zero model tokens. Connected storage and the updated deployment documentation were queried. Optional SQL parser was unavailable. Graph refresh was run against the modified worktree.
- The reported errors were described without a specific failing action or exact message. Verification covers the identified connection and direct-import paths. Production deployment confirmation is separate from local QA.

## Production release verification

- Owner approved production release. PR #2 was squash-merged as 1288c73fbe0971c700893f535e5c03121c83b5e9. Push CI run 45907808194 succeeded.
- The scheduled ASUS updater returned 0. The web container reported the exact release revision and healthy status. PostgreSQL remained healthy with the same container start time through the observed web rollout.
- Public HTTPS served the new HTML title and the expected JS and CSS. Health returned OK and the anonymous data request was refused. Fresh Chrome at 375 and 1440 px rendered the Persian and English login, subtitle and wordmark without page errors or failed same-origin requests.
- Before rollout, supplementary local Chrome QA submitted both a CSV and a pasted contact through the import UI. Both synthetic records were verified directly in the isolated PostgreSQL database. Production verification was read-only.
- Deploy Graphify was queried again for the updater and production flow. The production verification was documentation-only and changed no files in the deploy graph corpus.
