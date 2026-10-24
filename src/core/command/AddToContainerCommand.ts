import type { ContainerShape } from '../model/ContainerShape';
import type { Shape } from '../model/Shape';
import type { ShapeContainer } from '../model/ShapeContainer';
import type { Command } from './Command';

/** `addto`：把已有图形移入容器（作为最后一个子节点）。 */
export class AddToContainerCommand implements Command {
  private oldParent: ShapeContainer | null = null;
  private oldIndex = -1;

  public constructor(
    private readonly shape: Shape,
    private readonly target: ContainerShape,
  ) {}

  public execute(): string {
    const parent = this.shape.requireParent();
    this.oldParent = parent;
    this.oldIndex = parent.indexOfChild(this.shape);
    parent.removeChild(this.shape);
    this.target.appendChild(this.shape);
    return `${this.shape.label} moved into ${this.target.label}`;
  }

  public undo(): string {
    if (this.oldParent === null) {
      throw new Error('addto command was not executed');
    }
    this.target.removeChild(this.shape);
    this.oldParent.insertChildAt(this.oldIndex, this.shape);
    return `${this.shape.label} moved back into ${this.oldParent.containerLabel}`;
  }
}
