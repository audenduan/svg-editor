# 扩展点清单（Extension Point Manifest）

本文件逐条说明 PJ1 Phase 2 的四个扩展点：**在哪里定义、谁实现、内核如何消费、插件如何注册、错误如何表现**。
内核依赖的是接口，插件依赖的也是接口；两侧唯一的交汇处是 `PluginContext` 的四个注册方法。

---

## 0. 总览

| # | 扩展点 | 接口定义 | 注册方法 | 注册表（内核消费点） | 本次用到的实现 |
|---|---|---|---|---|---|
| 1 | 图形类型 | `src/core/registry/ShapeProvider.ts` | `registerShapeProvider` | `ShapeTypeRegistry` | `box`（`plugins/shape-box`） |
| 2 | 命令 | `src/core/plugin/CommandExtension.ts` | `registerCommand` | `CommandRegistry` → `CommandDispatcher` | `stats`、`dir`（另有 Phase 1 的 20 条内置命令也走这条路） |
| 3 | 结构树显示 | `src/core/plugin/TreeDecorator.ts` | `registerTreeDecorator` | `TreeDecoratorRegistry` → `TreeRenderer` | `box-type-label`（`plugins/shape-box`） |
| 4 | 属性处理 | `src/core/plugin/AttributeHandler.ts` | `registerAttributeHandler` | `AttributeHandlerRegistry` → `SetAttributeCommand` | `box-fill`、`box-label`（`plugins/shape-box`） |

统一入口：`src/core/plugin/PluginContext.ts` 定义 `PluginContext`（四个 `register*`）与 `Plugin`（`name` + `activate`）；
`src/core/plugin/ExtensionRegistry.ts` 实现 `PluginContext`，是唯一的注册落地处。

---

## 1. 图形类型 `ShapeProvider`

**定义**：`src/core/registry/ShapeProvider.ts`

```ts
interface ShapeProvider {
  readonly typeName: string;                    // create 用的名字，如 'box'
  readonly elementTag: string;                  // SVG 标签，如 'g'
  readonly parameters: readonly ShapeParameterSpec[];  // create 的位置参数 schema
  create(id: string, values: ParameterValues): Shape;
  restore(request: ShapeRestoreRequest): Shape; // 从 SVG 元素还原
  // 以下三个是可选钩子
  matchesElement?(attributes): boolean;         // 标签变体判定（与别的类型共用标签时）
  derivedIds?(id: string): readonly string[];   // 一并生成的子部件 id（查重用）
  afterRestore?(shape: Shape): readonly string[] | void; // 子元素读入后的结构自校验
}
```

**内核如何消费**（`src/core/registry/ShapeTypeRegistry.ts`，全文没有 `switch (tag)`）：

- `create` 命令 → `createShape(typeName, id, tokens)`：按 `typeName` 取 Provider，用 `parameters` 校验数量与数值；
- `read` 命令 → `resolveProvider(elementTag, attributes)`：先按注册顺序试各**变体**的 `matchesElement`，都不中再回落默认 Provider；
- 完整性保护 → `derivedIds()` 在创建前对整棵新子树做 id 查重；`afterRestore()` 在读入后校验必要子部件是否齐全。
- 内部结构保护 → 容器可选实现 `protectsChildren(): boolean`。一旦为真，内核会拒绝**四种**会破坏内部结构的操作：
  删除子部件（`delete`）、移走子部件（`addto` / `group`）、往容器里加子部件（`create … in` / `addto`）、
  调整子部件顺序（`front` / `back`）。内核只认这个布尔约定，不知道也不关心它是哪种图形。

**注册**：`context.registerShapeProvider(provider)`。**默认 Provider**（不声明 `matchesElement`）独占元素标签；
变体可以与默认 Provider 共享标签，这是 `box` 复用 `<g>` 的机制。

**错误表现**（都是 `EditorError`，CLI 渲染成 `error: …`）：

| 场景 | 文案 |
|---|---|
| 类型未注册 | `unknown shape type: box (is the plugin loaded?)` |
| 参数个数不对 | `wrong number of arguments for box: expected 5, got 3` |
| 数值参数非法 | `invalid number for x: abc` |
| 派生 id 与已有 id 冲突 | `id already exists: n1-label` |
| 读入的 box 结构不完整 | `invalid box: b1 (expected <rect id="b1-rect"> and <text id="b1-label">)` |
| 同类型重复注册 | `duplicate registration: shapes/box` |
| 默认 Provider 的标签重复 | `duplicate registration: shapes/<typeName>` |

---

## 2. 命令 `CommandExtension`

**定义**：`src/core/plugin/CommandExtension.ts`

```ts
interface CommandExtension {
  readonly name: string;
  readonly usage: string;      // help 里显示的用法，如 'stats'
  readonly summary: string;    // help 里的一句话说明
  run(args: readonly string[], context: CommandContext): readonly string[];
}
interface CommandContext {     // 只读视图，每次执行重建
  readonly document: SvgDocument | null;
  readonly commands: readonly CommandBrief[];   // 当前命令表（help 用）
  readonly shapeTypes: readonly string[];       // 当前已注册的图形类型名
}
```

**内核如何消费**：`src/cli/CommandDispatcher.ts` 里**没有内置命令表**——它只查 `CommandRegistry`。
Phase 1 的 20 条命令现在作为普通插件写在 `src/host/builtinPlugin.ts` 里（与第三方命令完全同级），
这直接证明"命令扩展点足以承载既有功能"，而不是给插件开的一个旁路。

**注册**：`context.registerCommand(command)`；`help` 由内置插件**最后**注册，因此总能看到含插件命令的完整命令表。

**错误表现**：

| 场景 | 文案 |
|---|---|
| 命令不存在 | `unknown command: stats. type 'help' for commands` |
| 参数个数不对 | `wrong number of arguments for stats: expected 0, got 1` |
| 文档未就绪 | `no document. use 'init' or 'read' first` |
| 重名 | `duplicate registration: commands/stats` |

**用完即弃的约束**：命令插件只能通过 `CommandContext` 与内核交互，拿不到 `EditorSession`，
因此没有绕过命令模式的捷径——`stats` 不写历史，`dir` 不碰文档，二者都自然满足"命令失败不改变状态"。

---

## 3. 结构树显示 `TreeDecorator`

**定义**：`src/core/plugin/TreeDecorator.ts`

```ts
interface TreeDecorator {
  readonly name: string;
  suffix(context: TreeLineContext): string;   // 返回 '' 表示这一行不加标签
  onSaved?(): void;                           // 可选：保存后清除自己的状态（如 modified 标记）
  onDocumentReplaced?(): void;                // 可选：init/read 后重置
}
interface TreeLineContext { readonly shape: Shape | null; readonly isRoot: boolean; }
```

**内核如何消费**：`src/render/TreeRenderer.ts` 对**每一行**（根行、子图形行、`tree <id>` 的根行）调用所有装饰器，
把非空返回值**按注册顺序拼在行尾**；没有任何装饰器时输出与 Phase 1 逐字节相同（行尾不会多出空格）。
`onSaved` / `onDocumentReplaced` 由 `EditorSession` 在对应时机调用，装饰器因此可以维护自己的状态。

**注册**：`context.registerTreeDecorator(decorator)`。渲染器不认识任何具体标签，`(box)` 三个字只存在于插件里。

**本次实现**：`BoxTypeLabel`（`box` 行尾 ` (box)`）；另有 `tests/decorators.test.ts` 里的
`modified-star` 形态示例，演示"保存后消除标记"所需的 `onSaved` 写法（内核在 `save`、`init`、`read` 三个时点通知）。

---

## 4. 属性处理 `AttributeHandler`

**定义**：`src/core/plugin/AttributeHandler.ts`

```ts
interface AttributeHandler {
  readonly name: string;
  handles(shape: Shape, attr: string): boolean;                 // 这一条 set 归我管吗
  apply(shape: Shape, attr: string, value: string, ctx: AttributeApplyContext): void;
  read?(shape: Shape, attr: string): string | null;             // undo 的旧值来源（可选）
}
interface AttributeApplyContext { findShape(id: string): Shape | null; touch(shape: Shape): void; }
```

**内核如何消费**：`SetAttributeCommand` 先用白名单判断基本属性；未知属性再问 `AttributeHandlerRegistry.findHandler(shape, attr)`，
**首个命中者独占**这条 `set`。整个命令仍是一次撤销单元：命令开始时先做子树快照，处理器抛出任何异常都整体回滚
（`tests/extensions.test.ts` 里"处理器中途抛错则文档与历史都不变"锁住了这条）。

**注册**：`context.registerAttributeHandler(handler)`；顺序即优先级。

**本次实现**：

- `box-fill`：底层色写到内部 `<rect>`，并给内部 `<text>` 配一个在该底色上可读的对比色
  （`#111111` / `#ffffff`，只对十六进制颜色计算亮度；`read` 读底板的值，供 undo 恢复）。
  一次 `set` 写两个子部件、两种语义，仍是**一个** undo 单元；
- `box-label`：把 `label` 写进内部 `<text>` 的元素内容（不在 `<g>` 上留无意义的属性）。

---

## 5. 注册的原子性（四个扩展点共用）

`ExtensionRegistry` 用**暂存式注册**实现"全有或全无"：

1. `beginRegistration()` —— 进入暂存区；
2. 插件的 `activate(context)` 期间所有 `register*` 只进暂存区，**不触碰**真实注册表；
3. `commitRegistration()` —— 一次性校验全部条目（重名 / 标签冲突 / 类别内重名），全部通过才原子应用；
   任何一条冲突都抛 `duplicate registration: <category>/<name>`，并**一条都不应用**；
4. 抛错时 `discardRegistration()` —— 丢弃暂存区，注册表回到调用前。

唯一的加载路径是 `src/host/assemble.ts` 的 `activatePlugin()`（begin → activate → commit，异常时 discard），
**方式 A 与方式 B 都走它**，因此"配置装配"不可能绕过原子性。

---

## 6. 两种装配方式

| | 方式 A（改代码） | 方式 B（改配置） |
|---|---|---|
| 入口 | `src/main-code.ts` | `src/main.ts --config <manifest.json>` |
| 谁实例化插件 | 代码里的 `import` | 内核 `PluginManifestLoader` + 宿主 `NodePluginModuleLoader` |
| 插件清单 | `assembleCli({ plugins: [...] })` 数组 | `config/plugins.json` 的 `plugins` 数组 |
| 激活路径 | `activatePlugin()` | `activatePlugin()`（同一个函数） |
| 输出 | —— | 与方式 A **逐字节相同**（由 `tests/assembly.test.ts` 用真实进程比较） |

**清单格式**（`config/plugins.json`）：

```json
{
  "version": 1,
  "plugins": [
    { "name": "@svgframe/plugin-shape-box", "entry": "builtin:shape-box", "enabled": true },
    { "name": "@svgframe/plugin-command-stats", "entry": "./my-plugins/stats/dist/index.js" }
  ]
}
```

**`entry` 解析规则**（`PluginManifestLoader.resolveEntry`，硬约定）：

1. `builtin:<name>` → 内建模块名（本仓库固定三个：`shape-box`、`command-stats`、`command-dir`），不落到文件系统；
2. 以 `./` 或 `../` 开头 → 相对**配置文件所在目录**；
3. 其余相对写法 → 相对**当前工作目录**；
4. 绝对路径 → 原样使用（Windows 盘符与 POSIX 根都支持）；
5. 无论哪种写法，最终都必须是 **Node 可 `require` 的 JavaScript 文件**（`.ts` 源码会在装配时给出
   `cannot load plugin <name>: <path>`），这是"先编译、再配置"的边界。

**条目字段**：`name`（必填，须与插件导出的 `name` 一致，否则 `name mismatch`）、`entry`（必填）、
`variant`（可选，多插件打包在一个文件时用 `.variants[name]`）、`enabled`（可选，`false` 时跳过并打印
`warning: plugin … disabled by config`）、`config`（可选，原样交给插件，内核不解释）。

**结构校验错误**（一律带配置路径与条目下标）：`version must be 1`、`plugins must be an array`、
`plugins[1].name must be a non-empty string`、`duplicate plugin name: x`、`enabled must be a boolean`。
配置文件开头的 UTF-8 BOM 会被忽略（Windows 编辑器常见，不算用户写错）。

---

## 7. 边界与判据（自查用）

- **内核不认识插件名**：`grep -rn "'box'\|'stats'\|'dir'" src/core src/app src/render src/io` 无命中
  （只有注释里作为举例出现）；`src/core`、`src/app`、`src/render` 对 `plugins/` 零 import。
- **插件不认识内核内部**：`plugins/**` 只 import `src/core` 的公开接口与领域抽象，不 import `src/host`、`src/cli`、`src/app`。
  可用 `npm run check:layers` 自动验证（见 `scripts/check-layers.mjs`；它检查 import 关系，不检查内联的字符串常量）。
- **接入插件零内核改动**：`git show --stat <box 提交> -- src` 输出为空，已作为过程节点提交留证。
- **缺插件时行为退化但不崩**：命令名与类型名的缺失被区分成两条错误；结构树回到 Phase 1 字节；
  Phase 1 的 54 个用例在框架重构后**一个字符都没改就全绿**。