import { formatNumber } from '../model/numbers';
import type { Shape } from '../model/Shape';
import type { Command } from './Command';
import { ShapeStateRecorder } from './ShapeStateRecorder';

/**
 * `move`：增量平移。
 *
 * 叶子回显新锚点（`moved to (130,100)`）；容器回显位移（`moved by (0,100)`），
 * 因为容器没有单一锚点，报"整组移动了多远"更有信息量。
 */
export class MoveShapeCommand implements Command {
  private readonly recorder = new ShapeStateRecorder();

  public constructor(
    private readonly shape: Shape,
    private readonly dx: number,
    private readonly dy: number,
  ) {}

  public execute(): string {
    this.recorder.capture(this.shape);
    this.shape.moveBy(this.dx, this.dy);
    if (this.shape.asContainer() !== null) {
      return `${this.shape.label} moved by (${formatNumber(this.dx)},${formatNumber(this.dy)})`;
    }
    const anchor = this.shape.anchorPoint();
    return `${this.shape.label} moved to (${formatNumber(anchor.x)},${formatNumber(anchor.y)})`;
  }

  public undo(): string {
    this.recorder.restore();
    if (this.shape.asContainer() !== null) {
      return `${this.shape.label} moved back by (${formatNumber(-this.dx)},${formatNumber(-this.dy)})`;
    }
    const anchor = this.shape.anchorPoint();
    return `${this.shape.label} moved back to (${formatNumber(anchor.x)},${formatNumber(anchor.y)})`;
  }
}
