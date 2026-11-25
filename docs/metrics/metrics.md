# 代码指标（由 scripts/metrics.mjs 生成，勿手改）

- 基线（base）：`final`
- 对比（head）：`WORKTREE`
- 生成命令：`node scripts/metrics.mjs --base final --head WORKTREE`

## 按类别：行数

| 类别 | 基线行数 | 当前行数 | 增量 |
|---|---|---|---|
| 内核 | 2593 | 3157 | +564 |
| 装配处 | 431 | 480 | +49 |
| 插件 | 0 | 324 | +324 |
| VSCode 扩展 | 0 | 593 | +593 |
| 其他 | 955 | 1120 | +165 |

## 按类别：文件数

| 类别 | 基线 | 当前 | 增量 |
|---|---|---|---|
| 内核 | 44 | 52 | +8 |
| 装配处 | 7 | 9 | +2 |
| 插件 | 0 | 5 | +5 |
| VSCode 扩展 | 0 | 5 | +5 |
| 其他 | 9 | 10 | +1 |

## 按类别：圈复杂度增量（判断点计数）

| 类别 | 基线 | 当前 | 增量 |
|---|---|---|---|
| 内核 | 228 | 275 | +47 |
| 装配处 | 31 | 35 | +4 |
| 插件 | 0 | 13 | +13 |
| VSCode 扩展 | 0 | 61 | +61 |
| 其他 | 10 | 12 | +2 |

## 文件清单与职责（当前）

| 文件 | 类别 | 行数 | 判断点 |
|---|---|---|---|
| `src/cli/CliApplication.ts` | 装配处 | 47 | 7 |
| `src/cli/CommandDispatcher.ts` | 装配处 | 45 | 1 |
| `src/cli/CommandLineTokenizer.ts` | 装配处 | 40 | 7 |
| `src/cli/HelpText.ts` | 装配处 | 20 | 1 |
| `src/cli/OutputPort.ts` | 装配处 | 13 | 0 |
| `src/cli/Repl.ts` | 装配处 | 51 | 4 |
| `src/host/assemble.ts` | 装配处 | 78 | 3 |
| `src/host/builtinPlugin.ts` | 装配处 | 169 | 12 |
| `src/main.ts` | 装配处 | 17 | 0 |
| `src/app/EditorSession.ts` | 内核 | 335 | 42 |
| `src/core/command/AddToContainerCommand.ts` | 内核 | 34 | 1 |
| `src/core/command/Command.ts` | 内核 | 15 | 0 |
| `src/core/command/CommandHistory.ts` | 内核 | 71 | 4 |
| `src/core/command/CreateShapeCommand.ts` | 内核 | 23 | 0 |
| `src/core/command/DeleteShapeCommand.ts` | 内核 | 28 | 1 |
| `src/core/command/GroupShapesCommand.ts` | 内核 | 64 | 7 |
| `src/core/command/MoveShapeCommand.ts` | 内核 | 40 | 2 |
| `src/core/command/ReorderShapeCommand.ts` | 内核 | 34 | 1 |
| `src/core/command/ScaleShapeCommand.ts` | 内核 | 41 | 2 |
| `src/core/command/SetAttributeCommand.ts` | 内核 | 54 | 6 |
| `src/core/command/ShapeStateRecorder.ts` | 内核 | 35 | 3 |
| `src/core/command/UngroupShapeCommand.ts` | 内核 | 50 | 4 |
| `src/core/errors/EditorError.ts` | 内核 | 14 | 0 |
| `src/core/model/Circle.ts` | 内核 | 16 | 0 |
| `src/core/model/ContainerShape.ts` | 内核 | 109 | 7 |
| `src/core/model/Ellipse.ts` | 内核 | 18 | 0 |
| `src/core/model/Group.ts` | 内核 | 14 | 0 |
| `src/core/model/Line.ts` | 内核 | 25 | 0 |
| `src/core/model/numbers.ts` | 内核 | 38 | 3 |
| `src/core/model/Rect.ts` | 内核 | 32 | 0 |
| `src/core/model/Shape.ts` | 内核 | 326 | 28 |
| `src/core/model/ShapeContainer.ts` | 内核 | 31 | 0 |
| `src/core/model/ShapeState.ts` | 内核 | 15 | 0 |
| `src/core/model/SvgDocument.ts` | 内核 | 146 | 6 |
| `src/core/model/TextShape.ts` | 内核 | 72 | 3 |
| `src/core/plugin/AttributeHandler.ts` | 内核 | 39 | 0 |
| `src/core/plugin/AttributeHandlerRegistry.ts` | 内核 | 38 | 3 |
| `src/core/plugin/CommandExtension.ts` | 内核 | 43 | 0 |
| `src/core/plugin/CommandRegistry.ts` | 内核 | 32 | 2 |
| `src/core/plugin/ExtensionRegistry.ts` | 内核 | 176 | 19 |
| `src/core/plugin/PluginContext.ts` | 内核 | 34 | 0 |
| `src/core/plugin/TreeDecorator.ts` | 内核 | 33 | 0 |
| `src/core/plugin/TreeDecoratorRegistry.ts` | 内核 | 47 | 4 |
| `src/core/registry/BaseShapeProvider.ts` | 内核 | 58 | 8 |
| `src/core/registry/CircleProvider.ts` | 内核 | 21 | 0 |
| `src/core/registry/createDefaultShapeTypeRegistry.ts` | 内核 | 25 | 0 |
| `src/core/registry/EllipseProvider.ts` | 内核 | 22 | 0 |
| `src/core/registry/GroupProvider.ts` | 内核 | 16 | 0 |
| `src/core/registry/LineProvider.ts` | 内核 | 22 | 0 |
| `src/core/registry/RectProvider.ts` | 内核 | 22 | 0 |
| `src/core/registry/ShapeProvider.ts` | 内核 | 57 | 0 |
| `src/core/registry/ShapeTypeRegistry.ts` | 内核 | 107 | 18 |
| `src/core/registry/TextProvider.ts` | 内核 | 20 | 0 |
| `src/io/FileStore.ts` | 内核 | 13 | 0 |
| `src/io/NodeFileStore.ts` | 内核 | 23 | 2 |
| `src/io/SvgReader.ts` | 内核 | 202 | 37 |
| `src/io/SvgWriter.ts` | 内核 | 111 | 10 |
| `src/io/xml/XmlElement.ts` | 内核 | 9 | 0 |
| `src/io/xml/XmlParser.ts` | 内核 | 227 | 47 |
| `src/render/ShowRenderer.ts` | 内核 | 9 | 0 |
| `src/render/TreeRenderer.ts` | 内核 | 71 | 5 |
| `tests/command.test.ts` | 其他 | 223 | 0 |
| `tests/errors.test.ts` | 其他 | 133 | 2 |
| `tests/extensions.test.ts` | 其他 | 147 | 2 |
| `tests/geometry.test.ts` | 其他 | 126 | 1 |
| `tests/io.test.ts` | 其他 | 126 | 1 |
| `tests/registry.test.ts` | 其他 | 90 | 3 |
| `tests/support/BufferOutput.ts` | 其他 | 10 | 0 |
| `tests/support/MemoryFileStore.ts` | 其他 | 35 | 2 |
| `tests/support/testHarness.ts` | 其他 | 45 | 1 |
| `tests/transcript.test.ts` | 其他 | 185 | 0 |
| `plugins/command-dir/src/directoryAccess.ts` | 插件 | 46 | 4 |
| `plugins/command-dir/src/index.ts` | 插件 | 64 | 2 |
| `plugins/command-dir/tests/dir.test.ts` | 插件 | 108 | 2 |
| `plugins/command-stats/src/index.ts` | 插件 | 55 | 4 |
| `plugins/command-stats/tests/stats.test.ts` | 插件 | 51 | 1 |
| `vscode-svg/src/extension.ts` | VSCode 扩展 | 53 | 1 |
| `vscode-svg/src/fileDecorationProvider.ts` | VSCode 扩展 | 53 | 3 |
| `vscode-svg/src/outlineParser.ts` | VSCode 扩展 | 276 | 46 |
| `vscode-svg/src/outlineProvider.ts` | VSCode 扩展 | 74 | 10 |
| `vscode-svg/tests/outlineParser.test.ts` | VSCode 扩展 | 137 | 1 |

