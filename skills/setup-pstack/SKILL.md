---
name: setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Detects your available models and writes the role map that overrides the skill defaults. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Write the role-to-model map into `.pi/settings.json`, under `pstack`, plus the `subagents.agentOverrides` entries pi-subagents reads. Both surfaces are derived from the same map by the `pstack_models` tool, so a role change can never leave one of them stale.

The map is deployment policy, not documentation, which is why no model id appears in any skill file. The defaults live in `roles.example.json` at the package root.

## 1. Detect available models

Call `pstack_models` with `action: "list"`. It returns `provider/model` for every model this session can actually reach. That is the only dependable source, because it reads the live registry.

Never write a model id the list does not contain. The aliases `auto` and `inherit-parent` are always valid even though they are not in the list, and both mean the role runs on the parent chat model.

If the list is empty, stop and tell the operator which providers need credentials. Do not guess at ids.

## 2. Load current state

Call `pstack_models` with `action: "show"`. It returns the map in force and where it came from, project scope before user scope. When nothing is configured it returns the defaults from `roles.example.json`.

A role the map carries that `roles.example.json` does not name is from a retired role. Say so and leave it out of the new map.

## 3. Ask for a budget

Use `ask_user_question` rather than free text. Offer these four labels, and name the current budget when the map records one. With no map, say that `large` matches the skill defaults.

- `unlimited, max reasoning`
- `large, xhigh reasoning`
- `medium, high reasoning`
- `small, medium reasoning`

The budget sets the effort token on every real slug, panel entries included. An operator who pinned a level on one role keeps it.

## 4. Confirm the roles

Show every role with its model, and mark any real slug that is not in the detected set. Ask whether to accept as-is or change specific roles, offering the detected models plus `auto` and `inherit-parent`.

For panel roles the value is a list, and one subagent runs per entry, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena picks one entry whose family differs from the parent's when it can. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

## 5. Apply, and let the tool refuse

Call `pstack_models` with `action: "apply"`, the chosen `budget`, and any `overrides`. Add `scope: "user"` to write the user settings instead of the project's.

The tool validates before writing and refuses a map that names an unreachable model, so an invalid change leaves the file untouched and reports which role failed. Report the resulting `file` and the `changed` count.

Re-running is safe. A budget replaces the effort token rather than stacking a second one, and the write overwrites the map instead of appending to it.

## 6. Report

Name the file written, the budget, and every role whose model changed. If the operator kept a role on `auto` or `inherit-parent`, say that it follows the parent chat model. Never claim a role was configured when the tool refused it.
