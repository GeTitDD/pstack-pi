/**
 * pstack-automations
 *
 * Makes automation packs checkable and armable. A pack is a directory under `automations/` with
 * an `automation.json` manifest, the skills a run follows, and one pi-subagents workflow script
 * per automation.
 *
 * What this extension does not do, because pi-subagents does not allow it: create a schedule.
 * Its management allowlist is list, show, history, pause, resume, run, delete. So the tool
 * validates the pack and returns the exact `subagent` payload to arm, and the agent makes that
 * call. That split is deliberate, and it means a broken manifest fails before anything is armed
 * rather than at the first fire.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { type LoadedPack, describe, schedulePayload, validateManifest } from "./lib/automations.ts";

const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTOMATIONS = path.join(PACKAGE_ROOT, "automations");

const load = (): { packs: LoadedPack[]; problems: { pack: string; problem: string }[] } => {
	const packs: LoadedPack[] = [];
	const problems: { pack: string; problem: string }[] = [];
	if (!fs.existsSync(AUTOMATIONS)) return { packs, problems };
	const exists = (relative: string) => fs.existsSync(path.join(PACKAGE_ROOT, relative));

	for (const entry of fs.readdirSync(AUTOMATIONS, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const dir = `automations/${entry.name}`;
		const manifestPath = path.join(AUTOMATIONS, entry.name, "automation.json");
		if (!fs.existsSync(manifestPath)) {
			problems.push({ pack: entry.name, problem: "no automation.json manifest" });
			continue;
		}
		try {
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
			problems.push(...validateManifest(manifest, dir, exists));
			packs.push({ pack: manifest.pack ?? entry.name, dir, manifest });
		} catch (error) {
			problems.push({ pack: entry.name, problem: `manifest is not valid JSON: ${(error as Error).message}` });
		}
	}
	return { packs, problems };
};

/** pi renders a tool result from `content`; a plain object shows up as an empty result. */
const asResult = (payload: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
	details: payload,
	isError: typeof payload === "object" && payload !== null && (payload as { ok?: boolean }).ok === false,
});

export default function pstackAutomations(pi: ExtensionAPI) {
	pi.registerTool({
		name: "pstack_automations",
		description:
			"List and arm pstack automation packs. action=list validates every pack under automations/ and reports problems. action=arm returns the exact subagent schedule.create payload for one automation, which the caller must then invoke. Never invents a schedule.",
		parameters: Type.Object({
			action: Type.Union([Type.Literal("list"), Type.Literal("arm")]),
			pack: Type.Optional(Type.String({ description: "Pack name, for action=arm" })),
			automation: Type.Optional(Type.String({ description: "Automation name within the pack, for action=arm" })),
		}),
		async execute(_id: string, params: { action: string; pack?: string; automation?: string }, _signal: unknown, _onUpdate: unknown, _ctx: ExtensionContext) {
			const { packs, problems } = load();
			if (params.action === "list") {
				return asResult({ packs: packs.flatMap(describe), problems, ok: problems.length === 0 });
			}
			const loaded = packs.find((candidate) => candidate.pack === params.pack);
			if (!loaded) {
				return asResult({ ok: false, error: `no pack named ${params.pack}`, packs: packs.map((candidate) => candidate.pack) });
			}
			const automation = loaded.manifest.automations.find((candidate) => candidate.name === params.automation);
			if (!automation) {
				return asResult({
					ok: false,
					error: `no automation named ${params.automation} in ${loaded.pack}`,
					automations: loaded.manifest.automations.map((candidate) => candidate.name),
				});
			}
			const relevant = problems.filter((problem) => problem.pack === loaded.pack);
			if (relevant.length > 0) return asResult({ ok: false, error: "fix the manifest first", problems: relevant });
			return asResult({ ok: true, call: schedulePayload(loaded, automation) });
		},
	});

	pi.registerCommand("pstack-automations", {
		description: "List pstack automation packs, their schedules, and any manifest problem",
		handler: async (_args, ctx) => {
			const { packs, problems } = load();
			const lines = [
				...packs.flatMap(describe),
				...(problems.length === 0 ? ["every pack validates"] : problems.map((p) => `${p.pack}: ${p.problem}`)),
			];
			ctx.ui.notify(lines.join("\n"), problems.length === 0 ? "info" : "warning");
		},
	});
}
