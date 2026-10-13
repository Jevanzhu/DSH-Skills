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
- `skills/agent-notes/SKILL.md`、`skills/project-harness/SKILL.md`：两个 skill 的正文，改动前先读对应 SKILL.md 与其 references。
