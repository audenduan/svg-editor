import { formatNumber } from './numbers';
import { Shape } from './Shape';

/**
 * `<text>`：位置 (x, y) + **元素文本**（不是属性）。
 *
 * 文本内容通过 `setOwnAttribute` / `getOwnAttribute` / 快照钩子参与 `set` 与 undo：
 * `set t1 text "hello"` 与几何属性走同一个白名单入口，只是落地方式不同。
 */
export class TextShape extends Shape {
  private xValue = 0;
  private yValue = 0;
  private content: string;

  public constructor(id: string, content = '') {
    super(id, 'text', 'text');
    this.content = content;
    this.defineNumericField('x', 'x', () => this.xValue, (value) => { this.xValue = value; });
    this.defineNumericField('y', 'y', () => this.yValue, (value) => { this.yValue = value; });
  }

  public get textContent(): string {
    return this.content;
  }

  public override serializedTextContent(): string | null {
    return this.content;
  }

  public override interpretsTextContent(): boolean {
    return true;
  }

  public override treeSummary(): string {
    const position = `(${formatNumber(this.xValue)},${formatNumber(this.yValue)})`;
    return `${position} "${this.content}"${this.inlineStyleText()}`;
  }

  public override showLines(): string[] {
    const lines = [this.geometryText(), `text="${this.content}"`];
    const styles = this.styleText();
    if (styles !== '') {
      lines.push(styles);
    }
    const extras = this.extrasText();
    if (extras !== '') {
      lines.push(extras);
    }
    return lines;
  }

  protected override setOwnAttribute(name: string, value: string): boolean {
    if (name !== 'text') {
      return false;
    }
    this.content = value;
    return true;
  }

  protected override getOwnAttribute(name: string): string | null {
    return name === 'text' ? this.content : null;
  }

  protected override captureOwnText(): string {
    return this.content;
  }

  protected override applyOwnText(value: string): void {
    this.content = value;
  }
}
