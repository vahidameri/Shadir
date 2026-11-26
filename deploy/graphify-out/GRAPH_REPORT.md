# Graph Report - deploy  (2026-11-26)

## Corpus Check
- 10 files · ~5,207 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 70 nodes · 84 edges · 10 communities (5 shown, 5 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fcecbf78`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.mjs
- appContext
- Taskamun on ASUS
- sheet
- stage-sheets-import.py
- update-from-ci.ps1
- google-login.test.mjs

## God Nodes (most connected - your core abstractions)
1. `main()` - 6 edges
2. `appContext()` - 5 edges
3. `Taskamun on ASUS` - 5 edges
4. `convert()` - 4 edges
5. `createGoogleSignIn()` - 3 edges
6. `openGoogleSession()` - 3 edges
7. `sheet()` - 3 edges
8. `schema()` - 3 edges
9. `googleCookie` - 2 edges
10. `b64()` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (10 total, 5 thin omitted)

### Community 0 - "server.mjs"
Cohesion: 0.12
Nodes (8): cache, cacheService, code, disabledActions, dist, loginThrottle, mime, pool

### Community 1 - "appContext"
Cohesion: 0.33
Nodes (5): appContext(), context, atomic(), blob(), unavailable()

### Community 2 - "Taskamun on ASUS"
Cohesion: 0.29
Nodes (6): CI and production deploys, Data and integrations, Enable Google sign-in on the Docker site, Start and connect, Taskamun on ASUS, Verify

### Community 6 - "stage-sheets-import.py"
Cohesion: 0.26
Nodes (4): convert(), main(), schema(), value()

### Community 9 - "google-login.test.mjs"
Cohesion: 0.18
Nodes (7): createGoogleSignIn(), googleCookie, openGoogleSession(), b64(), client, credential(), { privateKey, publicKey }

## Knowledge Gaps
- **14 isolated node(s):** `{ privateKey, publicKey }`, `client`, `pool`, `code`, `cache` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 39 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `appContext()` connect `appContext` to `server.mjs`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `appContext()` (e.g. with `blob()` and `unavailable()`) actually correct?**
  _`appContext()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `{ privateKey, publicKey }`, `client`, `pool` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Why does `sheet()` connect `sheet` to `server.mjs`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `createGoogleSignIn()` connect `google-login.test.mjs` to `server.mjs`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._