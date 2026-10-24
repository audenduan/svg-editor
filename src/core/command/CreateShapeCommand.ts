import type { Shape } from '../model/Shape';
import type { ShapeContainer } from '../model/ShapeContainer';
import type { Command } from './Command';

/** `create`：把预先构建好的图形插入指定容器（根画布或某个 `<g>`）。 */
export class CreateShapeCommand implements Command {
  public constructor(
    private readonly shape: Shape,
    private readonly parent: ShapeContainer,
  ) {}

  public execute(): string {
    this.parent.appendChild(this.shape);
    const placement = this.parent.containerLabel === 'svg' ? '' : ` in ${this.parent.containerLabel}`;
    return `${this.shape.label} created${placement}`;
  }

  public undo(): string {
    this.parent.removeChild(this.shape);
    return `${this.shape.label} removed`;
  }
}
