/**
 * pstack-models
 *
 * Gives `/setup-pstack` the one capability a skill cannot have: the list of models this pi
 * process can actually reach. Upstream's setup skill enumerates them through Cursor's Task tool
 * and writes a rule file. Here the registry lives in the process, so enumeration and validation
 * belong in an extension, and the file it writes is `.pi/settings.json`.
 *
 * The tool is `pstack_models`. The rules live in `./lib/model-roles.ts`, which imports no pi
 * package and is covered by `scripts/tests/`.
 *
 * Why a tool and not only a command: `setup-pstack` is model-invocable upstream, so the agent
 * has to be able to read the model list and write the map itself. A command would make a human
 * do the copy-paste the whole skill exists to remove.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	AGENT_ROLES,
	BUDGETS,
	type Budget,
	type RoleMap,
	resolveRoles,
	validateRoles,
} from "./lib/model-roles.ts";

const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLE = path.join(PACKAGE_ROOT, "roles.example.json");

const projectSettings = (cwd: string) => path.join(cwd, ".pi", "settings.json");
const userSettings = () => path.join(os.homedir(), ".pi", "agent", "settings.json");

type Settings = {
	packages?: unknown;
	subagents?: { agentOverrides?: Record<string, { model?: string }> };
	pstack?: RoleMap;
	[key: string]: unknown;
};

const readJson = (file: string): Settings | undefined => {
	if (!fs.existsSync(file)) return undefined;
	try {
		return JSON.parse(fs.readFileSync(file, "utf8")) as Settings;
	} catch {
		return undefined;
	}
};

/** Project scope wins, exactly as pi resolves settings. */
const currentRoles = (cwd: string): { roles: RoleMap; from: string | undefined } => {
	for (const file of [projectSettings(cwd), userSettings()]) {
		const settings = readJson(file);
		const roles = settings?.pstack;
		if (roles && Object.keys(roles).length > 0) {
			const clean = Object.fromEntries(Object.entries(roles).filter(([role]) => !role.startsWith("//")));
			return { roles: clean as RoleMap, from: file };
		}
	}
	return { roles: {}, from: undefined };
};

/** The example file's `pstack` block is the default map, so the port ships one source of truth. */
const defaultRoles = (): RoleMap => {
	const example = readJson(EXAMPLE);
	const roles = example?.pstack ?? {};
	return Object.fromEntries(Object.entries(roles).filter(([role]) => !role.startsWith("//"))) as RoleMap;
};

const availableSlugs = (ctx: ExtensionContext): { slugs: string[]; source: string } => {
	const slugsOf = (models: readonly unknown[]): string[] =>
		models
			.map((raw) => {
				const model = raw as { provider?: unknown; id?: string };
				const provider = typeof model.provider === "string" ? model.provider : String((model.provider as { id?: string } | undefined)?.id ?? "");
				return provider && model.id ? `${provider}/${model.id}` : "";
			})
			.filter(Boolean)
			.sort();
	const registry = ctx.modelRegistry as
		| { getAvailable?: () => unknown[]; getAll?: () => unknown[] }
		| undefined;
	const available = slugsOf(registry?.getAvailable?.() ?? []);
	if (available.length > 0) return { slugs: available, source: "getAvailable" };
	// A registry with no authenticated model still knows the catalog. Reporting zero available
	// models is only honest when the catalog is empty too, so fall back and say which one ran.
	return { slugs: slugsOf(registry?.getAll?.() ?? []), source: "getAll" };
};

/** pi renders a tool result from `content`; a plain object shows up as an empty result. */
const asResult = (payload: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
	details: payload,
	isError: typeof payload === "object" && payload !== null && (payload as { ok?: boolean }).ok === false,
});

const writeSettings = (file: string, roles: RoleMap): { added: number; changed: number } => {
	const settings: Settings = readJson(file) ?? {};
	const before = settings.pstack ?? {};

	// The agent-keyed overrides pi-subagents reads are derived from the role map, never typed
	// twice, so a role change cannot leave one of the two surfaces stale.
	const agentOverrides: Record<string, { model: string }> = { ...(settings.subagents?.agentOverrides ?? {}) };
	for (const [agent, role] of Object.entries(AGENT_ROLES)) {
		const value = roles[role];
		if (typeof value === "string" && value !== "" && value !== "auto" && value !== "inherit-parent") {
			agentOverrides[agent] = { ...(agentOverrides[agent] ?? {}), model: value };
		}
	}

	settings.pstack = roles;
	settings.subagents = { ...(settings.subagents ?? {}), agentOverrides };

	const after = JSON.stringify(roles);
	const same = JSON.stringify(before) === after;
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);

	const added = Object.keys(roles).length - Object.keys(before).length;
	return { added: Math.max(0, added), changed: same ? 0 : Object.keys(roles).length };
};

export default function pstackModels(pi: ExtensionAPI) {
	pi.registerTool({
		name: "pstack_models",
		description:
			"Read and maintain the pstack role-to-model map. Actions: list (models this session can reach), show (the current map and any entry that no longer resolves), apply (write a budget and optional overrides to .pi/settings.json), validate (check the current map). Model ids are deployment policy and live only in settings.",
		parameters: Type.Object({
			action: Type.Union([Type.Literal("list"), Type.Literal("show"), Type.Literal("apply"), Type.Literal("validate")]),
			budget: Type.Optional(Type.Union(BUDGETS.map((value) => Type.Literal(value)))),
			overrides: Type.Optional(
				Type.Record(
					Type.String(),
					Type.String({
						description: 'Role to model, as provider/model. "auto" or "inherit-parent" run the role on the parent model.',
					}),
				),
			),
			scope: Type.Optional(Type.Union([Type.Literal("project"), Type.Literal("user")])),
		}),
		async execute(_id: string, params: { action: string; budget?: Budget; overrides?: RoleMap; scope?: "project" | "user" }, _signal: unknown, _onUpdate: unknown, ctx: ExtensionContext) {
			const cwd = ctx.cwd ?? process.cwd();
			const { slugs: available, source: registrySource } = availableSlugs(ctx);
			const availableSet = new Set(available);

			if (params.action === "list") {
				return asResult({ available, count: available.length, registry: registrySource });
			}

			const { roles, from } = currentRoles(cwd);
			const source = Object.keys(roles).length > 0 ? roles : defaultRoles();

			if (params.action === "show") {
				return asResult({ from: from ?? "(defaults from roles.example.json)", roles: source, availableCount: available.length });
			}

			if (params.action === "validate") {
				return asResult(validateRoles(source, availableSet));
			}

			// apply
			const budget = params.budget;
			if (!budget) return asResult({ ok: false, error: "apply needs a budget: unlimited, large, medium, or small" });
			const overrides = params.overrides ?? {};
			const next = resolveRoles(source, budget, overrides);
			const check = validateRoles(next, availableSet);
			if (!check.ok) {
				// Refuse rather than write a map the skills cannot use. Upstream's skill stops here too.
				return asResult({ ok: false, error: "refusing to write an unresolved map", problems: check.problems, available });
			}
			const file = params.scope === "user" ? userSettings() : projectSettings(cwd);
			const result = writeSettings(file, next);
			return asResult({ ok: true, file, budget, ...result, roles: next });
		},
	});

	pi.registerCommand("pstack-models", {
		description: "Show the pstack role-to-model map and the models this session can reach",
		handler: async (args, ctx) => {
			const { roles, from } = currentRoles(ctx.cwd ?? process.cwd());
			const source = Object.keys(roles).length > 0 ? roles : defaultRoles();
			const check = validateRoles(source, new Set(availableSlugs(ctx).slugs));
			const lines = [
				`map: ${from ?? "defaults"}`,
				...Object.entries(source).map(([role, value]) => `  ${role} = ${value}`),
				check.ok ? "every role resolves" : `problems: ${check.problems.join("; ")}`,
			];
			ctx.ui.notify(lines.join("\n"), check.ok ? "info" : "warning");
			if ((args ?? "").trim() === "list") {
				ctx.ui.notify(availableSlugs(ctx).slugs.join("\n"), "info");
			}
		},
	});
}
