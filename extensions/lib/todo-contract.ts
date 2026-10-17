/**
 * The todo contract's pure logic, separated from the pi glue.
 *
 * Nothing here imports a pi package, so the rules are testable without a runtime. The
 * extension in `../pstack-todo.ts` owns only tool registration and parameter schemas.
 *
 * The contract, quoted from `skills/poteto-mode/SKILL.md`:
 *
 *   "Open a todolist whose first items are the matched playbook's steps, copied in
 *    verbatim, before any task-specific todos. A step you choose not to do stays in
 *    the list with a one-line `skip: <reason>`."
 */

export type ItemState = "todo" | "doing" | "done" | "skipped";

export interface Item {
	id: number;
	text: string;
	state: ItemState;
	reason?: string;
}

export interface Contract {
	playbook: string | null;
	items: Item[];
	nextId: number;
	error?: string;
}

export type Action =
	| { action: "list" }
	| { action: "start"; playbook?: string; steps?: string[]; markdown?: string | null }
	| { action: "add"; text?: string }
	| { action: "doing"; id?: number }
	| { action: "done"; id?: number }
	| { action: "skip"; id?: number; reason?: string }
	| { action: "clear" };

export function emptyContract(): Contract {
	return { playbook: null, items: [], nextId: 1 };
}

export function clone(contract: Contract): Contract {
	return {
		playbook: contract.playbook,
		items: contract.items.map((item) => ({ ...item })),
		nextId: contract.nextId,
	};
}

/**
 * Top-level numbered steps of a playbook. A step starts at `^\d+\. ` and runs to the next
 * numbered step, the `**Reply:**` line, or a new heading.
 */
export function playbookSteps(markdown: string): string[] {
	const steps: string[] = [];
	let current: string[] | null = null;
	const flush = (): void => {
		if (current) steps.push(current.join(" ").trim());
		current = null;
	};
	for (const raw of markdown.split(/\r?\n/)) {
		if (/^\d+\.\s/.test(raw)) {
			flush();
			current = [raw.replace(/^\d+\.\s/, "").trim()];
			continue;
		}
		if (!current) continue;
		if (/^\*\*Reply:\*\*/.test(raw) || /^#{1,6}\s/.test(raw)) {
			flush();
			continue;
		}
		if (raw.trim() === "") continue;
		current.push(raw.trim());
	}
	flush();
	return steps;
}

function preview(text: string): string {
	return text.split(/\s+/).slice(0, 12).join(" ");
}

export function render(contract: Contract): string {
	const header = contract.playbook ? `playbook: ${contract.playbook}` : "playbook: none seeded";
	const marks: Record<ItemState, string> = { todo: "[ ]", doing: "[>]", done: "[x]", skipped: "[-]" };
	const lines = contract.items.map((item) => {
		const suffix = item.reason ? `  skip: ${item.reason}` : "";
		return `${item.id}. ${marks[item.state]} ${item.text}${suffix}`;
	});
	const body = lines.length ? lines.join("\n") : "(empty)";
	return contract.error ? `${header}\n${body}\n\nerror: ${contract.error}` : `${header}\n${body}`;
}

/**
 * Apply one action. Returns a new contract, never mutating the input. A rule violation sets
 * `error` and leaves the item list intact, so a refusal is visible rather than silent.
 */
export function apply(contract: Contract, action: Action): Contract {
	const next = clone(contract);
	delete next.error;

	switch (action.action) {
		case "list":
			return next;

		case "start": {
			if (!action.playbook) {
				next.error = "`start` needs a playbook name.";
				return next;
			}
			if (action.markdown == null) {
				next.error = `No playbook named ${action.playbook}. Look in skills/poteto-mode/playbooks/.`;
				return next;
			}
			const expected = playbookSteps(action.markdown);
			const given = action.steps ?? [];
			if (given.length === 0) {
				next.error = `Pass the playbook's ${expected.length} steps in \`steps\`, copied in verbatim.`;
				return next;
			}
			if (next.items.length > 0) {
				next.error = "`start` must come before any task-specific todo. Call `clear` first if this is a new task.";
				return next;
			}
			const haystack = expected.join("\n");
			const missing = given.filter((step) => !haystack.includes(step.trim()));
			if (missing.length > 0) {
				next.error = [
					`${missing.length} step(s) are not verbatim from ${action.playbook}.md:`,
					...missing.map((step) => `  - ${preview(step)}`),
					"Copy the playbook's steps exactly. Paraphrasing breaks the audit surface.",
				].join("\n");
				return next;
			}
			next.items = given.map((text, index) => ({ id: index + 1, text, state: "todo" as const }));
			next.nextId = next.items.length + 1;
			next.playbook = action.playbook;
			return next;
		}

		case "add": {
			if (!action.text) {
				next.error = "`add` needs text.";
				return next;
			}
			if (next.items.length === 0) {
				next.error = "Seed the playbook's steps with `start` before adding task-specific todos.";
				return next;
			}
			next.items.push({ id: next.nextId, text: action.text, state: "todo" });
			next.nextId += 1;
			return next;
		}

		case "doing":
		case "done": {
			const item = next.items.find((candidate) => candidate.id === action.id);
			if (!item) {
				next.error = `No item ${action.id}.`;
				return next;
			}
			item.state = action.action === "done" ? "done" : "doing";
			return next;
		}

		case "skip": {
			const item = next.items.find((candidate) => candidate.id === action.id);
			if (!item) {
				next.error = `No item ${action.id}.`;
				return next;
			}
			if (!action.reason || action.reason.trim() === "") {
				next.error = "`skip` needs a reason. A skipped step stays in the list with `skip: <reason>`.";
				return next;
			}
			item.state = "skipped";
			item.reason = action.reason.trim();
			return next;
		}

		case "clear":
			return emptyContract();
	}
}
