# pstack-pi

if you want to go fast, go deep first. pstack ported to pi.

This is a port of [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan, MIT licensed. It keeps the parts that are pure workflow and replaces the parts that were Cursor-only. Every deviation is recorded in [docs/ADR.md](docs/ADR.md).

## install

From the repository:

```bash
pi install git:github.com/GeTitDD/pstack-pi@main
```

Or from a local checkout with `pi install -l ./pstack-pi`.

Then run `setup-pstack` (or call the `pstack_models` tool with `action: "apply"`). It enumerates the models this machine can actually reach and writes the role map, refusing any id that does not resolve. `roles.example.json` is an example from one machine, not a recommendation.

If you would rather edit settings by hand, take the `subagents` block from `roles.example.json` into your settings, at user scope (`~/.pi/agent/settings.json`) or project scope (`.pi/settings.json`). That file also carries the `pstack` role map the ported skills read, keyed by pstack's own role names. No model id appears in any skill file, because ids are deployment policy.

For a review or design panel, seat two different providers. Two ids from one provider are one family; the file explains which providers are configured on this machine.

Pi reads project package declarations only after project trust is granted, so pass `-a` for a headless project-scoped run.

The port needs Node 22.19 or newer, which runs the `.ts` test files directly through type stripping.

### pushing when github.com:443 is blocked

`git push` needs `github.com:443`, and on some networks only `api.github.com` answers. The failure reads like an authentication error and is not one. `scripts/push-via-api.mjs` uploads the same commit over the REST Git Data API instead, comparing every blob SHA and printing whether the remote tree matches the local one.

```bash
git add -A && git commit -m "..."
node scripts/push-via-api.mjs GeTitDD/pstack-pi main
```

It needs an authenticated `gh`. The pushed commit SHA differs from the local one because a commit object hashes its committer and timestamp; the tree SHA is the content identity and has to match.

## use it

```
/poteto-mode the export writes duplicate rows when a retry lands mid-run. repro first, then fix and verify.
```

That attaches the router to one message. To keep it resident for the session:

```
/poteto-mode on
```

`/poteto-mode off` turns it off, and `/poteto-mode status` reports the current state. A headless run starts resident with the environment variable instead:

```bash
PSTACK_MODE=on pi -p "fix the duplicate row bug, repro first"
```

The router is `disable-model-invocation`, so the model never reaches for it on its own. That is deliberate, and it is what keeps the rest of the discipline enforceable.

Inside a run, the `pstack_todo` tool carries the playbook contract. Seed it from the matched playbook:

```
pstack_todo { action: "start", playbook: "bug-fix", steps: [...] }
```

The tool refuses a step that is not verbatim from the playbook, refuses to start after task-specific todos exist, and refuses a `skip` with no reason. `/pstack-todos` prints the list.

## what ships

**Router.** `poteto-mode`, with the 24 principles indexed inline and all 23 playbooks reachable.

**Playbooks.** `investigation`, `bug-fix`, `feature`, `refactoring`, `autonomous-run`, `pause-safely`, `opening-a-pr`.

**Skills.** `how`, `why`, `architect`, `arena`, `swarm`, `interrogate`, `unslop`, `no-comments`, `technical-writing`, `show-me-your-work`, `tdd`, `figure-it-out`, plus `verify-app`, which replaces pstack's `control-cli` and `control-ui`.

**Agents.** `poteto-agent`, the delegate every playbook step spawns.

**Extensions.** `pstack-mode` (the resident reminder) and `pstack-todo` (the todo contract, whose rules live in `extensions/lib/todo-contract.ts`).

**Scripts.**

```bash
bash scripts/test.sh                       # every test, the linter, and two negative controls
node scripts/check-skill-tree.mjs          # integrity and prose rules for the skill tree
node scripts/check-prose.mjs <artifact>    # prose rules for a plan, reply, or PR body
bash scripts/decision-log.sh <logfile> <phase> <decision> <why> <evidence> <result>
```

`check-skill-tree.mjs` exits non-zero on a dangling reference, an unported skill named without a marker, a missing owner sentence or reply contract, a non-contiguous step list, a stub principle body, an em dash, or a curly quote. Run it after editing anything under `skills/`.

## what does not ship

Perf, hillclimb, forensics, prototype, visual parity, eval, babysit, shipping, ship orchestration, autopilot, session pickup, multi-phase plans, worktree cleanup, and the skill-authoring playbook. The router lists each one under Not ported here, so a request that would route there gets an honest answer instead of an improvised run.

Also absent, because they belong to other Cursor plugins or to Cursor itself: `/deslop`, `create-skill`, `control-cli`, `control-ui`, and the built-in `/babysit`.

## verify the port

```bash
bash scripts/test.sh
```

Expect 75 passing tests, `0 problems` from the skill-tree linter, and two negative controls that confirm the prose linter and the decision log still refuse bad input.

Every rule in the linter has a fixture that must be rejected, because a linter nobody has seen fail is indistinguishable from a linter that checks nothing.

## license

MIT, matching pstack. The playbooks, principles, and skills are Lauren Tan's work, copied or adapted with the provenance for the three reconstructed principles recorded in [docs/ADR.md](docs/ADR.md).
