/**
 * Reading and validating automation packs.
 *
 * An automation pack is a directory under `automations/` with a `automation.json` manifest, the
 * skills it runs, and one pi-subagents workflow script per automation. Cursor ships the same idea
 * as an editor-driven automation; here the schedule is a `subagent` call, so the manifest exists
 * to make the schedule checkable before anything is armed.
 *
 * No pi import lives here, so the rules are testable with plain `node --test`.
 */

export type AutomationEntry = {
	name: string;
	workflow: string;
	skill: string;
	every: string;
	prompt?: string;
	args?: Record<string, string>;
	effects?: readonly string[];
};

export type AutomationManifest = {
	pack: string;
	description?: string;
	automations: AutomationEntry[];
};

export type LoadedPack = {
	pack: string;
	dir: string;
	manifest: AutomationManifest;
};

export type Problem = { pack: string; problem: string };

/** A fixed interval, or one of the calendar words pi-subagents accepts. */
const INTERVAL = /^(?:\d+[smhd]|day|week|month)$/;

/**
 * Validate one manifest against the files it names. The pack directory is relative to the
 * repository root, so the returned problems can be pasted into a report unchanged.
 */
export const validateManifest = (
	manifest: AutomationManifest,
	packDir: string,
	exists: (relative: string) => boolean,
): Problem[] => {
	const problems: Problem[] = [];
	const pack = manifest.pack || "(unnamed)";

	if (!manifest.pack) problems.push({ pack, problem: "manifest needs a pack name" });
	if (!Array.isArray(manifest.automations) || manifest.automations.length === 0) {
		problems.push({ pack, problem: "manifest needs at least one automation" });
		return problems;
	}

	const seen = new Set<string>();
	for (const automation of manifest.automations) {
		if (!automation.name) problems.push({ pack, problem: "an automation has no name" });
		else if (seen.has(automation.name)) problems.push({ pack, problem: `duplicate automation name: ${automation.name}` });
		else seen.add(automation.name);

		if (!automation.workflow) {
			problems.push({ pack, problem: `${automation.name}: no workflow script, so it cannot be scheduled` });
		} else if (!exists(`${packDir}/${automation.workflow}`)) {
			problems.push({ pack, problem: `${automation.name}: workflow does not exist: ${packDir}/${automation.workflow}` });
		}

		if (!automation.skill) {
			problems.push({ pack, problem: `${automation.name}: no skill, so the run has no instructions` });
		} else if (!exists(`${packDir}/${automation.skill}`)) {
			problems.push({ pack, problem: `${automation.name}: skill does not exist: ${packDir}/${automation.skill}` });
		}

		if (!automation.every) problems.push({ pack, problem: `${automation.name}: no schedule` });
		else if (!INTERVAL.test(automation.every)) {
			problems.push({ pack, problem: `${automation.name}: unsupported interval "${automation.every}"` });
		}
	}
	return problems;
};

/**
 * The exact `subagent` call that arms one automation. Returning the payload rather than creating
 * the schedule keeps the extension honest: pi-subagents does not let an extension create
 * schedules, so the agent calls this and then makes the call.
 */
export const schedulePayload = (loaded: LoadedPack, automation: AutomationEntry) => ({
	action: "schedule.create",
	workflow: `${loaded.dir}/${automation.workflow}`,
	args: automation.args ?? {},
	options: { every: automation.every },
});

/** One line per automation, for a command or tool result. */
export const describe = (loaded: LoadedPack): string[] =>
	loaded.manifest.automations.map(
		(automation) => `${loaded.manifest.pack}/${automation.name}: every ${automation.every}, ${automation.skill}`,
	);
