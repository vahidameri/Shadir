# Madar CI/CD verification

2026-11-17. Production is https://taskamun.ir/. Submit fixes to `codex/asus-postgres`. GitHub Actions runs the Docker smoke check for pull requests and pushes to that branch. The ASUS scheduled task pulls the exact SHA from a successful push run. It needs outbound GitHub access and the ASUS Docker Desktop user session.

- Workflow and CD commit: `78d9d4f29bb643a547a2b99f01df05f08a6eecfa`.
- GitHub run [44078337221](https://github.com/vahidameri/Shadir/actions/runs/44078337221) passed the isolated web build, PostgreSQL startup, frontend, health, access denial, and local admin sign-in checks.
- The scheduled task deployed that exact SHA with exit code 0. The next scheduled poll also exited 0 and the web image kept that SHA. PostgreSQL kept the same start time and volume.
- Public HTTPS served the Madar page and its JavaScript with HTTP 200, returned `ok: true` from `/healthz`, and denied the anonymous API read.
- A mocked startup failure restored the previous image tag, confirmed the failed SHA marker, and suppressed the next attempt. No failure was induced in production.
- Offline Graphify was rebuilt and queried for the new script and documentation (53 nodes, 59 edges). The optional SQL parser was unavailable.
