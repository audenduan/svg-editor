import type { Shape } from '../../../src/core/model/Shape';
import type { AttributeApplyContext, AttributeHandler } from '../../../src/core/plugin/AttributeHandler';
import { BoxShape } from './BoxShape';

/**
 * `box` 的 `fill` 语义：**底色落在底板矩形上，标签自动配对比色**。
 *
 * 为什么不是"两边刷同一个颜色"：`fill` 对 `<text>` 是**字的颜色**，
 * 把字刷成和底一样的浅色，标签就直接看不见了（流程图卡片最不可接受的失败）。
 * 所以一次 `set fill` 会写两个子部件，但写的是**两种语义**：
 * 底板 = 用户给的颜色，标签 = 在该底色上可读的对比色。
 * 两者仍是一个 undo 单元——事务由 `SetAttributeCommand` 的子树快照提供。
 */
export class BoxFillHandler implements AttributeHandler {
  public readonly name = 'box-fill';

  public handles(shape: Shape, attr: string): boolean {
    return shape.typeName === 'box' && attr === 'fill';
  }

  public apply(shape: Shape, _attr: string, value: string, context: AttributeApplyContext): void {
    const children = shape.asContainer()?.children ?? [];
    const [plate, caption] = children;
    if (plate !== undefined) {
      plate.setStyle('fill', value);
      context.touch(plate);
    }
    const contrast = readableOn(value);
    // 非十六进制颜色（如 `red`、`currentColor`）无法算亮度：宁可不动标签，也不猜。
    if (caption !== undefined && contrast !== null) {
      caption.setStyle('fill', contrast);
      context.touch(caption);
    }
  }

  public read(shape: Shape, _attr: string): string | null {
    const plate = shape.asContainer()?.children[0];
    return plate?.getAttribute('fill') ?? null;
  }
}

/** 在白/黑之间选一个在该底色上可读的颜色；只认 `#rgb` / `#rrggbb`。 */
export function readableOn(color: string): string | null {
  const rgb = parseHexColor(color);
  if (rgb === null) {
    return null;
  }
  // 感知亮度（ITU-R BT.601），阈值 0.55 偏保守：浅底用深字，深底用白字。
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.55 ? '#111111' : '#ffffff';
}

function parseHexColor(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (match === null) {
    return null;
  }
  const digits = match[1] as string;
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * `box` 的 `label` 语义：改写内部 `<text>` 的内容（而不是在 `<g>` 上存一个无意义的属性）。
 */
export class BoxLabelHandler implements AttributeHandler {
  public readonly name = 'box-label';

  public handles(shape: Shape, attr: string): boolean {
    return shape.typeName === 'box' && attr === 'label';
  }

  public apply(shape: Shape, _attr: string, value: string, context: AttributeApplyContext): void {
    const caption = shape instanceof BoxShape ? shape.caption : shape.asContainer()?.children[1];
    if (caption === undefined) {
      throw new Error('box has no caption');
    }
    caption.setAttribute('text', value);
    context.touch(caption);
  }

  public read(shape: Shape, _attr: string): string | null {
    const caption = shape.asContainer()?.children[1];
    return caption?.getAttribute('text') ?? null;
  }
}