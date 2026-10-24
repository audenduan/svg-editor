# svg-editor 设计文档（PJ1 Phase 1）

本文档记录架构方案、关键决策与一致性自查。使用手册（命令参考、需求覆盖对照表）见 [README.md](../README.md)。

## 1. 架构分层

依赖方向自下而上，`core` 不依赖任何 IO / CLI 概念：

```
src/
├── core/            # 领域层
│   ├── model/       #   Shape 层级 + 复合容器（ShapeContainer）+ 几何运算 + 状态快照
│   ├── command/     #   命令对象（Command）+ 历史栈（CommandHistory，快照式撤销）
│   ├── registry/    #   图形类型注册表 ShapeTypeRegistry（按名分派点之一）
│   └── errors/      #   EditorError——所有可预期失败都是这一个类型，CLI 统一加 error: 前缀
├── io/              # src/io/xml/XmlParser 手写 XML 解析器 + SvgReader/SvgWriter + FileStore
├── render/          # TreeRenderer / ShowRenderer：纯排版，几何/样式文本来自图形的多态钩子
├── app/             # EditorSession：前置校验 + 命令包装 + io 闸门（应用层唯一门面）
└── cli/             # CommandLineTokenizer → CommandDispatcher（按名分派点之二）→ Repl
```

### 两处按名分派

架构方案要求"按名分派"集中、可扩展，全项目只有两个按字符串名字分派的对象：

1. **`ShapeTypeRegistry.createShape(typeName, …)` / `findByTag(tag)`**——图形类型。内置 6 种由 `BaseShapeProvider` 子类注册；插件注册自己的 Provider 即可获得 `create`、`read`（restore）、`save`（序列化）与 `tree` 标注能力，无需改任何现有代码。未知类型报错带插件提示：`unknown shape type: hexagon (is the plugin loaded?)`。
2. **`CommandDispatcher`**——CLI 命令名 → handler。每个 handler 只做参数解析与个数校验，随后调用 `EditorSession`。

### 撤销/重做：状态快照

每条编辑命令（`create/delete/move/scale/set/group/ungroup/addto/front/back`）在 `execute()` 前对**涉及到的图形**做 `captureState()`，`undo()` 时 `restoreState()`。快照包含几何、样式、保留属性（extra）、文本内容。优点：

- 容器递归（move/scale 子孙）与 `group` 的多成员收编天然成为"一个 undo 单元"；
- 数值运算无浮点累积误差（undo 不是反向运算）；
- 删除/恢复、重新分组、移回原父容器与原下标都能精确还原。

### io 闸门（需求 4.3）

文档类命令（`init / read / save / canvas`）之后：

- `undo/redo` 被禁止：`undo not allowed after io command`；下一次编辑命令（或 undo/redo 之外任何操作）自动解禁。
- `init / read` 会整体清空历史栈（新文档从零开始）；`save / canvas` 只锁栈。

## 2. 语义决策

### id（需求 2）

- 显式 `id` 直接用；与**已分配** id 重复 → 改名 `dup-2`、`dup-3`… 并警告 `duplicate id dup renamed to dup-2`。
- 无 id → 按 `标签名+序号` 分配（`rect1`、`circle1`…），序号避开文件内所有显式 id，并警告 `assigned id rect1 to unnamed <rect>`。
- 全部 id 是字符串，`id-2` 与 `id-3` 这类解析成 id 时按字符串比较，规则简单无歧义。

### 自定义属性 vs 参数（需求 3）

`Shape` 内置三类属性通道，白名单只有一处定义（`Shape.setAttribute`），`create` 与 `restore` 都走它：

| 通道 | 内容 | set 规则 |
| --- | --- | --- |
| 几何 | x/y/w/h、cx/cy/r、rx/ry、x1/y1/x2/y2 | 数字（白名单，越权报 `unknown attribute: opacity`） |
| 样式 | fill/stroke/stroke-width | 字符串，`show` 里逐行列出，`tree` 里内联 |
| extra | 其余（`transform`、`font-size`…） | 任何字符串，序列化时原样输出，round-trip 不丢 |
| text（仅 text 类型） | 文本内容 | 元素文本 ↔ `text` 属性 |

协议（`Shape` 契约）：`treeSummary()`、`showLines()`、`geometrySummary()`、`anchorPoint()`、`elementName()` 是**多态钩子**——render/io 只描述"怎么排版/怎么序列化"，不假设类型细节。插件类型重写这些钩子即可定制输出。

## 3. 一致性自查与已知限制

1. **`tree` 对齐是统一规则，不是抄需求示例**：需求文档里的树手工排版、列宽不一。规则：同父兄弟取"**有内联摘要的最长标签 + 2**"为字段宽；无摘要的兄弟（如空 `g`）不参与计算、不补宽。`tests/transcript.test.ts` 按该规则逐字断言，与需求示例语义一致、空格数可能不同。
2. **`show <line>` 显示 `x1/y1/x2/y2`**：需求 0.1 的 show 规则是"`属性名=值`"，line 没有画布别名，不沿用 tree 的 `(x1,y1) -> (x2,y2)` 缩略。
3. **`tree` 内联样式**：带样式（fill/stroke/stroke-width）的图形在树里内联，与需求示例一致；需求 6.1 的 line 示例省略 stroke，本实现会显示（`stroke=black`），判定为示例笔误。
4. **read 缺省画布**：需求 0.1 示例的 `<svg>` 无 width/height；实现按 `viewBox` 兜底，再兜底 800x600。
5. **`defs` 与元数据元素本阶段跳过**：`defs` 内的引用形状（渐变/滤镜）Phase 1 不解析，`skipped <defs>: referenced shapes are not resolved in this phase`；`title/meta` 静默忽略；未知图形元素 `unsupported element <polygon> skipped`。
6. **带单位长度退化 0**：外部 SVG 的 `50%`/`300px`（图形属性）无法用数字表达，`restore` 退化为 0（静默，restore 通道无警告口；svg 根元素的 width/height 支持 `px/pt/mm/cm/in` 后缀并剥掉）。
7. **文本转义**：writer 对文本内容做 XML 实体转义（`&` `<` `>`），reader 反转义；round-trip 逐字节稳定（测试断言 write→read→write 不变）。
8. **`ungroup` 范围**：只允许本阶段创建的纯组（`g`）；line/text 是"复合图元"（几何/样式分离 + up/down 属性），本阶段不实现 ungroup；`g` 在顶层报 `cannot ungroup top-level container`（需求 4.2 自由块语义：根 svg 不可 ungroup）。插件可扩展。
9. **错误不含糊**：`no such container` 与 `not a container` 分开报（表 4.2）；`group` 的祖先冲突按"成员容器是否含另一个成员"检查：`cannot group a container into its own descendant: g1`；`move/scale/set/delete` 缺 id → `no such shape: zzz`。
10. **失败不改状态**：所有校验在命令执行前完成；`error:` 行出现后文档结构与撤销栈完全不变（`tests/errors.test.ts` 专门断言）。

## 4. 质量保证

- **测试**：`node:test`（内置），54 用例，无测试框架依赖。两个 transcript 测试把需求 6 / 6.1 的完整会话逐行断言；错误表测试逐字断言需求 4.2。
- **依赖纪律**：`scripts/check-dependencies.mjs` 拒绝 package.json 白名单（`@types/node`、`typescript`）以外的依赖，并拒绝源码里非相对路径/非 `node:`/非内置模块的 import。
- **流水线**：`npm test` = `tsc`（strict）→ 依赖检查 → `node --test`。

## 5. 后续阶段（Phase 2+ 候选）

- 插件样例（box → detail），验证 schema 绑定/restore/`treeAnnotation` 三个扩展点；
- `defs` 引用解析、单位长度入模型（加 extra 字段）；
- 撤销树 / 多文档；
- `up`/`down` 属性语义的完整支持。