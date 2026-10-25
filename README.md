# svg-editor（PJ1 Phase 1）

一个用 TypeScript 写的命令行 SVG 编辑器。零第三方运行期依赖（`@types/node` + `typescript` 仅用于类型检查与编译），一条命令一个撤销单元，`read/save` 使用手写的 XML 解析器/序列化器。

```
$ npm run cli
svg-editor 0.1 — type 'help' for commands
svg> init 800 600
canvas 800x600 created
svg> create rect bg 0 0 800 600 #ffffff
rect#bg created
svg> create text title 20 40 "My Diagram"
text#title created
svg> create circle c1 100 100 20 red
circle#c1 created
svg> create rect box 200 80 60 60 #3366ff
rect#box created
svg> group markers c1 box
g#markers created with 2 children
svg> tree
svg (800x600)
├── rect#bg     x=0 y=0 w=800 h=600 fill=#ffffff
├── text#title  (20,40) "My Diagram"
└── g#markers
    ├── circle#c1  cx=100 cy=100 r=20 fill=red
    └── rect#box   x=200 y=80 w=60 h=60 fill=#3366ff
```

## 快速开始

```bash
npm install
npm run cli          # 交互式 REPL（svg> 提示符）
npm run cli < script # 脚本回放：以 # 开头的行是注释，逐行执行
npm test             # 构建 → 依赖纪律检查 → 54 个测试用例
```

输出约定：

- 每条命令的输出是一行或多行文本；**所有错误都以 `error:` 前缀**输出，且失败不改变任何状态。
- 带空格的内容参数用双引号包裹：`create text t1 20 40 "My Diagram"`。
- 每个图形有唯一 `id`；命令只按 id 定位图形。

## 命令参考

| 命令 | 用法 | 说明 |
| --- | --- | --- |
| `init` | `init [w] [h]` | 新建空画布，缺省 800x600 |
| `read` | `read <file.svg>` | 读取 SVG 为当前文档（无 id 自动补、重复 id 改名，均警告） |
| `save` | `save [file.svg]` | 保存；不带路径则用当前文档来源路径 |
| `canvas` | `canvas [w] [h]` | 显示或修改画布尺寸 |
| `create` | `create <type> <id> [params…] [in <containerId>]` | 新建图形，`in` 子句放进指定容器 |
| `delete` | `delete <id>` | 删除图形（容器删除整棵子树） |
| `move` | `move <id> <dx> <dy>` | 按偏移平移 |
| `scale` | `scale <id> <factor>` | 按正因子缩放 |
| `set` | `set <id> <attr> <value>` | 修改属性（样式/几何/text） |
| `group` | `group <newGid> <id1> <id2>…` | 把已有图形收进新容器（新容器落在第一个成员的原位置） |
| `ungroup` | `ungroup <gid>` | 解散容器，子图形提升到原位置 |
| `addto` | `addto <gid> <id>` | 把已有图形移入容器 |
| `front` / `back` | `front <id>` / `back <id>` | 移到兄弟最前/最后 |
| `tree` | `tree [id]` | 结构树；带 id 打印该图形的子树 |
| `show` | `show <id>` | 属性明细（标题行 + parent + 两空格缩进） |
| `undo` / `redo` | — | 撤销/重做上一个编辑命令 |
| `help` | `help` | 命令表 + 图形类型 + 约定提示 |

### 图形类型与参数

| 类型 | 元素 | 参数（数字均支持小数） |
| --- | --- | --- |
| `rect` | `<rect>` | `x y width height [fill]` |
| `circle` | `<circle>` | `cx cy r [fill]` |
| `ellipse` | `<ellipse>` | `cx cy rx ry [fill]` |
| `line` | `<line>` | `x1 y1 x2 y2 [stroke]` |
| `text` | `<text>` | `x y content`（content 可含空格，需引号） |
| `g` | `<g>` | 无参数（容器） |

## 需求覆盖对照表

| 需求 | 实现 | 验收 |
| --- | --- | --- |
| 0.1 交互输出示例 | `src/cli/Repl.ts`、`src/render/`、`src/io/SvgWriter.ts` | `tests/io.test.ts` 逐字比对 writer 输出 |
| 1 图形层级 | `src/core/model/Shape.ts`、`ShapeContainer.ts` | `tests/command.test.ts` 容器递归 move/scale |
| 2 命令与 id 语义 | `src/app/EditorSession.ts` 前置校验 + 自动补 id | `tests/errors.test.ts` 错误表逐字一致 |
| 3 类型与参数 | `src/core/registry/*Provider.ts`（schema 绑定） | `tests/registry.test.ts` |
| 4.1 撤销/重做，一条命令=一个单元 | `src/core/command/*Command.ts`（快照还原） | `tests/command.test.ts` |
| 4.2 错误信息逐字一致 | `EditorSession` 全部校验点 | `tests/errors.test.ts`（13 组） |
| 4.3 文件操作后撤销被禁 | `CommandHistory` 的 io 闸门 | `tests/command.test.ts`、`tests/transcript.test.ts` |
| 5.1 `tree` 结构树 | `src/render/TreeRenderer.ts` | 需求 6/6.1 transcript 逐行一致 |
| 5.2 `show` 明细 | `src/render/ShowRenderer.ts` | `tests/transcript.test.ts` |
| 6 完整会话 | `src/app/EditorSession.ts` + `src/cli/` | `tests/transcript.test.ts` 两段 transcript |
| 6.1 `in` 子句嵌套创建 | `CommandDispatcher` 解析 + 会话 resolveContainer | 同上 |
| 架构：插件型图形类型 | `src/core/registry/ShapeTypeRegistry.ts` | 两处按名分派点（见 doc） |
| 架构：简单问题不引入依赖 | `scripts/check-dependencies.mjs` | `npm test` 流水线强制 |

## 目录结构

```text
src/
  core/     领域内核：图形模型、命令、图形类型注册表（不依赖 IO / CLI）
  io/       SVG 解析、序列化、文件访问
  render/   tree / show 的文本排版
  app/      应用层编排（EditorSession）
  cli/      交互外壳：REPL、分词、命令分发
  main.ts   进程入口
tests/      单元测试与"按需求 transcript 回放"的集成测试
doc/        设计文档（doc/README.md）
examples/   可直接回放的命令脚本与示例 SVG
```

架构方案、关键决策、一致性自查与质量保证手段见 [doc/README.md](doc/README.md)。

## Git 历史

开发过程共 13 个提交，自底向上：

```
（最终版本打 final 标签）
docs: submission document and final tag
0476dc4 docs(examples): replayable scripts and sample outputs
f09725d docs: user manual and design document
21d6c8b chore(scripts): dependency discipline checker
be4118f feat(tests): node:test suite (54 cases)
ed9e3be feat(cli): REPL, dispatcher, help
6c17676 feat(app): editor session orchestration
3aa760a feat(render): tree and show renderers
33af332 feat(io): hand-written XML parser and SVG reader/writer
51dcf91 feat(registry): shape provider registry and built-in providers
54a356c feat(command): command pattern with undo/redo history
eb72672 feat(model): shape hierarchy with composite containers
320a9a6 chore: scaffold TypeScript CLI project
```
