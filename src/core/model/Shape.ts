import { EditorError } from '../errors/EditorError';
import { formatNumber, parseNumeric } from './numbers';
import type { ContainerShape } from './ContainerShape';
import type { ShapeContainer } from './ShapeContainer';
import type { ShapeState } from './ShapeState';

/** 数值属性在 `move` 时的行为：沿 x 平移 / 沿 y 平移 / 只参与缩放（尺寸）。 */
export type NumericAxis = 'x' | 'y' | 'size';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** SVG 公共样式属性，序列化与 `show` 都按这个顺序输出。 */
export const STYLE_ATTRIBUTE_NAMES = ['fill', 'stroke', 'stroke-width'] as const;

interface NumericField {
  readonly name: string;
  readonly axis: NumericAxis;
  readonly read: () => number;
  readonly write: (value: number) => void;
}

/**
 * 所有图形（叶子图形与容器）的抽象基类。
 *
 * 设计要点：
 * 1. **多态而非 switch**：几何属性用"字段声明表"注册（`defineNumericField`），
 *    `move` / `scale` / `set` / 序列化 / tree-show 全部由基类按声明驱动，
 *    子类只声明自己的字段与展示文案；新增图形类型不需要改动任何既有分支。
 * 2. **封装而非数据袋**：几何值全部是子类私有字段，只通过声明时给出的读写闭包访问，
 *    外部拿不到可随意改写的公共字段（禁止贫血模型）。
 * 3. **状态可快照**：`captureState` / `restoreState` 为撤销提供 Memento，
 *    文本内容等非几何状态通过 `captureOwnText` / `applyOwnText` 钩子参与。
 */
export abstract class Shape {
  public readonly id: string;
  public readonly typeName: string;
  public readonly elementName: string;

  private parentContainer: ShapeContainer | null = null;
  private readonly numericFields = new Map<string, NumericField>();
  private readonly styleValues = new Map<string, string>();
  private readonly extraValues = new Map<string, string>();

  protected constructor(id: string, typeName: string, elementName: string) {
    this.id = id;
    this.typeName = typeName;
    this.elementName = elementName;
  }

  /**
   * 注册一个数值属性。声明顺序即序列化顺序，也就是 SVG 属性的输出顺序。
   * `read` / `write` 让基类在不暴露公共字段的前提下操作子类私有状态。
   */
  protected defineNumericField(
    name: string,
    axis: NumericAxis,
    read: () => number,
    write: (value: number) => void,
  ): void {
    this.numericFields.set(name, { name, axis, read, write });
  }

  /** 面向用户的图形标识：`rect#r1`。 */
  public get label(): string {
    return `${this.typeName}#${this.id}`;
  }

  public get parent(): ShapeContainer | null {
    return this.parentContainer;
  }

  /** 所在容器的名字；根画布的子图形显示为 `svg`。 */
  public get parentLabel(): string {
    return this.parentContainer === null ? 'svg' : this.parentContainer.containerLabel;
  }

  /**
   * 取父容器；缺失说明模型已不一致（只有程序缺陷会造成这种情况）。
   * 结构性命令（delete / group / addto / front…）都通过它拿父容器。
   */
  public requireParent(): ShapeContainer {
    if (this.parentContainer === null) {
      throw new EditorError(`shape has no parent: ${this.id}`);
    }
    return this.parentContainer;
  }

  public attachTo(parent: ShapeContainer | null): void {
    this.parentContainer = parent;
  }

  /**
   * 容器视图：叶子返回 `null`，容器返回自身。
   * 命令与 IO 用这个访问器判断"能不能装孩子"，避免 `instanceof` 式的类型分派。
   */
  public asContainer(): ContainerShape | null {
    return null;
  }

  /**
   * 复合图形（如后续阶段的 `box` 插件类型）由插件自己管理内部结构，`ungroup` 必须拒绝。
   * 内核类型（含普通 `<g>`）返回 `false`。
   */
  public isComposite(): boolean {
    return false;
  }

  public get numericAttributeNames(): readonly string[] {
    return [...this.numericFields.keys()];
  }

  public hasNumericAttribute(name: string): boolean {
    return this.numericFields.has(name);
  }

  public numericAttributes(): ReadonlyArray<readonly [string, number]> {
    return [...this.numericFields.values()].map((field) => [field.name, field.read()] as const);
  }

  /** 样式属性按固定顺序输出，保证 `save` 结果稳定可比对。 */
  public styleAttributes(): ReadonlyArray<readonly [string, string]> {
    const pairs: Array<readonly [string, string]> = [];
    for (const name of STYLE_ATTRIBUTE_NAMES) {
      const value = this.styleValues.get(name);
      if (value !== undefined) {
        pairs.push([name, value]);
      }
    }
    return pairs;
  }

  /** 读入时保留的未知属性（如 `font-size`、`transform`、`data-*`），保存时原样写回。 */
  public extraAttributePairs(): ReadonlyArray<readonly [string, string]> {
    return [...this.extraValues.entries()];
  }

  public setStyle(name: string, value: string): void {
    this.styleValues.set(name, value);
  }

  public setExtraAttribute(name: string, value: string): void {
    this.extraValues.set(name, value);
  }

  public getAttribute(name: string): string | null {
    if (isStyleAttributeName(name)) {
      return this.styleValues.get(name) ?? null;
    }
    const field = this.numericFields.get(name);
    if (field !== undefined) {
      return formatNumber(field.read());
    }
    return this.getOwnAttribute(name);
  }

  /**
   * 统一的属性写入口（`set` 命令即调用它）：
   * 样式 → 数值几何属性 → 子类自有属性（text 的内容），都不匹配则报未知属性。
   */
  public setAttribute(name: string, value: string): void {
    if (isStyleAttributeName(name)) {
      this.styleValues.set(name, value);
      return;
    }
    const field = this.numericFields.get(name);
    if (field !== undefined) {
      field.write(parseNumeric(value, name));
      return;
    }
    if (this.setOwnAttribute(name, value)) {
      return;
    }
    throw new EditorError(`unknown attribute: ${name}`);
  }

  /** 平移：位置字段各加 dx/dy，尺寸字段不变（容器会递归到子孙）。 */
  public moveBy(dx: number, dy: number): void {
    for (const field of this.numericFields.values()) {
      if (field.axis === 'x') {
        field.write(field.read() + dx);
      } else if (field.axis === 'y') {
        field.write(field.read() + dy);
      }
    }
  }

  /** 等比缩放：位置与尺寸按同一系数乘（容器会递归到子孙）。 */
  public scaleBy(factor: number): void {
    for (const field of this.numericFields.values()) {
      field.write(field.read() * factor);
    }
  }

  /** 图形锚点（第一个 x 字段 + 第一个 y 字段），用于 `move` 的回显。 */
  public anchorPoint(): Point {
    let x = 0;
    let y = 0;
    let hasX = false;
    let hasY = false;
    for (const field of this.numericFields.values()) {
      if (field.axis === 'x' && !hasX) {
        x = field.read();
        hasX = true;
      } else if (field.axis === 'y' && !hasY) {
        y = field.read();
        hasY = true;
      }
    }
    return { x, y };
  }

  public captureState(): ShapeState {
    return {
      numericAttributes: this.numericAttributes(),
      styles: [...this.styleValues.entries()],
      extraAttributes: [...this.extraValues.entries()],
      text: this.captureOwnText(),
    };
  }

  public restoreState(state: ShapeState): void {
    for (const [name, value] of state.numericAttributes) {
      const field = this.numericFields.get(name);
      if (field !== undefined) {
        field.write(value);
      }
    }
    this.styleValues.clear();
    for (const [name, value] of state.styles) {
      this.styleValues.set(name, value);
    }
    this.extraValues.clear();
    for (const [name, value] of state.extraAttributes) {
      this.extraValues.set(name, value);
    }
    if (state.text !== null) {
      this.applyOwnText(state.text);
    }
  }

  /** 序列化时作为元素文本写出的内容；非 text 图形为 `null`（自闭合标签）。 */
  public serializedTextContent(): string | null {
    return null;
  }

  /** 该类型是否用"元素文本"承载状态（只有 text 图形为 `true`），供 `read` 回填。 */
  public interpretsTextContent(): boolean {
    return false;
  }

  /** tree 命令的单行内联摘要（几何 + 样式）；容器返回空串以外的样式后缀。 */
  public treeSummary(): string {
    return `${this.geometryText()}${this.inlineStyleText()}`;
  }

  /** show 命令的属性明细行（不含缩进与标题行）。 */
  public showLines(): string[] {
    const lines = [this.geometryText()];
    const styles = this.styleText();
    if (styles !== '') {
      lines.push(styles);
    }
    const extras = this.extrasText();
    if (extras !== '') {
      lines.push(extras);
    }
    return lines;
  }

  /** 几何属性的完整摘要（`x=1 y=2 width=3 height=4`），供 `scale` 的回显使用。 */
  public geometrySummary(): string {
    return this.geometryText();
  }

  /** 子类可覆盖：属性名到展示别名的映射（如 `width` → `w`）。 */
  protected geometryText(aliases: Readonly<Record<string, string>> = {}): string {
    const parts = this.numericAttributes().map(([name, value]) => {
      const displayName = aliases[name] ?? name;
      return `${displayName}=${formatNumber(value)}`;
    });
    return parts.join(' ');
  }

  protected styleText(): string {
    return this.styleAttributes()
      .map(([name, value]) => `${name}=${value}`)
      .join(' ');
  }

  protected extrasText(): string {
    return this.extraAttributePairs()
      .map(([name, value]) => `${name}=${value}`)
      .join(' ');
  }

  /** tree 行尾：样式与保留属性合并成一串，便于看出"这个图形带了什么"。 */
  protected inlineStyleText(): string {
    const parts = [this.styleText(), this.extrasText()].filter((part) => part !== '');
    return parts.length === 0 ? '' : ` ${parts.join(' ')}`;
  }

  /** 子类钩子：处理样式/几何之外的属性（目前只有 text 的 `text`）。 */
  protected setOwnAttribute(_name: string, _value: string): boolean {
    return false;
  }

  protected getOwnAttribute(_name: string): string | null {
    return null;
  }

  protected captureOwnText(): string | null {
    return null;
  }

  protected applyOwnText(_value: string): void {
    // 默认无自有文本状态
  }
}

function isStyleAttributeName(name: string): boolean {
  return (STYLE_ATTRIBUTE_NAMES as readonly string[]).includes(name);
}
