import { EditorError } from '../errors/EditorError';
import type { CommandExtension } from './CommandExtension';

/**
 * 命令注册表（内核侧）：`Command` 扩展点的存放处。
 *
 * 内核的分发器只查这张表；内置命令与插件命令走同一条注册路径，
 * 因此"删掉某个命令插件"只是少一条注册，分发代码不变。
 */
export class CommandRegistry {
  private readonly commands = new Map<string, CommandExtension>();

  public register(command: CommandExtension): void {
    if (this.commands.has(command.name)) {
      throw new EditorError(`duplicate command: ${command.name}`);
    }
    this.commands.set(command.name, command);
  }

  public find(name: string): CommandExtension | null {
    return this.commands.get(name) ?? null;
  }

  public has(name: string): boolean {
    return this.commands.has(name);
  }

  /** 注册顺序即 `help` 顺序（内置命令先装，插件命令后装）。 */
  public list(): readonly CommandExtension[] {
    return [...this.commands.values()];
  }
}