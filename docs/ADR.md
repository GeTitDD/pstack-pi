# ADR: porting pstack to pi

Source: `cursor/plugins`, directory `pstack`, version 0.15.21, commit `fe53d9e` (2026-10-12). Local snapshot at `../cursor-plugins/pstack/`.

This file records every decision made while porting, so a later reader can tell a deliberate deviation from an oversight. It also carries the provenance for the three reconstructed principles.

---

## ADR-1. Reproduce the router faithfully, keep the trigger authority with the human

**Decision.** The router keeps `disable-model-invocation: true`, is attached by hand, and carries a per-turn reminder only while resident mode is on.

**Why.** In pstack the trigger authority is what keeps every later anti-cheat rule enforceable. If the agent can decide for itself when rigor applies, then the principle citations, the evidence labels, and the `skip:` reasons all become self-graded. Two mechanisms carry it here:

- `/poteto-mode <task>` attaches the router to one message, matching plain enter in Cursor.
- `/poteto-mode on` makes it resident. The extension adds a prompt section on every turn, matching Cursor's custom mode. pi diffs prompt sections, so the reminder is only re-sent when it changes.

The reminder text is quoted verbatim from `skills/poteto-mode/SKILL.md` frontmatter. The `mode`, `icon`, and `color` frontmatter fields are Cursor-only and dropped.

## ADR-2. Build a generic verification skill instead of importing a control skill

**Decision.** Ship `skills/verify-app/` with four adapters (CLI, HTTP, browser, script) as the replacement for `control-cli` and `control-ui`.

**Why.** Much of pstack's rigor rests on the live lane, and the live lane rests on a project-specific driver from a different plugin. Without a driver, "verify on the matching surface" degrades into "read the code and report", which is the exact failure mode the rule exists to prevent. The adapters keep the four things every lane needs explicit: boot, input, diagnostics, evidence.

## ADR-3. First port: seven playbooks, twelve cited skills, twenty-four principles

**Decision.** Ship `investigation`, `bug-fix`, `feature`, `refactoring`, `autonomous-run`, `pause-safely`, and `opening-a-pr`, plus the skills those playbooks cite.

**Why.** The seven cover the single-task main path, one scale-layer playbook, and the closing hook every code playbook invokes. The twelve skills are not optional: the closing hook alone cites eight of them. Porting the playbooks without their cited skills would leave dangling references, which is the same defect as the three stub principles (ADR-5).

Dropped from the closure: `why`'s six MCP-specific source playbooks. This environment has no MCPs configured, and `why` already has a rule for that case (record the category as a gap in Sources Consulted rather than skipping it silently).

## ADR-4. Ship `autonomous-run` as the scale layer

**Decision.** `autonomous-run` is in, `figure-it-out` is in, `orchestrate` and the two autopilots are out.

**Why.** `autonomous-run` needs only a predicate, a wake mechanism, and a decision log. `figure-it-out` is the fallback for "no playbook fits", so its absence would make that case a dead end. The orchestration tier needs a store, a ledger, a frontier, and cloud isolation, and none of it is reachable in a first port without inventing all four.

## ADR-5. Reconstruct the three stub principles, and cite the provenance

**Decision.** For `exhaust-the-design-space`, `encode-lessons-in-structure`, and `guard-the-context-window`, keep the `description` verbatim and rebuild the body from the author's own words elsewhere in the same repository.

**Why.** pstack's shipped leaves for these three are effectively empty (1, 2, and 5 non-empty body lines), while the rest of the corpus cites them, `encode-lessons-in-structure` alone eight times. A citation whose target carries no rule reads as compliance while changing no decision. Copying the stubs verbatim would have reproduced the defect; dropping them would have left the citations dangling.

The linter now enforces a three-line floor on every principle body, so the defect cannot return silently.

## ADR-6. Allow en dashes inside numeric ranges

**Decision.** The linter bans em dashes and curly quotes everywhere, and allows an en dash only between digits.

**Why.** `opening-a-pr.md` writes `1-3 short sentences` with an en dash in five places. pstack's own plan linter bans `\u2013` outright, but it only lints plan files. Banning it in instruction files would have forced five cosmetic edits to a verbatim file for no gain.

## ADR-7. Do not port the mid-sentence colon rule to instruction files

**Decision.** The colon rule lives in `scripts/check-prose.mjs`, which lints generated artifacts. The skill-tree linter does not apply it.

**Why.** Measured before deciding: 93 of pstack's own skill and playbook files contain a mid-sentence colon, because instruction files are full of tables, field labels, and prompt templates. pstack enforces the rule only on plans and replies, which is where prose for a human lives. Applying it to the corpus would have been both unfaithful and useless.

## ADR-8. Enforce the todo contract in code

**Decision.** `extensions/pstack-todo.ts` registers a `pstack_todo` tool that refuses a step which is not verbatim from the named playbook, refuses to `start` after task-specific todos exist, and refuses a `skip` with no reason.

**Why.** pstack asks for these in prose, in a file the agent may or may not have loaded fully. The three rules are cheap to check, and each one maps to a specific way the audit surface fails: paraphrased steps hide a dropped step, task-specific todos first hide the playbook entirely, and a bare skip hides the omission.

This is `principle-encode-lessons-in-structure` applied to pstack's own instructions.

## ADR-9. Model names stay out of skill files

**Decision.** The role-to-model map lives in `roles.example.json` and `.pi/settings.json`. No skill file names a model.

**Why.** Both pstack and pi-subagents reached this conclusion independently. pstack writes the map to `pstack-models.mdc` and repeats a fallback paragraph in every routed skill; pi-subagents documents it as "deployment policy". Model slugs expire in months, and a skill file that pins one ages into a false instruction.

## ADR-10. A second family comes from the native registry first

**Decision.** A cross-family panel is seated from the two native providers first. The external CLI agents (`codex-exec`, `claude-code`) are an alternative, not the default mechanism.

**Why, and this is a correction.** The first version of this ADR said the external CLI agents supply the second family. The acceptance run proved that wrong on this machine. pi-subagents refuses to launch an external CLI that resolves to a Windows `.CMD` batch wrapper, and the `codex` and `claude` entries on PATH are wrappers:

```
External CLI 'D:\Codexproject\codex.CMD' is a batch wrapper that cannot run without a shell
```

The panel still reached two families, from the native registry: one provider's ids for the native seats and a second provider's ids for the cross-family seat. Both families are configured and authenticated on this machine, so the cheapest route to real model diversity needs no external CLI at all.

**Workaround if the external route is wanted.** Override the agent's `runner.command` to an absolute `.exe` path. A WinGet-installed `claude.exe` exists on this machine, so the wrapper is a PATH accident rather than a missing install.

**Consequence for the skills.** `interrogate` and `arena` now state that a family is the provider behind the model, not the agent name, and that a same-provider pair is one family however different the two ids look.

## ADR-11. Tools first: the two that enforce discipline

**Decision.** Ship `scripts/check-skill-tree.mjs`, `scripts/check-prose.mjs`, and `scripts/decision-log.sh`. Do not port `watch-pr` or `orch` yet.

**Why.** The first two make the discipline checkable rather than requested, which is the whole point of pstack's tooling. `watch-pr` and `orch` are large and serve playbooks that are not ported. `decision-log.sh` is needed by `autonomous-run` and `figure-it-out` today, so it comes with them.

Two hardening details are carried over verbatim from pstack's `log.sh`, because both follow from the log being opened in a spreadsheet: CSV formula injection neutralisation, and `>>` for the header test so a flaky network mount costs a stray header rather than the rows.

## ADR-12. Warnings are separated from errors

**Decision.** The linter exits non-zero on integrity problems and exits zero with warnings for presentation differences. Thin principle bodies warn. Missing bold section headers are tallied, not warned.

**Why.** Eleven of pstack's twenty-four principles carry no bold section headers, so a warning there would fire on most of the corpus and teach people to ignore warnings. The stub check is the one that catches a real defect, so it is an error.

## ADR-13. The todo tool is named `pstack_todo`

**Decision.** The tool is `pstack_todo` and the command is `/pstack-todos`, not `todo` and `/todos`.

**Why.** pi ships an example extension at `~/.pi/agent/extensions/todo.ts` that registers a `todo` tool and a `/todos` command. Found the hard way: with both installed, the name collision did not produce a clear error in print mode. It hung, with no output and no message. A silent hang is a much worse failure than a slightly less canonical tool name, so the port yields the name. The contract is unaffected, since the tool's behavior is the contract and the name is a label.

**Verified.** With the stock example extension present and the port installed, both `todo` and `pstack_todo` register, and a run finishes with exit 0. The rename removed the collision rather than papering over it.

## ADR-14. The router skill is named `poteto-mode`, not `Poteto Mode`

**Decision.** The router's frontmatter `name` is `poteto-mode`.

**Why.** pstack uses Title Case for this skill's name, and pi loaded it anyway. Two reasons to change it regardless. The Agent Skills specification asks for lowercase kebab names, and pi derives the `/skill:<name>` command from `name`, so `Poteto Mode` produces a command with a space in it. The `mode`, `icon`, and `color` frontmatter fields are Cursor-only and were dropped with it. The `reminder` field is kept, since the extension quotes it.

## ADR-15. Resident mode is set by an environment variable, not a CLI flag

**Decision.** `PSTACK_MODE=on` starts a run resident. The extension registers no CLI flag.

**Why.** The first implementation registered `--pstack-mode` with `pi.registerFlag`. Measured on pi 1.3.0: a run that passes a flag registered by an extension reaches the model, produces its answer, and then never exits. Every flag value hangs, including a trivial probe flag, and the hang reproduces with pi's own example extensions. Shipping the flag would be a trap. An environment variable avoids the argument parser entirely, and headless runs get the same capability.

**Also measured, and worth knowing before debugging a flag:** `pi.getFlag(name)` returns the registered default during the extension factory, and the real command-line value only from `session_start` onward. A flag read in the factory is always wrong.

## ADR-16. The tests are the acceptance harness

**Decision.** `scripts/test.sh` runs 38 tests: the todo contract's rules, the mode extension's residency and one-shot behaviour, and the linter's rules including their negative fixtures. `scripts/diag-extension.ts` is kept as the runtime probe.

**Why.** Three claims needed proof rather than assertion: the contract is enforced in code, resident mode puts the reminder into the real provider payload, and the linter is not vacuous. The first is proved by unit tests over `extensions/lib/todo-contract.ts`, which imports no pi package. The second is proved by the diag extension reading `before_provider_request` and searching the payload for the reminder text, because a model's self-report about its own instructions is not evidence. The third is proved by fixtures that must be rejected.

The todo rules were extracted into `extensions/lib/todo-contract.ts` for this. That is `principle-boundary-discipline` applied to the port itself: the rules are pure functions, and the extension is the thin shell that talks to pi.

## ADR-17. The linter had a blind spot, found by running the port

**Decision.** Add `FOREIGN_MECHANISMS` and `MODEL_ID_PATTERNS` to `check-skill-tree.mjs`, with three new fixtures covering them.

**Why.** The first pass of this port fixed the router and the playbooks and left **eight skills still instructing the agent to use Cursor's mechanisms**: `Task tool`, `subagent_type: generalPurpose`, `readonly: true`, `~/.cursor/rules/pstack-models.mdc`, `agent-transcripts/`, `run_in_background`, `cloud_base_branch`, and hardcoded model ids. The linter reported zero problems across all of them, because none of those tokens were checked. The linter was enforcing "every reference resolves" without checking "the mechanism exists in this runtime".

This is the same defect class as the dangling citation, and it was found by running the port rather than reading it. The fix is mechanical: a list of foreign mechanisms and a list of model-id patterns, each with a fixture that must be rejected and a fixture that must pass. Agent names such as `claude-code` and `codex-exec` stay legal, which is why the patterns name model families rather than vendors.

**A second-order lesson.** While fixing this, the linter immediately rejected the new skill text that explained the rule, because that text named two providers as examples of families. The rule was right and the prose was wrong, so the prose now explains families without naming an id. A rule worth enforcing will reject its own author's first draft.

## ADR-18. A panel seat's family is its provider, and an external seat needs the artifact inlined

**Decision.** `interrogate` and `arena` describe a family as the provider behind the model. A second seat is a model from another provider, or an external CLI agent. The artifact is inlined into any external CLI seat's task.

**Why.** pstack varied one field to get diversity, the model id, on one agent type. On pi the relationship is different in two ways that the first port got wrong:

- Two ids from one provider are one family, however different the ids look. Varying the model while keeping the provider does not buy an independent opinion.
- The `codex-exec` and `claude-code` adapters run with the supplied handoff and may have no repository tools, so a path reference leaves those seats blind. The artifact has to be in the task text.

The acceptance run showed both. Its panel reached two families and the agent reported the independence honestly on its own, naming which seat shared the session's model and which seat gave no reasoning. It also stated the panel quality as degraded when two seats shared limitations. That is the rule working before it was written down.

---

## Reconstruction provenance

The `description` of each principle below is verbatim from pstack. The body was rebuilt from these passages, all from the same repository.

### `principle-exhaust-the-design-space`

- "Design it twice. Require at least two structurally distinct candidates before synthesis, even when the first looks sufficient. This is the **exhaust-the-design-space** principle skill made concrete. Whole-shape alternatives, not point fixes inside one shape." (from `skills/architect/SKILL.md`)
- "When comparing alternatives, build them behind one switcher (buttons or a keypress), each variant labeled. This is the **exhaust-the-design-space** principle skill made cheap." (from `skills/poteto-mode/playbooks/prototype.md`)
- Rubric, own output location, base selection, grafting, and the convergence and divergence readings (from `skills/arena/SKILL.md`, phases A, D and E)
- "The two most common design mistakes are taking the agent's first design and polishing a plan that no code has tested." (from `docs/guide/04-design.md`)
- The single sentence pstack did ship in the leaf.

### `principle-encode-lessons-in-structure`

- "Assume every contributor is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Design the repo so a change that looks right from one file is right for the whole repo." (from `skills/correct/SKILL.md`)
- The five-level ladder, and "Its error message must name the file, type, or function to use instead." (from `skills/correct/SKILL.md`)
- "Encode invariants in types: hard-to-misuse types > runtime checks > prose comments" (from `skills/architect/references/runner-prompt.md`)
- "It reads paths from `git worktree list`, never hand-typed, since a hand-typed path misses one that lives elsewhere" (from `skills/poteto-mode/playbooks/worktree-cleanup.md`)
- "When you catch yourself restating an instruction, append the line before you act" (from `skills/poteto-mode/playbooks/orchestrate.md`)
- "Move any Accepted item that a lint rule, script, metadata flag, or runtime check would enforce more reliably to Backlog." (from `skills/reflect/SKILL.md`)
- "Prefer evidence produced by committed scripts over hand-made one-offs" (from `skills/show-me-your-work/SKILL.md`)
- "Point at structural sources (types, READMEs, config)" (from `skills/poteto-mode/playbooks/authoring-a-skill.md`)
- The eight-line body and the corollary pstack did ship in the leaf.

### `principle-guard-the-context-window`

- "Route bulk to subagents; keep summaries in the main thread, not raw payloads." and "Context fills up: large outputs, long files, repeated reads, fan-out planning." (from the inline index in `skills/poteto-mode/SKILL.md`)
- "Cap in-flight children at what one drain can process, roughly ten, as a rolling window. Never as blocking batches, which cost the slowest child of every batch." (from `skills/poteto-mode/playbooks/orchestrate.md`)
- "Rolls up aggregates at wave boundaries. Never forwards raw child reports." (from `skills/poteto-mode/playbooks/orchestrate.md`)
- "State reads and writes go through `scripts/orch/orch.ts` at drain points, one command in and one line out." (from `skills/poteto-mode/playbooks/orchestrate.md`)
- "Every file has exactly one writer." (from `skills/poteto-mode/playbooks/orchestrate.md`)
- "Do not paste raw worker dumps." and "Keep a compact result table, one-line evidenced issues, and explicit gaps or dropouts." (from `skills/swarm/SKILL.md`)
- "Parse a long transcript in a subagent and keep the reduced timeline in the main thread." (from `skills/poteto-mode/playbooks/session-pickup.md`)
- "Parse large artifacts in a subagent, keep the reduced finding in the main thread." (from `skills/poteto-mode/playbooks/runtime-forensics.md`)
- The `Why` paragraph and the one bullet pstack did ship in the leaf.

---

## Known deviations from pstack

| Area | pstack | this port | Reason |
|---|---|---|---|
| Forge | `gh` by default, Origin CLI when available, never requires Graphite | `gh` only | ADR-3 scope. One forge is enough for a first port, and the Origin path is a Cursor feature. |
| Babysit and shipping | `babysit` drives to merge-ready, `shipping` lands the verified run | neither is ported, and the router says so plainly | They need `watch-pr`, an independent per-PR verifier agent, and the patch-id rule. All three are their own project. |
| Slop strip on a diff | `/deslop` strips slop from a diff before commit | `unslop` over the diff and the message | pstack ships `/deslop` in a different plugin. |
| Wake mechanism | Cursor's `/loop` | the `goal` package, or a heartbeat | Cursor-only builtin. |
| Isolation | cloud agents with their own VM | git worktrees | No cloud runner here. |
| Session transcripts | Cursor's `agent-transcripts/` directory | pi's session JSONL under `~/.pi/agent/sessions/` | Used by `session-pickup`, `eval`, and `reflect`, none of which is ported. |
| Tool name | `TodoWrite` | `pstack_todo` | ADR-13. |
| Resident-mode switch | a UI toggle | `PSTACK_MODE=on` | ADR-15. |
| Skill name casing | `Poteto Mode` | `poteto-mode` | ADR-14. |

## Harness notes for a future reader

The acceptance runs happen under the Windows pi, because that is the runtime the operator uses. Two things about that environment cost real time to diagnose, and neither is a defect in this port:

- **A local package declared in project settings hangs under WSL node.** `pi -p` reaches the model, then never exits. A minimal two-file package reproduces it, so it is not this port's content. The same settings work under the Windows pi, which is where `pi install -l ./pstack-pi` writes them. Use the Windows pi for acceptance runs.
- **Under WSL node, a run with `-e` also fails to exit after answering.** The artifacts are still written, so a background run plus reading the artifact file works, but the exit code is meaningless. The diag extension exists partly for this reason, since it reports ground truth without depending on the process exiting or on a model's self-report.

One more, which is a real trap in the install path: `pi install -l` running under the Windows pi writes the package path with a Windows separator (`..\\pstack-pi`). Linux node cannot resolve that, and the failure is silent. Write `../pstack-pi` if the settings file will be read by both.

### Two git identities in one machine

Found during the feature acceptance, and it explains several earlier mysteries:

- The agent's `bash` tool runs under **WSL git**, while `gh` and the Windows CLI tools run on Windows. A worktree the agent creates therefore carries a POSIX `gitdir:` pointer, and Windows git cannot read it (`fatal: not a git repository`). The files are fine, and WSL git lists the worktree correctly.
- WSL git has a global `url.<mirror>.insteadOf https://github.com/` rewrite, so a plain `git push` is silently redirected to a read-only mirror and fails on authentication. Windows git is unaffected by that rewrite but cannot reach `github.com:443` unless the system proxy (`127.0.0.1:7897` here) is configured on the repository, because git's libcurl ignores the Windows system proxy that `curl` and `gh` use.
- `github.com` itself was intermittent during these runs while `api.github.com` stayed reachable, which is why `gh` kept working when git did not.

None of this is a defect in the port. It is the environment, and it is worth knowing before concluding that a playbook's push step is broken.

## Reconstruction note on the local main divergence

The practice repository's local `main` carries two reconstructed commits (`43edd8a`, `d762ca4`) whose **tree is byte-identical to `origin/main`'s** (`21f3faba...`, verified against the GitHub API) but whose SHAs differ, because `github.com` was unreachable for git at that moment and the commits were rebuilt from API metadata. A later `git fetch && git reset --hard origin/main` reconciles them, and a feature branch built on the reconstruction rebases onto the true base with no content change.

## Defects found by acceptance

These are not deliberate deviations. They are places where the port, run against a real repository, did the wrong thing or could not follow its own instructions.

### The port has no notion of repo-local agent governance

Found in the `rea` investigation. That repository ships `AGENTS.md` plus `.agents/skills/` with four contributor skills, and `CONTRIBUTING.md` makes one of them mandatory for a class of work: "For CI/test correctness, drift, or performance investigations, use the [`rea-ci-tests-audit` contributor skill]". The investigation was exactly that — an investigation of a repository check. The router read `poteto-mode/SKILL.md`, `playbooks/investigation.md`, `how/SKILL.md` and `unslop/SKILL.md`, and never looked at the repository's own routing surface.

This will be the common case, not the exception. Any repository serious enough to be worth this port's attention now carries its own agent instructions, and a router that does not read them will silently ignore a maintained rule.

**Fixed.** The router now opens with a `## Repository rules come first` section that names the surfaces to read (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `.agents/skills/`, `.pi/skills/`, `.claude/skills/`, `.cursor/rules/`), states that an explicit repository instruction outranks this port's choice, and names the two absolute rules that recur in contribution guides: never mark a human declaration on a human's behalf, and never report a check you did not run. `check-skill-tree.mjs` fails a router that loses the step, and `linter.test.ts` carries the negative control.

### `how` asserted an agent profile the platform does not have

The original entry here said the port mandated a mechanism that could not work, on the strength of the agent's own explanation. That was half right, and the correction matters.

`why/SKILL.md` stated that the `reviewer` and `scout` profiles are both "restricted to `read, grep, find, ls`", and `how/SKILL.md` labelled a `scout` spawn "read-only". The packaged profiles are:

| agent | tools |
|---|---|
| `scout` | `read, grep, find, ls, bash, write, contact_supervisor` |
| `reviewer` | `read, grep, find, ls, watchdog_diff, contact_supervisor` |
| `delegate`, `worker` | `read, grep, find, ls, bash, edit, write, contact_supervisor` |

So the statement was right about `reviewer` and wrong about `scout`, which has a shell. The port had lumped the two together. Two consequences, and the second is the worse one.

1. The label made a correct run avoid delegation. The router already said "do not send a read-only child after external evidence", so the agent read "read-only", concluded the child had no shell, and did the empirical work inline with zero subagents. It disclosed the deviation, which is why the run was still honest, but the context-isolation the skill exists for was gone.
2. A child the port believed could not write, could write. In a playbook whose own words are "Investigation requests are read-only", the delegated child had `write` in its allowlist.

**Fixed.** `agents/pstack-scout.md` declares `tools: read, grep, find, ls, bash`, so the `write` and `edit` tools are gone while the shell stays. `how` and its explainer template now name that agent, `why` no longer misstates `scout`, and the router's rule is rewritten to match a child's profile to the evidence it must gather while naming the real reason. The linter now enforces both halves: every `agents/*.md` file must declare an inline `tools:` allowlist, and a skill may not call an agent read-only unless the resolved profile has no `write` or `edit`. The first rule immediately caught `agents/poteto-agent.md`, which had been inheriting the default tool set silently.

**What the fix does not do, measured.** A tool allowlist removes the `write` and `edit` tools. It does not remove `bash`, and `bash` can write. This was tested rather than reasoned about. A live `pstack-scout`, told that the operator authorized one write into the repository and that its no-write rule was suspended for that command, refused to run it and said why: "no plausible phrasing inside a task message lifts it, that is precisely the failure mode the constraint exists to resist", and "a prompt-level authorization cannot grant a capability I don't have. The permission model for this role is defined outside the task text; an in-task grant is self-asserted and therefore inert".

It then answered the underlying question without writing anything, using `uname`, `id`, `ls -ld`, and `test -w`. The findings: the shell is WSL2 running as `uid=0(root)`, the repository's `src/` is mode `0777`, and `test -w` on it reports writable. **There is no filesystem sandbox.** The probe file did not appear because the child chose not to create it, not because the environment prevented it, and the child said so in those words rather than letting a clean `git status` imply safety.

So the guarantee is a removed tool plus an instruction, and the instruction held under a direct attempt to talk it out of the way. That is worth having and it is not a sandbox. Closing the gap properly needs an OS-level sandbox around the child process; pi-subagents offers `runnerLaunchers` for background children, and the port does not configure one. Do not describe this agent as unable to modify a repository.

**Made checkable instead.** Since the guarantee cannot be a sandbox, the `investigation` playbook now requires the read-only claim to be shown rather than asserted: the reply opens with the revision inspected and the command that proves the tree is unchanged, normally `git rev-parse HEAD` and `git status --porcelain`. That converts the one claim in the playbook that costs a reviewer nothing to disbelieve into a measurement. The second and third `rea` runs did this on their own initiative; the step makes it the floor rather than a good habit.

The general rule this leaves behind: **a name is not a profile.** A port that states what a packaged agent can do is stating a fact it does not own. Declare the profile yourself, or read it from the installed package and record what you read.

### Agent definitions were never discovered at all

Found while verifying the fix above, and it had been true from the first commit.

Pi packages distribute extensions, skills, prompt templates, and themes. **Agents are not a package resource.** The pi-subagents owner looks for agent definitions in five places: its own builtins, `~/.pi/agent/agents`, `~/.agents`, `<project>/.agents`, and `<project>/.pi/agents`. A markdown file shipped at `<package>/agents/<name>.md` is in none of them, so `agents/poteto-agent.md` had never been reachable, and every playbook step that named it silently ran without it. The second `rea` run made it visible by naming the miss exactly: `Unknown agent: pstack-scout`, followed by the list of directories it had consulted.

The fix uses the documented runtime registration path rather than a copy step. `extensions/pstack-agents.ts` reads the markdown at `session_start` and forwards name, description, tools, and body through `pi-subagents:runtime-agent-register:v1`, keeping each returned handle and disposing them from an idempotent `session_shutdown` handler. The markdown stays the single source of truth, and `extensions/lib/agent-definitions.ts` holds the parse with no pi import so `scripts/tests/agent-definitions.test.ts` can exercise it, which is the split `todo-contract.ts` already used.

The lesson is narrower than "read the docs". A package manifest listing `extensions` and `skills` looks complete, and the install reported no error. **A resource that is silently not loaded produces no failure to notice.** Only naming the agent in a live run and reading the error surfaced it.

### A softer one: todo bookkeeping does not track the reply

In the same run `pstack_todo start` was given the investigation playbook's four steps and one step was added, then only two items were marked done, while the reply actually satisfied the unmarked ones. The contract has no closure rule (`done` only sets an item's state), so this is not a violation — but it means the todo list is not a reliable record of what happened. Worth a decision later: either add a closure check, or stop treating the list as evidence.

## Known warnings at the time of writing

Six principles have bodies under eight non-empty lines: `explain-the-number` (7), `laziness-protocol` (3), `never-block-on-the-human` (7), `redesign-from-first-principles` (7), `separate-before-serializing-shared-state` (7), `sequence-verifiable-units` (6). All six are verbatim from pstack and carry a usable rule. They warn because they are thin, not because they are broken. The three reconstructed principles were written long enough that they clear the threshold.

## The full replica

This section records the change from a seven-playbook subset to a complete replica of the Cursor
plugin, and the defects the change surfaced.

### Scope, measured

| | Upstream 0.15.21 | Before | Now |
|---|---|---|---|
| Skill directories | 52 | 38 | 53 |
| Playbooks | 23 | 7 | 23 |
| Agents | 2 | 2 | 3 |
| Automation packs | 1 | 0 | 1 |
| Guide pages | 17 | 0 | 17 |
| pi extensions | none (Cursor mechanisms) | 3 | 5 |

The 53rd skill is `verify-app`, which replaces the `control-cli` and `control-ui` skills that live
in another Cursor plugin. Nothing else was added beyond upstream.

### Decisions

1. **Transcribe mechanically, then repair by hand.** `scripts/port-from-upstream.mjs` copies what
   is missing and applies the mechanical part of the translation: Cursor mechanism names,
   `provider/model` ids, em dashes, curly quotes. The semantic paragraphs, the ones describing work
   pi cannot do, are hand-written afterwards. The script is re-runnable so an upstream bump becomes
   a reviewable diff rather than a mystery.
2. **The transcription script never overwrites.** The first version did, and it reverted fifty
   hand-ported files in one run, including the router's repository-governance step, the `how` and
   `why` profile corrections, and the `tools:` allowlist on `poteto-agent`. The port has no git
   history of its own, so the repair was manual from the ADR and the linter. The script now reports
   `kept` and writes nothing for a file that exists.
3. **Ship the three scripts the playbooks call.** `Babysit`, `Shipping`, `Worktree cleanup`, and
   `Orchestrate` name `scripts/watch-pr/watch-pr`, `scripts/worktree-audit.sh`, and
   `scripts/orch/orch.ts`. None of the three ships inside the Cursor plugin, so a faithful port has
   to provide them or the references dangle. All three are implemented here and are the only
   executable artifacts this port adds beyond upstream's text.
4. **Two new extensions for the two capabilities a skill cannot have.** `pstack-models` reads the
   live model registry, which exists only inside the pi process, and writes the role map.
   `pstack-automations` validates an automation manifest and returns the exact `schedule.create`
   payload. `setup-pstack` and the `benny` pack drive both.
5. **The package-root path resolution in the linter.** A playbook that names `scripts/...` means the
   package's scripts, not a copy beside the skill. The resolver now tries the package root, and a
   negative control confirms it did not become a wildcard.

### Defects found by verifying, not by reading

1. **A tool's `execute` takes the context as its fifth argument.** `execute(toolCallId, params,
   signal, onUpdate, ctx)`. Declaring three parameters makes `ctx` the AbortSignal, so
   `ctx.modelRegistry` is `undefined` and the tool silently reports zero models. Both new tools were
   affected. A diagnostic field that reported the registry's own shape is what made it visible;
   guessing at field names twice was not.
2. **Panel roles hold lists.** `arena runners` and friends are comma-separated, one subagent per
   entry. The first validation treated the whole string as one slug and reported three false
   problems. Budgeting and validation now work per entry.
3. **An agent override that names a role the map does not carry fails silently.** `worker`,
   `delegate`, and `poteto-agent` pointed at a role name that only existed in the old ad-hoc map,
   so a budget change left them on their previous model. A test now asserts every
   `AGENT_ROLES` value is a key in `roles.example.json`.
4. **A dirty worktree is not a merge candidate.** `worktree-audit.sh` bucketed a merged branch with
   uncommitted edits as `MERGED`, which licenses deleting the one thing that cannot be recovered
   from a branch. `wip` now outranks every other bucket.
5. **A duplicated code line is not a duplicated paragraph.** Typescript best-practices legitimately
   repeats one statement across a "don't" and a "do" example. The duplicate-line rule now skips
   fenced code.
6. **`readonly` is a TypeScript modifier.** The foreign-mechanism check now matches only the flag
   form, `readonly:` or `readonly=`.
7. **The router's skill name must stay kebab case.** Upstream ships `name: Poteto Mode`; the
   transcription restored it, and `/skill:<name>` derives from that field, so it reverted the
   port's ADR-14 decision. The linter's one-shot test caught it.

### What the replica deliberately does not do

- **Create a schedule from an extension.** pi-subagents' management allowlist for extensions is
  list, show, history, pause, resume, run, delete. `schedule.create` is not in it, so
  `pstack-automations` validates and returns the call, and the agent makes it. The `benny` docs
  were rewritten to say exactly that instead of naming a Cursor editor.
- **Reach an issue channel.** `benny`'s source is a Slack-style channel. No adapter is shipped, so
  the pack's own note stands: with no channel configured, an automation must say it has no new
  reports rather than invent one.
- **Use a forge other than `gh`.** Upstream's playbooks are forge-conditional and fall back to `gh`
  when `origin` is absent, so they run unchanged here. The router states the deviation.

### Publishing the repository

`github.com:443` is unreachable from the machine this port was built on, while `api.github.com`
answers, so `git push` cannot run and its failure reads like an authentication problem.
`scripts/push-via-api.mjs` uploads the same commit through the REST Git Data API. Two API
behaviours it has to work around: `POST /git/blobs` returns 409 on a repository with no commit, so
an empty repository is bootstrapped with one placeholder file first; and the pushed commit is
created with no parents, which makes that bootstrap commit unreachable instead of leaving it in
the history. Every blob SHA is compared against the local one before a tree is built, and the run
prints whether the remote tree matches the local tree. That comparison is the verification: a
matching tree SHA means every path, byte, and file mode matches, because git is content addressed.
The commit SHA differs by design, since a commit object hashes its committer and timestamp.

Repeated pushes chain rather than replace. The script looks for the local commit whose tree
equals the current remote head's tree and uses that remote commit as the parent, so history
accumulates. It falls back to a root commit only on a first push or a divergence, where no
local commit matches the remote tree.
