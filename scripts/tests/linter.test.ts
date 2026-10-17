/**
 * Tests for the skill-tree linter.
 *
 * The point of these tests is the negative case. A linter nobody has seen fail is
 * indistinguishable from a linter that checks nothing, so each rule gets a fixture that must
 * be rejected, plus one clean fixture that must pass.
 *
 * Run from the package root:  node scripts/tests/linter.test.ts
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const LINTER = path.join(HERE, "..", "check-skill-tree.mjs");

function fixture(files: Record<string, string>): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pstack-lint-"));
	for (const [rel, body] of Object.entries(files)) {
		// An `agents/` key lands beside the skills tree, because agent profiles are the port's own
		// files rather than skills, and the linter reads them from `<portRoot>/agents`.
		const full = rel.startsWith("agents/") ? path.join(root, rel) : path.join(root, "skills", rel);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, body);
	}
	return path.join(root, "skills");
}

function lint(root: string): { code: number; output: string } {
	try {
		const output = execFileSync(process.execPath, [LINTER, root], { encoding: "utf8", stdio: "pipe" });
		return { code: 0, output };
	} catch (error) {
		const failure = error as { status?: number; stdout?: string; stderr?: string };
		return { code: failure.status ?? 1, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
	}
}

const PRINCIPLE = `---
name: principle-demo
description: "Apply when testing the linter. A rule with a test."
disable-model-invocation: true
---

# Demo

Do the thing.

- A bullet.
- Another bullet.

**The test:** if this file passes, the fixture works.
`;

const PLAYBOOK = `### Demo playbook

**You own the demo.** Keep it small.

1. First step.
2. Second step.

**Reply:** the demo result.
`;

test("a clean tree passes", () => {
	const root = fixture({
		"principle-demo/SKILL.md": PRINCIPLE,
		"poteto-mode/playbooks/bug-fix.md": PLAYBOOK,
	});
	const result = lint(root);
	assert.equal(result.code, 0, result.output);
	assert.match(result.output, /ok\s+\d+ files, 0 problems/);
});

test("a dangling principle citation fails", () => {
	const root = fixture({
		"principle-demo/SKILL.md": PRINCIPLE,
		"poteto-mode/playbooks/bug-fix.md": `${PLAYBOOK}\nApply **principle-does-not-exist** here.\n`,
	});
	const result = lint(root);
	assert.equal(result.code, 1);
	assert.match(result.output, /cites a principle that does not exist: principle-does-not-exist/);
});

test("a dangling playbook path fails", () => {
	const root = fixture({
		"principle-demo/SKILL.md": PRINCIPLE,
		"poteto-mode/playbooks/bug-fix.md": `${PLAYBOOK}\nSee \`playbooks/nope.md\` for the rest.\n`,
	});
	const result = lint(root);
	assert.equal(result.code, 1);
	assert.match(result.output, /referenced path does not resolve: playbooks\/nope\.md/);
});

test("an unported skill mention without a marker fails", () => {
	const root = fixture({
		"principle-demo/SKILL.md": PRINCIPLE,
		"poteto-mode/playbooks/bug-fix.md": `${PLAYBOOK}\nThen run the deslop step.\n`,
	});
	const result = lint(root);
	assert.equal(result.code, 1);
	assert.match(result.output, /mentions unported "deslop" without a "not ported" marker/);
});

test("the same mention passes once marked", () => {
	const root = fixture({
		"principle-demo/SKILL.md": PRINCIPLE,
		"poteto-mode/playbooks/bug-fix.md": `${PLAYBOOK}\nThen run the deslop step, which is not ported.\n`,
	});
	const result = lint(root);
	assert.equal(result.code, 0, result.output);
});

test("an em dash fails", () => {
	const root = fixture({
		"principle-demo/SKILL.md": PRINCIPLE,
		"poteto-mode/playbooks/bug-fix.md": `${PLAYBOOK}\nA clause \u2014 with an em dash.\n`,
	});
	const result = lint(root);
	assert.equal(result.code, 1);
	assert.match(result.output, /em dash/);
});

test("an en dash inside a numeric range passes", () => {
	const root = fixture({
		"principle-demo/SKILL.md": PRINCIPLE,
		"poteto-mode/playbooks/bug-fix.md": `${PLAYBOOK}\nWrite 1\u20133 sentences.\n`,
	});
	const result = lint(root);
	assert.equal(result.code, 0, result.output);
});

test("an en dash outside a range fails", () => {
	const root = fixture({
		"principle-demo/SKILL.md": PRINCIPLE,
		"poteto-mode/playbooks/bug-fix.md": `${PLAYBOOK}\nA clause \u2013 with an en dash.\n`,
	});
	const result = lint(root);
	assert.equal(result.code, 1);
	assert.match(result.output, /en dash outside a numeric range/);
});

test("a playbook with no owner sentence fails, and passes with a declaration", () => {
	const bare = `### Bare\n\n1. Only a step.\n\n**Reply:** nothing.\n`;
	const rejected = lint(fixture({ "principle-demo/SKILL.md": PRINCIPLE, "poteto-mode/playbooks/bug-fix.md": bare }));
	assert.equal(rejected.code, 1);
	assert.match(rejected.output, /no owner sentence/);

	const declared = `### Bare\n\n<!-- owner: none, reason: it is a hook, not a routed task. -->\n\n1. Only a step.\n\n**Reply:** nothing.\n`;
	const accepted = lint(
		fixture({ "principle-demo/SKILL.md": PRINCIPLE, "poteto-mode/playbooks/bug-fix.md": declared }),
	);
	assert.equal(accepted.code, 0, accepted.output);
});

test("non-contiguous steps fail", () => {
	const root = fixture({
		"principle-demo/SKILL.md": PRINCIPLE,
		"poteto-mode/playbooks/bug-fix.md": `### Demo\n\n**You own it.**\n\n1. One.\n3. Three.\n\n**Reply:** x.\n`,
	});
	const result = lint(root);
	assert.equal(result.code, 1);
	assert.match(result.output, /step 3 follows 1/);
});

test("a stub principle body fails", () => {
	const stub = `---\nname: principle-demo\ndescription: "Apply when testing. A stub."\ndisable-model-invocation: true\n---\n\n# Demo\n\nOne line only.\n`;
	const result = lint(fixture({ "principle-demo/SKILL.md": stub, "poteto-mode/playbooks/bug-fix.md": PLAYBOOK }));
	assert.equal(result.code, 1);
	assert.match(result.output, /Under 3 is a stub/);
});

test("a principle name that disagrees with its directory fails", () => {
	const mismatched = PRINCIPLE.replace("name: principle-demo", "name: principle-other");
	const result = lint(
		fixture({ "principle-demo/SKILL.md": mismatched, "poteto-mode/playbooks/bug-fix.md": PLAYBOOK }),
	);
	assert.equal(result.code, 1);
	assert.match(result.output, /does not match directory/);
});

// This class was a real blind spot. The first pass of the port shipped eight skills that still
// told the agent to call Cursor's Task tool, and the linter reported zero problems because none
// of these tokens were checked. The acceptance run surfaced it; these fixtures keep it surfaced.
test("a Cursor mechanism with no pi equivalent fails", () => {
	const root = fixture({
		"principle-demo/SKILL.md": PRINCIPLE,
		"poteto-mode/playbooks/bug-fix.md": `${PLAYBOOK}\nSpawn a Task subagent with \`subagent_type: generalPurpose\` and \`readonly: true\`, reading the \`pstack-models.mdc\` rule.\n`,
	});
	const result = lint(root);
	assert.equal(result.code, 1);
	for (const token of ["subagent_type", "generalPurpose", "readonly", "Task subagent", "pstack-models", ".mdc"]) {
		assert.match(result.output, new RegExp(`names the Cursor mechanism "${token.replace(/\./g, "\\.")}"`));
	}
});

test("a Cursor mechanism passes once the line says it is not ported", () => {
	const root = fixture({
		"principle-demo/SKILL.md": PRINCIPLE,
		"poteto-mode/playbooks/bug-fix.md": `${PLAYBOOK}\nCursor's \`/loop\` is not ported, so use a heartbeat instead.\n`,
	});
	assert.equal(lint(root).code, 0);
});

test("a model id in a skill file fails, while an agent name passes", () => {
	const withSlug = lint(
		fixture({
			"principle-demo/SKILL.md": PRINCIPLE,
			"poteto-mode/playbooks/bug-fix.md": `${PLAYBOOK}\nRun that seat on \`claude-opus-5-5-xhigh\`.\n`,
		}),
	);
	assert.equal(withSlug.code, 1);
	assert.match(withSlug.output, /names a model id/);

	const withAgentName = lint(
		fixture({
			"principle-demo/SKILL.md": PRINCIPLE,
			"poteto-mode/playbooks/bug-fix.md": `${PLAYBOOK}\nSeat the second family on the \`claude-code\` or \`codex-exec\` agent.\n`,
		}),
	);
	assert.equal(withAgentName.code, 0, withAgentName.output);
});

test("the real tree passes", () => {
	const skills = path.join(HERE, "..", "..", "skills");
	const result = lint(skills);
	assert.equal(result.code, 0, result.output);
	assert.match(result.output, /0 problems/);
});

// A name is not a profile. The first acceptance run against a governed repository lost its
// delegation because `how` labelled a `scout` spawn read-only. The packaged `scout` has both
// `bash` and `write`, and the packaged agent with no shell is `reviewer`. These fixtures keep a
// read-only claim tied to a profile this port can prove.
const SCOUT_AGENT = `---
name: pstack-scout
description: A write-less scout for the fixture.
tools: read, grep, find, ls, bash
---

Scout.
`;

const skill = (body: string) => `---\nname: bugs\ndescription: "Use for the fixture."\n---\n\n${body}\n`;

test("calling a packaged agent read-only when it can write fails", () => {
	const result = lint(
		fixture({
			"principle-demo/SKILL.md": PRINCIPLE,
			"bugs/SKILL.md": skill('Spawn a read-only `subagent` with `agent: "scout"`.'),
		}),
	);
	assert.equal(result.code, 1);
	assert.match(result.output, /calls "scout" read-only, but its tools include write/);
});

test("the same read-only claim passes against a write-less port agent", () => {
	const root = fixture({
		"principle-demo/SKILL.md": PRINCIPLE,
		"agents/pstack-scout.md": SCOUT_AGENT,
		"bugs/SKILL.md": skill('Spawn a read-only `subagent` with `agent: "pstack-scout"`.'),
	});
	assert.equal(lint(root).code, 0, lint(root).output);
});

test("a read-only phrase after the agent reference describes the task, not the child", () => {
	const root = fixture({
		"principle-demo/SKILL.md": PRINCIPLE,
		"bugs/SKILL.md": skill('Every spawn is a `subagent` call with `agent: "delegate"`, which fits a read-only investigation.'),
	});
	assert.equal(lint(root).code, 0, lint(root).output);
});

test("an agent with no tools allowlist fails", () => {
	const root = fixture({
		"principle-demo/SKILL.md": PRINCIPLE,
		"agents/loose.md": `---\nname: loose\ndescription: An agent with no declared profile.\n---\n\nLoose.\n`,
	});
	const result = lint(root);
	assert.equal(result.code, 1);
	assert.match(result.output, /must declare an inline .* allowlist/);
});

test("an agent name with no known profile fails", () => {
	const result = lint(
		fixture({
			"principle-demo/SKILL.md": PRINCIPLE,
			"bugs/SKILL.md": skill('Spawn `agent: "ghost"`.'),
		}),
	);
	assert.equal(result.code, 1);
	assert.match(result.output, /names an agent with no known profile: ghost/);
});

test("a router without the repository-governance step fails", () => {
	const result = lint(
		fixture({
			"principle-demo/SKILL.md": PRINCIPLE,
			"poteto-mode/SKILL.md": `---\nname: poteto-mode\ndescription: "Use for the fixture."\n---\n\nA router that matches a playbook with no repository rules.\n`,
		}),
	);
	assert.equal(result.code, 1);
	assert.match(result.output, /router lost the repository-governance step/);
});

// A duplicated paragraph reads as emphasis and passes every other rule, because each copy is
// locally valid. `opening-a-pr.md` shipped one verbatim copy of its Forge paragraph.
test("a non-trivial line repeated in one file fails", () => {
	const paragraph =
		"**Forge.** The forge is the GitHub CLI everywhere, and the Origin CLI path is not ported here.";
	const result = lint(
		fixture({
			"principle-demo/SKILL.md": PRINCIPLE,
			"bugs/SKILL.md": skill(`${paragraph}\n\nA paragraph between them.\n\n${paragraph}`),
		}),
	);
	assert.equal(result.code, 1);
	assert.match(result.output, /repeats line \d+ verbatim/);
});

test("a repeated short line is allowed, because it carries no paragraph", () => {
	const result = lint(
		fixture({
			"principle-demo/SKILL.md": PRINCIPLE,
			"bugs/SKILL.md": skill("See above.\n\nSee above."),
		}),
	);
	assert.equal(result.code, 0, result.output);
});
