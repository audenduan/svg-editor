import type { Shape } from '../model/Shape';
import type { Command } from './Command';
import { ShapeStateRecorder } from './ShapeStateRecorder';

/**
 * `set`：设置属性（样式 / 几何 / text 内容）。
 *
 * 执行前快照整棵子树：容器上 `set` 目前只改自身属性，但插件复合图形（box）会
 * 把 `fill` 传播到子部件——快照范围覆盖子树后，undo 对"传播"同样成立。
 */
export class SetAttributeCommand implements Command {
  private readonly recorder = new ShapeStateRecorder();

  public constructor(
    private readonly shape: Shape,
    private readonly attributeName: string,
    private readonly value: string,
  ) {}

  public execute(): string {
    this.recorder.capture(this.shape);
    this.shape.setAttribute(this.attributeName, this.value);
    return `${this.shape.label} updated: ${this.describe(this.attributeName, this.value)}`;
  }

  public undo(): string {
    this.recorder.restore();
    const restored = this.shape.getAttribute(this.attributeName) ?? '';
    return `${this.shape.label} updated: ${this.describe(this.attributeName, restored)}`;
  }

  private describe(name: string, value: string): string {
    // 文本内容按需求回显带引号：text="My Diagram v2"
    return name === 'text' ? `text="${value}"` : `${name}=${value}`;
  }
}
