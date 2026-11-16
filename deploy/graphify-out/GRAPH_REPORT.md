# Graph Report - deploy  (2026-11-16)

## Corpus Check
- 4 files · ~2,423 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 36 nodes · 35 edges · 6 communities (3 shown, 3 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e34716ee`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.mjs
- appContext
- Madar on ASUS
- sheet

## God Nodes (most connected - your core abstractions)
1. `appContext()` - 5 edges
2. `Madar on ASUS` - 4 edges
3. `sheet()` - 3 edges
4. `unavailable()` - 2 edges
5. `blob()` - 2 edges
6. `context` - 2 edges
7. `atomic()` - 2 edges
8. `pool` - 1 edges
9. `code` - 1 edges
10. `cache` - 1 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (6 total, 3 thin omitted)

### Community 0 - "server.mjs"
Cohesion: 0.12
Nodes (8): cache, cacheService, code, disabledActions, dist, loginThrottle, mime, pool

### Community 1 - "appContext"
Cohesion: 0.33
Nodes (5): appContext(), context, atomic(), blob(), unavailable()

### Community 2 - "Madar on ASUS"
Cohesion: 0.40
Nodes (4): Google dependencies and data, Madar on ASUS, Start and connect, Verify

## Knowledge Gaps
- **11 isolated node(s):** `pool`, `code`, `cache`, `cacheService`, `mime` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 27 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `appContext()` connect `appContext` to `server.mjs`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `appContext()` (e.g. with `blob()` and `unavailable()`) actually correct?**
  _`appContext()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `pool`, `code`, `cache` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Why does `sheet()` connect `sheet` to `server.mjs`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._