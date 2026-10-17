/**
 * Throwaway diagnostic for the acceptance check. Writes ground truth to a file instead of
 * asking a model to self-report.
 *
 *  - `before_agent_start`: what skills and tools pi loaded, and the section keys.
 *  - `before_provider_request`: whether the reminder text actually reaches the provider
 *    payload. This is the deterministic check for resident mode, and it does not depend on
 *    extension handler ordering.
 */
import * as fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const OUT = process.env.PI_DIAG_OUT ?? "/tmp/pi-diag.json";
/** The first words of the router skill's frontmatter reminder. */
const REMINDER_MARK = "New task? Playbook match or rigor needed";

const report: Record<string, unknown> = {};

function flush(): void {
	fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
}

export default function diag(pi: ExtensionAPI) {
	pi.on("before_agent_start", (event) => {
		const options = event.systemPromptOptions as unknown as {
			skills?: Array<{ name?: string }>;
			selectedTools?: string[];
		};
		report.skills = (options.skills ?? []).map((skill) => skill?.name).filter(Boolean);
		report.allTools = pi
			.getAllTools()
			.map((tool) => tool.name)
			.sort();
		report.sectionKeysAtMyTurn = Object.keys(event.systemPromptOptions.sections ?? {});
		flush();
	});

	pi.on("before_provider_request", (event) => {
		const json = JSON.stringify(event.payload ?? {});
		report.payloadChars = json.length;
		report.reminderInProviderPayload = json.includes(REMINDER_MARK);
		report.playbookPathInPayload = json.includes("skills/poteto-mode/playbooks");
		flush();
	});
}
