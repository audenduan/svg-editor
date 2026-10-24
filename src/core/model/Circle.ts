import { Shape } from './Shape';

/** `<circle>`：圆心 (cx, cy) + 半径 r。 */
export class Circle extends Shape {
  private cxValue = 0;
  private cyValue = 0;
  private radiusValue = 0;

  public constructor(id: string) {
    super(id, 'circle', 'circle');
    this.defineNumericField('cx', 'x', () => this.cxValue, (value) => { this.cxValue = value; });
    this.defineNumericField('cy', 'y', () => this.cyValue, (value) => { this.cyValue = value; });
    this.defineNumericField('r', 'size', () => this.radiusValue, (value) => { this.radiusValue = value; });
  }
}
