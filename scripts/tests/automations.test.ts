/**
 * Tests for automation-pack validation.
 *
 * The pack is armed by a schedule, so a manifest that names a missing skill would arm something
 * that fails on every fire, hours later, with nobody watching. These cases keep that failure at
 * validation time.
 *
 * Run from the package root:  node scripts/tests/automations.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { describe, schedulePayload, validateManifest } from "../../extensions/lib/automations.ts";

const exists = (present: string[]) => (relative: string) => present.includes(relative);
const packDir = "automations/demo";
const manifest = {
	pack: "demo",
	automations: [
		{
			name: "triage",
			workflow: "workflows/triage.js",
			skill: "skills/triage/SKILL.md",
			every: "15m",
			args: { config: "<path>" },
		},
	],
};
const full = exists([`${packDir}/workflows/triage.js`, `${packDir}/skills/triage/SKILL.md`]);

test("a complete manifest validates", () => {
	assert.deepEqual(validateManifest(manifest as never, packDir, full), []);
});

test("a missing workflow fails, because a schedule needs a script", () => {
	const problems = validateManifest(manifest as never, packDir, exists([]));
	assert.ok(problems.some((problem) => /workflow does not exist/.test(problem.problem)), JSON.stringify(problems));
});

test("a missing skill fails, because the run would have no instructions", () => {
	const problems = validateManifest(manifest as never, packDir, exists([`${packDir}/workflows/triage.js`]));
	assert.ok(problems.some((problem) => /skill does not exist/.test(problem.problem)), JSON.stringify(problems));
});

test("an unsupported interval fails", () => {
	const bad = { ...manifest, automations: [{ ...manifest.automations[0], every: "every so often" }] };
	const problems = validateManifest(bad as never, packDir, full);
	assert.ok(problems.some((problem) => /unsupported interval/.test(problem.problem)), JSON.stringify(problems));
});

test("a duplicate automation name fails", () => {
	const bad = { ...manifest, automations: [manifest.automations[0], manifest.automations[0]] };
	const problems = validateManifest(bad as never, packDir, full);
	assert.ok(problems.some((problem) => /duplicate automation name/.test(problem.problem)), JSON.stringify(problems));
});

test("an empty manifest fails rather than reporting nothing to do", () => {
	const problems = validateManifest({ pack: "demo", automations: [] } as never, packDir, full);
	assert.ok(problems.some((problem) => /at least one automation/.test(problem.problem)));
});

test("the arm payload is a schedule.create call naming the workflow and interval", () => {
	const payload = schedulePayload(
		{ pack: "demo", dir: packDir, manifest: manifest as never },
		manifest.automations[0] as never,
	);
	assert.equal(payload.action, "schedule.create");
	assert.equal(payload.workflow, `${packDir}/workflows/triage.js`);
	assert.equal(payload.options.every, "15m");
	assert.deepEqual(payload.args, { config: "<path>" });
});

test("describe names the pack, the schedule, and the skill", () => {
	const lines = describe({ pack: "demo", dir: packDir, manifest: manifest as never });
	assert.equal(lines.length, 1);
	assert.match(lines[0], /^demo\/triage: every 15m, skills\/triage\/SKILL\.md$/);
});
