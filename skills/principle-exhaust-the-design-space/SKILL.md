---
name: principle-exhaust-the-design-space
description: "Apply when facing a novel UI interaction or architectural decision with no precedent in the codebase. Build 2-3 competing prototypes and compare side by side before committing."
disable-model-invocation: true
---

# Exhaust the Design Space

It also applies to product design decisions where user experience depends on feel, not logic.

**Why:** The first shape a model thinks of becomes the shape you live with. One attempt at a hard design locks in that shape, and the cost of changing it later reads as a rewrite, so it gets deferred. Two or three competing attempts cost one extra pass and reveal options you would not have imagined.

**Related:** This principle governs exploring an open design space. [Foundational Thinking](../principle-foundational-thinking/SKILL.md) governs sequencing the work once the shape is settled. [Laziness Protocol](../principle-laziness-protocol/SKILL.md) governs the size of the change.

**The pattern:**

- **Name the decision the exploration exists to make**, one decision per run. No decision means no exploration, so route to Feature instead.
- **Design it twice, minimum.** Require at least two **structurally distinct** candidates before synthesis, even when the first looks sufficient. Whole-shape alternatives, not point fixes inside one shape.
- **Give each candidate its own output location**, a worktree or a scratch directory, so two attempts never write to the same place.
- **When the comparison is visual or interactive, build it cheap.** Throwaway files in one scratch directory, the variants behind a single switcher (buttons or a keypress), each variant labeled, so a human compares things that run instead of reading descriptions.
- **Compare on a rubric written before the candidates exist**, three to six concrete gradeable criteria. The rubric is the picker's tool, not the candidate's brief.
- **Read every candidate end to end before picking**, criterion by criterion rather than on holistic feel.
- **Graft, do not average.** Pick one base a future maintainer can extend most easily, then walk each loser once for the one or two things worth porting into it. Fold each graft in by hand so the result stays coherent under one mental model.

**Reading the result:**

- **Candidates converge on one shape.** That is strong agreement. Ship the consensus shape and skip the graft.
- **Candidates wildly diverge.** The brief was under-specified. Reframe and re-run rather than averaging the divergence.
- **Every candidate is a variation on one shape.** You asked for point fixes instead of whole-shape alternatives. Re-run with the constraint stated.

**The test:** can you name a structurally different design you considered and rejected, with the reason? If not, you took the first shape and polished it.

---

**Reconstruction note.** pstack's shipped leaf for this principle contains only the one sentence at the top plus the description. Everything else here is assembled from the author's own words elsewhere in the same repository. The exact source of each paragraph is listed under Reconstruction provenance in docs/ADR.md.
