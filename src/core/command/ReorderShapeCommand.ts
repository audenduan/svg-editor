import type { Shape } from '../model/Shape';
import type { Command } from './Command';

export type ReorderDirection = 'front' | 'back';

/** `front` / `back`：在同级兄弟中把图形移到最前 / 最后（z-order）。 */
export class ReorderShapeCommand implements Command {
  private oldIndex = -1;

  public constructor(
    private readonly shape: Shape,
    private readonly direction: ReorderDirection,
  ) {}

  public execute(): string {
    const parent = this.shape.requireParent();
    this.oldIndex = parent.indexOfChild(this.shape);
    parent.removeChild(this.shape);
    if (this.direction === 'front') {
      parent.insertChildAt(parent.children.length, this.shape);
    } else {
      parent.insertChildAt(0, this.shape);
    }
    return `${this.shape.label} moved to ${this.direction}`;
  }

  public undo(): string {
    const parent = this.shape.requireParent();
    parent.removeChild(this.shape);
    parent.insertChildAt(this.oldIndex, this.shape);
    return `${this.shape.label} order restored`;
  }
}
