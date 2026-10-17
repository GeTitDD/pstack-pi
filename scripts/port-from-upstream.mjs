/**
 * Transcribe pstack from the Cursor plugin layout into this port.
 *
 * Upstream ships a Cursor plugin: skills, agents, automations, and a docs guide, all written
 * against Cursor mechanisms (the Task tool, `pstack-models.mdc`, `agent-transcripts/`, cloud
 * environments). This script copies what is missing and applies the mechanical part of the
 * translation. The semantic part, meaning the paragraphs that describe work pi cannot do, is
 * hand-written afterwards and must not be regenerated.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node scripts/port-from-upstream.mjs [--apply] [--upstream <path>]
 *
 * After --apply, always run `node scripts/check-skill-tree.mjs`. It is the authority on what
 * the translation missed, and the remaining problems are exactly the paragraphs that need
 * judgment rather than substitution.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const upstreamFlag = args.indexOf("--upstream");
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")));
const upstream = upstreamFlag === -1 ? path.join(root, "..", "cursor-plugins", "pstack") : path.resolve(args[upstreamFlag + 1]);

/**
 * Ordered so longer, more specific phrases win over the short forms they contain.
 * Each entry is literal text, applied to prose only.
 */
const MECHANISM = [
	["`~/.cursor/rules/pstack-models.mdc`", "`~/.pi/agent/settings.json`"],
	["~/.cursor/rules/pstack-models.mdc", "~/.pi/agent/settings.json"],
	["`pstack-models.mdc`", "`subagents.agentOverrides`"],
	["pstack-models.mdc", "subagents.agentOverrides"],
	["the system prompt names the workspace's `agent-transcripts/` directory", "the session files live under `~/.pi/agent/sessions/` as JSONL, one file per session, and `PI_SESSION_FILE` names the active one"],
	["the workspace's `agent-transcripts/` directory", "`~/.pi/agent/sessions/`"],
	["`agent-transcripts/`", "`~/.pi/agent/sessions/`"],
	["agent-transcripts/", "~/.pi/agent/sessions/"],
	["`subagent_type: \"generalPurpose\"`", "`agent: \"poteto-agent\"`"],
	["`subagent_type: \"poteto-agent\"`", "`agent: \"poteto-agent\"`"],
	["`subagent_type`", "`agent`"],
	["subagent_type", "agent"],
	["`generalPurpose`", "`poteto-agent`"],
	["generalPurpose", "poteto-agent"],
	["the `Task` tool", "the `subagent` tool"],
	["`Task` tool", "`subagent` tool"],
	["Task tool", "`subagent` tool"],
	["Task subagent", "`subagent` child"],
	["Task call", "`subagent` call"],
	["the `AskQuestion` tool", "the `ask_user_question` tool"],
	["`AskQuestion`", "`ask_user_question`"],
	["AskQuestion", "ask_user_question"],
	["`readonly: true`", "a write-less agent profile"],
	["`run_in_background`", "`async: true`"],
	["run_in_background", "async"],
	["`environment: \"cloud\"`", "a git worktree"],
	["environment: \"cloud\"", "a git worktree"],
	["`cloud_base_branch`", "the base branch"],
	["cloud_base_branch", "base branch"],
	["`.cursor/automations/`", "`.pi/automations/`"],
	[".cursor/automations/", ".pi/automations/"],
	["`.cursor/skills/`", "`skills/`"],
	["`.cursor/settings.json`", "`.pi/settings.json`"],
	["~/.cursor/skills/", "~/.agents/skills/"],
	[".cursor/settings.json", ".pi/settings.json"],
	[".cursor/rules", ".pi/rules"],
	[".cursor/skills", "skills"],
	["`/deslop`", "`unslop`"],
	["/deslop", "unslop"],
	["deslop", "unslop"],
	["`control-cli`", "`verify-app`"],
	["`control-ui`", "`verify-app`"],
	["control-cli", "verify-app"],
	["control-ui", "verify-app"],
	["`create-skill`", "the `authoring-a-skill` playbook"],
	["create-skill", "authoring-a-skill"],
];

/**
 * Model ids are deployment policy. They never survive transcription; the prose keeps the role
 * name, and `roles.example.json` holds the id.
 */
const MODELS = [
	[/`claude-opus-[^`]*`/g, "the strongest judgment model"],
	[/`grok-[^`]*`/g, "the configured hillclimb model"],
	[/`gpt-[^`]*`/g, "the configured model"],
	[/claude-opus-[0-9][A-Za-z0-9.-]*/g, "the strongest judgment model"],
	[/grok-[0-9][A-Za-z0-9.-]*/g, "the configured hillclimb model"],
	[/\bgpt-[45][A-Za-z0-9.-]*/g, "the configured model"],
	[/\bGrok\b/g, "the bot"],
	[/\bgrok\b/g, "the configured model"],
];

const translate = (text) => {
	let out = text;
	for (const [from, to] of MECHANISM) out = out.split(from).join(to);
	for (const [pattern, to] of MODELS) out = out.replace(pattern, to);
	// The prose rule this port enforces, applied here so a freshly transcribed file is not born failing.
	out = out.replace(/\s*—\s*/g, ", ");
	out = out.replace(/\s+–\s+/g, ", ");
	out = out.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
	return out;
};

const walk = (dir) => {
	if (!fs.existsSync(dir)) return [];
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
	}
	return out;
};

/** Files upstream ships that this port mirrors. Kept as a list so a new upstream directory fails loudly. */
const DIRECTORIES = ["skills", "agents", "automations", "docs/guide"];

let copied = 0;
let kept = 0;

for (const dir of DIRECTORIES) {
	const source = path.join(upstream, dir);
	if (!fs.existsSync(source)) {
		console.error(`missing upstream directory: ${source}`);
		continue;
	}
	for (const file of walk(source)) {
		const relative = path.relative(upstream, file);
		const target = path.join(root, relative);
		// Never overwrite. This port carries hand-written pi deviations that a mechanical pass cannot
		// reconstruct, so an existing file is reported and left alone. To take an upstream change,
		// diff it by hand.
		if (fs.existsSync(target)) {
			kept += 1;
			continue;
		}
		if (apply) {
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, translate(fs.readFileSync(file, "utf8")));
		}
		copied += 1;
	}
}

console.log(`${apply ? "applied" : "dry run"}: ${copied} copied, ${kept} kept (already present), upstream ${upstream}`);
console.log("next: node scripts/check-skill-tree.mjs");
