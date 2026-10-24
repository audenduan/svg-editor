import { ContainerShape } from './ContainerShape';

/**
 * `<g>` 分组容器：Composite 的默认实现。
 *
 * 普通分组不是"复合图形"：`ungroup` 可以把它解散、子图形提升到父级。
 * 由插件创建的复合图形（如后续阶段的 `box`）会覆盖 `isComposite()` 为 `true`。
 */
export class Group extends ContainerShape {
  public constructor(id: string) {
    super(id, 'g', 'g');
  }
}
