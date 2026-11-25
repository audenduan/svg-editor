import type { SvgDocument } from '../model/SvgDocument';

/**
 * 扩展点 **`Command`**：一条可用命令。
 *
 * 内核（`CommandDispatcher` / `CliApplication`）只依赖本接口，按 `name` 分发；
 * 命令的参数解析、usage/summary 文案都由插件自己提供，内核不写任何 `if (name === 'stats')`。
 */
export interface CommandExtension {
  /** 命令名（全局唯一，也是 `help` 与重复注册检测的键）。 */
  readonly name: string;

  /** `help` 里的一行用法。 */
  readonly usage: string;

  /** `help` 里的一行说明。 */
  readonly summary: string;

  /**
   * 执行命令。`args` 是已分词的参数（不含命令名）。
   * 抛 `EditorError` 表示失败，CLI 统一加 `error:` 前缀；成功的输出行原样回显。
   */
  run(args: readonly string[], context: CommandContext): readonly string[];
}

/** 命令执行时可读取的内核状态（只读视图，命令不得直接改文档）。 */
export interface CommandContext {
  /** 当前文档；未执行 `init` / `read` 时为 `null`（`dir` 这类命令不依赖文档）。 */
  readonly document: SvgDocument | null;

  /** 已注册命令的用法与说明（注册顺序），供 `help` 自行排版。 */
  readonly commands: readonly CommandBrief[];

  /** 已注册图形类型名（注册顺序），供 `help` 展示。 */
  readonly shapeTypes: readonly string[];
}

/** `help` 用到的命令简要信息。 */
export interface CommandBrief {
  readonly name: string;
  readonly usage: string;
  readonly summary: string;
}