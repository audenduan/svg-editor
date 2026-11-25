import type { CommandBrief } from '../core/plugin/CommandExtension';

/** `help` 输出：全部命令 + 已注册图形类型 + 约定提示。 */
export class HelpText {
  public lines(commands: readonly CommandBrief[], shapeTypes: readonly string[]): string[] {
    const lines = ['commands:'];
    for (const command of commands) {
      lines.push(`  ${command.usage.padEnd(46)}${command.summary}`);
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