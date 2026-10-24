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
 * 内核只通过这个接口消费类型——参数 schema、实例化、读回、树形标注，
 * 因此内核里不会出现 `switch (tag)`；后续阶段的 `box` 插件只要实现本接口并注册即可。
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

  /** tree 行内的类型标注；内置类型返回空串，插件类型可返回 ` (box)` 之类。 */
  treeAnnotation(shape: Shape): string;
}
