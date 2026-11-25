import type { AttributeApplyContext, AttributeHandler } from '../plugin/AttributeHandler';
import type { Shape } from '../model/Shape';
import type { Command } from './Command';
import { ShapeStateRecorder } from './ShapeStateRecorder';

/**
 * `set`：设置属性。
 *
 * 两条路径（需求 phase_cli_2 §3.2）：
 * 1. 有 `AttributeHandler` 命中 → 由处理器执行（可改多个子部件）；
 * 2. 没有处理器 → Phase 1 的默认规则（图形自身的属性白名单，未知属性报错）。
 *
 * 一次 `set` 仍是一个 undo 单元：执行前快照整棵子树，`undo` 整体还原；
 * 处理器中途抛错时立即还原并**不转入**默认路径，避免掩盖错误或重复修改。
 */
export class SetAttributeCommand implements Command {
  private readonly recorder = new ShapeStateRecorder();

  public constructor(
    private readonly shape: Shape,
    private readonly attributeName: string,
    private readonly value: string,
    private readonly handler: AttributeHandler | null,
    private readonly context: AttributeApplyContext,
  ) {}

  public execute(): string {
    this.recorder.capture(this.shape);
    if (this.handler === null) {
      this.shape.setAttribute(this.attributeName, this.value);
    } else {
      try {
        this.handler.apply(this.shape, this.attributeName, this.value, this.context);
      } catch (error) {
        // 事务回滚：文档恢复到执行前；命令未入栈，undo 历史保持不变。
        this.recorder.restore();
        throw error;
      }
    }
    return `${this.shape.label} updated: ${this.describe(this.attributeName, this.value)}`;
  }

  public undo(): string {
    this.recorder.restore();
    const fromHandler = this.handler?.read?.(this.shape, this.attributeName) ?? null;
    const restored = fromHandler ?? this.shape.getAttribute(this.attributeName) ?? '';
    return `${this.shape.label} updated: ${this.describe(this.attributeName, restored)}`;
  }

  private describe(name: string, value: string): string {
    // 文本类属性按需求回显带引号：text="My Diagram v2" / label="开始"
    return name === 'text' || name === 'label' ? `${name}="${value}"` : `${name}=${value}`;
  }
}