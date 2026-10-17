# Adapter: browser and Electron UI

## Boot

Boot the app, then wait for a selector rather than a timeout.

```js
// scripts/verify/lane.mjs, run with: node scripts/verify/lane.mjs
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid=app-ready]", { timeout: 15000 });
```

Where the project already has a driver, use it. Where it has a test runner with a browser mode, drive through that instead of adding a second stack.

## Input

Drive through the visible control a user would use. A click on a button exercises the handler, the validation, and the render. A direct call into the module exercises none of them.

```js
await page.getByRole("button", { name: "Export" }).click();
await page.waitForSelector("[data-testid=export-done]", { timeout: 15000 });
```

When no accessible handle exists, say so and use the closest stable selector. Do not invent an internal hook for the test.

## Capture

Screenshots are the artifact, one per lane, saved to a path you report.

```js
await page.screenshot({ path: "/tmp/verify/lane1/after.png", fullPage: true });
```

Read the rendered value too, not only the pixels:

```js
const rows = await page.locator("[data-testid=row-count]").innerText();
console.log(`row-count=${rows}`);
```

## Diagnostics

- the browser console log, captured with `page.on("console", ...)` and printed on failure
- failed network requests with `page.on("requestfailed", ...)`
- the DOM state at failure, from a screenshot plus the inner text of the failing region
- the app's own log file

A blank screenshot is a boot or selector failure, not a passing lane. Treat it as `BLOCKED`.

## Pass predicates

State the visible end state a user would recognise, and assert it on a readable value.

| Bad | Good |
|---|---|
| the page loaded | `row-count` reads `60000` and the done state is visible |
| no console errors | the export list contains exactly one entry for `report.csv` |
| looks right | the pixel diff against the baseline is zero |

For a spacing, layout, or styling change, an image diff against a captured baseline is the predicate. Capture the baseline before the change, and never edit the baseline to make a diff pass.

## Common false passes

- A screenshot taken before the interaction settled.
- Asserting on the DOM the test itself rendered, with no interaction.
- The dev server served a stale build, so the previous version passed.
- A pixel diff against a baseline captured after the change.
- Zero diff because both images are blank.

## Cleanup

Close the browser, stop the dev server, and remove scratch profiles. Report the artifact directory and the exact command that reproduces the lane.
