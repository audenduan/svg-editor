import type { OutputPort } from '../../src/cli/OutputPort';

/** 测试用输出端口：把 writeLine 收集到数组里。 */
export class BufferOutput implements OutputPort {
  public readonly lines: string[] = [];

  public writeLine(line: string): void {
    this.lines.push(line);
  }
}