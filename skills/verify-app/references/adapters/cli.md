# Adapter: CLI, TUI, background job

## Boot

A CLI usually needs no boot. Say so explicitly rather than leaving it implied, so a reader knows nothing was skipped.

When the command needs a built artifact, build it first and record the build command as part of the recipe. A stale binary is the most common false pass in this adapter.

For a long-running process or a TUI, boot it in the background, capture its output to a file, and poll a readiness signal. Never `sleep` and hope.

```bash
# background process, output captured, readiness polled
node dist/server.js > /tmp/verify/server.log 2>&1 &
echo $! > /tmp/verify/server.pid
for i in $(seq 1 50); do
  grep -q "listening" /tmp/verify/server.log && break
  sleep 0.2
done
grep -q "listening" /tmp/verify/server.log || { echo "BOOT FAILED"; cat /tmp/verify/server.log; }
```

A TUI is driven through its own non-interactive flags or a pty driver where one exists. Where neither exists, say the surface cannot be driven and mark the lane `BLOCKED`. Do not upgrade a source read into a lane result.

## Input

Deliver input only through the command line. Redirecting stdin, setting environment variables, and passing flags are all legitimate. Reaching into internal files that the command owns is not, because it stops testing the command.

## Capture

Always capture three things together, because the exit code alone is not evidence:

```bash
set +e
out=$(mktemp); err=$(mktemp)
<command> > "$out" 2> "$err"
code=$?
set -e
printf 'exit=%s\n--- stdout ---\n' "$code"; cat "$out"
printf -- '--- stderr ---\n'; cat "$err"
```

Save `$out` and `$err` under your lane's artifact directory, not in the repository.

## Diagnostics

Name these before running, so a failure does not turn into a guess:

- the exit code
- the first error line in stderr
- the process log path
- for a job, the job's own status output rather than the service manager's summary

## Pass predicates

Write the predicate as a literal, not as a shape.

| Bad | Good |
|---|---|
| output looks right | stdout contains `exported 60000 rows` and exit code is 0 |
| no error | exit code 0 and stderr is empty |
| counts match | printed count equals `60000` |

Prefer one predicate per lane. A lane with three predicates hides which one failed.

## Common false passes

- Ran the command before rebuilding, so the old binary answered.
- A warm cache or an existing output file made the run a no-op.
- The command wrote nothing and exited 0 because the input path was wrong.
- Output was read from a previous run's log file that was never truncated.
- The assertion restated a string the test itself wrote into the fixture.

## Cleanup

Stop every process you started and remove scratch directories the lane created. Leave the artifact directory in place, and report its path.
