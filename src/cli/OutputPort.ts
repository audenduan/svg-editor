/** 输出端口：CLI 只依赖它写用户可见的输出（测试注入内存实现）。 */
export interface OutputPort {
  writeLine(line: string): void;
}

/** 输出到控制台 stdout 的默认实现。 */
export class ConsoleOutput implements OutputPort {
  public constructor(private readonly stream: NodeJS.WritableStream = process.stdout) {}

  public writeLine(line: string): void {
    this.stream.write(`${line}\n`);
  }
}