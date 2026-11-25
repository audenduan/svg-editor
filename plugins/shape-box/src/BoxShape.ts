import { formatNumber } from '../../../src/core/model/numbers';
import { ContainerShape } from '../../../src/core/model/ContainerShape';
import { Rect } from '../../../src/core/model/Rect';
import { TextShape } from '../../../src/core/model/TextShape';
import type { Shape } from '../../../src/core/model/Shape';

/**
 * `box` 复合图形：一个矩形 + 一段居中文字，序列化为
 * `<g id="…" data-kind="box"><rect id="…-rect"/><text id="…-label">…</text></g>`。
 *
 * 它**只依赖内核公开的领域抽象**（`ContainerShape` / `Rect` / `TextShape`），
 * 不引用任何内核内部实现：因此接入 box 不需要改内核，也不需要改既有插件。
 *
 * 不变量（由 `protectsChildren()` 与属性处理器共同维持）：
 * 恰好两个子部件，顺序为 rect（底板）→ text（标签）。
 */
export class BoxShape extends ContainerShape {
  public constructor(id: string) {
    super(id, 'box', 'g');
    // 与普通分组共用的标签靠这个属性区分（`ShapeProvider.matchesElement` 用它判定）。
    this.setExtraAttribute('data-kind', 'box');
  }

  public static create(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
  ): BoxShape {
    const box = new BoxShape(id);
    const plate = new Rect(`${id}-rect`);
    plate.setAttribute('x', formatNumber(x));
    plate.setAttribute('y', formatNumber(y));
    plate.setAttribute('width', formatNumber(width));
    plate.setAttribute('height', formatNumber(height));
    plate.setStyle('fill', '#ffffff');
    const caption = new TextShape(`${id}-label`, label);
    caption.setAttribute('x', formatNumber(x + 8));
    caption.setAttribute('y', formatNumber(y + height / 2 + 4));
    box.appendChild(plate);
    box.appendChild(caption);
    return box;
  }

  public override isComposite(): boolean {
    return true;
  }

  public override protectsChildren(): boolean {
    return true;
  }

  /** 底板（第一个子部件）。 */
  public get plate(): Shape {
    return this.children[0] as Shape;
  }

  /** 标签文字（第二个子部件）。 */
  public get caption(): Shape {
    return this.children[1] as Shape;
  }

  /** 树行不内联样式/属性：`(box)` 标签已由 `box-type-label` 装饰器提供。 */
  public override treeSummary(): string {
    return '';
  }
}