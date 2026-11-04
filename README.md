# DSH-Skills

从 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的工程治理实践中蒸馏出的一个 agent skill：决策记录与工程治理门禁装在同一份技能里，纯 Node 直跑、零 npm 依赖、可整包复制进任何仓库。运行要求（Node 版本下限）以 `package.json` 的 `engines` 为准——门禁是 TypeScript 源文件直跑，靠 Node 的类型剥离特性。

| skill | 拥有什么 |
|---|---|
| `dsh-project-harness` | **决策记录**：`{lifecycle}/{class}/yyyy-mm-dd-topic.md`（目录与文件名主干随语料语言，英文 `implemented/feature/` ↔ 中文 `已实施/功能/`）、骨架强制、中英双语配对与一致性记录、冻结归档。**工程治理**：规则住在哪里、怎么强制——AGENTS.md 分层、文档字数预算、Markdown 门禁、bootstrap 脚手架、统一 gate runner、代码评审、测试可靠性、agent 派发纪律 |

一份技能同时承载两个职责域：决策记录决定「一条决策怎么被记录、推翻与归档」，工程治理决定「规则住在哪个文件、怎么变成可执行的检查」。两域的分界与冲突裁决写在 `SKILL.md` 的「整合与上游」一节。`bootstrap.ts` 会把两域的门禁脚本一并复制进目标仓库——门禁必须能在没装 skill 的克隆与 CI 里独立运行。

## 结构

```
skills/                      # 技能本体；源码布局，装到各客户端的用户级根
  dsh-project-harness/       #   SKILL.md + references/ + scripts/ + templates/ + VERSION
docs/                        # 本仓自己的文档链：索引 / 活账 / 槽位目录（规则见 doc-lifecycle）
scripts/structure.spec.ts    # 仓库自身的不变量守卫（frontmatter name、模板双语配对、门禁可被调用）
scripts/harness/             # 本仓自己的检查声明：各道门读的 manifest
```

技能装在哪由客户端的用户级根决定，本仓不占这些路径：正本只在这里维护，安装副本落在 `~/.agents/skills`、`~/.claude/skills`、`~/.codebuddy/skills` 之类的目录。项目里没有技能目录也是正常形态——bootstrap 只往项目写 `scripts/harness/` 的校验器与文档骨架，不读也不写任何 skills 目录。脚本一律按「相对于自身 skill 目录」解析，所以换安装位置不需要改项目。

## 装到用户级，再初始化一个仓库

技能是机器级配置，不是仓库的产物。正本留在这里，给每个实际用到的客户端各放一个入口：

```sh
git clone <repo> ~/src/DSH-Skills
for r in ~/.agents/skills ~/.claude/skills ~/.codebuddy/skills; do
  mkdir -p "$r"
  ln -sfn ~/src/DSH-Skills/skills/dsh-project-harness "$r/dsh-project-harness"
done
```

同一台机器上多个客户端各读自己的根，指向同一份内容，所以升级只更新正本（`git pull`）。初始化只改目标仓库，不读取也不写入任何 skills 目录：

```sh
node <skill-dir>/scripts/bootstrap.ts --target <repo> --dry-run
node <skill-dir>/scripts/bootstrap.ts --target <repo>
```

把技能复制进仓库（`<repo>/.agents/skills/`）是另一回事，只在需要钉住版本、或 CI 环境里没有技能安装时这么做——那份副本会遮蔽用户级同名技能，所以两个位置不要同时维护。

bootstrap 会铺 `.agents/notes/` 生命周期树、写 `harness.json`（主语言与配对开关）、按 `--notes-language` 选语言的起步模板（`AGENTS`、`docs/AGENTS`、`lefthook`），并复制门禁脚本到目标仓库的 `scripts/harness/`，按 `--adopt` 与否决定既有违规是入账还是直接红。

升级已装的仓库用同一命令加 `--force`：它只刷新 `scripts/harness/` 下的校验器副本，你在各 manifest 里的申报（文档索引、宣称清单、注释规则、预算、测试面）不受影响，删掉的起步文档也不会被复活（它们只在首次铺装时写入）；要按当前实测的树重新生成那些 manifest，用独立且破坏性的 `--reset-manifests`。装完读目标仓库的 `scripts/harness/version.json` 就知道装的是哪一版。

## 跑测试

```sh
npm test      # node --test：门禁负向对照 + 仓库结构守卫 + 门禁脚本各套
npm run check # run-gates 的 text 模式：文本面门禁，跑哪些以门禁表为准
```

本仓**不设 CI**：门禁只在本地跑，提交前自己跑一遍这两条。仓库自己的检查以本地为准，采用方的仓库要不要接 CI 由采用方定（本 skill 的 doctrine 里，CI 是「本地薄」的另一半，不是本仓的义务）。

`run-gates.ts` 底部的门禁表是本仓检查的唯一声明点，`npm run check` 与 CI 只是它的一层壳：`text` 模式（8 道）是每次改动都跑的文本面规则，`doc-quick`（11 道）是交付给采用方的秒级聚合，`check-all` 是全量、留给采用方按技术栈往里加构建与测试门。两个数都是**下限**而不是目标——规则只增不减，加规则就往门禁表里加一门，删门要被 `verify-doc-claims.ts` 抓住。

新增或修改门禁规则时必须带**负向对照**用例：正向绿、反向红，缺一不可。

## 与上游的关系

实践与阈值蒸馏自 deepseek-harness（归档的 533/248 校准、2772 条封存记录、门禁的诚实边界等），但本仓是**免依赖重写**：无 mdast 等第三方依赖，门禁以行级解析近似上游的块级语义；有意简化处写在对应模块头注与 references 里（例：活跃配对记录按空行分块而非 AST 节点切块，见 `pair-record.ts`）。上游为 MIT 许可，版权归其作者所有。

本仓早期以 `agent-notes` 与 `project-harness` 两个分离技能发布，`0.1.11` 起统一为单一技能：资源逐字节并入本包，`SKILL.md` 是合并叙述的门面，构建镜像与逐字节一致性门禁随之退役。

## 状态

当前版本 0.1.13（`skills/dsh-project-harness/VERSION`，随 skill 目录一起复制）：凡是改动 `scripts/`、`SKILL.md`、`references/` 或 `templates/` 下任何文件，都同批动它。

公开仓库：[Jevanzhu/DSH-Skills](https://github.com/Jevanzhu/DSH-Skills)，MIT 许可（见 `LICENSE`）。
