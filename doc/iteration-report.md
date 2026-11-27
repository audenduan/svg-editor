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

99 个用例，分五层：

| 层级 | 文件 | 覆盖 |
|---|---|---|
| Phase 1 回归 | `tests/*.test.ts`（原有） | 54 个用例全部通过，断言期望值一字未改（唯一 diff 是 `SetAttributeCommand` 的构造参数） |
| 框架 | `tests/extensions.test.ts` | 四个扩展点的注册/冲突回滚/处理器优先级/失败回滚 |
| 装饰器契约 | `tests/decorators.test.ts` | `modified-star` 形态示例：`onSaved`/`onDocumentReplaced` 复位、空串不留空格 |
| 组合 | `tests/composition.test.ts` | 跨插件协作、缺插件退化、顺序无关、基线字节 |
| 装配 | `tests/assembly.test.ts`、`tests/configLoader.test.ts` | **真实 CLI 进程**逐字节比较两种装配、非法配置、缺模块 |
| help 排版 | `tests/help.test.ts` | 用法列宽自适应、说明列对齐、插件命令出现在 help |

（含装饰器契约用例与 debug 回归用例，总数为 123。）

### 5.1.1 全面 debug 阶段发现并修掉的 6 个缺陷

代码写完、测试全绿，不等于没有 bug。这一轮专门**换角度攻击**（而不是重跑已有断言），
方法是：写探针脚本把命令组合灌进真实装配，观察不变量是否还能被破坏。结果找到 5 个：

| # | 缺陷 | 表现 | 根因 | 修复 |
|---|---|---|---|---|
| 1 | `create … in <box>` / `addto <box> <x>` 能往 box 里塞第三个子部件 | 之后 `save` 正常、`read` 报 `invalid box`——**用户自己的文件变得读不回来** | 只保护了"删"与"移走"，没保护"加入" | 内核加 `requireAcceptsChildren`：容器 `protectsChildren()` 为真时拒绝加子元素 |
| 2 | `front` / `back` 能打乱 box 的子部件顺序 | 同上，round-trip 直接失败 | 顺序被当作可自由调整的显示属性，但它是 box 不变量的一部分 | `reorder` 前检查父容器保护契约 |
| 3 | `group <newId> <box 的子部件>` 能把必要子部件"借走" | box 少一个子部件，结构损坏 | `group` 内部移出成员，绕过了删除保护 | `group` 对每个成员执行 `requireRemovable` |
| 4 | `--config` 加载失败后仍进入 REPL | 用户看到 `unknown command: stats` 而非真正的配置错误 | 入口把"装配失败"当成"可继续" | 装配失败即打印 `error:` 退出（运行期失败 1，用法错 2）；横幅永远第一行，`warning:` 由 `Repl` 的 `prelude` 在横幅后输出 |
| 5 | `help` 用法列固定 46 列，最长用法溢出 | `create <type> <id> [params…] [in <containerId>]create a shape` 说明贴死在用法上 | 列宽写死；Phase 1 遗留 | 列宽改为"最长用法 + 2"，最小 46 |
| 6 | `set <box> fill <浅色>` 把标签文字也染成浅色 | 标签与底色同色，**文字消失** | 处理器把同一个值刷到两个子部件，忽略了 `<text>` 的 `fill` 是"字的颜色" | 底板收底色，标签收对比色（亮度阈值 + 只认十六进制） |

前 3 个都是**同一个思维盲区**：实现 `protectsChildren()` 时只想到"别让子部件离开"，
没想到"别让新东西进来"和"别重排"。修法把契约补全为四类操作（删/移走/加入/重排），
且仍然只依赖容器自报的布尔值——内核不认识 `box`。

第 4 个的教训是**失败路径也要当正常路径设计**：装配失败时继续跑，会把"配置写错"
伪装成"命令不存在"，排查成本从一眼变成一小时。

第 5 个是 `final` 上就存在的排版缺陷（Phase 1 遗留）。修它使**当前版本与 `final` 的输出
在这一行不同**——这是唯一一处有意偏离，见 §5.3.1 的逐字节复核说明。

第 6 个（`fill` 把标签染色）属于**语义**层面的 bug，测试全绿也发现不了：两个子部件都拿到了
用户给的值，`assert` 完全成立，但屏幕上的字没了。它只能靠"看到输出后觉得不对"发现——
所以 debug 阶段刻意把每个命令的真实输出**打印出来读一遍**，而不只看断言是否通过。
这条也回答了"插件该拥有什么"：不是"批量写同一个值"（白名单也能做），而是
"把用户级语义翻译成子部件级语义"（`fill` 在底板与文字上是两种东西）。

### 5.2 自动化闸门（`npm test` 一次跑完）

```
tsc（strict, noUnusedLocals, noUnusedParameters, noFallthroughCasesInSwitch）
  → check-dependencies.mjs   零运行时依赖 + 内核不 import node 内置模块
  → check-layers.mjs         分层依赖 0 违规（内核不依赖上层/插件，插件不碰装配层）
  → node --test              125 个用例
```

`check-layers.mjs` 是这次新增的：把"插件化"从口头约束变成 CI 约束。
需要说清它的能力边界——它检查的是 **import 关系**（内核不 import 上层或插件、插件不 import 装配层），
**不检查**"内核里内联写了某个具体类型名"。后者目前只能靠人工 grep 与代码审查保证：

```bash
# 期望没有任何命中（注释除外）
grep -rn "'box'\|'stats'\|'dir'" src/core src/app src/render src/io
```

### 5.3 指标（由 `scripts/metrics.mjs` 从 git 历史生成，不接受手填）

| 类别 | 基线行数 | 当前行数 | 判断点增量 |
|---|---|---|---|
| 内核（core/app/io/render） | 2593 | 3464 | +105 |
| 装配处（cli/host/入口） | 431 | 639 | +17 |
| 插件（plugins/） | 0 | 899 | +40 |
| VSCode 扩展 | 0 | 593 | +61 |
| 测试与其他 | 955 | 1708 | +18 |

（数字来自 `docs/metrics/metrics.md`，由 `node scripts/metrics.mjs --base final --head WORKTREE` 生成，不接受手填。）

指标不用于评分，用于回答"复杂度去了哪里"：**新增复杂度主要落在插件与测试**，
内核增量集中在四个接口与注册表；装配处只涨了 208 行（清单加载桥接 + 第二个入口 + 入口的失败策略）。

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

- 内核里没有任何具体类型名分支：`src/core`、`src/app`、`src/render`、`src/io` 里
  `grep -rn "'box'\|'stats'\|'dir'"` 无命中；而边界本身由 `check-layers` 机械检查（import 关系）；
- 插件不能绕过原子性：`activatePlugin` 是唯一加载路径，方式 B 也必须经过它；
- 缺插件时错误可区分且不崩溃，结构树回到 Phase 1 字节；
- 装配失败不进入 REPL：`--config` 读不到/写错/插件加载失败一律 `error:` + 退出码 1（用法错为 2）；
- 复合图形的内部结构四类操作全部被拒（加/删/移走/重排），且 `save` 后的文件一定能 `read` 回来；
- 所有错误都是 `EditorError`，CLI 统一渲染成 `error: …`，退出码语义不变。

---

## 6. 已知边界

1. **`entry` 必须指向可 `require` 的 JS**：源码是 TypeScript，所以内建的三个插件用 `builtin:` 前缀映射到
   `dist/` 产物；外部插件同理需要先编译。这条规则写在清单文档与错误信息里，不在装配时做隐式编译。
2. **`dir` 列出的是当前工作目录**：不跟随符号链接（按 `[FILE]` 显示），不做递归，不支持参数（`usage: dir`）。
3. **`modified-star` 类装饰器依赖 `onSaved` 契约**：内核在保存、`init`、`read` 后通知，装饰器自行维护状态；
   本次交付的 `(box)` 标签是无状态的，`modified-star` 只在 `tests/decorators.test.ts` 中作为契约示例验证，
   没有作为独立插件交付（它需要"哪个图形被改过"的信息，而内核目前不广播编辑事件）。
4. **VSCode 扩展的截图部分人工完成**：大纲截图已归档为
   [`vscode-svg/screenshots/02-outline.png`](../vscode-svg/screenshots/02-outline.png)
   （原生 Outline 显示 `svg > g#flowchart > g#node1 > rect#start / text#start-label`）；
   `vscode-svg/README.md` §5.0 记录了三种启动方式与两条运行期约束
   （选择器必须覆盖工作区根目录、`.svg` 被自定义编辑器接管时无大纲）。
   Explorer 徽标单图仍待补，自动化部分（解析器 5 个用例）已全绿。
5. **Phase 1 的实验报告不包含 Phase 2**：Phase 2 的说明集中在本报告的 `doc/` 三份文档里。

---

## 7. 结论

Phase 2 的四项要求都落到了可执行的证据上：

- 四个扩展点各有真实实现，且 `box` 的接入**零内核改动**（提交 `c082226` 对 `src/` 的差异为空）；
- 改代码与改配置两条装配路径**逐字节等价**，由真实进程测试锁住；
- Phase 1 的全部 54 个用例仍然全绿，且没有任何断言期望值被修改（唯一 diff 是构造参数），说明重构没有行为漂移；
- 分层依赖与零依赖两条硬约束被纳入 `npm test`，不只是文档里的承诺。