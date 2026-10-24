# svg-editor-cli

PJ1 Phase 1 —— 命令行 SVG 编辑器，TypeScript 实现。

## 运行

```bash
npm install
npm run cli
```

启动后进入 `svg>` 交互模式，`#` 开头的行视为注释，可直接把命令序列存成脚本回放：

```bash
node dist/src/main.js < examples/flowchart.txt
```

## 其它脚本

```bash
npm run build     # tsc 编译到 dist/
npm test          # 依赖方向检查 + 单元/集成测试
npm run check:deps  # 只跑依赖方向检查
```

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

架构方案、过程记录、一致性自查与质量保证手段见 [doc/README.md](doc/README.md)。
