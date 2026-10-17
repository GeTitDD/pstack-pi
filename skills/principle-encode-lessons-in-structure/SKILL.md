---
name: principle-encode-lessons-in-structure
description: "Apply when you catch yourself writing the same instruction a second time, or notice a recurring correction. Encode the rule as a lint, metadata flag, runtime check, or script instead of more text."
disable-model-invocation: true
---

# Encode Lessons in Structure

If the lesson needs judgment and cannot be encoded, make the instruction more prominent and add an example of the failure mode.

**Corollary:** If the fix is structural, only use the structural fix. The instruction is the symptom.

**Why:** Text asks every future reader to remember and comply. Structure makes the wrong thing impossible or loud. An instruction that has already been written once and then violated is evidence that text is the wrong medium for that rule.

**Assume every contributor is an agent** that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Design so that a change that looks right from one file is right for the whole repo.

**The ladder.** Fix each recurring lesson at the highest level that works, not the most convenient one.

1. **Eliminate it with architecture.** Give each piece of state one owner and each task one supported way. Hide internals so the wrong import fails. Replace hand-synced lists with one source of truth. Delete the old ways and the dead code an agent would copy.
2. **Enforce it with types.** Make the bad state unrepresentable, or the wrong call fail to compile. Invariants go in types before they go in runtime checks, which go in before prose comments.
3. **Add a lint or CI check.** Its error message must name the file, type, or function to use instead. If the pattern is already common, fail only when a change adds more.
4. **Test the behavior.** Fix or delete any test that would still pass if every function it calls returned nothing.
5. **Write prose last**, only for judgment calls that cannot be encoded. Nothing fails when an agent skips prose.

**The pattern:**

- **Read paths from the tool that owns them.** A hand-typed list misses entries the tool would have reported.
- **Derive from the authoritative source.** When a schema, migration, spec, or config file owns a shape, derive from it instead of hand-rolling a parallel copy.
- **Make the script the evidence.** Prefer a committed script's output over a hand-made one-off, because the script reruns for free and a reviewer can check it.
- **Turn a repeated instruction into a guardrail.** When you catch yourself restating an instruction, write the line into the register or the check before you act on it again.
- **Move enforceables out of review notes.** A finding that a lint rule, script, metadata flag, or runtime check would catch more reliably belongs in the backlog as a check, not as a comment.
- **Prose rules get a checker too.** A writing rule the agent keeps breaking can be a linter over the artifact it produces.

**The test:** if the mistake recurred tomorrow, what would catch it without a human remembering this instruction? If the answer is "nothing", the lesson is not encoded yet.

**Distinct from** [Build the Lever](../principle-build-the-lever/SKILL.md), which is throughput and reviewability on the work in front of you. This principle is about making a recurring instruction a durable guardrail.

---

**Reconstruction note.** pstack's shipped leaf for this principle is eight lines and carries no Pattern section, even though eight other files cite it. The text above is assembled from the author's own words elsewhere in the same repository. The exact source of each paragraph is listed under Reconstruction provenance in docs/ADR.md.
