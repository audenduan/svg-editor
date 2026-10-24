import type { Shape } from '../model/Shape';
import type { ShapeContainer } from '../model/ShapeContainer';
import type { Command } from './Command';

/** `delete`：把图形（容器则连同整棵子树）从父容器摘下；undo 放回原下标。 */
export class DeleteShapeCommand implements Command {
  private parent: ShapeContainer | null = null;
  private index = -1;

  public constructor(private readonly shape: Shape) {}

  public execute(): string {
    const parent = this.shape.requireParent();
    this.parent = parent;
    this.index = parent.indexOfChild(this.shape);
    parent.removeChild(this.shape);
    return `${this.shape.label} deleted`;
  }

  public undo(): string {
    if (this.parent === null) {
      throw new Error('delete command was not executed');
    }
    this.parent.insertChildAt(this.index, this.shape);
    return `${this.shape.label} restored into ${this.parent.containerLabel}`;
  }
}
