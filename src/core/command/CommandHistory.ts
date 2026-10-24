import { EditorError } from '../errors/EditorError';
import type { Command } from './Command';

/**
 * 撤销/重做栈 + "文档类命令之后禁止 undo/redo" 的闸门。
 *
 * 闸门规则来自需求 4.3：`init` / `read` / `save` / `canvas` 改尺寸属于文档类命令，
 * 执行后 undo/redo 一律报 `not allowed after io command`，直到下一条**成功的**编辑命令
 * 重新解禁。`init` / `read` 同时清空两个栈（旧命令作用在已被替换的文档上，无法重放）。
 */
export class CommandHistory {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];
  private lockedAfterIo = false;

  public run(command: Command): string {
    const message = command.execute();
    this.undoStack.push(command);
    // 经典规则：undo 之后又有新编辑，redo 栈清空。
    this.redoStack.length = 0;
    this.lockedAfterIo = false;
    return message;
  }

  public undo(): string {
    if (this.lockedAfterIo) {
      throw new EditorError('undo not allowed after io command');
    }
    const command = this.undoStack.pop();
    if (command === undefined) {
      throw new EditorError('nothing to undo');
    }
    const message = command.undo();
    this.redoStack.push(command);
    return message;
  }

  public redo(): string {
    if (this.lockedAfterIo) {
      throw new EditorError('redo not allowed after io command');
    }
    const command = this.redoStack.pop();
    if (command === undefined) {
      throw new EditorError('nothing to redo');
    }
    const message = command.execute();
    this.undoStack.push(command);
    return message;
  }

  /** `save` / `canvas` 改尺寸：历史保留但闸门落下。 */
  public lockAfterIo(): void {
    this.lockedAfterIo = true;
  }

  /** `init` / `read`：文档被整体替换，历史清空且闸门落下。 */
  public resetAfterIo(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.lockedAfterIo = true;
  }

  public get undoDepth(): number {
    return this.undoStack.length;
  }

  public get redoDepth(): number {
    return this.redoStack.length;
  }
}
