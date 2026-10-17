/**
 * Reading this port's agent definitions.
 *
 * Pi packages distribute extensions, skills, prompts, and themes. Agents are not a package
 * resource, and pi-subagents discovers them only from its builtins, `~/.pi/agent/agents`,
 * `~/.agents`, `<project>/.agents`, and `<project>/.pi/agents`. A definition shipped at
 * `<package>/agents/<name>.md` is therefore invisible until something registers it. This module
 * turns those files into the shape the runtime registration event wants, so the markdown stays
 * the single source of truth.
 *
 * No pi import lives here, so the parse is testable with plain `node --test`. That is the same
 * split `todo-contract.ts` uses, and for the same reason.
 */

export type AgentDefinition = {
	name: string;
	description: string;
	tools: readonly string[];
	systemPrompt: string;
};

export type ParsedAgent = { ok: true; agent: AgentDefinition } | { ok: false; error: string };

/**
 * Parse one agent markdown file. `fallbackName` is the file name without its extension, used
 * when the frontmatter omits `name`.
 */
export const parseAgentDefinition = (text: string, fallbackName: string): ParsedAgent => {
	const lines = text.split(/\r?\n/);
	if (lines[0] !== "---") return { ok: false, error: "frontmatter must open the file" };
	const end = lines.indexOf("---", 1);
	if (end === -1) return { ok: false, error: "frontmatter is unterminated" };

	const meta: Record<string, string> = {};
	for (const line of lines.slice(1, end)) {
		const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (match) meta[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
	}

	const name = meta.name || fallbackName;
	if (!meta.description) return { ok: false, error: "description is required" };

	// An inline allowlist, not a YAML block, because the linted form is the parsed form. An
	// agent with no allowlist inherits the default tool set, which is silent write access.
	const tools = (meta.tools ?? "")
		.split(",")
		.map((tool) => tool.trim())
		.filter(Boolean);
	if (tools.length === 0) return { ok: false, error: "an inline tools allowlist is required" };

	const systemPrompt = lines
		.slice(end + 1)
		.join("\n")
		.trim();
	if (systemPrompt === "") return { ok: false, error: "a body is required as the system prompt" };

	return { ok: true, agent: { name, description: meta.description, tools, systemPrompt } };
};
