import type { CommandEntry } from './CommandDispatcher';

/** `help` 输出：全部命令 + 内置图形类型 + 约定提示。 */
export class HelpText {
  public lines(entries: readonly CommandEntry[], shapeTypes: readonly string[]): string[] {
    const lines = ['commands:'];
    for (const entry of entries) {
      lines.push(`  ${entry.usage.padEnd(46)}${entry.summary}`);
    }
    lines.push('');
    lines.push(`shape types (create <type> <id> …): ${shapeTypes.join(' ')}`);
    lines.push('');
    lines.push(`notes:`);
    lines.push(`  lines starting with '#' are comments (useful for script replay)`);
    lines.push(`  double-quote arguments containing spaces: "My Diagram"`);
    lines.push(`  every shape has a unique id; commands locate shapes by id only`);
    lines.push(`  doc commands (init/read/save/canvas) disable undo/redo until the next edit command`);
    return lines;
  }
}