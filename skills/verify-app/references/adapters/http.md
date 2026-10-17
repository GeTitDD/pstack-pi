# Adapter: HTTP API, webhook, RPC

## Boot

Boot the server, then prove readiness with a request, not with a log line.

```bash
node dist/server.js > /tmp/verify/server.log 2>&1 &
echo $! > /tmp/verify/server.pid
for i in $(seq 1 50); do
  curl -fsS http://127.0.0.1:8787/health > /dev/null 2>&1 && break
  sleep 0.2
done
```

If the service has no health endpoint, use the endpoint under test and treat its first successful response as readiness, recording that choice.

## Input

Send one real request per lane, with the body in a file rather than as an inline shell string. Inline strings get mangled by quoting, and a mangled body produces a false failure that costs a debugging round.

```bash
curl -sS -o /tmp/verify/lane1.body -D /tmp/verify/lane1.headers \
  -w '%{http_code}' \
  -X POST http://127.0.0.1:8787/export \
  -H 'content-type: application/json' \
  --data-binary @/tmp/verify/lane1.request.json
```

Save the request body with the lane's artifacts. A reviewer needs it to re-run.

## Capture

Keep the status code, the headers you assert on, and the body. Parse the body with `jq` for the assertion and keep the raw body for the record.

```bash
jq -e '.rows == 60000' /tmp/verify/lane1.body > /dev/null \
  && echo "PASS lane1: row count 60000" \
  || { echo "FAIL lane1: $(jq -c '.' /tmp/verify/lane1.body | head -c 400)"; }
```

## Diagnostics

- status code and the first line of the body on failure
- the server log path
- whether the request reached the server at all (a connection refused is a boot problem, not a behavior result)
- for a webhook, the receiver's record of deliveries, not the sender's log

## Pass predicates

State the status code and the parsed field with its literal value. Assert on the parsed value, never on a substring of the body, because a substring match passes on an error message that happens to quote the expected value.

Beware of asserting on a value the server computed from your own request, such as echoing the input back. Assert on something the server had to decide.

## Common false passes

- Asserted on a 200 from a proxy or a cached response rather than the service.
- The endpoint returned the request body, so the assertion restated the input.
- No baseline request, so a scenario that never reached the code under test still "passed".
- Retried a failed request until one succeeded without recording the failures.

## Cleanup

Stop the server, remove scratch files, and report the artifact directory. If the service writes state to disk or a database, say what the run left behind.
