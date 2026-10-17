---
name: principle-guard-the-context-window
description: "Apply when context is filling up: large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents; keep summaries in the main thread, not raw payloads."
disable-model-invocation: true
---

# Guard the Context Window

**Why:** Context overflow degrades reasoning quality, creates compression artifacts, and halts progress. The window is a working-memory budget, and a full window is not a neutral cost. It is a quality regression that arrives before the hard limit does.

**Pattern:**

- **Size phases and cap scope.** Limit files per phase, set turn budgets, account for mechanism costs.
- **Route bulk to subagents.** Large artifacts, long transcripts, wide sweeps, and repeated reads go to a child. The child returns the reduced finding. The parent keeps the finding and a pointer, never the payload.
- **Keep one writer per store.** When several actors publish facts, give each one its own file and aggregate at read time. A shared file grows the parent's context on every write. Do not let the parent become a bottleneck for other agents' output.
- **Bound the fan-out window.** Cap in-flight children at what one drain can process, as a rolling window rather than blocking batches. A batch costs the slowest child of every batch, and a wide fan-out whose results all land in the parent is a context bomb.
- **Ask for tables, not dumps.** Aggregated reports carry a compact table, one-line evidenced findings, and explicit gaps. Never paste raw child output into the reply. The child's own report path is the pointer a reader follows.
- **Reduce before you read.** Reach a queryable or reduced shape first (a parsed artifact, a grep, a summary) and read that, instead of reading the raw blob and holding it.
- **One command in, one line out.** For bookkeeping between phases, a state read or write that emits a single summary line keeps the mechanism cost flat as the run grows.

**The test:** for each large thing you are about to read, name who reduces it. If the answer is the main thread, you are paying context for work a child could have reduced. If a phase cannot be summarized in a short paragraph plus pointers, it was sized too wide.

**Related:** This is the delegating counterpart to [Minimize Reader Load](../principle-minimize-reader-load/SKILL.md), which bounds what a human reader must hold.

---

**Reconstruction note.** pstack's shipped leaf for this principle is one bullet long, even though the orchestrator, the forensics playbooks, and the fan-out skills all depend on it. The text above is assembled from the author's own words elsewhere in the same repository. The exact source of each paragraph is listed under Reconstruction provenance in docs/ADR.md.
