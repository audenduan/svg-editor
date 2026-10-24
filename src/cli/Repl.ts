import { createInterface } from 'node:readline';
import type { CliApplication } from './CliApplication';
import type { OutputPort } from './OutputPort';

/** 启动横幅（需求 6 transcript 逐字一致）。 */
export const BANNER = "svg-editor 0.1 — type 'help' for commands";

export interface ReplOptions {
  readonly input: NodeJS.ReadableStream;
  readonly output: OutputPort;
  /** readline 输出流（提示符写到这里）；交互模式为 process.stdout。 */
  readonly promptStream: NodeJS.WritableStream;
  /** 是否为交互终端：是则显示 `svg>` 提示符，管道/重定向时不显示。 */
  readonly interactive: boolean;
}

/**
 * REPL 主循环：横幅 → 逐行 `svg>` 提示 → 执行 → 循环；`#` 开头的行是注释。
 * 脚本回放（`node dist/src/main.js < script.txt`）走同一路径，只是不开提示符。
 */
export class Repl {
  public constructor(
    private readonly options: ReplOptions,
    private readonly application: CliApplication,
  ) {}

  public start(): void {
    this.options.output.writeLine(BANNER);
    if (this.options.interactive) {
      this.options.output.writeLine('');
    }
    const readline = createInterface({
      input: this.options.input,
      output: this.options.promptStream,
      terminal: this.options.interactive,
    });
    readline.setPrompt('svg> ');
    readline.on('line', (line) => {
      this.application.executeLine(line);
      if (this.options.interactive) {
        readline.prompt();
      }
    });
    if (this.options.interactive) {
      readline.prompt();
    }
    readline.on('close', () => {
      // stdin 结束（交互时 Ctrl+D，脚本时 EOF）即正常退出。
    });
  }
}