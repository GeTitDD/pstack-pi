/**
 * Tests for reading agent definitions.
 *
 * The negative cases are the point. The parse is what stands between a markdown file and a
 * registered child, so each refusal needs a fixture that must be rejected.
 *
 * Run from the package root:  node scripts/tests/agent-definitions.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAgentDefinition } from "../../extensions/lib/agent-definitions.ts";

const FULL = `---
name: pstack-scout
description: A write-less scout.
tools: read, grep, find, ls, bash
---

Scout body.
`;

test("a complete definition parses with its tools and body", () => {
	const parsed = parseAgentDefinition(FULL, "fallback");
	assert.equal(parsed.ok, true);
	if (!parsed.ok) return;
	assert.equal(parsed.agent.name, "pstack-scout");
	assert.equal(parsed.agent.description, "A write-less scout.");
	assert.deepEqual(parsed.agent.tools, ["read", "grep", "find", "ls", "bash"]);
	assert.equal(parsed.agent.systemPrompt, "Scout body.");
});

test("a missing name falls back to the file name", () => {
	const parsed = parseAgentDefinition(`---\ndescription: A scout.\ntools: read\n---\n\nBody.\n`, "pstack-scout");
	assert.equal(parsed.ok, true);
	if (!parsed.ok) return;
	assert.equal(parsed.agent.name, "pstack-scout");
});

test("a definition with no tools allowlist is refused", () => {
	const parsed = parseAgentDefinition(`---\nname: loose\ndescription: No profile.\n---\n\nBody.\n`, "loose");
	assert.equal(parsed.ok, false);
	if (parsed.ok) return;
	assert.match(parsed.error, /inline tools allowlist is required/);
});

test("a definition with no description is refused", () => {
	const parsed = parseAgentDefinition(`---\nname: quiet\ntools: read\n---\n\nBody.\n`, "quiet");
	assert.equal(parsed.ok, false);
	if (parsed.ok) return;
	assert.match(parsed.error, /description is required/);
});

test("a definition with no body is refused", () => {
	const parsed = parseAgentDefinition(`---\nname: empty\ndescription: Nothing to say.\ntools: read\n---\n`, "empty");
	assert.equal(parsed.ok, false);
	if (parsed.ok) return;
	assert.match(parsed.error, /body is required/);
});

test("a file with no frontmatter is refused", () => {
	const parsed = parseAgentDefinition(`Just a body.\n`, "bare");
	assert.equal(parsed.ok, false);
	if (parsed.ok) return;
	assert.match(parsed.error, /frontmatter must open the file/);
});

// The real definitions are the ones that ship, so a change to the parse that breaks them fails
// here rather than at the first spawn.
test("every agent this port ships parses", async () => {
	const fs = await import("node:fs");
	const path = await import("node:path");
	const { fileURLToPath } = await import("node:url");
	const here = path.dirname(fileURLToPath(import.meta.url));
	const agentsDir = path.join(here, "..", "..", "agents");
	const files = fs.readdirSync(agentsDir).filter((name: string) => name.endsWith(".md"));
	assert.ok(files.length >= 2, `expected at least two agent definitions, found ${files.length}`);

	for (const file of files) {
		const parsed = parseAgentDefinition(
			fs.readFileSync(path.join(agentsDir, file), "utf8"),
			path.basename(file, ".md"),
		);
		assert.equal(parsed.ok, true, `${file}: ${parsed.ok ? "" : parsed.error}`);
	}

	const scout = parseAgentDefinition(
		fs.readFileSync(path.join(agentsDir, "pstack-scout.md"), "utf8"),
		"pstack-scout",
	);
	assert.equal(scout.ok, true);
	if (!scout.ok) return;
	// The whole point of this agent. A write tool here would put write access back into a
	// playbook whose own words are "Investigation requests are read-only".
	assert.deepEqual([...scout.agent.tools].filter((tool) => tool === "write" || tool === "edit"), []);
	assert.ok(scout.agent.tools.includes("bash"), "pstack-scout must keep bash, or it cannot measure anything");
});
