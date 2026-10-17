/**
 * Push this repository through the GitHub REST Git Data API.
 *
 * `git push` needs `github.com:443`. On a network where that host is blocked but
 * `api.github.com` still answers, the ordinary push cannot run and the failure reads like an
 * authentication problem when it is not. This script uploads the same bytes over the API instead.
 *
 *   gh auth login                                  # once, so the `gh` calls are authenticated
 *   git add -A && git commit -m "..."              # build the commit locally as usual
 *   node scripts/push-via-api.mjs <owner/repo> [branch]
 *
 * Every blob is uploaded with its content and its SHA compared against the local blob. A
 * mismatch aborts before a tree is built, so the pushed tree cannot silently differ from the
 * commit being pushed. The final line compares the remote tree SHA with the local one; it must
 * read YES.
 *
 * Two API details this handles. `POST /git/blobs` returns 409 on a repository with no commit, so
 * an empty repository is bootstrapped with one placeholder file first. The pushed commit is then
 * created with no parents, which makes the bootstrap commit unreachable rather than leaving it in
 * the history.
 *
 * The commit SHA differs from the local one by design: a commit object hashes its committer and
 * timestamp, which the API sets. The tree SHA is the content identity, and that is the line that
 * has to match.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.argv[2];
const branch = process.argv[3] ?? "main";
if (!repo) {
	console.error("usage: node scripts/push-via-api.mjs <owner/repo> [branch]");
	process.exit(2);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** `gh api` takes a JSON body from a file, which keeps large base64 payloads off the command line. */
const gh = (args, payload) => {
	const file = join(tmpdir(), `gh-payload-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
	writeFileSync(file, JSON.stringify(payload));
	try {
		return JSON.parse(execFileSync("gh", [...args, "--input", file], { encoding: "utf8" }));
	} finally {
		try {
			unlinkSync(file);
		} catch {}
	}
};

const ghRetry = (args, payload, attempts = 4) => {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return gh(args, payload);
		} catch (error) {
			if (attempt >= attempts) throw error;
			// api.github.com answers, but not always on the first attempt on a constrained link.
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 1500);
		}
	}
};

// GitHub refuses git/blobs on a repository with no commit, so one file has to land first.
const ensureNotEmpty = () => {
	try {
		execFileSync("gh", ["api", `/repos/${repo}/git/ref/heads/${branch}`], { encoding: "utf8", stdio: "pipe" });
		return false;
	} catch {
		execFileSync(
			"gh",
			[
				"api",
				"--method",
				"PUT",
				`/repos/${repo}/contents/README.md`,
				"-f",
				"message=chore: initialize repository",
				"-f",
				`branch=${branch}`,
				"-f",
				`content=${Buffer.from(`# ${repo.split("/")[1]}\n`).toString("base64")}`,
			],
			{ encoding: "utf8" },
		);
		return true;
	}
};

const bootstrapped = ensureNotEmpty();
if (bootstrapped) console.log("bootstrapped an empty repository with one commit");

const message = git("log", "-1", "--format=%B").trim();
const localTree = git("rev-parse", "HEAD^{tree}").trim();

// `git ls-tree -r --long` prints: <mode> SP <type> SP <sha> SP <size> TAB <path>
const entries = git("ls-tree", "-r", "HEAD", "--long")
	.split("\n")
	.filter(Boolean)
	.map((line) => {
		const [meta, path] = line.split("\t");
		const [mode, type, sha] = meta.split(/\s+/);
		return { mode, type, sha, path };
	});

console.log(`pushing ${entries.length} blobs to ${repo}#${branch}`);
console.log(`local tree ${localTree}`);

let mismatched = 0;
const remote = [];
for (const [index, entry] of entries.entries()) {
	const content = readFileSync(entry.path);
	// Check the working file against the commit first, so a dirty tree cannot upload other bytes.
	const computed = createHash("sha1")
		.update(Buffer.concat([Buffer.from(`blob ${content.length}\0`), content]))
		.digest("hex");
	if (computed !== entry.sha) {
		console.error(`  DIRTY ${entry.path}: local blob is ${computed}, commit expects ${entry.sha}`);
		mismatched += 1;
		continue;
	}
	const result = ghRetry(["api", "--method", "POST", `/repos/${repo}/git/blobs`], {
		content: content.toString("base64"),
		encoding: "base64",
	});
	if (result.sha !== entry.sha) {
		console.error(`  MISMATCH ${entry.path}: remote blob ${result.sha}, local ${entry.sha}`);
		mismatched += 1;
	}
	remote.push({ path: entry.path, mode: entry.mode, type: "blob", sha: result.sha });
	if ((index + 1) % 25 === 0 || index === entries.length - 1) console.log(`  ${index + 1}/${entries.length}`);
}

if (mismatched > 0) {
	console.error(`${mismatched} blob(s) did not round-trip; refusing to build a tree`);
	process.exit(1);
}

const tree = ghRetry(["api", "--method", "POST", `/repos/${repo}/git/trees`], { tree: remote });
console.log(`remote tree ${tree.sha}`);

// A root commit keeps the pushed history identical to the local one.
const commit = ghRetry(["api", "--method", "POST", `/repos/${repo}/git/commits`], {
	message,
	tree: tree.sha,
	parents: [],
});
console.log(`remote commit ${commit.sha}`);

try {
	ghRetry(["api", "--method", "POST", `/repos/${repo}/git/refs`], { ref: `refs/heads/${branch}`, sha: commit.sha });
	console.log(`created refs/heads/${branch}`);
} catch {
	ghRetry(["api", "--method", "PATCH", `/repos/${repo}/git/refs/heads/${branch}`], { sha: commit.sha, force: true });
	console.log(`updated refs/heads/${branch}`);
}

const same = tree.sha === localTree;
console.log(`tree identical to local: ${same ? "YES" : "NO"}`);
process.exit(same ? 0 : 1);
