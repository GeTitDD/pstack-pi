### Investigation

**You own the answer. Plan, route, write.**

Investigation requests are read-only. They produce a cited explanation or a recommendation, not a code change.

1. Route through the **how** skill. For motivation questions, also route through the **why** skill.
2. Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only investigation`.
3. Produce the `how`-shaped output (Overview / Key Concepts / How It Works / Where Things Live / Gotchas), or a recommendation with a tradeoffs table if the request is a decision between alternatives.
4. Apply the **unslop** skill to the reply.
5. Show the read-only claim rather than asserting it. Name the revision you inspected, and the command that proves the tree is unchanged, normally `git rev-parse HEAD` and `git status --porcelain`. A delegated child loses the `write` and `edit` tools, and there is no filesystem sandbox behind that, so the tree is the only evidence a reviewer can check.

No PR, no babysit, no `architect` unless the investigation precedes a code change. If it does, hand back to the user and re-route to Bug fix or Feature.

**Reply:** the investigation output, opened with the revision you inspected and the unchanged-tree evidence. For "are we sure?" answers, include your real judgment with reasons. Push back if the premise is wrong (see Autonomy).
