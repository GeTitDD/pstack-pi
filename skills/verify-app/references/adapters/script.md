# Adapter: library, data pipeline, no running surface

Use this adapter when there is nothing to boot. It is the weakest of the four, so state that plainly in the report rather than presenting it as a live lane.

## Boot

None. Say "no surface to boot" so a reader knows the lane is weaker than a driven one.

## Input

Write one script that calls the code the way a caller would, end to end, from the public entry point. Do not call an internal function to shorten the path, because the path is what is under test.

```js
// scripts/verify/roundtrip.mjs
import { parse, render } from "../../dist/index.js";

const input = "a,b\n1,2\n";
const output = render(parse(input));
if (output !== input) {
  console.error(`FAIL roundtrip\n  in:  ${JSON.stringify(input)}\n  out: ${JSON.stringify(output)}`);
  process.exit(1);
}
console.log("PASS roundtrip: output equals input");
```

Commit the script when the work outlives the session. A committed script is what turns "trust me" into "run this".

## Capture

Print one line per assertion with the literal values. Exit non-zero on the first failure so a caller can chain the script.

## Prefer real data over fixtures you wrote

The strongest version of this adapter replays a **real** artifact: a recorded response, an exported file, a production sample. A fixture the same change produced proves only self-consistency.

When the change is an equivalence or migration, capture the baseline from the pre-change state and diff old against new:

```bash
git stash --include-untracked
node scripts/verify/roundtrip.mjs > /tmp/verify/before.txt
git stash pop
node scripts/verify/roundtrip.mjs > /tmp/verify/after.txt
diff -u /tmp/verify/before.txt /tmp/verify/after.txt
```

An empty diff is the predicate for a behavior-preserving change. A non-zero diff is a finding, not noise, until each hunk is explained.

## Diagnostics

- the failing assertion's literal values, printed by the script
- for a diff, the first hunk, not the whole diff
- the input artifact path, so the run is reproducible

## Pass predicates

Assert on a literal expected value. The test that must be rejected: would it still pass if every imported function returned `undefined`? If yes, rewrite or delete it. See the **principle-test-behavior-not-implementation** skill.

## Common false passes

- Expected value computed by the code under test, as in `expect(f(a)).toBe(f(a))`.
- Asserting only that a function was called, or that a value is defined.
- A fixture that the change itself regenerated.
- The script exiting 0 because it never reached the assertion.

## Honest reporting

Mark the lane as a scripted check rather than a live pass, and name what a live lane would have added that this one cannot. A reader with that sentence can decide whether the evidence is enough.
