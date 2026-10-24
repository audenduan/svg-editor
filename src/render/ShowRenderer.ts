import type { Shape } from '../core/model/Shape';

/** `show` 的属性明细排版：标题行 + 两空格缩进的明细行。 */
export class ShowRenderer {
  public render(shape: Shape): string[] {
    const header = `${shape.label}  parent=${shape.parentLabel}`;
    return [header, ...shape.showLines().map((line) => `  ${line}`)];
  }
}