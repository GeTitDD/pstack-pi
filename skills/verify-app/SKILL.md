---
name: verify-app
description: "Use to prove a change works by driving the real artifact instead of reading code or trusting a self-report. Covers the boot recipe, input delivery, diagnostics, evidence artifact, and pass predicate for a CLI, an HTTP surface, a browser UI, or a scripted assertion. Use when a playbook says to verify on the matching surface."
disable-model-invocation: true
---

# Verify app

The job is to make a change's behavior **observable on the surface a user touches**, and to leave an artifact a reviewer can check without redoing the work.

This skill exists because pstack's live lane depends on a project-specific control skill (the `control-cli` skill for CLIs and TUIs, the `control-ui` skill for browser and Electron, both of which are not ported). Where a project ships its own driver, use that and let it own the recipe. Otherwise this skill is the driver.

## Non-negotiables

- **The real surface is the floor.** Unit tests show branch behavior, not the absence of the bug. "Inconclusive" and "wrong surface" are not passes. Flag them.
- **Suspect the observation method before the system** when a check passes too easily.
- **A self-report is not evidence.** Read the value, the file, the response body, or the screenshot.
- **Leave a rerunnable command and its output.** A one-time eyeball is not an artifact.
- **Say which surface you drove.** If the change touches two surfaces, drive both.

## Step 1. Name the surface and the scenario

State the surface (CLI command, HTTP endpoint, browser flow, library call, background job) and the one user-visible scenario that would fail if the change were wrong. One scenario per lane.

If the repo has a `verify-*` skill, read it and follow it. It already knows the boot recipe and the fences.

## Step 2. Pick the adapter

| Surface | Adapter | Evidence artifact |
|---|---|---|
| CLI, TUI, background job | [`references/adapters/cli.md`](references/adapters/cli.md) | captured stdout and stderr with the exit code |
| HTTP API, webhook, RPC | [`references/adapters/http.md`](references/adapters/http.md) | the response body and status |
| Browser or Electron UI | [`references/adapters/browser.md`](references/adapters/browser.md) | screenshots and a scripted interaction log |
| Library, data pipeline, no running surface | [`references/adapters/script.md`](references/adapters/script.md) | the script and its printed assertion result |

## Step 3. Write the boot recipe

If the reply you are writing is hard to follow, restate it in plain words instead of shipping jargon. The `bro` skill (not ported) was pstack's tool for that, and a plain restatement costs one paragraph.

Every adapter needs the same four things, in this order, before any assertion:

1. **Boot.** The exact commands to get the surface running, and how to know it is ready. Never sleep and hope.
2. **Input.** How one scenario is delivered. Deliver input only through the driver, not by reaching into the process.
3. **Diagnostics.** Which read-only signals to inspect when it fails (logs, exit codes, status endpoints). Name them up front so a failure does not become a guess.
4. **Evidence.** Where the artifact lands, with a path per lane.

## Step 4. Run it twice

Run the scenario against **the baseline first**, then against the change. A change that "works" with no baseline cannot be told apart from a scenario that never exercised anything.

For a bug fix the baseline is the original reproduction, which must fail before the change and pass after. Paste both outputs verbatim into the reply.

## Step 5. Reduce and report

Reduction is mandatory. The parent thread gets the pass predicate and its result, the artifact path, and one line on what the evidence shows. Raw logs, traces, and full page dumps stay in the artifact, and a child summarizes them.

Per lane, report:

- surface and scenario, one line
- the exact command
- the artifact path
- pass or fail against a stated predicate
- if fail, the smallest reproduction you found

## Step 6. Record the negative

An environment that cannot be booted is a real finding, not a skip. Record what you tried, what it said, and mark the lane `BLOCKED` rather than dropping it. A dropped lane is indistinguishable from a passing one at report time.

## Fences

- Do not modify the harness to make a check pass. If the baseline looks wrong, stop and ask.
- Do not re-run only the part that failed and call it a pass.
- Do not assert on a value the code under test produced. Assert on a literal.
- Do not leave a booted server, simulator, or background process behind. Stop it in the same run.
