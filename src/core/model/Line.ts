import { formatNumber } from './numbers';
import { Shape } from './Shape';

/** `<line>`：两个端点，四个坐标都参与平移与缩放（line 没有尺寸字段）。 */
export class Line extends Shape {
  private x1Value = 0;
  private y1Value = 0;
  private x2Value = 0;
  private y2Value = 0;

  public constructor(id: string) {
    super(id, 'line', 'line');
    this.defineNumericField('x1', 'x', () => this.x1Value, (value) => { this.x1Value = value; });
    this.defineNumericField('y1', 'y', () => this.y1Value, (value) => { this.y1Value = value; });
    this.defineNumericField('x2', 'x', () => this.x2Value, (value) => { this.x2Value = value; });
    this.defineNumericField('y2', 'y', () => this.y2Value, (value) => { this.y2Value = value; });
  }

  public override treeSummary(): string {
    const from = `(${formatNumber(this.x1Value)},${formatNumber(this.y1Value)})`;
    const to = `(${formatNumber(this.x2Value)},${formatNumber(this.y2Value)})`;
    return `${from} -> ${to}${this.inlineStyleText()}`;
  }
}
