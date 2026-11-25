import type { Shape } from '../model/Shape';

/**
 * 扩展点 **`AttributeHandler`**：某个属性在某图形上的**领域语义**。
 *
 * 用于 `set <id> <attr> <value>`：当图形是插件复合图形（如 `box`）时，
 * `fill` 要传播到内部矩形、`label` 要改写内部文字，这些规则由插件提供，
 * 内核的 `set` 与属性白名单都不必为此扩张。
 *
 * 调用契约（详见 `doc/README.md` 的扩展点清单与 ADR-1）：
 * 1. 内核先定位图形，再按**注册顺序**询问各处理器 `handles`；
 * 2. **第一个命中**的处理器独占执行（后注册者不参与，避免未定义的覆盖）；
 * 3. 处理器抛错时整条命令失败：文档回滚到执行前、undo 历史不变，**不再**转入默认属性处理。
 */
export interface AttributeHandler {
  /** 稳定的注册名（清单校验与重复注册检测的键）。 */
  readonly name: string;

  /** 判断是否负责该图形与属性；**不得修改文档状态**。 */
  handles(shape: Shape, attr: string): boolean;

  /**
   * 执行该属性的修改。多子部件的修改由调用方（`SetAttributeCommand`）统一包在一个事务里：
   * 执行前快照整棵子树，抛错时整体还原，因此一次 `set` 仍是一个 undo 单元。
   */
  apply(shape: Shape, attr: string, value: string, context: AttributeApplyContext): void;

  /** 可选：读取当前属性值（供 undo 回显）；不提供则回落到图形自身的属性读取。 */
  read?(shape: Shape, attr: string): string | null;
}

/** 处理器执行修改时可用的上下文。 */
export interface AttributeApplyContext {
  /** 按 id 在当前文档里查找图形（含容器内部）；找不到返回 `null`。 */
  findShape(id: string): Shape | null;

  /** 把被修改的子部件登记为本次命令触及的图形（用于回显/审计）。 */
  touch(shape: Shape): void;
}