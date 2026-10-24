import { Shape } from './Shape';

/** `<ellipse>`：圆心 (cx, cy) + 两个半径 (rx, ry)。 */
export class Ellipse extends Shape {
  private cxValue = 0;
  private cyValue = 0;
  private rxValue = 0;
  private ryValue = 0;

  public constructor(id: string) {
    super(id, 'ellipse', 'ellipse');
    this.defineNumericField('cx', 'x', () => this.cxValue, (value) => { this.cxValue = value; });
    this.defineNumericField('cy', 'y', () => this.cyValue, (value) => { this.cyValue = value; });
    this.defineNumericField('rx', 'size', () => this.rxValue, (value) => { this.rxValue = value; });
    this.defineNumericField('ry', 'size', () => this.ryValue, (value) => { this.ryValue = value; });
  }
}
