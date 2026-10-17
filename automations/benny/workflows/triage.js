// Triage automation for the benny pack.
//
// pi-subagents fires a scheduled run by script path, not by prompt text, so each automation
// needs one of these. The script does nothing but hand the pack's own skill to a child, which is
// what keeps the automation and the interactive path reading the same instructions.
//
// Arm it with:
//   subagent({ action: "schedule.create", workflow: "automations/benny/workflows/triage.js",
//              args: { config: "<repo-relative config path>" }, options: { every: "15m" } })
const config = args?.config ?? "";
const task = [
	"Read and follow `.pi/automations/benny/skills/triage-issue-reports/SKILL.md` for this run.",
	config ? `Configuration source: \`${config}\`.` : "No committed configuration path was supplied, so ask before acting.",
	"Report the thread-only verdict you posted and the evidence it rests on. Post nothing outside the source thread.",
].join("\n\n");
return runs.run("triage", { agent: "delegate", task });
