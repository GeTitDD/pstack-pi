/**
 * Tests for the todo contract's pure rules.
 *
 * These are the checks that back the claim "the contract is enforced in code". They run with
 * `node --test` and need no pi runtime, because `lib/todo-contract.ts` imports no pi package.
 *
 * Run from the package root:  node --test scripts/tests/
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, emptyContract, playbookSteps, render, type Contract } from "../../extensions/lib/todo-contract.ts";

const PLAYBOOK = `### Bug fix

**You own this task. Plan, review, verify.** Delegate and stay in the lead.

1. Reproduce it yourself on the matching surface.
2. Binary-search the cause.
   Keep the census.
3. Plan the fix.
4. Verify on the same surface.
5. Stage the commits so the failing repro lands first.
6. Run **Opening a PR**.

**Reply:** what was broken, root cause, fix, how you verified.
`;

function seeded(): Contract {
	const started = apply(emptyContract(), {
		action: "start",
		playbook: "bug-fix",
		steps: playbookSteps(PLAYBOOK),
		markdown: PLAYBOOK,
	});
	assert.equal(started.error, undefined, "seeding must succeed");
	return started;
}

test("playbookSteps reads the numbered steps and stops at Reply", () => {
	const steps = playbookSteps(PLAYBOOK);
	assert.equal(steps.length, 6);
	assert.match(steps[0], /^Reproduce it yourself/);
	assert.match(steps[1], /Binary-search the cause\. Keep the census\./, "a wrapped step joins its continuation lines");
	assert.match(steps[5], /^Run \*\*Opening a PR\*\*\./);
	assert.ok(
		!steps.some((step) => step.includes("what was broken")),
		"the Reply line must not be read as a step",
	);
});

test("start refuses a step that is not verbatim from the playbook", () => {
	const steps = playbookSteps(PLAYBOOK);
	steps[0] = "Reproduce the bug first";
	const result = apply(emptyContract(), { action: "start", playbook: "bug-fix", steps, markdown: PLAYBOOK });
	assert.ok(result.error, "a paraphrase must be refused");
	assert.match(result.error, /not verbatim from bug-fix\.md/);
	assert.equal(result.items.length, 0, "a refused start leaves no items");
});

test("start accepts the playbook's own steps, in any order of text", () => {
	const result = seeded();
	assert.equal(result.items.length, 6);
	assert.equal(result.playbook, "bug-fix");
	assert.deepEqual(
		result.items.map((item) => item.state),
		["todo", "todo", "todo", "todo", "todo", "todo"],
	);
});

test("start needs a playbook name", () => {
	const result = apply(emptyContract(), { action: "start", steps: ["anything"] });
	assert.match(result.error ?? "", /needs a playbook name/);
});

test("start refuses an unknown playbook", () => {
	const result = apply(emptyContract(), { action: "start", playbook: "nope", steps: ["x"], markdown: null });
	assert.match(result.error ?? "", /No playbook named nope/);
});

test("start refuses to run after a task-specific todo exists", () => {
	const afterAdd = apply(seeded(), { action: "add", text: "something task specific" });
	assert.ok(afterAdd.items.length > 1);
	const result = apply(afterAdd, {
		action: "start",
		playbook: "bug-fix",
		steps: playbookSteps(PLAYBOOK),
		markdown: PLAYBOOK,
	});
	assert.match(result.error ?? "", /must come before any task-specific todo/);
});

test("add refuses to run before the playbook's steps are seeded", () => {
	const result = apply(emptyContract(), { action: "add", text: "do the thing" });
	assert.match(result.error ?? "", /Seed the playbook's steps with `start`/);
});

test("skip refuses a missing reason", () => {
	const result = apply(seeded(), { action: "skip", id: 2 });
	assert.match(result.error ?? "", /`skip` needs a reason/);
	const item = result.items.find((candidate) => candidate.id === 2);
	assert.equal(item?.state, "todo", "a refused skip leaves the step pending");
});

test("skip refuses a blank reason", () => {
	const result = apply(seeded(), { action: "skip", id: 2, reason: "   " });
	assert.match(result.error ?? "", /`skip` needs a reason/);
});

test("skip records the reason and keeps the step in the list", () => {
	const result = apply(seeded(), { action: "skip", id: 2, reason: "no runtime access to that surface" });
	assert.equal(result.error, undefined);
	const item = result.items.find((candidate) => candidate.id === 2);
	assert.equal(item?.state, "skipped");
	assert.equal(item?.reason, "no runtime access to that surface");
	assert.match(render(result), /skip: no runtime access to that surface/);
	assert.equal(result.items.length, 6, "a skipped step stays in the list");
});

test("doing and done move one item at a time", () => {
	const doing = apply(seeded(), { action: "doing", id: 1 });
	assert.equal(doing.items[0].state, "doing");
	const done = apply(doing, { action: "done", id: 1 });
	assert.equal(done.items[0].state, "done");
	assert.equal(done.items[1].state, "todo", "other items are untouched");
});

test("an unknown id is refused, and the list survives", () => {
	const result = apply(seeded(), { action: "done", id: 99 });
	assert.match(result.error ?? "", /No item 99/);
	assert.equal(result.items.length, 6);
});

test("clear removes the list and the playbook", () => {
	const result = apply(seeded(), { action: "clear" });
	assert.equal(result.items.length, 0);
	assert.equal(result.playbook, null);
});

test("apply never mutates its input", () => {
	const before = seeded();
	const snapshot = JSON.stringify(before);
	apply(before, { action: "add", text: "extra" });
	apply(before, { action: "skip", id: 1, reason: "because" });
	assert.equal(JSON.stringify(before), snapshot);
});
