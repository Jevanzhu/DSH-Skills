# DSH-Skills

从 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的工程治理实践中蒸馏出的两个 agent skill：纯 Node 直跑、零 npm 依赖、可整包复制进任何仓库。

| skill | 拥有什么 |
|---|---|
| `agent-notes` | 决策记录的格式与生命周期：`{lifecycle}/{class}/yyyy-mm-dd-topic.md`、骨架强制、中英双语配对与一致性记录、冻结归档 |
| `project-harness` | 规则住在哪里、怎么强制：AGENTS.md 分层、文档字数预算、Markdown 门禁、bootstrap 脚手架、统一 gate runner |

两个 skill 互相配合：`project-harness` 决定「规则住在哪个文件」，`agent-notes` 决定「一条决策怎么被记录」；`bootstrap.ts` 会把 `agent-notes` 的门禁脚本一并复制进目标仓库——门禁必须能在没装 skill 的克隆与 CI 里独立运行。

## 结构

```
skills/                      # 技能本体；源码布局，安装时复制到目标仓库的 .agents/skills/
  agent-notes/               #   SKILL.md + references/ + scripts/ + templates/
  project-harness/           #   SKILL.md + references/ + scripts/ + templates/
docs/                        # 本仓自己的文档链：索引 / 活账 / 槽位目录（规则见 doc-lifecycle）
scripts/structure.spec.ts    # 仓库自身的不变量守卫（共享文件逐字节一致等）
scripts/harness/             # 本仓自己的检查声明：各道门读的 manifest
```

`.agents/` 是**安装位置**而不是源码位置：它给消费方仓库用，被客户端当作技能目录扫描。正本仓不占这个路径，避免本仓的技能被当成已安装技能加载，也避免源码布局与安装布局混为一谈。脚本一律按「相对于自身 skill 目录」解析，因此两份布局都跑得通。

## 装进一个仓库

```sh
mkdir -p <repo>/.agents/skills
cp -r skills/. <repo>/.agents/skills/
node skills/project-harness/scripts/bootstrap.ts --target <repo> --dry-run
node skills/project-harness/scripts/bootstrap.ts --target <repo>
```

bootstrap 会铺 `.agents/notes/` 生命周期树、写 `harness.json`（主语言与配对开关）、复制门禁脚本到目标仓库的 `scripts/harness/`，并按 `--adopt` 与否决定既有违规是入账还是直接红。

## 跑测试

```sh
npm test      # node --test：agent-notes 门禁负向对照 + 仓库结构守卫 + 门禁脚本各套
npm run check # run-gates 的 text 模式：文本面门禁，跑哪些以门禁表为准
```

`run-gates.ts` 底部的门禁表是本仓检查的唯一声明点，`npm run check` 与 CI 只是它的一层壳：`text` 模式（7 道）是每次改动都跑的文本面规则，`doc-quick`（10 道）是交付给采用方的秒级聚合，`check-all` 是全量、留给采用方按技术栈往里加构建与测试门。两个数都是**下限**而不是目标——规则只增不减，加规则就往门禁表里加一门，删门要被 `verify-doc-claims.ts` 抓住。

新增或修改门禁规则时必须带**负向对照**用例：正向绿、反向红，缺一不可。

## 与上游的关系

实践与阈值蒸馏自 deepseek-harness（归档的 533/248 校准、2772 条封存记录、门禁的诚实边界等），但本仓是**免依赖重写**：无 mdast 等第三方依赖，门禁以行级解析近似上游的块级语义；有意简化处写在对应模块头注与 references 里（例：活跃配对记录按空行分块而非 AST 节点切块，见 `pair-record.ts`）。上游为 MIT 许可，版权归其作者所有。

## 状态

公开仓库：[Jevanzhu/DSH-Skills](https://github.com/Jevanzhu/DSH-Skills)，MIT 许可（见 `LICENSE`）。
