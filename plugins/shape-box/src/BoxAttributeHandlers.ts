import type { Shape } from '../../../src/core/model/Shape';
import type { AttributeApplyContext, AttributeHandler } from '../../../src/core/plugin/AttributeHandler';
import { BoxShape } from './BoxShape';

/**
 * `box` 的 `fill` 语义：底色要落到**两个子部件**上（底板矩形与标签文字），
 * 一次 `set` 仍是**一个** undo 单元——事务由 `SetAttributeCommand` 的子树快照提供。
 */
export class BoxFillHandler implements AttributeHandler {
  public readonly name = 'box-fill';

  public handles(shape: Shape, attr: string): boolean {
    return shape.typeName === 'box' && attr === 'fill';
  }

  public apply(shape: Shape, _attr: string, value: string, context: AttributeApplyContext): void {
    const children = shape.asContainer()?.children ?? [];
    for (const child of children) {
      child.setStyle('fill', value);
      context.touch(child);
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