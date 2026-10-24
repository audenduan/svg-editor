import { EditorError } from '../core/errors/EditorError';
import { CommandLineTokenizer } from './CommandLineTokenizer';
import type { CommandDispatcher } from './CommandDispatcher';
import type { OutputPort } from './OutputPort';

/**
 * 交互外壳的"一行"执行器：去注释、分词、分发、统一 `error:` 前缀。
 * REPL（交互）与脚本回放（管道输入）都复用同一个 `executeLine`。
 */
export class CliApplication {
  public constructor(
    private readonly dispatcher: CommandDispatcher,
    private readonly output: OutputPort,
    private readonly tokenizer = new CommandLineTokenizer(),
  ) {}

  public executeLine(line: string): void {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      return;
    }
    try {
      const tokens = this.tokenizer.tokenize(trimmed);
      const name = tokens[0];
      if (name === undefined) {
        return;
      }
      const entry = this.dispatcher.find(name);
      if (entry === null) {
        throw new EditorError(`unknown command: ${name}. type 'help' for commands`);
      }
      for (const outputLine of entry.run(tokens.slice(1))) {
        this.output.writeLine(outputLine);
      }
    } catch (error) {
      // 需求 2：错误统一 `error:` 前缀，一行一条；失败不改变任何状态。
      this.output.writeLine(`error: ${toMessage(error)}`);
    }
  }
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}