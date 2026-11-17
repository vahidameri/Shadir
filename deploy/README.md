# Madar on ASUS

The Docker deployment contains the Vite frontend, a Node.js adapter for the existing Apps Script handlers, and a dedicated PostgreSQL 16 service. The adapter runs the existing application routes and permission checks. PostgreSQL stores logical sheets and app properties in two tables. The single web replica processes each request against a database transaction and saves changed sheets as JSONB. PostgreSQL listens on the project's Compose network. Its named volume survives a container restart or replacement.

## Start and connect

Run `deploy/start.ps1` from the server checkout with Windows PowerShell and Docker Compose. On the first run it creates separate random database and application passwords under `.secrets/` with restricted Windows ACLs, initializes the database and creates the `admin` account. An existing database keeps its account state on subsequent runs. The initial application password is in `.secrets/admin-password.txt` on the host.

From a machine with the ASUS SSH alias:

```powershell
ssh -N -L 4181:127.0.0.1:4181 asus-server
```

While the tunnel is open, visit `http://127.0.0.1:4181` and sign in as `admin`. Use the existing server SSH account to retrieve the initial password from `vahid-deployments/madar/.secrets/admin-password.txt`. Keep passwords out of Git and chat.

## Verify

With both stacks running, from this deployment directory on ASUS:

```powershell
.\deploy\smoke.ps1 -Port 4181 -OtherPort 4182
```

The check creates one temporary project record, restarts this stack, verifies the record still exists, deletes it and revokes the test session. It also checks unauthenticated requests and isolation against the other stack.

## Google dependencies and data

The app starts with an empty project dataset. Google Sheets data can be imported when the owner provides each source. Local username/password login is enabled. The Apps Script deployment keeps its own Google integrations. This Docker deployment can use Google for sign-in. Email and email-based recovery, Drive uploads, Calendar synchronization and external sheet imports require separate setup.

### Enable Google sign-in on the Docker site

1. In the Google Cloud project for Madar, open **Google Auth Platform → Clients** and use a **Web application** OAuth client. Register `https://taskamun.ir` as an authorized JavaScript origin. The popup flow needs no redirect URI and no client secret. Configure the consent audience for the Madar users.
2. Set `MADAR_GOOGLE_CLIENT_ID` to that client's public ID in the deployment's `.env`. New checkouts already pass it to the web container in Compose. On the existing ASUS installation, the scheduled updater only replaces the web image; add the environment mapping to the installed Compose configuration or merge it into a local `compose.override.yaml` before recreating **only** the web container:
   ```yaml
   services:
     web:
       environment:
         MADAR_GOOGLE_CLIENT_ID: ${MADAR_GOOGLE_CLIENT_ID:-}
   ```
   Back up any existing configuration first. Run `docker compose config --quiet` and use the existing web-only update procedure; neither the PostgreSQL service nor its data has to be replaced.
3. Verify the official Google button on the same site with an active team test account, and verify that username/password sign-in still works. A Google account can sign in only if its verified Gmail or Workspace address matches exactly one active team member. On first sign-in the Google account is linked to the existing member; no member is created automatically. For a sanctioned account replacement, an operator must verify the identity and remove that member's `GOOGLE_SUB.<member-id>` property before relinking. An empty client ID leaves password login available.

Madar uses the ID token to sign users in on this site and does not request Calendar or Drive permissions.

Upstream source revision: `e34716ee7e7dad23ec448040bfa84cb17255e9fb`.

## CI and production deploys

Open pull requests against `codex/asus-postgres`. On pull requests and pushes to that branch, **Madar CI** builds the Docker image, starts a temporary PostgreSQL database, and checks the frontend, health endpoint, and login. GitHub Pages has a separate workflow.

The `Madar Deploy from CI` Windows task runs `deploy/update-from-ci.ps1` on ASUS every three minutes while the Docker Desktop user session is active. It checks the most recent push run of Madar CI and downloads/builds that exact commit only when the run passes. It replaces the web container, checks local health, and reverts to the previous web image on failure. PostgreSQL and the Cloudflare connector remain in place. A failed release can be retried by removing its SHA from `.secrets/madar-ci-failed-sha` on ASUS after correcting the cause. To pause deployments, disable the Windows task.

The ASUS script is installed on the server and changes to the script itself require a separate server update. Schema or Compose changes require a separate deployment step.
