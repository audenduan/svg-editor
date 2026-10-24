/**
 * Command 模式（本项目的核心模式）：一条编辑命令 = 一个可执行、可撤销的单元。
 *
 * 约定：
 * - `execute()` / `undo()` 返回**给用户的成功摘要**（CLI 直接回显，不需要再做格式化）；
 * - `execute()` 必须可重复调用（即 redo 直接再调一次 `execute()`），因此结构性命令
 *   在 `execute` 里现场记录"原来的位置"，而不是在构造函数里缓存；
 * - 命令失败时抛 `EditorError`，并且此时不得改动任何模型状态（先校验、后修改）。
 */
export interface Command {
  execute(): string;

  undo(): string;
}
