/**
 * pstack-mode
 *
 * Ports two Cursor mechanisms to pi:
 *
 *  1. `mode: true` + the frontmatter `reminder` field (a resident custom mode that
 *     re-injects a short reminder every turn), implemented as a prompt section added
 *     in `before_agent_start`. pi diffs sections, so the reminder is only re-sent
 *     when it changes.
 *  2. The plain-enter behaviour: attaching the router skill to one message only.
 *
 * Faithfulness note. In pstack the router is `disable-model-invocation: true`, so the
 * model can never reach for it on its own. That is deliberate: the trigger authority
 * is what keeps every later anti-cheat rule enforceable. This extension keeps that
 * property. The reminder text is quoted verbatim from
 * `skills/poteto-mode/SKILL.md` frontmatter.
 *
 * Commands:
 *   /poteto-mode <task>      one-shot: attach the router to this message
 *   /poteto-mode on          resident mode on (every turn carries the reminder)
 *   /poteto-mode off         resident mode off
 *   /poteto-mode status      report the current mode
 *
 * The `PSTACK_MODE=on` environment variable starts a run with resident mode already on,
 * which is what a headless or unattended run wants. There is deliberately no CLI flag.
 * Measured on pi 1.3.0: a run that passes a flag registered by an extension reaches the
 * model and then never exits, so shipping the flag would be a trap rather than a feature.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const CUSTOM_TYPE = "pstack-mode";

/** Verbatim from pstack's `poteto-mode` frontmatter `reminder` field. */
const REMINDER =
	"New task? Playbook match or rigor needed -> apply /poteto-mode. Casual turn or user opts out -> don't.";

const SECTION = "pstack_mode";

const here = path.dirname(fileURLToPath(import.meta.url));

function findRouter(): string | null {
	const candidates = [
		path.join(here, "..", "skills", "poteto-mode", "SKILL.md"),
		path.join(process.cwd(), "skills", "poteto-mode", "SKILL.md"),
		path.join(process.cwd(), ".pi", "skills", "poteto-mode", "SKILL.md"),
	];
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) return candidate;
	}
	return null;
}

function readRouter(): string | null {
	const router = findRouter();
	if (!router) return null;
	try {
		return fs.readFileSync(router, "utf8");
	} catch {
		return null;
	}
}

function routerIsMissing(): string {
	return [
		"pstack could not find skills/poteto-mode/SKILL.md.",
		"Install the package (`pi install -l ./pstack-pi`) or run pi from the package root.",
		"Refusing to attach a router that is not on disk, because a run without the playbooks drifts.",
	].join("\n");
}

function sectionText(): string {
	const router = findRouter();
	return [
		"## poteto-mode",
		"",
		REMINDER,
		"",
		router
			? `The router lives at \`${router}\`. Read it in full before any non-trivial work, then follow its Playbooks section: open a todo list whose first items are the matched playbook's steps, copied in verbatim.`
			: "The router file was not found on disk. Do not invent a playbook.",
	].join("\n");
}

export default function pstackMode(pi: ExtensionAPI) {
	let resident = false;

	function persist(): void {
		pi.appendEntry(CUSTOM_TYPE, { resident });
	}

	// An environment variable wins over the restored session state, because it is this
	// invocation's explicit instruction. The value may not be settled during the factory, so
	// it is also checked on the first turn.
	let flagApplied = false;
	const flagNow = () => /^(on|1|true|yes)$/i.test((process.env.PSTACK_MODE ?? "").trim());
	if (flagNow()) {
		resident = true;
		flagApplied = true;
	}

	// Restore residency for the active branch. Reading the branch, not every file
	// entry, because abandoned branches are alternative histories.
	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		if (flagApplied || flagNow()) {
			resident = true;
			flagApplied = true;
			return;
		}
		try {
			const branch = ctx.sessionManager.getBranch() as Array<{ type?: string; customType?: string; data?: unknown }>;
			for (const entry of branch) {
				if (entry?.type === "custom" && entry.customType === CUSTOM_TYPE) {
					const data = entry.data as { resident?: boolean } | undefined;
					if (typeof data?.resident === "boolean") resident = data.resident;
				}
			}
		} catch {
			resident = false;
		}
	});

	// The resident half of the mechanism. pi appends a transcript delta for changed
	// sections instead of replacing the whole prompt, so this stays cache friendly.
	pi.on("before_agent_start", (event) => {
		try {
			if (!flagApplied && flagNow()) {
				resident = true;
				flagApplied = true;
			}
			const options = event.systemPromptOptions as { sections?: Record<string, string> };
			if (!options.sections) return;
			if (resident) {
				options.sections[SECTION] = sectionText();
			} else {
				delete options.sections[SECTION];
			}
		} catch (error) {
			// A thrown handler error here must never break the run. Record it when asked.
			if (process.env.PSTACK_DEBUG) {
				try {
					fs.writeFileSync(
						process.env.PSTACK_DEBUG,
						`${String(error)}\n${(error as Error)?.stack ?? ""}\n`,
					);
				} catch {
					/* the diagnostic is best effort */
				}
			}
		}
	});

	pi.registerCommand("poteto-mode", {
		description: "Attach the pstack router to one message, or toggle resident mode (on|off|status)",
		handler: async (args, ctx) => {
			const arg = (args ?? "").trim();

			if (arg === "on" || arg === "off" || arg === "status") {
				if (arg === "status") {
					ctx.ui.notify(`poteto-mode is ${resident ? "on (resident)" : "off"}`, "info");
					return;
				}
				resident = arg === "on";
				persist();
				ctx.ui.notify(
					resident
						? "poteto-mode on. Every turn carries the reminder."
						: "poteto-mode off. Use /poteto-mode <task> for a single run.",
					"info",
				);
				return;
			}

			const router = readRouter();
			if (!router) {
				ctx.ui.notify(routerIsMissing(), "error");
				return;
			}
			if (!arg) {
				ctx.ui.notify("usage: /poteto-mode <task> | on | off | status", "error");
				return;
			}

			// One-shot: attach the router to this message, exactly like plain enter does
			// in Cursor. The task text stays the last thing the model reads.
			pi.sendUserMessage([router, "", "---", "", arg].join("\n"));
		},
	});
}
