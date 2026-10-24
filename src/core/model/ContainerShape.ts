import { EditorError } from '../errors/EditorError';
import { Shape } from './Shape';
import type { Point } from './Shape';
import type { ShapeContainer } from './ShapeContainer';

/**
 * 容器图形的抽象基类（Composite 模式中的 Composite 角色）。
 *
 * 它继承 `Shape` 并实现 `ShapeContainer`，因此：
 * - 对命令而言，容器和叶子完全同构：`move` / `scale` / `delete` / `set` 一视同仁；
 * - 对命令而言，"容器"这一能力是通过 `asContainer()` 暴露的，命令不需要知道是 `<g>` 还是插件复合图形。
 * 平移/缩放递归到子孙，且子孙坐标是**坐标系内的绝对坐标**（本实现不写 `transform`），
 * 这与 `scale` 要求"递归到每个子孙"的语义一致。
 */
export abstract class ContainerShape extends Shape implements ShapeContainer {
  private readonly items: Shape[] = [];

  protected constructor(id: string, typeName: string, elementName: string) {
    super(id, typeName, elementName);
  }

  public get containerLabel(): string {
    return this.label;
  }

  public get children(): readonly Shape[] {
    return this.items;
  }

  public appendChild(shape: Shape): void {
    shape.attachTo(this);
    this.items.push(shape);
  }

  public insertChildAt(index: number, shape: Shape): void {
    const clamped = Math.max(0, Math.min(index, this.items.length));
    shape.attachTo(this);
    this.items.splice(clamped, 0, shape);
  }

  public removeChild(shape: Shape): number {
    const index = this.items.indexOf(shape);
    if (index < 0) {
      throw new EditorError(`shape is not a child of ${this.containerLabel}: ${shape.id}`);
    }
    this.items.splice(index, 1);
    shape.attachTo(null);
    return index;
  }

  public indexOfChild(shape: Shape): number {
    return this.items.indexOf(shape);
  }

  public override asContainer(): ContainerShape {
    return this;
  }

  /** 自己是 `shape` 的祖先吗（用于阻止把容器挪进自己的子树）。 */
  public isAncestorOf(shape: Shape): boolean {
    return this.items.some(
      (child) => child === shape || (child.asContainer()?.isAncestorOf(shape) ?? false),
    );
  }

  public override moveBy(dx: number, dy: number): void {
    for (const child of this.items) {
      child.moveBy(dx, dy);
    }
  }

  public override scaleBy(factor: number): void {
    for (const child of this.items) {
      child.scaleBy(factor);
    }
  }

  public override anchorPoint(): Point {
    // 容器没有自己的几何锚点，`move` / `scale` 的回显走容器专用文案。
    return { x: 0, y: 0 };
  }

  public override treeSummary(): string {
    // 容器行只内联"自己身上的样式/保留属性"，子图形另起一行。
    return [this.styleText(), this.extrasText()].filter((part) => part !== '').join(' ');
  }

  public override showLines(): string[] {
    const lines = [`children=${this.items.length}`];
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
}
