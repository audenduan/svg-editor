import type { Shape } from '../model/Shape';

/** `create` 位置参数的类别：数值、颜色/描边（任意字符串）、自由文本（可含空格）。 */
export type ParameterKind = 'number' | 'color' | 'text';

export interface ShapeParameterSpec {
  /** 同时是 `set` 可用的属性名；text 的内容参数固定叫 `text`。 */
  readonly name: string;
  readonly kind: ParameterKind;
  readonly optional?: boolean;
}

/** `create` 绑定后的实参：数值已解析，其余保留原始字符串。 */
export type ParameterValues = ReadonlyMap<string, number | string>;

export interface ShapeRestoreRequest {
  readonly id: string;
  readonly attributes: ReadonlyMap<string, string>;
  /** 元素的直接文本内容（只有 `<text>` 会用到）。 */
  readonly textContent: string;
}

/**
 * ShapeProvider：图形类型的**插件插槽**。
 *
 * 内核只通过这个接口消费类型——参数 schema、实例化、读回，因此内核里不会出现
 * `switch (tag)`；插件类型（如 `box`）只要实现本接口并注册即可。
 *
 * 除基本四项外还有三个可选钩子，供"与既存类型共享元素标签"的插件使用
 * （例如 `box` 序列化为 `<g data-kind="box">`，与普通 `<g>` 共用标签）：
 * - `matchesElement`：读回时按属性判定该元素是否属于本类型（标签变体）；
 * - `derivedIds`：创建时一并生成的子部件 id，供内核做全局唯一性校验；
 * - `afterRestore`：子元素读入后校验复合结构，返回警告或抛错拒绝整个读入。
 */
export interface ShapeProvider {
  readonly typeName: string;

  /** 对应的 SVG 元素名；`read` 用"标签名 → 类型"做唯一映射。 */
  readonly elementTag: string;

  /** `create <type> <id> [params…]` 的位置参数 schema。 */
  readonly parameters: readonly ShapeParameterSpec[];

  create(id: string, values: ParameterValues): Shape;

  /** 从 SVG 元素还原（属性顺序、未知属性保留、text 内容回填）。 */
  restore(request: ShapeRestoreRequest): Shape;

  /** 标签变体判定：与 `elementTag` 相同的其他类型用它区分各自的元素。 */
  matchesElement?(attributes: ReadonlyMap<string, string>): boolean;

  /** 该类型创建时会一并生成的子部件 id（不含自身 id）。 */
  derivedIds?(id: string): readonly string[];

  /** 子元素读入之后的复合结构校验：抛 `EditorError` 表示拒绝整个读入。 */
  afterRestore?(shape: Shape): readonly string[] | void;
}