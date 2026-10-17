### EDAE

**You own the evidence and delivery decision.** 复用 pstack 的调查、设计、执行与验证机制，按风险交付 Evidence-Driven Agent Engineering。

先把下面六条顶层步骤原样写入 `pstack_todo`，`playbook` 为 `edae`。步骤文本保持单行，细则按后面的阶段说明读取。无须新增 Skill、命令、扩展或模型角色。

1. 确定任务边界、风险等级与验收证据。
2. 先建立评估用例、基线与通过条件。
3. 调查现有链路并选择最小设计。
4. 按验证单元实现并记录证据。
5. 验证行为、失败路径与恢复边界。
6. 交付结果并回流发布或事故经验。

**Reply:** 改变了什么、风险等级与理由、实际加载的规范、基线与结果、可定位的证据、跳过项及理由、未验证部分、发布与回滚条件。只报告实测的通过状态。

#### 确定边界

沿用入口的 Repository rules come first。记录目标仓库、当前分支、未提交改动、受影响的用户行为和非目标。调查或设计请求不得自行变成实现或部署。

选择最高适用等级，说明触发原因。新证据改变风险时重新分级，不以工作量代替风险。

| 等级 | 触发条件 | 最小交付 |
|---|---|---|
| 轻量 L | 文档或不改变工具、数据、状态边界的局部低风险调整 | 一个具体验收样例、相关检查、命令与实际结果。可直接写在回复中 |
| 标准 M | 改变 Agent 回答、检索、工具选择、提示词、单任务重试或本地恢复 | 固定回归集、变更前基线、失败路径、可定位的 trace 或脱敏执行记录 |
| 高风险 H | 权限或租户隔离、外部写入、敏感数据、共享状态并发、生产发布、破坏性迁移 | 标准级证据，加授权拒绝用例、隔离或幂等验证、回滚条件与发布决策。只执行与任务有关的检查 |

轻量路径仍保留六条待办。将不适用的基线、实现或发布工作写成有理由的 skip，不制造空报告。标准级和高风险级只加载下表中被任务触发的文件。

| 何时读取 | 文件 |
|---|---|
| 标准级或高风险级的评估设计 | [evaluation.md](../references/edae/evaluation.md) |
| 标准级或高风险级的证据、trace、replay | [evidence.md](../references/edae/evidence.md) |
| SQL、检索、指标、schema、数据版本发生变化 | [data-foundation.md](../references/edae/data-foundation.md) |
| 状态、重试、恢复、并发、Agent 交接发生变化 | [orchestration.md](../references/edae/orchestration.md) |
| 权限、敏感数据、外部副作用或任意高风险任务 | [governance.md](../references/edae/governance.md) |
| 发布、线上事故或已有失败案例需要回归 | [release-incident.md](../references/edae/release-incident.md) |

#### 先评估

实现前写下输入、预期行为或不变量、判定方法和失败阈值。修复缺陷时先保留失败复现。新增能力没有旧基线时，记录当前不支持或现有失败结果，不能虚构对比值。

固定数据和配置，运行与本次行为相关的最小基线。通过条件在看到候选结果前确定。仓库规定的检查仍必须运行。

#### 调查与设计

现有链路不清楚时复用 [how](../../how/SKILL.md)。设计理由决定兼容边界时复用 [why](../../why/SKILL.md)。跨函数边界或改变状态模型时复用 [architect](../../architect/SKILL.md)。它们使用既有角色配置，不在本 playbook 重写调查或面板协议。已在本会话完成且与当前版本一致的调查可以复用，注明文件和版本。

代码先命名数据形状，遵循 [principle-model-the-domain](../../principle-model-the-domain/SKILL.md)。多步骤实现沿用 Feature 的 throughput checkpoint，明确阻塞步骤、独立工作流、共享状态和最小安全拆分。写出接口、失败行为和现有测试入口再实现，不因 EDAE 自动拆成多 Agent。

#### 实现与验证

按 [principle-sequence-verifiable-units](../../principle-sequence-verifiable-units/SKILL.md) 切分变更。需要委派时沿用入口的 Subagents 规则。保留用户未提交改动。每个单元先验证再推进，记录版本、命令、退出状态和产物位置。

在真实调用边界验证成功、拒绝、超时和恢复中与任务相关的路径。结构检查不能替代 Agent 行为评估。无法调用真实模型或工具时，分别标明 mock、离线结果和未验证项，不把它们写成端到端通过。

#### 交付与反馈

交付最小复现、相关回归结果、证据位置和残余风险。标准级和高风险级在目标仓库约定的位置保存记录，不向 pstack 安装目录写任务证据。

发布继续使用 [Shipping](shipping.md)，PR 使用 [Opening a PR](opening-a-pr.md)。仅在任务授权范围内执行。事故诊断继续使用 [Runtime forensics](runtime-forensics.md) 或 [Trace forensics](trace-forensics.md)，修复和回归再回到 EDAE。失败案例脱敏后进入固定回归集，不自动改变生产配置。
