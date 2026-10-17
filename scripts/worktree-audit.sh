#!/usr/bin/env bash
# worktree-audit: bucket every git worktree so a human can decide what to delete.
#
#   worktree-audit.sh [-b <pr-base-ref>] [repo-path]
#
# Prints one row per worktree, tab separated: BUCKET, PATH, BRANCH, AHEAD, DIRTY.
#
# Buckets are advice, not permission. The playbook that calls this says so, and the reason is
# that a worktree is cheap to keep and expensive to recreate badly:
#
#   MERGED              the branch is fully contained in the base ref, so the work is landed
#   main                 the primary worktree; never a prune candidate
#   verify-recent-chat   not merged, but recent; a human or an agent may still be using it
#   wip:<n>              <n> uncommitted or untracked paths, so deleting loses work
#   unmerged             not merged, or the base ref could not be resolved; inspect before touching
#
# Without -b, the base ref is origin/HEAD, which is where a default-branch merge check belongs.
set -euo pipefail

base=""
repo="."
while [ $# -gt 0 ]; do
	case "$1" in
	-b)
		base="$2"
		shift 2
		;;
	*) repo="$1" && shift ;;
	esac
done

cd "$repo"
base="${base:-$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || echo HEAD)}"
recent_days="${WORKTREE_AUDIT_RECENT_DAYS:-14}"

printf 'BUCKET\tPATH\tBRANCH\tAHEAD\tDIRTY\n'

# The primary worktree is the checkout a human is standing in, so it is never a prune candidate.
first=1

# --porcelain gives one block per worktree, separated by a blank line.
git worktree list --porcelain | awk -v RS='' '{
	path=""; branch=""; head="";
	for (i = 1; i <= NF; i++) {
		if ($i == "worktree") path = $(i+1);
		if ($i == "HEAD") head = $(i+1);
		if ($i == "branch") branch = $(i+1);
	}
	if (path == "") next;
	print path "\t" branch "\t" head;
}' | while IFS=$'\t' read -r path branch head; do
	[ -z "$path" ] && continue
	ahead=0
	if [ -n "$branch" ] && [ "$branch" != "detached" ]; then
		short="${branch#refs/heads/}"
		# Count commits on the branch that the base ref does not contain. An unknown base ref is
		# not evidence of a merge, so it reports unknown rather than zero.
		ahead=$(git rev-list --count "${base}..${short}" 2>/dev/null || echo "?")
	fi

	dirty=$(git -C "$path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
	last=$(git -C "$path" log -1 --format=%ct 2>/dev/null || echo 0)
	now=$(date +%s)
	age_days=$(( (now - last) / 86400 ))

	if [ "$first" = "1" ]; then
		bucket="main"
		first=0
	elif [ "$dirty" -gt 0 ] 2>/dev/null; then
		# Uncommitted work outranks every other bucket. Removing a clean worktree is recoverable
		# from its branch; uncommitted edits are not, so a merged branch must not hide them.
		bucket="wip:${dirty}"
	elif [ "$ahead" = "0" ]; then
		bucket="MERGED"
	elif [ "$ahead" = "?" ]; then
		# An unresolvable base ref tells us nothing, and guessing "merged" here would license a
		# delete on missing evidence.
		bucket="unmerged"
	elif [ "$age_days" -lt "$recent_days" ]; then
		bucket="verify-recent-chat"
	else
		bucket="unmerged"
	fi

	printf '%s\t%s\t%s\t%s\t%s\n' "$bucket" "$path" "${branch#refs/heads/}" "$ahead" "$dirty"
done
