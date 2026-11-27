import type { Shape } from '../../../src/core/model/Shape';
import type { AttributeApplyContext, AttributeHandler } from '../../../src/core/plugin/AttributeHandler';
import { BoxShape } from './BoxShape';

/**
 * `box` 的 `fill` 语义（phase_cli_2 §3.1 的规定）：**只改内部底板矩形的 `fill`**。
 *
 * 规范把"实际修改"写死为 `n1-rect` 的 `fill`，因此这里不碰标签文字的颜色：
 * `fill` 落在 `<text>` 上表示的是**字色**而不是底色，顺手改写会带来规范之外的副作用。
 * 需要调整标签字色时应直接 `set <box>-label fill …`。
 */
export class BoxFillHandler implements AttributeHandler {
  public readonly name = 'box-fill';

  public handles(shape: Shape, attr: string): boolean {
    return shape.typeName === 'box' && attr === 'fill';
  }

  public apply(shape: Shape, _attr: string, value: string, context: AttributeApplyContext): void {
    const plate = shape.asContainer()?.children[0];
    if (plate !== undefined) {
      plate.setStyle('fill', value);
      context.touch(plate);
    }
  }

  public read(shape: Shape, _attr: string): string | null {
    const plate = shape.asContainer()?.children[0];
    return plate?.getAttribute('fill') ?? null;
  }
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