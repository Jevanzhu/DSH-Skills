# 项目指引（治理正本）

本仓是两个 agent skill 的**正本**（唯一维护地）。目标仓库安装的是副本，副本内的改动不回灌。

## 恒常纪律

- **改门禁必跑全量**：任何 `scripts/` 或 `SKILL.md`/`references/` 改动，`npm test` 全绿才算完。
- **负向对照必带**：新增或修改一条门禁规则 = 一条它变红的用例；正向绿、反向红都演示过才收口。
- **共享文件逐字节一致**：`harness-root.ts` 在每个 skill 下各持一份，必须逐字节相同（安装器按「复制一次」的假设计算）；由 `scripts/structure.spec.ts` 钉住。
- **规则与文档同批**：门禁行为变了，SKILL.md 与对应 references 同批更新；模板的骨架（标题、状态行、记录文法）与 `aliases.ts` 的别名表不许漂移。
- **双语按需**：双语契约全文只住 `agent-notes/references/bilingual.md`；常读文档只留指针与启用条件。
- 提交说明不引作者指令原文，决策以结论转述。

## 入口

- `README.md`：结构、安装、测试、与上游的关系。
- `docs/README.md`：本仓文档链——活账、执行档、设计档；未了结事项先在活账立一行。
- `skills/agent-notes/SKILL.md`、`skills/project-harness/SKILL.md`：两个 skill 的正文，改动前先读对应 SKILL.md 与其 references。

## 本文件的维护

本仓的工作语言声明在这里：**中文**——文档、提交信息与指令文件同一种语言，别处不再重复声明；换语言是整棵树的显式迁移，不是逐文件漂移（判据见 [语言策略](skills/project-harness/references/language-policy.md)）。**指令面永不配对**：本文件与两个 `SKILL.md` 各只有一份；需要双语的知识住在对照面，配对与一致性记录只在那边。

只放规则，不放决策。逐条问：「这条改了，需要谁点头？」没人点头、跑一遍 `npm test` 就绿的是规则，留在这里；需要有人被说服的是决策，写进 [docs/03-设计/](docs/03-设计/) 并在这里留一句指针。
