# Graph Report - deploy  (2026-11-17)

## Corpus Check
- 8 files · ~3,881 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 54 nodes · 59 edges · 9 communities (4 shown, 5 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `38ec383a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.mjs
- appContext
- Madar on ASUS
- sheet
- stage-sheets-import.py
- update-from-ci.ps1

## God Nodes (most connected - your core abstractions)
1. `main()` - 6 edges
2. `appContext()` - 5 edges
3. `Madar on ASUS` - 5 edges
4. `convert()` - 4 edges
5. `sheet()` - 3 edges
6. `schema()` - 3 edges
7. `unavailable()` - 2 edges
8. `blob()` - 2 edges
9. `context` - 2 edges
10. `atomic()` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (9 total, 5 thin omitted)

### Community 0 - "server.mjs"
Cohesion: 0.12
Nodes (8): cache, cacheService, code, disabledActions, dist, loginThrottle, mime, pool

### Community 1 - "appContext"
Cohesion: 0.33
Nodes (5): appContext(), context, atomic(), blob(), unavailable()

### Community 2 - "Madar on ASUS"
Cohesion: 0.33
Nodes (5): CI and production deploys, Google dependencies and data, Madar on ASUS, Start and connect, Verify

### Community 6 - "stage-sheets-import.py"
Cohesion: 0.26
Nodes (4): convert(), main(), schema(), value()

## Knowledge Gaps
- **12 isolated node(s):** `pool`, `code`, `cache`, `cacheService`, `mime` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 33 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `appContext()` connect `appContext` to `server.mjs`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `appContext()` (e.g. with `blob()` and `unavailable()`) actually correct?**
  _`appContext()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `pool`, `code`, `cache` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Why does `sheet()` connect `sheet` to `server.mjs`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._