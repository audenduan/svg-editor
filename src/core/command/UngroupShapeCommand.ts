import type { ContainerShape } from '../model/ContainerShape';
import type { Shape } from '../model/Shape';
import type { ShapeContainer } from '../model/ShapeContainer';
import type { Command } from './Command';

/**
 * `ungroup`：解散容器，子图形提升到原容器的父级、占据原容器位置。
 *
 * 两个前置校验由调用方完成：不能解散根级容器（`svg` 直接子节点）、
 * 不能解散插件复合图形（`isComposite()` 为 `true`）。
 */
export class UngroupShapeCommand implements Command {
  private hostParent: ShapeContainer | null = null;
  private hostIndex = -1;
  private moved: Shape[] = [];

  public constructor(private readonly group: ContainerShape) {}

  public execute(): string {
    const parent = this.group.requireParent();
    this.hostParent = parent;
    this.hostIndex = parent.indexOfChild(this.group);
    this.moved = [...this.group.children];
    parent.removeChild(this.group);
    // 必须先让容器与子图形脱钩：否则子图形会同时挂在两个父容器上，
    // undo 时再 appendChild 就会产生重复子节点（自检脚本发现的真实缺陷）。
    for (const child of this.moved) {
      this.group.removeChild(child);
    }
    this.moved.forEach((child, offset) => {
      parent.insertChildAt(this.hostIndex + offset, child);
    });
    return `${this.group.label} dissolved, ${this.moved.length} children moved to ${parent.containerLabel}`;
  }

  public undo(): string {
    if (this.hostParent === null) {
      throw new Error('ungroup command was not executed');
    }
    for (const child of this.moved) {
      this.hostParent.removeChild(child);
    }
    for (const child of this.moved) {
      this.group.appendChild(child);
    }
    this.hostParent.insertChildAt(this.hostIndex, this.group);
    return `${this.group.label} restored with ${this.moved.length} children`;
  }
}
