/**
 * orch: the bookkeeping half of the Orchestrate playbook.
 *
 * The playbook keeps a durable project directory where every fact has exactly one writer and
 * every reader aggregates at read time. This file is the only code that writes those files, so
 * the table shapes stay in one place instead of drifting across a dozen shell one-liners.
 *
 *   orch init [--slug <slug>] [--root <dir>]
 *   orch unit add --id <id> --track <t> --state <s> [--branch b] [--pr n] [--head sha] [--brief p]
 *   orch unit set <id> field=value [field=value...]
 *   orch ledger record --pr <n> --head <sha> --verdict <v> [--note <text>]
 *   orch ledger check --pr <n> [--head <sha>]
 *   orch inbox push <agent> <unit> <status> [--report <path>]
 *   orch inbox drain [--consume]
 *   orch frontier set [--repo <dir>] [--from-json <file>]
 *   orch status
 *
 * The project directory is `$ORCH_ROOT/<slug>`, defaulting to `./orchestrate/default`, so a
 * coordinator can run several projects in one repository without a shared mutable file.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

type UnitState = string;

const UNIT_COLUMNS = ["id", "track", "state", "branch", "pr", "head", "brief"] as const;
const LEDGER_COLUMNS = ["pr", "head", "verdict", "note", "recorded_at"] as const;

const args = process.argv.slice(2);

/** Commands with a second word own it; everything else takes flags from the first token on. */
const GROUPED = new Set(["unit", "ledger", "inbox", "frontier"]);
const group = args[0] ?? "";
const action = GROUPED.has(group) ? (args[1] ?? "") : "";
const rest = GROUPED.has(group) ? args.slice(2) : args.slice(1);
const command = `${group}.${action}`;

const value = (name: string, fallback = ""): string => {
	const at = rest.indexOf(name);
	return at === -1 ? fallback : (rest[at + 1] ?? fallback);
};
const has = (name: string): boolean => rest.includes(name);

const slug = value("--slug", process.env.ORCH_SLUG ?? "default");
const root = path.resolve(value("--root", process.env.ORCH_ROOT ?? "orchestrate"));
const projectDir = path.join(root, slug);

const FILE = {
	preferences: path.join(projectDir, "preferences.md"),
	overview: path.join(projectDir, "overview.md"),
	units: path.join(projectDir, "units.tsv"),
	frontier: path.join(projectDir, "frontier.json"),
	ledger: path.join(projectDir, "ledger.tsv"),
	inbox: path.join(projectDir, "inbox"),
	gates: path.join(projectDir, "gates.md"),
	decisions: path.join(projectDir, "decisions.tsv"),
	status: path.join(projectDir, "status.md"),
};

const fail = (message: string): never => {
	console.error(`orch: ${message}`);
	process.exit(1);
};

const requireProject = (): void => {
	if (!fs.existsSync(FILE.units)) fail(`no project at ${projectDir}. Run 'orch init' first`);
};

const readTsv = (file: string, columns: readonly string[]): Record<string, string>[] => {
	if (!fs.existsSync(file)) return [];
	const [header, ...rows] = fs.readFileSync(file, "utf8").split("\n").filter((line) => line.trim() !== "");
	const names = header ? header.split("\t") : [...columns];
	return rows.map((row) => {
		const cells = row.split("\t");
		return Object.fromEntries(names.map((name, index) => [name, cells[index] ?? ""]));
	});
};

const writeTsv = (file: string, columns: readonly string[], rows: Record<string, string>[]): void => {
	const body = [columns.join("\t"), ...rows.map((row) => columns.map((column) => row[column] ?? "").join("\t"))];
	fs.writeFileSync(file, `${body.join("\n")}\n`);
};

const upsert = (rows: Record<string, string>[], key: string, next: Record<string, string>): Record<string, string>[] => {
	const index = rows.findIndex((row) => row[key] === next[key]);
	if (index === -1) return [...rows, next];
	const updated = [...rows];
	updated[index] = { ...updated[index], ...next };
	return updated;
};

const init = (): void => {
	fs.mkdirSync(FILE.inbox, { recursive: true });
	const create = (file: string, body: string): void => {
		if (!fs.existsSync(file)) fs.writeFileSync(file, body);
	};
	create(FILE.preferences, "# Standing orders\n\nOne numbered constraint per line. Pasted verbatim into every brief.\n");
	create(FILE.overview, "# Overview\n\nAppend-only PR and issue database.\n");
	create(FILE.gates, "# Gates\n\nEach entry parks a decision that needs a human.\n");
	create(FILE.decisions, "ts\tphase\tdecision\twhy\tevidence\tresult\n");
	if (!fs.existsSync(FILE.units)) writeTsv(FILE.units, UNIT_COLUMNS, []);
	if (!fs.existsSync(FILE.ledger)) writeTsv(FILE.ledger, LEDGER_COLUMNS, []);
	if (!fs.existsSync(FILE.frontier)) fs.writeFileSync(FILE.frontier, `${JSON.stringify({ repo: null, order: [], computedAt: null }, null, 2)}\n`);
	writeStatus();
	console.log(projectDir);
};

const unitAdd = (): void => {
	requireProject();
	const id = value("--id") || fail("unit add needs --id");
	const rows = readTsv(FILE.units, UNIT_COLUMNS);
	if (rows.some((row) => row.id === id)) fail(`unit ${id} already exists. Use 'orch unit set'`);
	const row: Record<string, string> = {
		id,
		track: value("--track"),
		state: value("--state", "todo"),
		branch: value("--branch"),
		pr: value("--pr"),
		head: value("--head"),
		brief: value("--brief"),
	};
	writeTsv(FILE.units, UNIT_COLUMNS, [...rows, row]);
	console.log(`${id}\t${row.state}`);
};

const unitSet = (): void => {
	requireProject();
	const id = rest[0] ?? fail("unit set needs an id");
	const assignments = rest.slice(1).filter((token) => token.includes("="));
	if (assignments.length === 0) fail("unit set needs at least one field=value");
	const rows = readTsv(FILE.units, UNIT_COLUMNS);
	const index = rows.findIndex((row) => row.id === id);
	if (index === -1) fail(`no unit ${id}`);
	const updated = { ...rows[index] };
	for (const assignment of assignments) {
		const [field, ...tail] = assignment.split("=");
		if (!UNIT_COLUMNS.includes(field as (typeof UNIT_COLUMNS)[number])) fail(`unknown unit field ${field}`);
		updated[field] = tail.join("=");
	}
	rows[index] = updated;
	writeTsv(FILE.units, UNIT_COLUMNS, rows);
	console.log(`${id}\t${updated.state}`);
};

const ledgerRecord = (): void => {
	requireProject();
	const pr = value("--pr") || fail("ledger record needs --pr");
	const head = value("--head") || fail("ledger record needs --head");
	const verdict = value("--verdict") || fail("ledger record needs --verdict");
	const rows = readTsv(FILE.ledger, LEDGER_COLUMNS);
	writeTsv(
		FILE.ledger,
		LEDGER_COLUMNS,
		upsert(rows, "pr", { pr, head, verdict, note: value("--note"), recorded_at: new Date().toISOString() }),
	);
	console.log(`${pr}\t${head}\t${verdict}`);
};

const ledgerCheck = (): void => {
	requireProject();
	const pr = value("--pr") || fail("ledger check needs --pr");
	const head = value("--head");
	const row = readTsv(FILE.ledger, LEDGER_COLUMNS).find((entry) => entry.pr === pr && (!head || entry.head === head));
	if (!row) {
		console.log(`PR ${pr} has no verdict${head ? ` at ${head}` : ""}`);
		process.exit(1);
	}
	console.log(JSON.stringify(row));
};

const inboxPush = (): void => {
	requireProject();
	const [agent, unit, status] = rest.filter((token) => !token.startsWith("--"));
	if (!agent || !unit || !status) fail("inbox push needs <agent> <unit> <status>");
	const report = value("--report");
	const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${unit}-${randomUUID().slice(0, 8)}.json`;
	const payload = { agent, unit, status, report: report || null, pushedAt: new Date().toISOString() };
	fs.writeFileSync(path.join(FILE.inbox, name), `${JSON.stringify(payload, null, 2)}\n`);
	console.log(path.join(FILE.inbox, name));
};

const inboxDrain = (): void => {
	requireProject();
	const names = fs.existsSync(FILE.inbox) ? fs.readdirSync(FILE.inbox).sort() : [];
	for (const name of names) {
		const file = path.join(FILE.inbox, name);
		const payload = JSON.parse(fs.readFileSync(file, "utf8"));
		console.log(`${payload.agent}\t${payload.unit}\t${payload.status}\t${payload.report ?? ""}`);
		if (has("--consume")) fs.rmSync(file, { force: true });
	}
};

const frontierSet = (): void => {
	requireProject();
	const fromJson = value("--from-json");
	let order: { pr: number; base: string | null; head: string | null }[] = [];
	if (fromJson) {
		order = JSON.parse(fs.readFileSync(fromJson, "utf8"));
	} else {
		const repo = value("--repo", ".");
		try {
			const stdout = execFileSync(
				"gh",
				["pr", "list", "--state", "open", "--json", "number,baseRefName,headRefOid", "--limit", "200"],
				{ cwd: repo, encoding: "utf8" },
			);
			order = (JSON.parse(stdout) as { number: number; baseRefName: string; headRefOid: string }[])
				.sort((a, b) => a.number - b.number)
				.map((pr) => ({ pr: pr.number, base: pr.baseRefName, head: pr.headRefOid }));
		} catch (error) {
			// No authenticated forge is not a frontier of zero. Say what happened instead.
			fail(`cannot read open PRs: ${(error as Error).message}`);
		}
	}
	fs.writeFileSync(
		FILE.frontier,
		`${JSON.stringify({ repo: value("--repo", null) || null, order, computedAt: new Date().toISOString() }, null, 2)}\n`,
	);
	console.log(`${order.length} open PRs`);
};

const countBy = (rows: Record<string, string>[], key: string): string =>
	[...new Set(rows.map((row) => row[key] || "(none)"))]
		.sort()
		.map((name) => {
			const count = rows.filter((row) => (row[key] || "(none)") === name).length;
			return `${name} ${count}`;
		})
		.join(", ");

const writeStatus = (): string => {
	const units = readTsv(FILE.units, UNIT_COLUMNS);
	const ledger = readTsv(FILE.ledger, LEDGER_COLUMNS);
	const gates = fs.existsSync(FILE.gates)
		? fs.readFileSync(FILE.gates, "utf8").split("\n").filter((line) => /^[-*] /.test(line)).length
		: 0;
	const verified = new Set(ledger.map((row) => row.pr).filter(Boolean)).size;
	const body = [
		"# Status",
		"",
		`Generated at ${new Date().toISOString()}. Derived from units.tsv and ledger.tsv, never hand-maintained.`,
		"",
		`- units: ${units.length}`,
		`- by state: ${countBy(units, "state") || "none"}`,
		`- verified PRs: ${verified}`,
		`- gates open: ${gates}`,
		"",
	].join("\n");
	fs.writeFileSync(FILE.status, body);
	// The playbook's drain turn ends with exactly these three lines.
	return [
		`units ${units.length}: ${countBy(units, "state") || "none"}`,
		`ledger: ${ledger.length} verdicts across ${verified} PRs`,
		`gates open: ${gates}`,
	].join("\n");
};

const main = (): void => {
	switch (command) {
		case "init.":
			return init();
		case "unit.add":
			return unitAdd();
		case "unit.set":
			return unitSet();
		case "ledger.record":
			return ledgerRecord();
		case "ledger.check":
			return ledgerCheck();
		case "inbox.push":
			return inboxPush();
		case "inbox.drain":
			return inboxDrain();
		case "frontier.set":
			return frontierSet();
		case "status.":
			requireProject();
			console.log(writeStatus());
			return;
		default:
			fail(`unknown command '${command}'. Try init, unit add, unit set, ledger record, ledger check, inbox push, inbox drain, frontier set, status`);
	}
};

main();
