/**
 * Tests for the mode extension's residency and one-shot behaviour.
 *
 * `extensions/pstack-mode.ts` imports pi only for types, so it loads under `node --test` with
 * a fake pi object. What is asserted here is the part that matters: resident mode puts the
 * reminder into the prompt every turn, off takes it out, and the one-shot form attaches the
 * router text to the message.
 *
 * Run from the package root:  node --test scripts/tests/
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import pstackMode from "../../extensions/pstack-mode.ts";

interface Fake {
	sections: Record<string, string>;
	sent: string[];
	notices: string[];
	entries: Array<{ type: string; data?: unknown }>;
	beforeAgentStart: Array<(event: unknown) => unknown>;
	sessionStart: Array<(event: unknown, ctx: unknown) => unknown>;
	command: { name: string; handler: (args: string, ctx: unknown) => Promise<void> } | null;
}

function fakePi(): { pi: unknown; seen: Fake } {
	const seen: Fake = {
		sections: {},
		sent: [],
		notices: [],
		entries: [],
		beforeAgentStart: [],
		sessionStart: [],
		command: null,
	};
	const ctx = {
		ui: { notify: (text: string) => seen.notices.push(text) },
		sessionManager: { getBranch: () => [] },
	};
	const pi = {
		on: (event: string, handler: unknown) => {
			if (event === "before_agent_start") seen.beforeAgentStart.push(handler as never);
			if (event === "session_start") seen.sessionStart.push(handler as never);
			return () => {};
		},
		registerCommand: (name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) => {
			seen.command = { name, handler: options.handler };
		},
		appendEntry: (type: string, data?: unknown) => seen.entries.push({ type, data }),
		sendUserMessage: (content: string) => seen.sent.push(content),
		getFlag: () => undefined,
	};
	return { pi, seen };
}

function event(seen: Fake): unknown {
	return { systemPromptOptions: { sections: seen.sections } };
}

function boot(): { seen: Fake; ctx: unknown; runTurn: () => void } {
	const { pi, seen } = fakePi();
	pstackMode(pi as never);
	return {
		seen,
		ctx: { ui: { notify: (text: string) => seen.notices.push(text) } },
		runTurn: () => {
			for (const handler of seen.beforeAgentStart) handler(event(seen));
		},
	};
}

test("a fresh session is not resident", () => {
	const { seen, runTurn } = boot();
	runTurn();
	assert.equal(seen.sections.pstack_mode, undefined);
});

test("the command turns resident mode on and the reminder lands every turn", () => {
	const { seen, runTurn } = boot();
	assert.ok(seen.command, "the /poteto-mode command must be registered");
	void seen.command.handler("on", { ui: { notify: () => {} } });
	runTurn();
	const section = seen.sections.pstack_mode;
	assert.ok(section, "resident mode must add the section");
	assert.match(section, /New task\? Playbook match or rigor needed -> apply \/poteto-mode\./, "the reminder is verbatim from the router frontmatter");
	assert.match(section, /poteto-mode\/SKILL\.md/, "the section points at the router file");
});

test("the command turns resident mode off again", async () => {
	const { seen, runTurn } = boot();
	const ctx = { ui: { notify: () => {} } };
	await seen.command?.handler("on", ctx);
	runTurn();
	assert.ok(seen.sections.pstack_mode);
	await seen.command?.handler("off", ctx);
	runTurn();
	assert.equal(seen.sections.pstack_mode, undefined, "off must remove the section");
});

test("residency survives the turn boundary because the section is re-added each turn", async () => {
	const { seen, runTurn } = boot();
	await seen.command?.handler("on", { ui: { notify: () => {} } });
	runTurn();
	delete seen.sections.pstack_mode;
	runTurn();
	assert.ok(seen.sections.pstack_mode, "the next turn puts it back");
});

test("the one-shot form attaches the router to the message", async () => {
	const { seen, runTurn } = boot();
	await seen.command?.handler("repro the duplicate write first, then fix", { ui: { notify: () => {} } });
	assert.equal(seen.sent.length, 1, "exactly one message is sent");
	const text = seen.sent[0];
	assert.match(text, /^---\nname: poteto-mode/, "the message opens with the router file");
	assert.match(text, /repro the duplicate write first, then fix$/, "the task is the last thing the model reads");
	runTurn();
	assert.equal(seen.sections.pstack_mode, undefined, "one-shot must not make the session resident");
});

test("a one-shot call with no task is refused", async () => {
	const { seen, ctx } = boot();
	await seen.command?.handler("", ctx);
	assert.equal(seen.sent.length, 0);
	assert.match(seen.notices.join("\n"), /usage: \/poteto-mode/);
});

test("status reports the current mode", async () => {
	const { seen, ctx } = boot();
	await seen.command?.handler("status", ctx);
	assert.match(seen.notices.join("\n"), /poteto-mode is off/);
	await seen.command?.handler("on", ctx);
	await seen.command?.handler("status", ctx);
	assert.match(seen.notices.join("\n"), /poteto-mode is on \(resident\)/);
});

test("toggling persists the mode as a session entry", async () => {
	const { seen } = boot();
	await seen.command?.handler("on", { ui: { notify: () => {} } });
	const last = seen.entries.at(-1);
	assert.equal(last?.type, "pstack-mode");
	assert.deepEqual(last?.data, { resident: true });
});
