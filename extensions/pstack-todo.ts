/**
 * pstack-todo
 *
 * Carries pstack's todo contract, enforced in code rather than requested in prose.
 *
 * The rules and the refusal messages live in `./lib/todo-contract.ts`, which imports no pi
 * package and is covered by `scripts/tests/`. This file is only the pi glue: the tool
 * registration, the parameter schema, and the command.
 *
 * Why the rules are enforced rather than requested: pstack asks for them in prose, in a file
 * the agent may or may not have loaded in full. Each rule maps to one way the audit surface
 * fails. Paraphrased steps hide a dropped step, task-specific todos first hide the playbook
 * entirely, and a bare skip hides the omission.
 *
 * The tool is named `pstack_todo`, not `todo`. pi ships an example extension that registers a
 * `todo` tool, and the collision did not produce a clear error in print mode. It hung. See
 * docs/ADR.md, decision 13.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { apply, emptyContract, render, type Action, type Contract } from "./lib/todo-contract.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function playbookDirs(): string[] {
	return [
		path.join(here, "..", "skills", "poteto-mode", "playbooks"),
		path.join(process.cwd(), "skills", "poteto-mode", "playbooks"),
		path.join(process.cwd(), ".pi", "skills", "poteto-mode", "playbooks"),
	];
}

function readPlaybook(name: string): string | null {
	for (const dir of playbookDirs()) {
		const candidate = path.join(dir, `${name}.md`);
		if (fs.existsSync(candidate)) {
			try {
				return fs.readFileSync(candidate, "utf8");
			} catch {
				return null;
			}
		}
	}
	return null;
}

const Params = Type.Object({
	action: StringEnum(["list", "start", "add", "doing", "done", "skip", "clear"] as const),
	playbook: Type.Optional(
		Type.String({ description: "Playbook name for `start`, such as bug-fix. The file name without .md." }),
	),
	steps: Type.Optional(
		Type.Array(Type.String(), {
			description:
				"For `start`. The matched playbook's steps copied in verbatim. Every string must appear in the playbook.",
		}),
	),
	text: Type.Optional(Type.String({ description: "Todo text for `add`." })),
	id: Type.Optional(Type.Number({ description: "Item id for `doing`, `done`, or `skip`." })),
	reason: Type.Optional(Type.String({ description: "Required for `skip`. One line saying why the step is skipped." })),
});

export default function pstackTodo(pi: ExtensionAPI) {
	let current: Contract = emptyContract();

	pi.registerTool({
		name: "pstack_todo",
		label: "pstack todo",
		description: [
			"Manage the run's todo list. Carries pstack's todo contract.",
			"`start` seeds the list from a playbook's steps, which must be copied in verbatim.",
			"`skip` requires a reason. A step you choose not to do stays in the list with `skip: <reason>`.",
			"Call `start` before any task-specific `add`, so the playbook's steps are the first items.",
		].join(" "),
		parameters: Params,
		async execute(_toolCallId, params) {
			const action = params as Action;
			const markdown =
				action.action === "start" && action.playbook ? readPlaybook(action.playbook) : undefined;
			current = apply(current, { ...action, markdown } as Action);
			return {
				content: [{ type: "text", text: render(current) }],
				details: current,
				isError: Boolean(current.error),
			};
		},
	});

	pi.on("session_start", async () => {
		current = emptyContract();
	});

	pi.registerCommand("pstack-todos", {
		description: "Show the pstack todo list",
		handler: async (_args, ctx) => {
			ctx.ui.notify(render(current), "info");
		},
	});
}
