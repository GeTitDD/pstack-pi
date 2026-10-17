#!/usr/bin/env bash
# Run every test in the port. Exits non-zero on the first failing suite.
#
# Requires Node 22.19 or newer, which runs .ts files directly through type stripping.
set -euo pipefail
cd "$(dirname "$0")/.."

status=0
for suite in scripts/tests/*.test.ts; do
	printf '\n=== %s\n' "$suite"
	node "$suite" || status=1
done

printf '\n=== linter\n'
node scripts/check-skill-tree.mjs || status=1

printf '\n=== prose linter (negative control)\n'
if printf 'A clause — with an em dash.\n' > /tmp/pstack-prose-probe.md && node scripts/check-prose.mjs /tmp/pstack-prose-probe.md >/dev/null 2>&1; then
	printf 'FAIL the prose linter accepted an em dash\n'
	status=1
else
	printf 'ok  the prose linter rejects an em dash\n'
fi

printf '\n=== decision log\n'
rm -f /tmp/pstack-log-probe.tsv
bash scripts/decision-log.sh /tmp/pstack-log-probe.tsv probe "=formula" why evidence result
if grep -q "'=formula" /tmp/pstack-log-probe.tsv; then
	printf 'ok  the log neutralises a leading formula character\n'
else
	printf 'FAIL the log left a formula character unescaped\n'
	status=1
fi

exit "$status"
