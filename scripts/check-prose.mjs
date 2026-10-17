#!/usr/bin/env node
/**
 * Prose lint for generated artifacts: plan files, saved replies, PR bodies, PR descriptions,
 * commit messages, decision notes. Anything the agent writes for a human to read.
 *
 * This is where pstack's mid-sentence colon rule lives. It is deliberately NOT applied to
 * instruction files, because those are reference material full of tables and field labels,
 * and the rule would flag most of the corpus. See docs/ADR.md, decision 9.
 *
 * Rules, quoted from the Writing the reply section of skills/poteto-mode/SKILL.md:
 *
 *   "No long-dash character anywhere. Write a file-list bullet as a sentence and a bold
 *    section header as its own sentence."
 *   "A colon as a mid-sentence connector is also out (unslop rule 14). A colon before a
 *    list is fine."
 *
 * The colon test is the same regex pstack's own check-plan.mjs uses, `: ` followed by a
 * non-space. A colon that ends a line introduces a list, so it never matches.
 *
 * Usage:
 *   node scripts/check-prose.mjs <file> [more files ...]
 *   node scripts/check-prose.mjs --text "reply text to check"
 */

import fs from "node:fs";
import process from "node:process";

const args = process.argv.slice(2);
if (args.length === 0) {
	console.error("usage: check-prose.mjs <file> [...] | --text <string>");
	process.exit(2);
}

const problems = [];

function check(text, label) {
	let fence = null;
	text.split(/\r?\n/).forEach((line, index) => {
		const lineNumber = index + 1;

		if (/^\s{0,3}(```|~~~)/.test(line)) {
			const char = line.trim()[0];
			fence = fence && fence === char ? null : (fence ?? char);
			return;
		}
		if (fence) return;

		// Judge prose only. Inline code and link targets are not prose.
		const prose = line.replace(/`[^`]*`/g, "`").replace(/!?\[[^\]]*\]\([^)]*\)/g, "[link]");
		if (prose.trim() === "") return;

		if (/\u2014/.test(prose)) problems.push(`${label}:${lineNumber}: em dash`);
		const withoutRanges = prose.replace(/\d\s*\u2013\s*\d/g, "");
		if (/\u2013/.test(withoutRanges)) problems.push(`${label}:${lineNumber}: en dash outside a numeric range`);
		if (/[\u2018\u2019\u201C\u201D]/.test(prose)) problems.push(`${label}:${lineNumber}: curly quote`);
		if (/: \S/.test(prose)) problems.push(`${label}:${lineNumber}: mid-sentence colon`);
	});
}

for (let index = 0; index < args.length; index += 1) {
	if (args[index] === "--text") {
		check(args.slice(index + 1).join(" "), "<text>");
		break;
	}
	const file = args[index];
	if (!fs.existsSync(file)) {
		console.error(`no such file: ${file}`);
		process.exit(2);
	}
	check(fs.readFileSync(file, "utf8"), file);
}

if (problems.length === 0) {
	console.log("ok  0 problems");
} else {
	console.error(`${problems.length} problem(s)`);
	for (const problem of problems) console.error(`  ${problem}`);
	process.exit(1);
}
