import { formatNumber } from '../model/numbers';
import type { Shape } from '../model/Shape';
import type { Command } from './Command';
import { ShapeStateRecorder } from './ShapeStateRecorder';

/**
 * `scale`：等比缩放（系数同乘到全部几何属性）。
 *
 * 容器语义 = 递归到每个子孙；撤销用状态快照还原，避免"再乘一次 1/factor"的累积浮点误差。
 */
export class ScaleShapeCommand implements Command {
  private readonly recorder = new ShapeStateRecorder();

  public constructor(
    private readonly shape: Shape,
    private readonly factor: number,
  ) {}

  public execute(): string {
    this.recorder.capture(this.shape);
    this.shape.scaleBy(this.factor);
    if (this.shape.asContainer() !== null) {
      return `${this.shape.label} scaled by ${formatNumber(this.factor)} (${this.descendantCount()} shapes affected)`;
    }
    return `${this.shape.label} scaled by ${formatNumber(this.factor)} to ${this.shape.geometrySummary()}`;
  }

  public undo(): string {
    this.recorder.restore();
    if (this.shape.asContainer() !== null) {
      return `${this.shape.label} scaled back (${this.descendantCount()} shapes restored)`;
    }
    return `${this.shape.label} scaled back to ${this.shape.geometrySummary()}`;
  }

  /** 容器自身没有几何属性，回显只统计真正被缩放的子孙。 */
  private descendantCount(): number {
    return Math.max(0, this.recorder.size - 1);
  }
}
