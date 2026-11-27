# A.3 分析：VSCode 扩展的职责划分、装饰模式对照与 Phase 1 复用评估

> 本文对应 PJ1 Phase 2 第一部分 A.3，结合本扩展的真实代码与仓库 Phase 1 的真实代码进行说明。
> 涉及的文件：
> - 本扩展：`vscode-svg/src/extension.ts`、`vscode-svg/src/fileDecorationProvider.ts`、`vscode-svg/src/outlineParser.ts`、`vscode-svg/src/outlineProvider.ts`
> - Phase 1：`src/io/xml/XmlParser.ts`、`src/io/xml/XmlElement.ts`、`src/io/SvgReader.ts`、`src/core/model/Shape.ts`、`src/core/model/ContainerShape.ts`、`src/core/model/SvgDocument.ts`、`src/core/model/Group.ts`、`src/core/registry/ShapeTypeRegistry.ts`、`src/core/registry/ShapeProvider.ts`、`src/render/TreeRenderer.ts`、`src/app/EditorSession.ts`、`src/main.ts`

---

## 1. VSCode 与插件各自的职责，以及回调时机

### 1.1 职责边界：VSCode 是“宿主/调度者”，插件是“数据供给者”

VSCode（编辑器内核）负责**一切 UI 与生命周期**：窗口、资源管理器（Explorer）的渲染、原生“大纲（Outline）”视图、面包屑、文档打开/保存/变更事件、命令面板等。插件（Extension）**不直接画 UI**，它只在被 VSCode 回调时**提供数据或附加信息**。

本扩展的入口 `vscode-svg/src/extension.ts` 的 `activate(context)` 只做一件事：向 VSCode **注册**若干 provider / 监听器，并把返回的 `Disposable` 挂到 `context.subscriptions` 上：

```ts
// src/extension.ts（节选）
export function activate(context: vscode.ExtensionContext): void {
  const decorationProvider = new SvgFileDecorationProvider();
  context.subscriptions.push(decorationProvider);
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider));

  const outlineProvider = new SvgOutlineProvider();
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      [{ language: 'xml' }, { pattern: '**/*.svg' }, { pattern: '*.svg' }],
      outlineProvider,
    ),
  );
  // …注册 onDidSaveTextDocument / onDidCreateFiles / onDidDeleteFiles / 手动刷新命令
}
```

这里的关键是**控制反转**：插件把“能力”注册给 VSCode，之后**由 VSCode 决定何时调用**插件提供的回调。插件从不主动去“刷新资源管理器”，只能通过事件告诉 VSCode“这块该重算了”。这体现了“框架调用你（Hollywood principle）”。

### 1.2 A.1 的实际调用链：`registerFileDecorationProvider` → `provideFileDecoration` → `onDidChangeFileDecorations`

1. **注册**：`activate` 里 `vscode.window.registerFileDecorationProvider(decorationProvider)`（`src/extension.ts`）。VSCode 保存这个 provider 并返回一个 `Disposable`。
2. **VSCode 回调**：每当资源管理器需要渲染某个资源条目（文件/文件夹）时，VSCode 会对每个 `Uri` 调用
   `decorationProvider.provideFileDecoration(uri, token)`（`src/fileDecorationProvider.ts`）。我们返回 `{ badge: '[]', tooltip: 'SVG file' }` 或 `undefined`：
   ```ts
   public async provideFileDecoration(uri: vscode.Uri) {
     if (!SVG_EXTENSION.test(uri.path)) return undefined;
     try {
       const stat = await vscode.workspace.fs.stat(uri);
       if (stat.type !== vscode.FileType.File) return undefined; // 目录不加标记
     } catch { return undefined; }
     return { badge: '[]', tooltip: 'SVG file' };
   }
   ```
   注意 provider 是**纯函数式的映射**：输入 `Uri`（+可选 `FileStat`），输出一段“显示附加信息”，它**不持有、不包装**资源管理器条目本身。
3. **刷新时机**：装饰结果会被 VSCode 缓存。需要重算时，插件通过 provider 暴露的 `onDidChangeFileDecorations` 事件（我们内部是 `EventEmitter<Uri | Uri[] | undefined>`，见 `src/fileDecorationProvider.ts`）`fire` 一个 `Uri` / `Uri[]`；`fire(undefined)` 表示**全部重算**。触发点：
   - `workspace.onDidSaveTextDocument` → 保存 `.svg` 后 `refresh(document.uri)`；
   - `workspace.onDidCreateFiles` / `onDidDeleteFiles` → 增删后 `refresh(files)`；
   - 手动命令 `svgEditor.refreshDecorations` → `refreshAll()`（`fire(undefined)`）。
   VSCode 收到事件后，会**重新调用** `provideFileDecoration` 来拿新结果。

一句话：**插件提供 `badge/tooltip` 这段“附加数据”，VSCode 把它合并进自己对该条目的渲染**；插件通过事件“请求重算”，从不直接操作 Explorer 的 DOM/视图。

### 1.3 A.2 的实际调用链：`registerDocumentSymbolProvider` → `provideDocumentSymbols`

1. **注册**：`vscode.languages.registerDocumentSymbolProvider(selector, outlineProvider)`（`src/extension.ts`），`selector` 用 `[{ language: 'xml' }, { pattern: '**/*.svg' }, { pattern: '*.svg' }]` 匹配 `.svg` 文档。

2. **VSCode 回调**：当匹配的文档被打开、切到 Outline 视图、或**文档内容发生变化**时，VSCode 会调用
   `outlineProvider.provideDocumentSymbols(document, token)`（`src/outlineProvider.ts`）。实现里：
   ```ts
   const text = document.getText();
   const nodes = parseSvgOutline(text);              // 每次都读最新文本
   return nodes.map((n) => this.toSymbol(n, document, text)); // OutlineNode → DocumentSymbol
   ```
   每个 `DocumentSymbol` 的 `range` 用 `document.positionAt(startOffset/endOffset)` 换算成行列；`selectionRange` 用开始标签区间。VSCode 用它渲染大纲树、面包屑，并支持点击跳转。
3. **自动更新**：因为 VSCode 在 `onDidChangeTextDocument` 之后会重新调用 provider，我们**无需**自己监听文档变化——只要保证每次解析用的是 `document.getText()` 的最新文本（本实现如此）。这同样是控制反转：插件不推动更新，由 VSCode 在合适时机来“拉取”数据。

**选择器为什么要三条**：`**/*.svg` 覆盖工作区内的多级路径；工作区**根目录**下的文件
（例如把 `examples/` 直接当工作区打开，`flowchart.svg` 的相对路径就是 `flowchart.svg`）
需要额外一条 `*.svg`；`language: 'xml'` 则覆盖"`*.svg` 被别的语法扩展关联成 xml"的情况。
**这条是运行时才暴露的坑**：单测直接调 provider 永远发现不了选择器不匹配——
表现就是大纲显示「活动编辑器无法提供大纲信息」，而 `Ctrl+Shift+O` 同样无输出。

**另一个真实约束**：大纲只对**文本编辑器**有效。若 `.svg` 被 image preview 一类的自定义编辑器接管，
活动编辑器就不是 `TextDocument`，符号 provider 不会参与，这时需要
`右键标签 → 重新打开方式 → 文本编辑器`，或用
`"workbench.editorAssociations": { "*.svg": "default" }` 固定成文本编辑器。

### 1.4 小结

| 能力 | 插件做的 | VSCode 做的 |
|---|---|---|
| A.1 徽标 | 注册 provider；`provideFileDecoration` 返回 `{badge,tooltip}`；用事件请求刷新 | 保存 provider；渲染 Explorer 时回调；缓存并按事件重算 |
| A.2 大纲 | 注册 provider；`provideDocumentSymbols` 返回 `DocumentSymbol[]` | 决定匹配文档；在打开/变更时回调；渲染 Outline 视图/面包屑 |

---

## 2. 文件装饰 vs 经典 **Decorator** 与 **Adapter** 模式

### 2.1 GoF Decorator（装饰器）模式要点

经典 Decorator：**包装一个与自身实现同一接口的对象**，在转发调用前后**添加职责**，并且可以**层层叠加**（`new A(new B(new C()))`）。其特征是：持有被装饰对象引用、实现同一接口、把方法调用**委托**给内部对象。典型如 Java `BufferedReader(new FileReader(...))`。

### 2.2 GoF Adapter（适配器）模式要点

经典 Adapter：把一个类的**接口转换成客户端期望的另一个接口**，让原本不兼容的两者协同工作。特征是“**接口转换**”，Adapter 通常持有被适配对象（对象适配器）并转发调用，或通过多继承（类适配器）复用。

### 2.3 `FileDecoration` 与这两者的对应关系、以及关键差异

**对应关系：**

- VSCode 内部把 `FileDecorationProvider` 当作一个**适配器**：它把“文件系统条目”（`Uri` + 可选的 `FileStat` 元数据）**适配**成“可显示的条目视图”（`FileDecoration`：`badge`/`color`/`tooltip`）。“文件条目 → 显示条目”正是 Adapter 的“**接口转换**”语义，`provideFileDecoration` 就是那个转换函数。
- 从效果上看，它也像 Decorator：给文件条目**附加了额外的显示信息**（`[]` 徽标、悬停提示），而不改变原条目本身。

**关键差异（为什么它不是“经典”的这两种）：**

1. **不是“包装对象 + 转发调用”**。真实的 `FileDecoration` 只是一个**纯数据对象**（`{ badge, tooltip, color }`，见 `vscode-svg/types/vscode.d.ts` 的 `interface FileDecoration`），它**不持有**被装饰的文件条目、**不实现**任何与被装饰对象相同的接口、也**不委托**任何方法。因此不符合 GoF Decorator 的“包装同一接口并转发”的形式。
2. **不可层层嵌套叠加**。经典 Decorator 靠“装饰器套装饰器”实现能力叠加；而这里插件返回的是**单个**装饰描述，**叠加由 VSCode 自己完成**（VSCode 把这段附加信息合并进它对资源的渲染；多个 provider 的结果由宿主聚合）。插件之间不是“外壳套外壳”的包装链，而是“各自注册、宿主合并”。
3. **注册式（registration-based）而非继承式/包装式**。经典 Decorator/Adapter 往往通过**继承或包装**在编译期就确立组合；而 `registerFileDecorationProvider` 是**运行期注册**——插件只把 provider “登记”给 VSCode，真正把 provider 和资源条目“拼”在一起的是 **VSCode 内核**。插件既不继承、也不包装资源条目。

**结论：** 更准确的说法是——这是一种**“注册式装饰/适配”**：`FileDecorationProvider` 是**适配器**（把文件系统条目适配成可显示条目），`FileDecoration` 是**附件的显示信息**（装饰的结果数据），但整个机制**不是** GoF 那种“包装同一接口、转发调用、可叠加”的继承式/包装式装饰，而是“**插件注册能力、宿主负责组合与渲染**”的适配。

---

## 3. 复用 Phase 1 代码的评估（基于真实代码）

先读了三处关键代码，结论以**实际实现**为准（尤其纠正一个常见误解：`XmlParser` 并不记录偏移）。

### 3.1 `src/io/xml/XmlParser.ts` 与 `src/io/xml/XmlElement.ts`：能解析，但**没有偏移信息**、且**遇错即抛**

- `class XmlParser`（`src/io/xml/XmlParser.ts`）的 `parse(source: string): XmlElement` 用手写递归下降解析 XML 声明、注释、CDATA、DOCTYPE、自闭合标签、单双引号属性、实体解码，能力上与 A.2 需要的“结构解析”高度重合。
- 但产物 `interface XmlElement`（`src/io/xml/XmlElement.ts`）只有 `name / attributes / children / text` **四个字段，没有任何 `startOffset`/`endOffset`**。而 A.2 的硬需求正是“每个 symbol 的 `range` 覆盖该元素的整段源码、`selectionRange` 覆盖开始标签”——**需要精确源码偏移**，`XmlElement` 无法提供。
- 另外，`XmlParser` 在遇到残缺 XML 时通过 `this.error(...)` 抛 `EditorError`（`src/core/errors/EditorError.ts`，信息以 `invalid svg:` 开头），是**快速失败**策略；而 A.2 要求“编辑中途不完整时**不得抛异常**，返回 `[]`”。语义相反。

**因此**：A.2 **没有**直接 `import` 复用 `XmlParser`，而是另写了独立的 `vscode-svg/src/outlineParser.ts`——一个**记录偏移**、**容错返回 `[]`** 的轻量结构解析器（复用“手写递归下降 + 处理 CDATA/注释/自闭合/引号属性”的**思路**，但作为独立文件实现，避免改动 `src/`）。这是“**借鉴思路、重写实现**”，而不是“直接复制文件”。

> 说明为什么不去改造 `XmlParser` 让它记录偏移：① 本作业约束禁止修改仓库根 `src/`；② 即便允许，让 CLI 的解析器同时承担“带偏移、可容错”的职责也会污染其“严格校验、失败即报错”的既有契约，影响 Phase 1 的 `io.test.ts` 等测试；③ 扩展需要独立打包，耦合 CLI 内部模块会带来不必要的依赖。

### 3.2 `src/core/model/*`（`Shape` / `ContainerShape` / `SvgDocument` / `Group`）：**不宜复用**

- `abstract class Shape`（`src/core/model/Shape.ts`）是**可编辑领域模型**：它有 `captureState()` / `restoreState()`（第 215–242 行）为**撤销（Memento）**服务，有 `moveBy` / `scaleBy` / `setAttribute` 等修改方法，`label` 固定为 `${typeName}#${id}`（第 67–69 行），几何值都是**私有字段**（封装，非数据袋）。
- `ContainerShape`（`ContainerShape.ts`）、`SvgDocument`（`SvgDocument.ts`）、`Group`（`Group.ts`）构成一棵**可变、可命令化**的图形树；`SvgDocument` 还带 `resize/setOrigin` 等编辑操作。
- 更关键的是：这套模型**不保留源码偏移**，而且是“**语义模型**”而非“**文本结构模型**”。配套的 `src/io/SvgReader.ts` 还会在 `resolveId`（第 112–133 行）里**给无 id 元素自动分配 id**（如 `rect1`）并发出 warning——如果复用这套模型来生成大纲，节点名会变成 `rect#rect1` 而不是需求要求的“无 id 时只显示标签名 `rect`”。
- A.2 的大纲是**只读、结构化、需要源码偏移**的展示；它没有 undo 需求、没有命令、没有图形几何语义。**把命令/撤销/注册表那一整套装配拉进来是过度耦合**。

**因此**：模型层（`Shape`/`ContainerShape`/`SvgDocument`/`Group`）与 `SvgReader` **全部不复用**，A.2 用“纯结构 + 偏移”的 `OutlineNode` 自建轻量树。

### 3.3 `src/render/*`（`TreeRenderer` 等）：**不复用**

- `class TreeRenderer`（`src/render/TreeRenderer.ts`）的 `renderDocument` / `renderSubtree` 输出的是给 CLI 终端看的**ASCII 树文本**（`├──`/`└──` 缩进、按 `treeSummary()` 对齐），并依赖 `ShapeTypeRegistry.findProvider(...).treeAnnotation(shape)`（第 67–70 行）和 `Shape.treeSummary()`。
- 它的“消费者”是**终端文本**；而 A.2 的消费者是 **VSCode 的 `DocumentSymbol` 结构化对象**（要 `range`/`selectionRange`/`kind`/`children`）。两者数据形态与依赖完全不同，`TreeRenderer` 无法产出带源码偏移的 `DocumentSymbol`。

**因此**：`render/*` 不复用；`OutlineNode → DocumentSymbol` 的转换放在 `vscode-svg/src/outlineProvider.ts`。

### 3.4 可“部分借鉴”的：`ShapeProvider` / `ShapeTypeRegistry` 的**可扩展思路**

- `src/core/registry/ShapeProvider.ts` 与 `ShapeTypeRegistry.ts` 体现的“**按类型名/标签名分派、内核无 `switch`**”的插件化思路值得借鉴（Phase 2 第二部分若要让大纲认识自定义元素，可引入类似的 provider 注册机制）。但本阶段 A.2 **只做结构解析**，不需要类型语义，因此未实际引入。

### 3.5 不能复用 CLI 装配代码（`src/main.ts` / `src/cli/*` / `src/app/EditorSession.ts`）

- `src/main.ts`、`src/cli/CliApplication.ts`、`Repl.ts`、`CommandDispatcher.ts`、`src/app/EditorSession.ts` 是 **CLI 的装配层**：它们绑定 `NodeFileStore`、`readline` 交互循环、`CommandHistory` 撤销栈等。
- VSCode 扩展必须**独立打包**（`vscode-svg/package.json` 的 `main: ./dist/src/extension.js`），运行在 **Extension Host（Node 进程但 API 为 `vscode`）**中；把 CLI 的 `readline`/文件 IO/命令历史装配代码拖进来，既无用（扩展不做命令行编辑），又会带来多余的进程/IO 依赖与启动负担。

### 3.6 复用结论一览

| Phase 1 模块 | 是否复用 | 原因 |
|---|---|---|
| `XmlParser`（`src/io/xml/XmlParser.ts`） | **否（借鉴思路重写）** | 无 `startOffset/endOffset`；遇错抛 `EditorError`，与“容错返回 `[]`”冲突 |
| `XmlElement`（`src/io/xml/XmlElement.ts`） | 否（结构概念借鉴） | 仅 `name/attributes/children/text`，缺偏移字段 |
| `SvgReader`（`src/io/SvgReader.ts`） | **否** | 会重构模型、自动补 id，破坏“无 id 只显示标签名”；无偏移 |
| `Shape`/`ContainerShape`/`SvgDocument`/`Group`（`src/core/model/*`） | **否** | 可编辑 + 撤销（Memento）+ 命令耦合；是语义模型非文本结构 |
| `ShapeTypeRegistry`/`ShapeProvider`（`src/core/registry/*`） | **否（思路借鉴）** | 本阶段只做结构解析，不需要类型语义 |
| `TreeRenderer`（`src/render/TreeRenderer.ts`） | **否** | 输出 ASCII 文本、依赖 `treeSummary()`，无法产出带偏移的 `DocumentSymbol` |
| `main.ts` / `src/cli/*` / `EditorSession` | **否** | CLI 装配层，含 readline/命令历史/NodeFileStore，不适合独立扩展 |

**总方针：** 扩展是“**纯文本、只读、结构化**”的消费者，而 Phase 1 是“**可编辑、命令化、带撤销**”的 CLI 应用；两者共享的只有“XML 结构解析”的**思路**。因此扩展在 `vscode-svg/` 内**自包含**实现解析与适配，只在概念上借鉴 `XmlParser` 的手写递归下降，既满足偏移与容错需求，又遵守“不改 `src/`、不引入 CLI 装配”的约束。
