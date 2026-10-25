# svg-editor 项目文档（PJ1 Phase 1）

> 本文档是课程的提交文档，由四部分组成：**架构方案**、**与 AI 协作的过程记录**、**实现后的一致性自查**、**功能完整性与质量保证手段**。仓库使用 git 管理并已推送到 GitHub（`github.com/audenduan/svg-editor`），提交历史体现完整开发过程，最终版本打了 `final` 标签。

## 0. 项目概述与需求范围

一个用 TypeScript 实现的命令行 SVG 编辑器：支持画布管理、六种图形类型的创建与层级组织、撤销/重做、SVG 文件读写、结构树与属性明细展示。零第三方运行期依赖（仅 `@types/node`、`typescript` 用于类型检查与编译）。

需求覆盖编号：0.1（交互输出示例）、1（图形层级）、2（命令与 id 语义）、3（类型与参数）、4.1~4.3（撤销/重做、错误表、文件操作后撤销被禁）、5.1~5.2（tree / show）、6（完整会话）、6.1（`in` 子句嵌套创建），以及架构要求（插件型图形类型、简单问题不引入依赖）。

---

## 1. 架构方案

### 1.1 分层架构

依赖方向自下而上，领域层（`core`）不依赖任何 IO / CLI 概念：

```
src/
├── core/            # 领域层
│   ├── model/       #   Shape 层级 + 复合容器（ShapeContainer）+ 几何运算 + 状态快照
│   ├── command/     #   命令对象（Command）+ 历史栈（CommandHistory）
│   ├── registry/    #   图形类型注册表 ShapeTypeRegistry（按名分派点之一）
│   └── errors/      #   EditorError——所有可预期失败的唯一类型
├── io/              # 手写 XML 解析器（io/xml/XmlParser）+ SvgReader/SvgWriter + FileStore
├── render/          # TreeRenderer / ShowRenderer：纯排版，内容来自图形的多态钩子
├── app/             # EditorSession：前置校验 + 命令包装 + io 闸门（应用层唯一门面）
└── cli/             # CommandLineTokenizer → CommandDispatcher → Repl
```

- **`core/model` 为什么单独一层**：图形本身的"是什么、能做什么"（移动、缩放、序列化、快照）与"命令怎么用"、"怎么显示"解耦。`Shape` 基类用"数值字段声明表"（`defineNumericField`）驱动 `moveBy/scaleBy/anchorPoint/序列化`，新增图形类型不需要改既有分支；几何值是子类私有字段（封装而非数据袋）。
- **`core/command` 与撤销**：每个编辑命令一个类，`execute()` 前对涉及的图形 `captureState()`，`undo()` 时 `restoreState()`（Memento 模式）。结构变化（delete/group/addto）由命令自己记录父容器与原下标，撤销时精确还原位置。
- **`core/registry` 插件化**：内置 6 种类型（rect/circle/ellipse/line/text/g）通过 Provider 注册；`BaseShapeProvider` 保证 `create`（命令行）与 `restore`（读 SVG）复用同一套属性白名单。
- **`app` 与 `cli` 分离**：`EditorSession` 是唯一门面，一条命令一个方法、返回面向用户的输出行；CLI 只做分词参数解析与错误前缀，不接触模型。

### 1.2 两处按名分派

架构方案要求"按名分派"集中且可扩展，全项目只有两个按字符串名字分派的对象：

1. **`ShapeTypeRegistry.createShape(typeName, …)` / `findByTag(tag)`**——图形类型。未知类型报错带插件提示：`unknown shape type: hexagon (is the plugin loaded?)`。注册新 Provider 即可获得 create / read（restore）/ save（序列化）/ tree 标注能力，不改任何现有代码。
2. **`CommandDispatcher`**——CLI 命令名 → handler。每个 handler 只做参数解析与个数校验，随后调用 `EditorSession`。

### 1.3 命令模式与快照式撤销

- 一条命令 = 一个撤销单元（包括 `create … in`、`group` 多成员收编、容器递归的 move/scale）。
- 快照包含几何、样式、保留属性（extra，如 transform）、文本内容，undo 是"整体还原"而非反向运算 → 无浮点累积误差，删除/恢复、重新分组都能精确还原。
- `CommandHistory` 维护 undo/redo 双栈：新编辑清空 redo 栈；`lockAfterIo()` 后拒绝 undo/redo，下一次 `run` 自动解锁；`resetAfterIo()` 整体清空。

### 1.4 io 闸门（需求 4.3）

文档类命令（`init / read / save / canvas`）之后 undo/redo 被禁止（`undo not allowed after io command`）；`init / read` 直接清空历史，`save / canvas` 只锁栈。这样保证"文件内容 ↔ 内存模型 ↔ 撤销栈"三者的边界清晰：IO 之后的历史不再有意义。

### 1.5 id 语义与属性通道

- **id（需求 2）**：显式 id 直接用；与已分配 id 重复 → 改名 `dup-2/-3…` 并警告；无 id → `标签名+序号`（`rect1`、`circle1`…），序号避开文件内所有显式 id，并警告。
- **属性三通道**（白名单只在 `Shape.setAttribute` 定义一处）：几何（数字、越权报错）、样式（fill/stroke/stroke-width）、extra（transform、font-size 等，round-trip 不丢）；text 类型另有文本内容通道。
- **协议**：`treeSummary()/showLines()/geometrySummary()/elementName()` 是多态钩子，render/io 只描述"怎么排版/怎么序列化"，不假设类型细节。

---

## 2. 与 AI 协作的过程记录

### 2.1 协作方式

本项目由本人提出需求与决策点、AI 辅助实现与质控的方式协作完成。约定如下：

- **分步提交**：整个开发拆成 12 个提交，每步 = 设计要点 → 实现 → 自检验证（按需求 transcript 逐行断言）→ 独立提交并推送，提交历史完整体现开发过程；
- **需求冲突先问不猜**：凡是需求文档有歧义的点（tree 对齐、show 的 line 属性、缺省画布、defs），先记录决策再实现，不留模糊地带；
- **测试优先回放**：以需求文档的完整会话 transcript 为准绳，先写逐行断言，再实现/修正；
- **自主纠错**：AI 自检发现的失败先归类（测试期望错误 vs 代码缺陷），修复后回归全绿。

### 2.2 分阶段开发记录（git 提交历史）

| 提交 | 内容 | 该步的关键验证 |
| --- | --- | --- |
| `320a9a6` | 脚手架（tsconfig/package.json/目录结构） | `npm run cli` 链路通（banner 输出） |
| `eb72672` | 图形层级与复合容器（Shape/ShapeContainer/6 类型） | 容器递归 move/scale 断言 |
| `54a356c` | 命令模式 + 撤销历史（10 个命令类 + CommandHistory） | undo/redo/清栈/io 闸门单测 |
| `51dcf91` | 图形类型注册表 + 6 个内置 Provider（schema 绑定） | 参数个数/非法数值/未知类型错误断言 |
| `33af332` | 手写 XML 解析器 + SvgReader/SvgWriter | writer 逐字比对、round-trip 逐字节稳定 |
| `3aa760a` | tree / show 渲染器 | 需求 6/6.1 transcript 逐行断言 |
| `6c17676` | EditorSession 应用门面（校验 + 编排 + io 闸门） | 30 项会话断言 |
| `ed9e3be` | CLI：分词/命令分发/REPL/help + main.ts 组装 | 需求 6 与 6.1 完整会话端到端回放 |
| `be4118f` | node:test 测试套件（54 用例） | `npm test` 全绿（54/54） |
| `21d6c8b` | 依赖纪律检查器（check-dependencies.mjs） | 流水线强制零第三方依赖 |
| `f09725d` | README + 本文档 | — |
| `0476dc4` | 示例脚本与样例 SVG（examples/） | 三个示例真实进程回放通过 |
| `（本次提交）` | 提交文档定稿（README 更新 + 本文档） | 全量回归 `npm test` 后打 `final` 标签 |

### 2.3 关键决策记录（人机分工）

| 决策点 | 需求原文情况 | 最终决策 | 理由 |
| --- | --- | --- | --- |
| `tree` 对齐 | 示例为手工排版、列宽不一 | 统一规则：同父兄弟取"有内联摘要的最长标签 + 2"为字段宽 | 程序必须输出确定列，不能"照着抄空格" |
| `show <line>` | 需求 5.2 规则"属性名=值" | 显示 `x1/y1/x2/y2` 与样式 | line 无画布别名，遵循通用规则 |
| `tree` 的 line 样式 | 6.1 示例省略 stroke | 显示 `stroke=black` | 样式内联是统一规则，判定示例为笔误 |
| read 缺省画布 | 0.1 示例无 width/height | viewBox 兜底 → 800x600 | 手写解析器需确定行为 |
| `defs`/元数据元素 | 需求未提及 | 本阶段跳过并警告 | Phase 1 不解析引用形状（渐变/滤镜），记录限制 |
| 带单位长度（300px） | 需求未提及 | 图形属性退化 0，根元素剥单位 | 数字模型无法表达单位，记录为已知 round-trip 限制 |
| ungroup 范围 | 4.2 提到根 svg 不可 ungroup | 只允许本阶段创建的 g；line/text 为复合图元拒绝 | 错误表语义 + 复合图元不可拆分 |
| 撤销实现 | 4.1 一条命令=一个单元 | 快照式 Memento 而非反向运算 | 容器递归/多成员收编/删除恢复天然精确，无浮点误差 |

### 2.4 过程中遇到的问题与解决

1. **验收脚本的"假失败"**：自检出现 3 个 FAIL，逐一排查后确认均为**测试脚本期望值写错**（对齐空格数、read 换文档后 parent 变化、重复 id 检查时机），不是代码缺陷；修正期望后全绿。真正改过的代码问题只有一处（help 中图形类型顺序 → 改为注册顺序）。
2. **Windows 中文脚本回放编码陷阱**：PowerShell 管道把 UTF-8 当 GBK 解码导致乱码。程序本身无问题（生成 SVG 经字节级校验为正确 UTF-8），win 下建议 `cmd` 重定向回放含中文脚本。
3. **git push 偶发 TLS 瞬断**：重试后成功，提交历史连续完整。
4. **`node --test` 目录参数**：Node 24 需传 glob（`dist/tests/*.test.js`）而非目录，已在 `npm test` 脚本修正。

---

## 3. 实现后的一致性自查

对照需求文档逐项自查（实现与原文的差异均已记录并给出理由）：

1. **`tree` 对齐为统一规则**：语义与需求 6/6.1 示例一致（每列的语义：类型#id、几何、样式），空格数不同（示例列宽不统一，无法照抄）；`tests/transcript.test.ts` 按本规则逐字断言。
2. **`show <line>` 用 `x1/y1/x2/y2`**：遵守"属性名=值"；tree 里用 `(x1,y1) -> (x2,y2)` 缩略展示方向。
3. **tree 内联样式含 stroke**：需求 6.1 示例省略，判定为笔误。
4. **read 缺省画布**：viewBox → 800x600 兜底。
5. **`defs` 与元数据跳过**：警告而非失败；`title/meta` 静默忽略；未知图形元素 `unsupported element <polygon> skipped`。
6. **带单位长度退化 0**：图形属性无法用数字表达（svg 根元素 width/height 剥 `px/pt/mm/cm/in`）。
7. **文本转义**：writer 转义（`& < >`），reader 反转义，round-trip 逐字节稳定。
8. **ungroup 范围**：仅本阶段创建的 g；line/text 复合图元拒绝；根级 g 报 `cannot ungroup top-level container`。
9. **错误不含糊**：`no such container` 与 `not a container` 分开报；group 祖先冲突按"成员容器含另一个成员"检查；错误信息与需求 4.2 逐字一致。
10. **失败不改状态**：所有校验在命令执行前完成，`error:` 行出现后文档结构与撤销栈完全不变（有专门测试断言）。

---

## 4. 功能完整性与质量保证手段

### 4.1 功能完整性：需求 → 实现 → 验证

| 需求 | 实现位置 | 验证 |
| --- | --- | --- |
| 0.1 交互输出示例 | `src/cli/Repl.ts`、`src/render/`、`src/io/SvgWriter.ts` | `tests/io.test.ts` writer 逐字比对 |
| 1 图形层级（嵌套、递归 move/scale、删除整棵子树） | `src/core/model/`（ShapeContainer） | `tests/command.test.ts` |
| 2 命令与 id 语义 | `src/app/EditorSession.ts`、`SvgReader.resolveId` | 自动补 id/改名警告断言 |
| 3 类型与参数（6 种 + schema 绑定） | `src/core/registry/*Provider.ts` | `tests/registry.test.ts`（含错误数量/非法数值） |
| 4.1 撤销/重做一格一格 | `src/core/command/*` | `tests/command.test.ts`（12 个语义用例） |
| 4.2 错误表逐字一致 | `EditorSession` 全部校验点 | `tests/errors.test.ts`（13 组） |
| 4.3 文件操作后撤销被禁 | `CommandHistory` io 闸门 | `tests/command.test.ts`、`transcript.test.ts` |
| 5.1 `tree` | `src/render/TreeRenderer.ts` | 需求 6/6.1 transcript 逐行 |
| 5.2 `show` | `src/render/ShowRenderer.ts` | `tests/transcript.test.ts` |
| 6 完整会话 | `EditorSession` + `cli/` | `tests/transcript.test.ts` 两段逐行 |
| 6.1 `in` 子句 | `CommandDispatcher` + `resolveContainer` | 同上 + 示例流程图回放 |
| 架构：插件型类型、按名分派 | `ShapeTypeRegistry`、`CommandDispatcher` | 注册表/分派测试 + 依赖纪律 |
| 架构：零第三方依赖 | `scripts/check-dependencies.mjs` | `npm test` 流水线强制 |

### 4.2 质量保证手段

- **分层测试**（`node:test`，内置框架，54 用例）：
  - 单元：几何运算与白名单（`geometry`）、撤销历史语义（`command`）、schema 绑定与 restore（`registry`）、XML 读写逐字节（`io`）；
  - 集成：需求 6/6.1 **完整会话逐行断言**（`transcript`）、需求 4.2 **错误表逐字断言**（`errors`）；
  - 支持件：`MemoryFileStore`（可开关写失败）、`BufferOutput`、`testHarness`——IO 失败路径不依赖真实文件系统。
- **依赖纪律**：`scripts/check-dependencies.mjs` 拒绝 package.json 白名单（`@types/node`、`typescript`）以外的依赖，并拒绝源码里非相对路径/非 `node:`/非内置模块的 import。
- **流水线**：`npm test` = `tsc`（strict 全开）→ 依赖检查 → `node --test`。任何代码提交前必须全绿。
- **灰度验证**：每个示例脚本（`examples/`）都真实进程回放；生成 SVG 做字节级 UTF-8 校验。
- **规模**：源码 + 测试约 3800 行（测试占 23%），单文件最大 307 行，无循环依赖。

---

## 5. 后续阶段（Phase 2+ 候选）

- 插件样例（box → detail / treeAnnotation），用真实例子验证三个扩展点；
- `defs` 引用解析、单位长度入模型（去掉两个已知 round-trip 限制）；
- `up/down` 属性语义的完整支持；
- 撤销树 / 多文档。