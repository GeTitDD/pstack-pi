#!/usr/bin/env bash
# Append a well-formed row to a pstack decision log (TSV).
#
# Usage: decision-log.sh <logfile> <phase> <decision> <why> <evidence> <result>
#
# Columns, from skills/show-me-your-work/SKILL.md:
#   ts        ISO8601 timestamp
#   phase     the phase or workstream
#   decision  what was chosen or done, one line
#   why       the reason in plain words
#   evidence  a link or path that proves it, never a paragraph
#   result    the outcome or predicate state
#
# Two hardening details are carried over from pstack's log.sh, because both are
# consequences of the log being read by a human in a spreadsheet:
#
#   1. CSV formula injection. Evidence is attacker-controlled (PR titles, filenames,
#      generated text). A cell starting with =, +, -, or @ is prefixed with a single
#      quote so it cannot execute when a reviewer opens the file.
#   2. The header test uses >>, never >. A network mount can fail the existence test
#      for a log that exists. Then the cost is one stray header line, not the rows.
set -euo pipefail

if [ "$#" -ne 6 ]; then
	printf 'usage: decision-log.sh <logfile> <phase> <decision> <why> <evidence> <result>\n' >&2
	exit 1
fi

logfile="$1"
shift

logdir="$(dirname "$logfile")"
if [ -n "$logdir" ] && [ "$logdir" != "." ] && [ ! -d "$logdir" ]; then
	mkdir -p "$logdir"
fi

if [ ! -s "$logfile" ]; then
	printf 'ts\tphase\tdecision\twhy\tevidence\tresult\n' >> "$logfile"
fi

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Strip tabs, newlines, and CR so a cell stays on one line, then neutralize a leading
# formula character.
clean() {
	local v
	v=$(printf '%s' "$1" | tr '\t\n\r' '   ')
	case "$v" in
		=*|+*|-*|@*) printf "'%s" "$v" ;;
		*) printf '%s' "$v" ;;
	esac
}

printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
	"$ts" "$(clean "$1")" "$(clean "$2")" "$(clean "$3")" "$(clean "$4")" "$(clean "$5")" \
	>> "$logfile"
