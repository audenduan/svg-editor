import type { CommandContext, CommandExtension } from '../core/plugin/CommandExtension';
import type { CommandRegistry } from '../core/plugin/CommandRegistry';

/** 一条命令的注册项：usage/summary 供 help；run 接收已分词的参数并返回输出行。 */
export interface CommandEntry {
  readonly name: string;
  readonly usage: string;
  readonly summary: string;
  run(tokens: readonly string[]): readonly string[];
}

/**
 * 命令分发：命令名 → 实现。
 *
 * Phase 2 起这里**不再有内置命令表**：所有命令（Phase 1 的内置命令、`stats`、`dir`）
 * 都以 `CommandExtension` 的形式注册进 `CommandRegistry`，分发器只做查表与上下文注入。
 * 因此"新增一条命令"不需要改动本文件，"删掉插件"也不会留下悬空分支。
 */
export class CommandDispatcher {
  public constructor(
    private readonly commands: CommandRegistry,
    private readonly context: () => CommandContext,
  ) {}

  public find(name: string): CommandEntry | null {
    const command = this.commands.find(name);
    if (command === null) {
      return null;
    }
    return this.adapt(command);
  }

  public list(): readonly CommandEntry[] {
    return this.commands.list().map((command) => this.adapt(command));
  }

  private adapt(command: CommandExtension): CommandEntry {
    return {
      name: command.name,
      usage: command.usage,
      summary: command.summary,
      run: (tokens) => command.run(tokens, this.context()),
    };
  }
}