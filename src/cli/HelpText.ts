import type { CommandBrief } from '../core/plugin/CommandExtension';

/** 用法列的最小宽度；实际宽度取"最长用法 + 2"，避免长用法把说明挤到同一行。 */
const MIN_USAGE_COLUMN = 46;

/** `help` 输出：全部命令 + 已注册图形类型 + 约定提示。 */
export class HelpText {
  public lines(commands: readonly CommandBrief[], shapeTypes: readonly string[]): string[] {
    // 列宽按实际命令表计算：插件命令的用法可能比内置命令更长（Phase 1 固定 46 列会溢出）。
    const column = Math.max(MIN_USAGE_COLUMN, ...commands.map((command) => command.usage.length + 2));
    const lines = ['commands:'];
    for (const command of commands) {
      lines.push(`  ${command.usage.padEnd(column)}${command.summary}`);
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