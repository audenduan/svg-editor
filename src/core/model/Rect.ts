import { Shape } from './Shape';

/** `<rect>`：位置 (x, y) + 尺寸 (width, height)。 */
export class Rect extends Shape {
  private xValue = 0;
  private yValue = 0;
  private widthValue = 0;
  private heightValue = 0;

  public constructor(id: string) {
    super(id, 'rect', 'rect');
    this.defineNumericField('x', 'x', () => this.xValue, (value) => { this.xValue = value; });
    this.defineNumericField('y', 'y', () => this.yValue, (value) => { this.yValue = value; });
    this.defineNumericField(
      'width',
      'size',
      () => this.widthValue,
      (value) => { this.widthValue = value; },
    );
    this.defineNumericField(
      'height',
      'size',
      () => this.heightValue,
      (value) => { this.heightValue = value; },
    );
  }

  public override treeSummary(): string {
    return `${this.geometryText({ width: 'w', height: 'h' })}${this.inlineStyleText()}`;
  }
}
