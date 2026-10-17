/**
 * The role-to-model map that `/setup-pstack` maintains.
 *
 * Upstream writes a Cursor rule file with one line per role. Here the same map lives in
 * `.pi/settings.json` under `pstack`, plus `subagents.agentOverrides` for the agent-keyed
 * entries pi-subagents needs. This module is the rules half: it decides what a budget does to a
 * slug and whether every role still resolves. No pi import lives here, so the rules are testable
 * with plain `node --test`, the same split `todo-contract.ts` uses.
 */

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export const BUDGETS = ["unlimited", "large", "medium", "small"] as const;
export type Budget = (typeof BUDGETS)[number];

/** The effort a budget targets. A slug that cannot reach it is clamped by the caller. */
export const BUDGET_LEVEL: Record<Budget, ThinkingLevel> = {
	unlimited: "max",
	large: "xhigh",
	medium: "high",
	small: "medium",
};

/** Aliases that are always valid and never carry a level. */
export const ALIASES = new Set(["auto", "inherit-parent"]);

export type RoleMap = Record<string, string>;

export type Slug = { base: string; level: ThinkingLevel | undefined };

/**
 * Split `provider/model:level` into its parts. The level is the last colon segment only when it
 * is a known thinking level, so a provider or model id containing a colon survives intact.
 */
export const splitSlug = (value: string): Slug => {
	const at = value.lastIndexOf(":");
	if (at === -1) return { base: value, level: undefined };
	const tail = value.slice(at + 1).trim() as ThinkingLevel;
	if (!THINKING_LEVELS.includes(tail)) return { base: value, level: undefined };
	return { base: value.slice(0, at), level: tail };
};

/**
 * A panel role holds a list: one subagent runs per entry, so the list length sets the fan-out.
 * The separator is a comma with optional space, and an entry may itself be an alias.
 */
export const splitList = (value: string): string[] =>
	value
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry !== "");

/** Apply a budget to one entry. Aliases are left alone. */
const budgetEntry = (entry: string, budget: Budget): string => {
	if (entry === "" || ALIASES.has(entry)) return entry;
	const { base } = splitSlug(entry);
	return `${base}:${BUDGET_LEVEL[budget]}`;
};

/** Apply a budget to one role value, which may be a list. Aliases are left alone. */
export const withBudget = (value: string, budget: Budget): string => {
	const trimmed = value.trim();
	if (trimmed === "") return trimmed;
	if (ALIASES.has(trimmed)) return trimmed;
	if (!trimmed.includes(",") && !trimmed.includes(" ")) return budgetEntry(trimmed, budget);
	return splitList(trimmed)
		.map((entry) => budgetEntry(entry, budget))
		.join(", ");
};

/** Apply a budget to every role. Idempotent: re-running replaces the level rather than stacking. */
export const applyBudget = (roles: RoleMap, budget: Budget): RoleMap =>
	Object.fromEntries(Object.entries(roles).map(([role, value]) => [role, withBudget(value, budget)]));

/**
 * Check every role against the models this session can actually reach.
 *
 * `available` holds `provider/id` without a level. An unknown role is reported rather than
 * dropped, because a role the skills read and this map does not name silently runs on the
 * parent model.
 */
export const validateRoles = (
	roles: RoleMap,
	available: ReadonlySet<string>,
	knownRoles?: ReadonlySet<string>,
): { ok: boolean; problems: string[] } => {
	const problems: string[] = [];
	for (const [role, value] of Object.entries(roles)) {
		if (knownRoles && !knownRoles.has(role)) problems.push(`unknown role: ${role}`);
		const entries = splitList(value);
		if (entries.length === 0) {
			problems.push(`${role} is empty`);
			continue;
		}
		for (const entry of entries) {
			if (ALIASES.has(entry)) continue;
			const { base } = splitSlug(entry);
			if (!base.includes("/")) {
				problems.push(`${role}: "${entry}" is not provider/model`);
				continue;
			}
			if (!available.has(base)) problems.push(`${role}: ${base} is not an available model`);
		}
	}
	return { ok: problems.length === 0, problems };
};

/**
 * Merge a budget and explicit overrides into a new role map. Explicit overrides win and are
 * themselves budgeted, so a role pinned to a specific model still follows the effort setting
 * unless the override names a level.
 */
export const resolveRoles = (base: RoleMap, budget: Budget, overrides: RoleMap): RoleMap => {
	const merged: RoleMap = { ...base };
	for (const [role, value] of Object.entries(overrides)) merged[role] = value;
	for (const [role, value] of Object.entries(merged)) {
		if (ALIASES.has(value.trim())) continue;
		// An override that already names a level keeps it: the operator was specific. A list is
		// budgeted entry by entry, so one pinned entry does not pin its peers.
		const pinned = overrides[role] !== undefined && splitList(value).every((entry) => splitSlug(entry).level !== undefined);
		if (pinned) continue;
		merged[role] = withBudget(value, budget);
	}
	return merged;
};

/** Agent names pi-subagents keys its overrides by, derived from the role map they mirror. */
export const AGENT_ROLES: Readonly<Record<string, string>> = Object.freeze({
	worker: "feature, refactoring",
	reviewer: "judgment and prose",
	delegate: "feature, refactoring",
	oracle: "hardest tasks",
	"pstack-scout": "how explorer",
	"poteto-agent": "feature, refactoring",
});
