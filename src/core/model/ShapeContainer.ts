import type { Shape } from './Shape';

/**
 * 可以容纳子图形的"容器"契约。
 *
 * 有两个实现：`SvgDocument`（画布根，序列化为 `<svg>`）与 `ContainerShape`
 * （`<g>` 等容器图形）。所有结构性命令（create/group/addto/front…）只依赖这个
 * 接口，因此"挂在根画布"与"挂在分组里"走完全相同的代码路径。
 */
export interface ShapeContainer {
  /** 用于回显的容器名：根画布为 `svg`，分组为 `g#id`。 */
  readonly containerLabel: string;

  readonly children: readonly Shape[];

  appendChild(shape: Shape): void;

  insertChildAt(index: number, shape: Shape): void;

  /** 摘除子图形并返回它原来的下标（越界由实现方保证不会发生）。 */
  removeChild(shape: Shape): number;

  indexOfChild(shape: Shape): number;
}
