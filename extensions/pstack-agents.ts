/**
 * pstack-agents
 *
 * Registers this port's agent definitions with pi-subagents.
 *
 * Why this exists. Pi packages distribute extensions, skills, prompts, and themes. Agents are not
 * a package resource, and pi-subagents discovers agents only from its builtins, `~/.pi/agent/agents`,
 * `~/.agents`, `<project>/.agents`, and `<project>/.pi/agents`. A definition shipped at
 * `<package>/agents/pstack-scout.md` is invisible. The acceptance run against a governed
 * repository proved it, when `how` prescribed `pstack-scout` and the spawn failed with
 * `Unknown agent: pstack-scout`. `poteto-agent` had the same problem from the first commit, so
 * every playbook that named it silently ran without it.
 *
 * The markdown files stay the single source of truth. This extension reads them at
 * `session_start` and forwards name, description, tools, and body to the runtime registration
 * event. Registration is process-local and does not survive into child sessions, so it runs per
 * session and disposes at shutdown.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { type AgentDefinition, parseAgentDefinition } from "./lib/agent-definitions.ts";

const AGENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "agents");
const RUNTIME_AGENT_REGISTER_EVENT = "pi-subagents:runtime-agent-register:v1";

type Registration = { dispose(): void };

type RegisterRequest = {
	version: 1;
	name: string;
	definition: { description: string; systemPrompt: string; tools?: readonly string[] };
	result?: { ok: true; registration: Registration } | { ok: false; error: Error };
};

const readAgents = (): { agents: AgentDefinition[]; problems: string[] } => {
	const agents: AgentDefinition[] = [];
	const problems: string[] = [];
	if (!fs.existsSync(AGENTS_DIR)) return { agents, problems };

	for (const entry of fs.readdirSync(AGENTS_DIR)) {
		if (!entry.endsWith(".md")) continue;
		const fallbackName = path.basename(entry, ".md");
		const parsed = parseAgentDefinition(fs.readFileSync(path.join(AGENTS_DIR, entry), "utf8"), fallbackName);
		if (parsed.ok) agents.push(parsed.agent);
		else problems.push(`${entry}: ${parsed.error}`);
	}
	return { agents, problems };
};

export default function pstackAgents(pi: ExtensionAPI) {
	let registrations: Registration[] = [];
	let reported = false;

	pi.on("session_start", (_event, ctx) => {
		registrations = [];
		const { agents, problems } = readAgents();

		for (const agent of agents) {
			const request: RegisterRequest = {
				version: 1,
				name: agent.name,
				definition: { description: agent.description, systemPrompt: agent.systemPrompt, tools: agent.tools },
			};
			pi.events.emit(RUNTIME_AGENT_REGISTER_EVENT, request);

			if (!request.result) {
				// pi-subagents is not installed. Say so once per session and stay out of the way,
				// because this port still runs without it, minus the panels.
				if (!reported) {
					reported = true;
					ctx.ui.notify(
						"pstack: pi-subagents is not installed, so the port's agents are not registered. Install it for the panels and for pstack-scout.",
						"warning",
					);
				}
				return;
			}
			if (request.result.ok) {
				registrations.push(request.result.registration);
				continue;
			}
			problems.push(`${agent.name}: ${request.result.error.message}`);
		}

		if (problems.length > 0) {
			ctx.ui.notify(`pstack: agent registration problems. ${problems.join(" | ")}`, "error");
		}
	});

	// Idempotent, because normal operation may already have cleaned up.
	pi.on("session_shutdown", () => {
		for (const registration of registrations) registration.dispose();
		registrations = [];
	});
}
