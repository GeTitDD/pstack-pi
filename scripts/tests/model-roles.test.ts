/**
 * Tests for the role-to-model rules.
 *
 * The negative cases carry the weight: a map that writes a model id this session cannot reach
 * is worse than no map, because every skill silently runs on a wrong model instead of failing.
 *
 * Run from the package root:  node scripts/tests/model-roles.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	AGENT_ROLES,
	applyBudget,
	BUDGET_LEVEL,
	resolveRoles,
	splitSlug,
	validateRoles,
	withBudget,
} from "../../extensions/lib/model-roles.ts";

test("a slug splits into base and level only when the tail is a level", () => {
	assert.deepEqual(splitSlug("deepseek/deepseek-flash:xhigh"), { base: "deepseek/deepseek-flash", level: "xhigh" });
	assert.deepEqual(splitSlug("deepseek/deepseek-flash"), { base: "deepseek/deepseek-flash", level: undefined });
	// A colon that is not a level belongs to the id.
	assert.deepEqual(splitSlug("ollama/llama3:8b"), { base: "ollama/llama3:8b", level: undefined });
});

test("a budget replaces the level instead of stacking it", () => {
	assert.equal(withBudget("p/m:high", "unlimited"), "p/m:max");
	assert.equal(withBudget("p/m:high", "large"), "p/m:xhigh");
	assert.equal(withBudget("p/m", "small"), "p/m:medium");
	// Reapplying is idempotent, which is what makes the write safe to re-run.
	assert.equal(withBudget(withBudget("p/m", "medium"), "medium"), "p/m:high");
});

test("aliases never take a level", () => {
	for (const alias of ["auto", "inherit-parent"]) {
		assert.equal(withBudget(alias, "unlimited"), alias);
	}
});

test("every budget maps to a distinct level", () => {
	const levels = Object.values(BUDGET_LEVEL);
	assert.equal(new Set(levels).size, levels.length);
});

test("a level already chosen by an operator survives a budget change", () => {
	const base = { "how explorer": "p/fast" };
	const next = resolveRoles(base, "unlimited", { "how explorer": "p/strong:low" });
	assert.equal(next["how explorer"], "p/strong:low");
});

test("an override without a level still follows the budget", () => {
	const next = resolveRoles({ "how explorer": "p/fast" }, "small", { "how explorer": "p/strong" });
	assert.equal(next["how explorer"], "p/strong:medium");
});

test("validation accepts available models and aliases", () => {
	const available = new Set(["deepseek/deepseek-flash", "zai-coding-cn/glm-5.3"]);
	const result = validateRoles({ a: "deepseek/deepseek-flash:xhigh", b: "auto", c: "zai-coding-cn/glm-5.3" }, available);
	assert.equal(result.ok, true, result.problems.join("; "));
});

test("validation rejects a model this session cannot reach", () => {
	const available = new Set(["deepseek/deepseek-flash"]);
	const result = validateRoles({ "how explainer": "zai-coding-cn/glm-5.3" }, available);
	assert.equal(result.ok, false);
	assert.match(result.problems[0], /not an available model/);
});

test("validation rejects a bare name that is neither alias nor provider/model", () => {
	const result = validateRoles({ a: "deepseek-flash" }, new Set());
	assert.equal(result.ok, false);
	assert.match(result.problems[0], /not provider\/model/);
});

test("validation reports an unknown role rather than dropping it", () => {
	const result = validateRoles({ "how critics": "p/m" }, new Set(["p/m"]), new Set(["how explorer"]));
	assert.equal(result.ok, false);
	assert.match(result.problems[0], /unknown role: how critics/);
});

test("a list-valued panel role is budgeted entry by entry", () => {
	assert.equal(withBudget("p/a, p/b", "unlimited"), "p/a:max, p/b:max");
	assert.equal(withBudget("p/a:xhigh, auto", "small"), "p/a:medium, auto");
});

test("a list-valued role validates each entry and reports the bad one by name", () => {
	const available = new Set(["p/a", "p/b"]);
	assert.equal(validateRoles({ "arena runners": "p/a, p/b" }, available).ok, true);
	const bad = validateRoles({ "arena runners": "p/a, p/nope" }, available);
	assert.equal(bad.ok, false);
	assert.match(bad.problems[0], /p\/nope is not an available model/);
});

test("budgeting leaves the role names alone", () => {
	const roles = { "how explorer": "p/a", "hardest tasks": "p/b", "arena runners": "p/c, p/d" };
	const next = applyBudget(roles, "large");
	assert.deepEqual(Object.keys(next), Object.keys(roles));
	assert.equal(next["arena runners"], "p/c:xhigh, p/d:xhigh");
});

// A mapping to a role the shipped map does not carry silently leaves that agent on its old
// model, which is exactly the failure the derivation exists to prevent.
test("every agent override names a role that roles.example.json actually carries", async () => {
	const fs = await import("node:fs");
	const path = await import("node:path");
	const { fileURLToPath } = await import("node:url");
	const here = path.dirname(fileURLToPath(import.meta.url));
	const example = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "roles.example.json"), "utf8"));
	const roles = new Set(Object.keys(example.pstack ?? {}).filter((role: string) => !role.startsWith("//")));
	assert.ok(roles.size > 0, "roles.example.json carries no roles");
	for (const [agent, role] of Object.entries(AGENT_ROLES)) {
		assert.ok(roles.has(role), `${agent} -> "${role}" is not a role in roles.example.json`);
	}
});
