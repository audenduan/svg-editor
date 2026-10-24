import { EditorError } from '../errors/EditorError';
import { Shape } from './Shape';
import type { ShapeContainer } from './ShapeContainer';

export interface ViewBox {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 当前文档：画布根 + 图形树。
 *
 * 它实现 `ShapeContainer`，因此"根画布"和"分组"在命令眼里是同一类东西；
 * 但它不是 `Shape`——根没有 id、不能被删除/移动，这条区别由类型系统保证。
 * 画布尺寸改动属于文档类命令（不进入 undo 栈），见 `EditorSession`。
 */
export class SvgDocument implements ShapeContainer {
  private readonly items: Shape[] = [];
  private readonly extraAttributes = new Map<string, string>();
  private widthValue: number;
  private heightValue: number;
  private minXValue: number;
  private minYValue: number;

  /** 读入时的文件路径；`save` 不带参数时回写到这个路径。 */
  public sourcePath: string | null = null;

  public constructor(width = 800, height = 600, origin: { x: number; y: number } = { x: 0, y: 0 }) {
    this.widthValue = width;
    this.heightValue = height;
    this.minXValue = origin.x;
    this.minYValue = origin.y;
  }

  public get containerLabel(): string {
    return 'svg';
  }

  public get children(): readonly Shape[] {
    return this.items;
  }

  public get width(): number {
    return this.widthValue;
  }

  public get height(): number {
    return this.heightValue;
  }

  public get viewBox(): ViewBox {
    return {
      minX: this.minXValue,
      minY: this.minYValue,
      width: this.widthValue,
      height: this.heightValue,
    };
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

  /** 改画布尺寸：保留 viewBox 原点（读入的文件可能不是 0 0 起始）。 */
  public resize(width: number, height: number): void {
    this.widthValue = width;
    this.heightValue = height;
  }

  public setOrigin(minX: number, minY: number): void {
    this.minXValue = minX;
    this.minYValue = minY;
  }

  /** 读入时保留的 `<svg>` 未知属性（`xmlns`/`width`/`height`/`viewBox` 除外）。 */
  public addExtraAttribute(name: string, value: string): void {
    this.extraAttributes.set(name, value);
  }

  public extraAttributePairs(): ReadonlyArray<readonly [string, string]> {
    return [...this.extraAttributes.entries()];
  }

  public allShapes(): Shape[] {
    const result: Shape[] = [];
    collectShapes(this.items, result);
    return result;
  }

  public elementCount(): number {
    return this.allShapes().length;
  }

  /** 全文档按 id 查找（大小写敏感，深度优先，与显示顺序一致）。 */
  public findShape(id: string): Shape | null {
    for (const shape of this.allShapes()) {
      if (shape.id === id) {
        return shape;
      }
    }
    return null;
  }

  /** 按 id 查找一个能装孩子的容器（`<g>` 或插件复合图形）；叶子返回 `null`。 */
  public findContainer(id: string): ShapeContainer | null {
    const shape = this.findShape(id);
    if (shape === null) {
      return null;
    }
    return shape.asContainer();
  }
}

function collectShapes(children: readonly Shape[], result: Shape[]): void {
  for (const child of children) {
    result.push(child);
    const container = child.asContainer();
    if (container !== null) {
      collectShapes(container.children, result);
    }
  }
}
