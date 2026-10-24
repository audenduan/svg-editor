import type { Shape } from '../model/Shape';
import type { ShapeState } from '../model/ShapeState';

/**
 * 记录一棵子树上每个图形的可变状态（Memento）。
 *
 * `move` / `scale` / `set` 在执行前调用 `capture`，撤销时 `restore()`。
 * 递归整棵子树的好处：容器操作天然是一整条命令，插件复合图形若把 `set` 传播给子部件，
 * 也不需要再补记录逻辑。
 */
export class ShapeStateRecorder {
  private readonly states = new Map<Shape, ShapeState>();

  public capture(shape: Shape): void {
    this.states.set(shape, shape.captureState());
    const container = shape.asContainer();
    if (container !== null) {
      for (const child of container.children) {
        this.capture(child);
      }
    }
  }

  public restore(): void {
    for (const [shape, state] of this.states) {
      shape.restoreState(state);
    }
  }

  /** 受影响的图形数量（容器缩放的回显会用到）。 */
  public get size(): number {
    return this.states.size;
  }
}
