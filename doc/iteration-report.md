# PJ1 Phase 2 迭代报告

**基线**：Phase 1 提交 `final`（`a3761d3`，54 个测试全绿，零运行时依赖）
**终点**：Phase 2 提交链末端，标签 `p2`（125 个测试全绿，零运行时依赖）
**约束**：Phase 1 行为不可变——未加载任何插件时一切输出与 `final` 逐字节相同

---

## 1. 目标与验收口径

Phase 2 要求把 Phase 1 的单体 CLI 改造成**插件化架构**，四个扩展点各至少一个真实实现，两种装配方式（改代码 / 改配置）产出相同结果，并附上 VSCode 扩展实践。

验收口径（全部可执行验证，不靠人工判断）：

| # | 口径 | 验证方式 | 结果 |
|---|---|---|---|
| 1 | 四个扩展点各有一个非平凡实现 | 见 §4 表格 | ✅ 4/4 |
| 2 | 两种装配方式的输出逐字节相同 | `tests/assembly.test.ts` 起真实进程比较 | ✅ |
| 3 | 未加载插件时与 Phase 1 一致 | 直接用 worktree 编译 `final` 并**逐字节比对进程输出**（§5.3.1）：4 个示例脚本 + 5212 字节错误路径矩阵 + 保存的 SVG 全部相同；唯一差异是 `help` 列宽缺陷的有意修复 | ✅ |
| 4 | 接入插件不需要改内核 | `git show --stat c082226 -- src` 输出为空 | ✅ |
| 5 | 错误可区分 | `unknown command` / `unknown shape type` / `duplicate registration` / `cannot load plugin` | ✅ |
| 6 | 注册原子性 | 冲突或 activate 抛错时不留半个插件 | ✅ |
| 7 | 分层依赖不倒挂 | `npm run check:layers`（76 文件，0 违规） | ✅ |

---

## 2. 架构对比：Phase 1 → Phase 2

### 2.1 Phase 1（单体，命令表写死在装配处）

```
                    ┌───────────────────────────────┐
                    │        src/main.ts            │  组合根
                    └───────────────┬───────────────┘
                                    │ new EditorSession / new CommandDispatcher
    ┌───────────────────────────────▼───────────────────────────────┐
    │ src/cli  CommandDispatcher                                    │
    │   ⚠ 内置命令表硬编码：init/read/save/create/… 20 条            │
    │     switch (name) → new CreateShapeCommand(...)               │
    └───────────────────────────────┬───────────────────────────────┘
                                    │
    ┌───────────────────────────────▼───────────────────────────────┐
    │ src/core   ShapeTypeRegistry                                  │
    │   ⚠ 图形类型在注册时写死：rect/circle/ellipse/line/polyline/   │
    │     text/g，new 出来直接注册                                  │
    │ src/render TreeRenderer                                       │
    │   ⚠ if (shape.typeName === 'g') … 结构树标签逻辑内联在渲染器   │
    └───────────────────────────────────────────────────────────────┘

  扩展一个新图形类型需要改：ShapeTypeRegistry 装配处 + TreeRenderer + 可能还有
  SvgWriter；扩展一个命令需要改：CommandDispatcher 的命令表。
```

### 2.2 Phase 2（插件化，内核只认接口）

```
        ┌──────────────────────────────┐        ┌───────────────────────────┐
        │ 方式 A  src/main-code.ts      │        │ 方式 B  src/main.ts        │
        │  import box/stats/dir         │        │  --config plugins.json    │
        │  assembleCli({plugins})       │        │  core: ManifestLoader     │
        └───────────────┬──────────────┘        │  host: NodeModuleLoader   │
                        │                       └─────────────┬─────────────┘
                        │                                     │
                        └──────────────┬──────────────────────┘
                                       │  同一条加载路径
                        ┌──────────────▼──────────────┐
                        │ src/host/assemble.ts        │
                        │   activatePlugin():         │
                        │   begin → activate → commit │  ← 原子性
                        └──────────────┬──────────────┘
                                       │
   ┌───────────────────────────────────▼────────────────────────────────────┐
   │  src/core/plugin/ExtensionRegistry  （PluginContext 的实现）            │
   │   暂存区 ──commit──▶ ④张注册表                                          │
   │   ① shapes      ② commands      ③ decorators      ④ attributes          │
   └───┬─────────────────┬──────────────────┬──────────────────┬────────────┘
       │                 │                  │                  │
   ┌───▼──────┐   ┌──────▼───────┐   ┌──────▼───────┐   ┌──────▼────────┐
   │ShapeType │   │CommandDispat │   │TreeRenderer  │   │SetAttributeCmd│
   │Registry  │   │cher          │   │              │   │               │
   │ 无switch │   │ 无内置表     │   │ 只拼 suffix  │   │ 首个命中独占  │
   └───┬──────┘   └──────┬───────┘   └──────┬───────┘   └──────┬────────┘
       └─────────────────┴──────────────────┴──────────────────┘
                                       │  只依赖接口
   ┌───────────────────────────────────▼────────────────────────────────────┐
   │  plugins/                                                              │
   │   shape-box:      BoxProvider + BoxFillHandler + BoxLabelHandler        │
   │                   + BoxTypeLabel   （四类扩展点用了三类）                │
   │   command-stats:  StatsCommand（CommandExtension）                       │
   │   command-dir:    DirCommand + DirectoryAccess（适配器模式）             │
   │   builtinPlugin:  Phase 1 的 6 种图形 + 20 条命令，降级为普通插件         │
   └────────────────────────────────────────────────────────────────────────┘
```

### 2.3 关键变化

| 维度 | Phase 1 | Phase 2 | 为什么要变 |
|---|---|---|---|
| 命令表 | `CommandDispatcher` 里硬编码 20 条 | `CommandRegistry`，内置命令也是插件 | 让"加命令"不再需要改 CLI 层 |
| 图形类型 | 装配处 `new` 列表 | `ShapeProvider` 注册 + 参数 schema | 让"加类型"不再需要改内核 |
| 结构树标签 | `TreeRenderer` 里的 `if typeName === 'g'` | `TreeDecorator.suffix()` 链式拼接 | 让"改显示"不再需要改渲染器 |
| 未知属性 | `set` 直接拒绝 | `AttributeHandler` 首个命中独占 | 让插件定义新属性语义 |
| 插件失败 | —— | 暂存式注册，全有或全无 | 半个插件比没有插件更糟 |
| 装配 | 只有一种 | 改代码 / 改配置两条路，同一加载路径 | 交付方式不必重新编译 |

**内核行数增量**：2593 → 3443（+850 行），其中大部分是四个接口 + 注册表 + 清单加载器 + 注释。
**插件行数**：0 → 768（三个插件 + 装配侧内置插件）。

---

## 3. 迭代过程（提交链）

每一个提交都是一个**可运行、测试全绿**的状态；顺序即实际开发顺序。

| # | 提交 | 内容 | 测试数 | 说明 |
|---|---|---|---|---|
| 0 | `47b23c6` | `feat(framework)`: 四个扩展点 + 注册表 + 暂存注册 | 60 | Phase 1 命令迁入 `builtinPlugin`；54 个旧用例除一处构造参数外原样通过 |
| 1 | `1f5761d` | `feat(vscode)`: `.svg` 徽标 + 结构大纲 | 60 + 5 | VSCode 扩展独立编译与测试 |
| 2 | `d7a409c` | `feat(plugins)`: `stats`、`dir`（含目录适配器） | 70 | 两个命令插件，`dir` 用适配器隔离文件系统 |
| 3 | `dd9286c` | `feat(framework)`: 标签变体 / 派生 id / 子部件保护 | 70 | 为"零内核改动接入 box"预先准备通用钩子 |
| 4 | `c082226` | `feat(plugins)`: `box` + fill/label 处理器 + `(box)` 标签 | 80 | **本提交对 `src/**` 改动为 0** |
| 5 | `d3f9727` | `test(composition)`: 跨插件组合与基线回退 | 87 | 缺插件时的两类错误、装饰器移除后回到基线 |
| 6 | `bcdfcb7` | `feat(config)`: JSON 清单加载器 + 第二种装配 | 99 | 两种装配逐字节相同的自动化证明 |
| 7 | `5bfebbb` | `docs`: 扩展点清单、迭代报告、ADR、指标 | 102 | 打标签 `p2` |
| 8 | `e640f69` | `docs(phase2)`: 校正文档中三处夸大表述 | 102 | 让每个判据都能被命令复现 |
| 9 | 本次 | `fix(debug)`: 复合图形四类操作保护 + 装配失败即退出 + help 列宽 | 123 | 全面 debug 的产物，见 §5.1.1；`p2` 随之前移 |

### 3.1 过程中的四次真实返工（都已固化在提交链里）

1. **`SetAttributeCommand` 签名变更**带来 Phase 1 测试的编译错误。处理方式不是改期望值，
   而是在构造调用里补上显式的 `null` 处理器与空上下文（`findShape: () => null, touch: () => {}`）。
   **`tests/command.test.ts` 是唯一被修改的 Phase 1 测试文件，diff 为 6 增 1 删，全部是构造参数**；
   所有 `assert` 断言与期望字符串一字未动——这是"行为没漂移"的证据形式。
2. **共用元素标签**：`box` 想序列化成 `<g data-kind="box">`，但 `ShapeTypeRegistry` 原本一个标签只能一个类型。
   先补了通用钩子（提交 3），再写插件（提交 4），而不是在插件里塞内核特例。
3. **Windows 路径与 BOM**：清单加载器最初用 `path` 的语义处理 `\`，导致盘符被当作目录名；
   修好后又在测试中发现 PowerShell 写的 JSON 带 BOM 会让 `JSON.parse` 失败。
   结论是**修产品而不是改测试**——用户手写配置带 BOM 在 Windows 上极其常见。
4. **保护契约写漏了方向**：`protectsChildren()` 最初只挡住"子部件离开"（`delete`/`addto`），
   没挡住"新子部件进来"（`create … in`）和"重新排序"（`front`/`back`），
   于是能构造出"保存成功、读回失败"的自毁文件。这不是测试没写，是**思维没换位**：
   写保护逻辑时只想着已有结构，没想着结构还会被谁改写。补全后新增了 5 组回归用例（§5.1.1）。

---

## 4. 扩展点落地情况

| 扩展点 | 实现 | 内核消费点 | 无需改内核的关键设计 |
|---|---|---|---|
| 图形类型 | `BoxProvider`（+3 可选钩子） | `ShapeTypeRegistry.createShape / resolveProvider` | `matchesElement` 让 `box` 与 `g` 共用标签 |
| 命令 | `stats`、`dir`、以及内置 20 条 | `CommandDispatcher`（已无内置表） | `CommandContext` 只暴露只读视图 |
| 结构树 | `BoxTypeLabel` | `TreeRenderer.suffixFor` | 装饰器返回 `''` 时行尾不加空格，基线不变 |
| 属性 | `BoxFillHandler`、`BoxLabelHandler` | `SetAttributeCommand` 的 handler 分支 | 子树快照保证多字段修改仍是单次 undo；`fill` 翻译成"底板底色 + 标签对比色"两种语义 |

细节（接口签名、错误文案、注册顺序语义）见 [`doc/extension-points.md`](extension-points.md)。

---

## 5. 质量保证手段

### 5.1 测试

148 个用例（`npm test` 一次跑完），分六层：

| 层级 | 文件 | 覆盖 |
|---|---|---|
| Phase 1 回归 | `tests/*.test.ts`（原有） | 54 个用例全部通过，断言期望值一字未改（唯一 diff 是 `SetAttributeCommand` 的构造参数） |
| 框架 | `tests/extensions.test.ts` | 四个扩展点的注册 / 冲突回滚 / 处理器优先级 / 失败回滚 |
| 激活与清单 | `tests/pluginActivation.test.ts` | `activateChecked`：清单逐类比对、`activate` 抛错回滚、重复注册保留先注册者、`options` 原样透传、声明为空也算不一致 |
| 装饰器契约 | `tests/decorators.test.ts` | 无装饰器时行尾不留空格、`onSaved` / `onDocumentReplaced` 复位、多装饰器按注册顺序拼接 |
| 组合 | `tests/composition.test.ts` | 跨插件协作、缺插件退化、顺序无关、基线字节 |
| 装配 | `tests/assembly.test.ts`、`tests/configLoader.test.ts` | **真实 CLI 进程**逐字节比较两种装配；六个规范文案；加载期失败继续启动；相对路径解析；`options` 到达插件 |
| 插件独立测试 | `plugins/*/tests/*.test.ts` | `box`：创建 / 读写往返 / 四类结构保护 / 属性处理器 / undo；`stats`：计数口径；`dir`：适配器（测试替身 + 真实 FS）；`tree-star`：`*` 状态机四分支、祖先传播、与 `(box)` 并存 |
| help 排版 | `tests/help.test.ts` | 用法列宽自适应、说明列对齐、插件命令出现在 help |

Phase 2 新增的测试文件都遵循同一条原则：**断言规范原文里的文案与行为**（而非"当前实现的输出"），
所以每次实现偏离规范，测试都会先一步变红。

### 5.1.1 全面 debug 阶段发现并修掉的 6 个缺陷

代码写完、测试全绿，不等于没有 bug。这一轮专门**换角度攻击**（而不是重跑已有断言），
方法是：写探针脚本把命令组合灌进真实装配，观察不变量是否还能被破坏。

| # | 缺陷 | 表现 | 根因 | 修复 |
|---|---|---|---|---|
| 1 | `create … in <box>` / `addto <box> <x>` 能往 box 里塞第三个子部件 | 之后 `save` 正常、`read` 报 `invalid box`——**用户自己的文件变得读不回来** | 只保护了"删"与"移走"，没保护"加入" | 内核加 `requireAcceptsChildren`：容器 `protectsChildren()` 为真时拒绝加子元素 |
| 2 | `front` / `back` 能打乱 box 的子部件顺序 | 同上，round-trip 直接失败 | 顺序被当作可自由调整的显示属性，但它是 box 不变量的一部分 | `reorder` 前检查父容器保护契约 |
| 3 | `group <newId> <box 的子部件>` 能把必要子部件"借走" | box 少一个子部件，结构损坏 | `group` 内部移出成员，绕过了删除保护 | `group` 对每个成员执行 `requireRemovable` |
| 4 | `help` 用法列固定 46 列，最长用法溢出 | `create <type> <id> [params…] [in <containerId>]create a shape` 说明贴死在用法上 | 列宽写死；Phase 1 遗留 | 列宽改为"最长用法 + 2"，最小 46 |
| 5 | `set <box> fill <浅色>` 把标签文字也染成浅色 | 标签与底色同色，**文字消失** | 处理器把同一个值刷到两个子部件，忽略了 `<text>` 的 `fill` 是"字的颜色" | 先改成"底板收底色、标签收对比色"；**规范对齐轮又改回只改底板**（见 §5.1.2 第 6 条） |
| 6 | `--config` 加载失败后仍进入 REPL | 用户看到 `unknown command: stats` 而非真正的配置错误 | 入口把"装配失败"当成"可继续" | 先改成"失败即退出"；**规范对齐轮又改回继续启动**（见 §5.1.2 第 3 条） |

前 3 个都是**同一个思维盲区**：实现 `protectsChildren()` 时只想到"别让子部件离开"，
没想到"别让新东西进来"和"别重排"。修法把契约补全为四类操作（删/移走/加入/重排），
且仍然只依赖容器自报的布尔值——内核不认识 `box`。

第 4 个是 `final` 上就存在的排版缺陷（Phase 1 遗留）。修它使**当前版本与 `final` 的输出
在这一行不同**——这是唯一一处有意偏离，见 §5.3.1 的逐字节复核说明。

第 5、6 两个缺陷的**修复方向最终被规范否决**，这是本轮最有价值的教训之一：
debug 阶段的两个"更聪明的做法"（自动配对比色、失败即退出）都超出了规范给定的行为契约。
把"我觉得更好"当成"应该如此"，是 AI 协作里最容易发生的越界——判据只能是**规范原文**。

### 5.1.2 规范对齐轮发现并修掉的 8 处违规

功能跑通之后再对着 `phase_cli_2` 原文逐条核对，发现实现层面有 8 处与规范/判据不一致。
它们都不是"跑不起来"，而是"跑起来但不符合契约"——**测试全绿也照样违规**。

| # | 违规 | 规范要求 | 修正 |
|---|---|---|---|
| 1 | 会在 8 处打不开：加载器内建了 `builtin:shape-box → 路径` 的**名称映射表** | 加载器不得硬编码具体插件的分支或映射表（判据直接查这一点） | 删除整张表；claimed 的 `module` 说明符原样交给宿主解析（`./` 相对配置目录、绝对路径原样、其余按包名） |
| 2 | 清单只有 `name`/`entry`/`enabled`，没有 `contributes` | 声明四类贡献，与实际注册**逐类比较**，不一致即失败 | 新增 `PluginActivation.activateChecked`：暂存 → `compareContributions` → 提交/回滚，`stagedNames()` 提供"暂存态"快照 |
| 3 | 加载失败即退出（退出码 1） | 四类失败必须打印 `error:` 并**继续启动，主程序不得退出** | `main.ts` 重写：错误行进 prelude，REPL 照常启动；只有用法错（`--config` 缺参数）才退出 2 |
| 4 | 错误文案是自造的（`cannot read plugin config`、`cannot load plugin …`） | 六个固定文案逐字一致 | 全量替换为 `plugin not found: <module>`、`plugin has no default export: <module>`、`plugin manifest mismatch: <name> (declared: …; registered: …)`、`plugin failed to activate: <name> (<reason>)`、`duplicate registration: <category>/<name>`、`invalid plugin config` |
| 5 | 配置在 `config/plugins.json`，键名是 `entry`/`config`，且没有 `contributes` | 清单结构为 `plugins[].{name, module, options, enabled, contributes}` | 新建仓库根 `plugins.config.json`，删除旧文件；`entry`/`config` 保留为兼容别名 |
| 6 | `set fill` 顺手改了标签字色 | "实际修改"写死为 `n1-rect` 的 `fill` | 收敛回只改底板；对比色构想以 "known limitation" 记入 ADR-4，而不是留在代码里 |
| 7 | `modified-star` 只是测试里的匿名对象，不是插件 | 三处：`contributes.decorators: ["modified-star"]`、`suffix` 返回 `*`、状态封装在实例里、**独立插件包 + 独立测试** | 新建 `plugins/tree-star`（含 `contributes`、独立状态机测试）；内核只加一个通用钩子 `onEdited` 广播"哪些 id 被改过" |
| 8 | VSCode 选择器 `**/*.svg` 匹配不到工作区**根目录**的 `a.svg` | 打开 `.svg` 必须能出大纲与徽标 | 选择器补 `{ pattern: '*.svg' }`，并在 `analysis.md` 记录"自定义编辑器接管 `.svg` 时无大纲"这条运行期约束 |

第 1、2 条是这次审计的核心收获：**判据查的是"代码里有没有那张表"**。
只要表还在，无论它被多少测试覆盖，这一项就是 0 分。同理，`contributes` 比对不是"锦上添花的校验"，
而是规范要求的装配协议——插件声明什么，就必须精确注册什么。

第 7 条牵出一个设计判断：`*` 的 dirty 语义（"内容变了" vs "发生过编辑"）规范留了选择空间，
但要求写进 ADR。选择了后者（`undo` 不撤销 `*`），因为它不需要在渲染路径上做内容快照，
且判据里的"编辑 → 保存 → 再编辑 → `undo`"四个分支都能被独立测试断言。见 ADR-10。

### 5.2 自动化闸门（`npm test` 一次跑完）

```
tsc（strict, noUnusedLocals, noUnusedParameters, noFallthroughCasesInSwitch）
  → check-dependencies.mjs   零运行时依赖 + 内核不 import node 内置模块
  → check-layers.mjs         分层依赖 0 违规（内核不依赖上层/插件，插件不碰装配层）
  → node --test              148 个用例
```

`check-layers.mjs` 是这次新增的：把"插件化"从口头约束变成 CI 约束。
需要说清它的能力边界——它检查的是 **import 关系**（内核不 import 上层或插件、插件不 import 装配层），
**不检查**"内核里内联写了某个具体类型名"。后者目前只能靠人工 grep 与代码审查保证：

```bash
# 期望没有任何命中（注释除外）
grep -rn "'box'\|'stats'\|'dir'" src/core src/app src/render src/io
```

**双装配一致性的独立判据**（不依赖测试框架，直接对真实进程）：

```bash
node scripts/compare-assembly.mjs
# ok   cli-1.txt：27 行输出逐字节相同（退出码 0）
# ok   cli-2.txt：8 行输出逐字节相同（退出码 0）
# ok   cli-3.txt：25 行输出逐字节相同（退出码 0）
```

会话输入放在 `doc/transcript/cli-{1,2,3}.txt`，只含命令与 `#` 注释（不含 `svg>` 提示符与示例输出），
因此同一份输入可以喂给任意装配方式。

### 5.3 指标（由 `scripts/metrics.mjs` 从 git 历史生成，不接受手填）

| 类别 | 基线行数 | 当前行数 | 判断点增量 |
|---|---|---|---|
| 内核（core/app/io/render） | 2593 | 3711 | 见 `docs/metrics/metrics.md` |
| 装配处（cli/host/入口） | 431 | 709 | |
| 插件（plugins/） | 0 | 1049 | |
| VSCode 扩展 | 0 | 604 | |
| 其他（测试/脚本/文档） | 955 | 2065 | |

（数字来自 `docs/metrics/metrics.md`，由 `node scripts/metrics.mjs --base final --head WORKTREE` 生成。）

指标不用于评分，用于回答"复杂度去了哪里"：**新增复杂度主要落在插件与测试**，
内核增量集中在四个接口、两个注册表与一个激活校验函数；装配处只涨了 278 行
（清单加载桥接 + 第二个入口 + 入口的失败策略 + 模块加载适配）。

### 5.3.1 与 `final` 的逐字节复核（verify 阶段的做法与结论）

"未加载插件时与 Phase 1 一致"这句话不是靠"旧测试还绿"推断的，而是**直接比对两个版本的进程输出**：

1. `git worktree add $TEMP\svgfinal final`，用同一份 `tsc` 编译出 Phase 1 的 `dist/`；
2. 准备一份覆盖全部错误路径的脚本（`canvas/init/create/move/scale/set/show/tree/group/ungroup/addto/front/back/delete/undo/redo/save/read/help`，
   含参数个数错、非法数值、未闭合引号、空行、注释行等，共 5212 字节输出）；
3. 两个版本在**同一工作目录**里回放，`Out-File` 落盘后做 `-ceq` 全等比较；
4. 再比 `examples/*.txt` 四个示例脚本，以及保存出来的 SVG 文件本身。

结论：

| 比对对象 | 结果 |
|---|---|
| `examples/flowchart.txt`、`hello.txt`、`other-session.txt`、`plugin-demo.txt` | 逐字节相同（4/4） |
| 5212 字节的错误路径回归矩阵 | 除 `help` 段外逐字节相同 |
| 保存的 SVG 文件（含 box 序列化） | 逐字节相同 |
| 唯一差异 | `help` 的用法列宽（缺陷 5 的有意修复）；差异**完全落在 `commands:` 到 `notes:` 之间**的 19 行，其前后内容 `-ceq` 全等 |

### 5.4 判据自检

- **内核里没有任何具体类型名分支或映射表**：`src/core`、`src/app`、`src/render`、`src/io` 里
  `grep -rn "'box'\|'stats'\|'dir'"` 无命中（注释除外），加载器里也没有"插件名 → 路径"的表；
- **插件不能绕过原子性与清单校验**：`activateChecked` 是唯一加载路径（两处入口都走它），
  方式 B 的插件也必须先通过 `contributes` 比对才能提交；
- **加载期失败不阻断启动**：四类失败 + 配置非法都只打印 `error:` 行，REPL 与内置能力照常可用；
- **缺插件时错误可区分**：`unknown command: …` 与 `unknown shape type: … (is the plugin loaded?)` 分开报；
- **复合图形内部结构四类操作全部被拒**（加 / 删 / 移走 / 重排），`save` 后的文件一定能 `read` 回来；
- **Phase 1 行为不变**：`tests/transcript.test.ts` 等 Phase 1 用例的断言**一个字符都没改**即全绿；
  不加载可选插件时 `tree` 与 Phase 1 逐字节相同（`tests/decorators.test.ts` 用根行与行尾空格锁住）；
- **两种装配方式逐字节等价**：`tests/assembly.test.ts`（真实进程）+ `scripts/compare-assembly.mjs`（三个会话）。

---

## 6. 已知边界

1. **`module` 必须指向可 `require` 的 JS**：源码是 TypeScript，所以仓库内的插件都配置到
   `./dist/plugins/<包>/src/index.js`；外部插件同理需要先编译。这条规则写在清单文档与错误信息里，
   装配时不做隐式编译。
2. **`dir` 列出的是当前工作目录**：不跟随符号链接（按 `[FILE]` 显示），不做递归，不支持参数（`usage: dir`）。
3. **`modified-star` 的 dirty 语义是"发生过编辑命令"**：`undo` 回到保存点后 `*` 仍然保留，
   只有 `save` / `init` / `read` 才会清除。另一种"内容与上次保存不一致"的语义见 ADR-10 的被否方案。
4. **VSCode 扩展有两条运行期约束**：工作区必须能匹配到 `.svg`（选择器已覆盖 `**/*.svg` 与根级 `*.svg`）；
   `.svg` 若被图片预览自定义编辑器接管，则原生大纲不产出内容（需"重新打开方式 → 文本编辑器"）。
   截图部分人工完成：大纲截图已归档为
   [`vscode-svg/screenshots/02-outline.png`](../vscode-svg/screenshots/02-outline.png)，
   Explorer 徽标单图见 `vscode-svg/screenshots/01-badge.png`。
5. **Phase 1 的实验报告不包含 Phase 2**：Phase 2 的说明集中在本报告与 `doc/README.md` §5。

---

## 7. 结论

Phase 2 的四项要求都落到了可执行的证据上：

- 四个扩展点各有真实实现；`box` 的接入**零内核改动**（提交 `c082226` 对 `src/` 的差异为空），
  `tree-star` 的接入只用到通用钩子 `onEdited`（新增装饰器不需要动渲染器）；
- 改代码与改配置两条装配路径**逐字节等价**，由真实进程测试与独立判据脚本双重锁住；
- 加载器的四类失败按规范文案输出且**不阻断启动**，坏插件不会连累其他插件；
- `contributes` 声明与实际注册逐类比对，不一致即整插件回滚（不留半个插件）；
- Phase 1 的全部用例仍然全绿，且没有任何断言期望值被修改，说明重构没有行为漂移；
- 分层依赖与零依赖两条硬约束被纳入 `npm test`，不只是文档里的承诺；
- 与 AI 协作中的每一次越界（自造文案、自造映射表、自加行为）都被记录并回退，
  修正理由以规范原文为依据，见 §5.1.1 / §5.1.2 与 `doc/README.md` §5.8。
