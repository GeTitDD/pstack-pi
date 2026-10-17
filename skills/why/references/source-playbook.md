# Source playbooks

The why skill spawns one investigator per available evidence category, each reading a single source-specific playbook below. The playbooks are concrete examples for common MCPs. Adapt them for a different MCP in the same category.

This port ships two of the seven category playbooks. The other six are not ported here, so a category whose playbook is missing gets recorded as a gap in Sources Consulted rather than improvised.

| Category | Playbook | Example MCP it documents |
|---|---|---|
| Source control history | [`code-archaeology.md`](./sources/code-archaeology.md) | git, `gh` |
| Issue / ticket tracker | not ported in this port | Linear, Jira, GitHub Issues, Plane, Shortcut |
| Long-form documents | not ported in this port | Notion, Confluence, Google Docs, Coda |
| Real-time team chat | not ported in this port | Slack, Discord, Microsoft Teams, Mattermost |
| Infrastructure observability | not ported in this port | Datadog, New Relic, Honeycomb, Grafana, Splunk |
| Error / exception tracking | not ported in this port | Sentry, Rollbar, Bugsnag, Airbrake |
| Product analytics warehouse | not ported in this port | Databricks SQL, Snowflake, BigQuery, ClickHouse, dbt |

Cross-cutting:

- [`incident-postmortem.md`](./sources/incident-postmortem.md). Add this if the target code looks defensive (null checks, retry, timeout, rate limit, feature flag, egress guard, OOM handler).
