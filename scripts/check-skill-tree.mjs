#!/usr/bin/env node
/**
 * Structural lint for the pstack skill tree.
 *
 * Two jobs.
 *
 *  1. Integrity. Every `principle-*` citation, bare skill name, `playbooks/*.md`
 *     reference, and relative link must resolve to a file on disk. A citation that
 *     resolves to nothing is a dangling rule, and a dangling rule reads as complied
 *     with while changing no decision.
 *
 *  2. Prose rules on instruction files. Em dashes and curly quotes are banned.
 *     An en dash is allowed only inside a numeric range, because `1-3 short
 *     sentences` is a range and not punctuation.
 *
 * What this linter deliberately does NOT check is the mid-sentence colon rule. That
 * rule belongs to generated artifacts (plans, replies), where the text is prose for a
 * human. Instruction files are reference material full of tables and field labels, and
 * enforcing the colon rule here would flag most of the corpus. See docs/ADR.md.
 *
 * Usage: node scripts/check-skill-tree.mjs [root] [--quiet]
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : path.join(process.cwd(), "skills");

const problems = [];
const warnings = [];
let shapeCount = 0;
let principleCount = 0;
const fail = (file, line, message) => problems.push(`${path.relative(process.cwd(), file)}:${line}: ${message}`);
const warn = (file, line, message) => warnings.push(`${path.relative(process.cwd(), file)}:${line}: ${message}`);

/**
 * pstack ships 28 situational skills, 3 automation packs, and 23 playbooks. This port
 * ships a subset. Any mention of an unported name must carry an explicit `not ported`
 * marker on the same line, so the router can never point at a skill that does not exist.
 *
 * One list. Everything pstack itself ships is ported, so the only remaining names belong to
 * other Cursor plugins or to Cursor itself. A router line that mentions one needs a "not
 * ported" marker on the same line.
 */
const UNPORTED_STRICT = [
	"deslop",
	"create-skill",
	"control-cli",
	"control-ui",
];

const UNPORTED_SLASH = [];

/**
 * Cursor mechanisms that have no meaning in pi. A skill that names one is instructing the
 * agent to do something it cannot do, which is the same defect as a dangling citation. The
 * first pass of this port shipped eight such files and the linter stayed silent, because none
 * of these tokens were checked. Exempted when the same line says "not ported".
 */
const FOREIGN_MECHANISMS = [
	"pstack-models",
	".mdc",
	"subagent_type",
	"generalPurpose",
	"agent-transcripts",
	"cloud_base_branch",
	"run_in_background",
	"Task tool",
	"Task call",
	"Task subagent",
	"AskQuestion",
	"environment: \"cloud\"",
];

/**
 * `readonly` is a Cursor Task flag and also a TypeScript modifier. Only the flag form counts,
 * which is why it is a pattern rather than a substring: `typescript-best-practices` legitimately
 * teaches `readonly` fields.
 */
const FOREIGN_MECHANISM_PATTERNS = [/\breadonly\b(?=\s*[:=])/];

/**
 * Model ids belong to deployment policy, so no skill file may name one. Agent names such as
 * `claude-code` and `codex-exec` are allowed, which is why the patterns below name model
 * families rather than vendors.
 */
const MODEL_ID_PATTERNS = [
	/claude-opus/i,
	/claude-sonnet/i,
	/claude-haiku/i,
	/grok/i,
	/gpt-[45]/i,
	/deepseek[-/]/i,
	/glm-/i,
	/qwen/i,
	/kimi-/i,
	/\bsonnet\b/i,
	/\bopus\b/i,
];

const PORTED_PLAYBOOKS = new Set([
	"edae",
	"investigation",
	"bug-fix",
	"feature",
	"refactoring",
	"autonomous-run",
	"pause-safely",
	"opening-a-pr",
	"authoring-a-skill",
	"autopilot-full",
	"autopilot-stack",
	"babysit",
	"eval",
	"hillclimb",
	"multi-phase-plan",
	"orchestrate",
	"perf-issue",
	"prototype",
	"runtime-forensics",
	"session-pickup",
	"shipping",
	"trace-forensics",
	"visual-parity",
	"worktree-cleanup",
]);

// Tool profiles of the packaged pi-subagents agents, read from the installed package at
// `node_modules/pi-subagents/agents/<name>.md`. A name is not a profile: `scout` reads like a
// read-only recon agent and is not one, because it has both `bash` and `write`. That mistake
// shipped once, in `how`, where the label "read-only" on a `scout` spawn made the rule below
// fire on a real run and cost the run its delegation. Re-read these when pi-subagents is upgraded.
const PACKAGED_AGENT_TOOLS = {
	scout: ["read", "grep", "find", "ls", "bash", "write", "contact_supervisor"],
	reviewer: ["read", "grep", "find", "ls", "watchdog_diff", "contact_supervisor"],
	worker: ["read", "grep", "find", "ls", "bash", "edit", "write", "contact_supervisor"],
	delegate: ["read", "grep", "find", "ls", "bash", "edit", "write", "contact_supervisor"],
	oracle: ["read", "grep", "find", "ls", "bash"],
	researcher: ["read", "write", "web_search", "fetch_content", "get_search_content", "source_check"],
	"evidence-auditor": ["read", "web_search", "fetch_content", "get_search_content", "source_check"],
};

const WRITE_TOOLS = new Set(["write", "edit"]);

// The label sits before the agent it describes, so only a `read-only` that precedes the
// `agent:` reference on the same line counts as a claim about that agent. A later phrase such as
// "a read-only investigation" describes the task, not the child.
const READ_ONLY_CLAIM_WINDOW = 160;

// The router must send a new task through the target repository's own rules before it matches a
// playbook. A missing step is silent, which is the failure mode this guards: the step was absent
// for the whole first port and nothing noticed until a run against a governed repository.
const ROUTER_GOVERNANCE_MARKERS = ["Repository rules come first", "AGENTS.md", "CONTRIBUTING.md"];

function walk(dir) {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
	}
	return out;
}

function splitFrontmatter(text) {
	const lines = text.split(/\r?\n/);
	if (lines[0] !== "---") return { meta: {}, body: lines, offset: 0 };
	const end = lines.indexOf("---", 1);
	if (end === -1) return { meta: {}, body: lines, offset: 0 };
	const meta = {};
	for (const line of lines.slice(1, end)) {
		const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (match) meta[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
	}
	return { meta, body: lines.slice(end + 1), offset: end + 1 };
}

/** Strip fenced code, inline code, and link targets so prose rules judge prose only. */
function proseOf(line) {
	if (/^\s{0,3}(```|~~~)/.test(line)) return "";
	return line.replace(/`[^`]*`/g, "`").replace(/!?\[[^\]]*\]\([^)]*\)/g, "[link]");
}

function checkProse(file, lines, offset) {
	let fence = null;
	lines.forEach((line, index) => {
		const lineNumber = index + offset + 1;
		if (/^\s{0,3}(```|~~~)/.test(line)) {
			const char = line.trim()[0];
			fence = fence && fence === char ? null : fence ?? char;
			return;
		}
		if (fence) return;
		const prose = proseOf(line);
		if (prose === "") return;
		if (/\u2014/.test(prose)) fail(file, lineNumber, "em dash");
		if (/[\u2018\u2019\u201C\u201D]/.test(prose)) fail(file, lineNumber, "curly quote");
		// En dash outside a numeric range.
		const withoutRanges = prose.replace(/\d\s*\u2013\s*\d/g, "");
		if (/\u2013/.test(withoutRanges)) fail(file, lineNumber, "en dash outside a numeric range");
	});
}

function resolveReference(file, target) {
	const dir = path.dirname(file);
	return path.resolve(dir, target);
}

/** The nearest ancestor directory holding a SKILL.md. Skill docs address paths from there. */
function skillRootOf(file) {
	let dir = path.dirname(file);
	for (let depth = 0; depth < 6; depth += 1) {
		if (fs.existsSync(path.join(dir, "SKILL.md"))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

/** A link target that cannot be a file: a placeholder such as `url`, or an angle-bracket form. */
function isPlaceholderTarget(target) {
	if (/^<.*>$/.test(target)) return true;
	return !target.includes("/") && !target.includes(".");
}

function checkLinks(file, lines, skillsRoot, offset) {
	let fence = null;
	lines.forEach((line, index) => {
		const lineNumber = index + offset + 1;
		if (/^\s{0,3}(```|~~~)/.test(line)) {
			const char = line.trim()[0];
			fence = fence && fence === char ? null : fence ?? char;
			return;
		}
		if (fence) return;

		for (const match of line.matchAll(/\]\(([^)\s]+)\)/g)) {
			const target = match[1];
			if (/^[a-z]+:/i.test(target) || target.startsWith("#") || isPlaceholderTarget(target)) continue;
			const resolved = resolveReference(file, target.split("#")[0]);
			if (!fs.existsSync(resolved)) fail(file, lineNumber, `link target does not resolve: ${target}`);
		}

		// Path references. A lookbehind keeps a longer path such as
		// `skills/architect/references/runner-prompt.md` from being read as a skill-relative
		// `references/runner-prompt.md`. Resolution tries the file's own directory first, then
		// the skill root, matching how the docs address paths.
		const skillRoot = skillRootOf(file);
		for (const match of line.matchAll(/(?<![A-Za-z0-9._/-])(references\/[A-Za-z0-9._/-]+|scripts\/[A-Za-z0-9._/-]+|playbooks\/[A-Za-z0-9._/-]+\.md)/g)) {
			const target = match[1];
			const candidates = [resolveReference(file, target)];
			if (skillRoot) candidates.push(path.resolve(skillRoot, target));
			// A playbook that names `scripts/...` means the package's scripts, not a copy beside the
			// skill. Without this the reference reads as dangling while the file exists one level up.
			candidates.push(path.resolve(skillsRoot, "..", target));
			if (!candidates.some((candidate) => fs.existsSync(candidate))) {
				fail(file, lineNumber, `referenced path does not resolve: ${target}`);
			}
		}

		for (const match of line.matchAll(/principle-[a-z0-9-]+/g)) {
			const name = match[0];
			if (!fs.existsSync(path.join(skillsRoot, name, "SKILL.md"))) {
				fail(file, lineNumber, `cites a principle that does not exist: ${name}`);
			}
		}

		if (/not ported/i.test(line)) return;
		for (const name of UNPORTED_STRICT) {
			const pattern = new RegExp(`(?<![A-Za-z0-9-])${name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(?![A-Za-z0-9-])`);
			if (pattern.test(line)) fail(file, lineNumber, `mentions unported "${name}" without a "not ported" marker`);
		}
		for (const name of UNPORTED_SLASH) {
			// Word boundary after the name, so a path segment such as `adapters/browser.md` is not
			// read as an invocation of `/bro`.
			const pattern = new RegExp(`/${name}(?![A-Za-z0-9-])`);
			if (pattern.test(line)) fail(file, lineNumber, `invokes unported "/${name}" without a "not ported" marker`);
		}
		for (const token of FOREIGN_MECHANISMS) {
			if (line.includes(token)) fail(file, lineNumber, `names the Cursor mechanism "${token}" without a "not ported" marker`);
		}
		for (const pattern of FOREIGN_MECHANISM_PATTERNS) {
			const hit = line.match(pattern);
			if (hit) fail(file, lineNumber, `names the Cursor mechanism "${hit[0].trim()}" without a "not ported" marker`);
		}
		for (const pattern of MODEL_ID_PATTERNS) {
			const hit = line.match(pattern);
			if (hit) fail(file, lineNumber, `names a model id ("${hit[0]}"). Model ids are deployment policy and belong in roles.example.json`);
		}
	});
}

/**
 * Rule: a non-trivial line may not appear twice in one file. The port was transcribed from
 * pstack's own files by editing them in place, and a duplicated paragraph is the residue. It
 * reads as emphasis, and every other rule here passes it, because each copy is locally valid.
 */
const DUPLICATE_LINE_MIN_LENGTH = 40;

function checkDuplicateLines(file, lines, offset) {
	const seen = new Map();
	let fence = null;
	lines.forEach((line, index) => {
		const lineNumber = index + offset + 1;
		// Fenced code repeats lines legitimately: a "don't" and a "do" example often share one
		// statement. The rule is about a paragraph appearing twice, so code is out of scope.
		if (/^\s{0,3}(```|~~~)/.test(line)) {
			const char = line.trim()[0];
			fence = fence && fence === char ? null : fence ?? char;
			return;
		}
		if (fence) return;

		const text = line.trim();
		if (text.length < DUPLICATE_LINE_MIN_LENGTH) return;
		if (text.startsWith("#") || text.startsWith("|") || text.startsWith("<!--")) return;
		const first = seen.get(text);
		if (first === undefined) {
			seen.set(text, lineNumber);
			return;
		}
		fail(file, lineNumber, `repeats line ${first} verbatim: ${text.slice(0, 64)}`);
	});
}

function checkPrinciple(file, name, meta, body, offset) {
	principleCount += 1;
	if (!name.startsWith("principle-")) fail(file, 1, "principle directory must start with principle-");
	if ((meta.name ?? "") !== name) fail(file, 1, `frontmatter name "${meta.name}" does not match directory "${name}"`);
	if (!meta.description) fail(file, 1, "description is required");
	if (meta.description && !/^(Apply|Use)/.test(meta.description)) {
		fail(file, 1, "description must open with a trigger, such as Apply when or Use for");
	}
	if (meta["disable-model-invocation"] !== "true") fail(file, 1, "disable-model-invocation: true is required");
	const content = body.filter((line) => line.trim() !== "" && !line.startsWith("---"));
	// Thresholds are set against the source corpus. The shortest legitimate principle in
	// pstack (laziness-protocol) has 3 non-empty body lines, and the three genuine stubs had
	// 1, 2, and 5. So 3 is the hard floor, and 8 is where a principle is thin enough to warn
	// about without failing the build.
	if (content.length < 3) fail(file, 1, `body is ${content.length} non-empty lines. Under 3 is a stub`);
	else if (content.length < 8) warn(file, 1, `body is ${content.length} non-empty lines, on the thin side`);

	// Presentation is tallied, not warned about. About two thirds of pstack's own principles
	// carry no bold section headers, and a warning that fires on most of the corpus teaches
	// people to ignore warnings. The stub floor above is the check that matters.
	if (!body.some((line) => /^\*\*(Why|Pattern|Rule|The pattern|The test|Stop|Applications|Related|Distinct from|Reconstruction)/.test(line))) {
		shapeCount += 1;
	}
	void offset;
}

function checkPlaybook(file, lines, offset) {
	const text = lines.join("\n");
	const title = lines.find((line) => line.startsWith("### "));
	if (!title) fail(file, 1, "no ### title");

	const ownerDeclared = /<!--\s*owner:\s*none,\s*reason:/.test(text);
	if (!ownerDeclared && !/^\*\*You own /m.test(text)) {
		fail(file, 1, 'no owner sentence. Start the playbook with **You own ... or declare <!-- owner: none, reason: ... -->');
	}

	const replyDeclared = /<!--\s*reply:\s*none,\s*reason:/.test(text);
	if (!replyDeclared && !/^\*\*Reply:\*\*/m.test(text)) {
		fail(file, 1, 'no **Reply:** contract. Add one, or declare <!-- reply: none, reason: ... -->');
	}

	const numbers = [];
	lines.forEach((line, index) => {
		const match = line.match(/^(\d+)\.\s/);
		if (match) numbers.push({ n: Number(match[1]), line: index + offset + 1 });
	});
	if (numbers.length > 0) {
		if (numbers[0].n !== 1) fail(file, numbers[0].line, `first numbered step is ${numbers[0].n}, expected 1`);
		numbers.forEach((step, index) => {
			if (index > 0 && step.n !== numbers[index - 1].n + 1) {
				fail(file, step.line, `step ${step.n} follows ${numbers[index - 1].n}. Steps must be contiguous`);
			}
		});
	}
}

function toolsOf(meta) {
	if (typeof meta.tools !== "string" || meta.tools.trim() === "") return [];
	return meta.tools
		.split(",")
		.map((tool) => tool.trim())
		.filter(Boolean);
}

/**
 * Agent names a skill may pass to `subagent`, mapped to their tool list. A port-owned agent wins
 * over a packaged one, because a profile declared in this port is a fact this port can prove.
 */
function loadAgentProfiles(skillsRoot) {
	const agentsDir = path.join(path.dirname(skillsRoot), "agents");
	const profiles = new Map();
	const files = [];
	if (!fs.existsSync(agentsDir)) return { profiles, files };
	for (const name of fs.readdirSync(agentsDir)) {
		if (!name.endsWith(".md")) continue;
		const file = path.join(agentsDir, name);
		files.push(file);
		const { meta } = splitFrontmatter(fs.readFileSync(file, "utf8"));
		if (meta.name) profiles.set(meta.name, toolsOf(meta));
	}
	return { profiles, files };
}

/**
 * Rule: a port-owned agent states its tool allowlist. Without one the child inherits the default
 * tool set, which is the same as silent write access.
 */
function checkAgentProfile(file, meta) {
	if (!meta.name) fail(file, 1, "agent frontmatter name is required");
	if (!meta.description) fail(file, 1, "agent frontmatter description is required");
	if (toolsOf(meta).length === 0) {
		fail(
			file,
			1,
			"agent must declare an inline `tools:` allowlist, so its profile is a fact rather than an assumption",
		);
	}
}

/**
 * Rule: a skill may not claim a read-only child whose profile it cannot prove. This is the rule
 * that catches a name being trusted for a profile.
 */
function checkAgentClaims(file, lines, offset, profiles) {
	const packaged = new Map(Object.entries(PACKAGED_AGENT_TOOLS));
	let fence = null;
	lines.forEach((line, index) => {
		const lineNumber = index + offset + 1;
		if (/^\s{0,3}(```|~~~)/.test(line)) {
			const char = line.trim()[0];
			fence = fence && fence === char ? null : fence ?? char;
			return;
		}
		if (fence) return;

		for (const match of line.matchAll(/agent:\s*"([A-Za-z0-9._-]+)"/g)) {
			const name = match[1];
			const tools = profiles.get(name) ?? packaged.get(name);
			if (!tools) {
				fail(
					file,
					lineNumber,
					`names an agent with no known profile: ${name}. Declare it in this port's agents/ directory, or record its packaged tools in PACKAGED_AGENT_TOOLS`,
				);
				continue;
			}
			const claimAt = line.lastIndexOf("read-only", match.index);
			if (claimAt === -1 || match.index - claimAt > READ_ONLY_CLAIM_WINDOW) continue;
			const writes = tools.filter((tool) => WRITE_TOOLS.has(tool));
			if (writes.length > 0) {
				fail(
					file,
					lineNumber,
					`calls "${name}" read-only, but its tools include ${writes.join(", ")}. Declare a write-less agent in agents/ and call that instead`,
				);
			}
		}
	});
}

function main() {
	if (!fs.existsSync(root)) {
		console.error(`no such directory: ${root}`);
		process.exit(2);
	}
	const skillsRoot = root;
	const files = walk(root);
	const { profiles: agentProfiles, files: agentFiles } = loadAgentProfiles(skillsRoot);
	const totalFiles = files.length + agentFiles.length;

	for (const file of agentFiles) {
		const { meta } = splitFrontmatter(fs.readFileSync(file, "utf8"));
		checkAgentProfile(file, meta);
	}

	for (const file of files) {
		const text = fs.readFileSync(file, "utf8");
		const { meta, body, offset } = splitFrontmatter(text);
		const dirName = path.basename(path.dirname(file));
		const isPlaybook = file.includes(`${path.sep}playbooks${path.sep}`);
		const isPrinciple = dirName.startsWith("principle-");

		checkProse(file, body, offset);
		checkLinks(file, body, skillsRoot, offset);
		checkAgentClaims(file, body, offset, agentProfiles);
		checkDuplicateLines(file, body, offset);

		if (!isPlaybook) {
			// Only SKILL.md carries skill frontmatter. Files under references/ are prompt
			// templates and rubrics, not routable skills.
			const isSkillFile = path.basename(file) === "SKILL.md";
			if (isSkillFile) {
				if (!meta.name) fail(file, 1, "frontmatter name is required");
				if (!meta.description) fail(file, 1, "frontmatter description is required");
				if (meta.description && meta.description.length > 1024) fail(file, 1, "description exceeds 1024 characters");
			}
		}

		if (isPrinciple) checkPrinciple(file, dirName, meta, body, offset);
		if (isPlaybook) {
			checkPlaybook(file, body, offset);
			const base = path.basename(file, ".md");
			if (!PORTED_PLAYBOOKS.has(base)) {
				fail(file, 1, `${base}.md is not in the ported playbook set. Add it to PORTED_PLAYBOOKS or drop the file`);
			}
		}
	}

	const routerFile = path.join(skillsRoot, "poteto-mode", "SKILL.md");
	if (fs.existsSync(routerFile)) {
		const routerText = fs.readFileSync(routerFile, "utf8");
		const missing = ROUTER_GOVERNANCE_MARKERS.filter((marker) => !routerText.includes(marker));
		if (missing.length > 0) {
			fail(
				routerFile,
				1,
				`router lost the repository-governance step (missing ${missing.join(", ")}). Read the target repository's own rules before matching a playbook`,
			);
		}
	}

	const pr = problems.length;
	if (pr === 0) {
		console.log(`ok  ${totalFiles} files, ${pr} problems, ${warnings.length} warning(s)`);
	} else {
		console.error(`${pr} problem(s) and ${warnings.length} warning(s) across ${totalFiles} files`);
		for (const problem of problems) console.error(`  ${problem}`);
	}
	for (const warning of warnings) console.error(`  warn ${warning}`);
	console.log(
		`info ${principleCount} principles, ${shapeCount} with no bold section headers (presentation only, tallied rather than warned)`,
	);
	process.exit(pr === 0 ? 0 : 1);
}

main();
