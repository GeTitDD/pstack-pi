// Reproduce-and-fix automation for the benny pack.
//
// Deliberately separate from triage: this one may prepare a draft fix, so it runs on its own
// schedule and its own budget. See triage.js for why each automation owns a script.
//
// Arm it with:
//   subagent({ action: "schedule.create", workflow: "automations/benny/workflows/reproduce.js",
//              args: { config: "<repo-relative config path>" }, options: { every: "1h" } })
const config = args?.config ?? "";
const task = [
	"Read and follow `.pi/automations/benny/skills/reproduce-and-fix-issues/SKILL.md` for this run.",
	config ? `Configuration source: \`${config}\`.` : "No committed configuration path was supplied, so ask before acting.",
	"Reproduce through the configured control adapter before changing anything. Open a draft PR at most, never a ready one, and report what you actually ran.",
].join("\n\n");
return runs.run("reproduce", { agent: "delegate", task });
