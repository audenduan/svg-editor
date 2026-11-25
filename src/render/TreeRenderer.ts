import { formatNumber } from '../core/model/numbers';
import type { Shape } from '../core/model/Shape';
import type { SvgDocument } from '../core/model/SvgDocument';
import type { TreeDecoratorRegistry } from '../core/plugin/TreeDecoratorRegistry';

/**
 * `tree` 的结构树排版。
 *
 * 对齐规则（文档示例是手工排的、列宽不一致，这里定为统一规则并记入文档）：
 * 同一父容器的子图形按"最长标签 + 2"对齐，只有带内联摘要的子图形参与计算。
 *
 * 行尾标签由 `TreeDecoratorRegistry` 提供（`modified-star`、`(box)` 等插件），
 * 渲染器只做字符串拼接，不认识任何具体标签；没有装饰器时输出与 Phase 1 逐字节相同。
 */
export class TreeRenderer {
  public constructor(private readonly decorators: TreeDecoratorRegistry) {}

  public renderDocument(document: SvgDocument): string[] {
    const rootSuffix = this.decorators.suffixFor({ shape: null, isRoot: true });
    const lines = [`svg (${formatNumber(document.width)}x${formatNumber(document.height)})${rootSuffix}`];
    this.renderChildren(document.children, '', lines);
    return lines;
  }

  /** `tree <id>`：以该图形为根打印子树。 */
  public renderSubtree(shape: Shape): string[] {
    const lines = [this.rootLine(shape)];
    const container = shape.asContainer();
    if (container !== null) {
      this.renderChildren(container.children, '', lines);
    }
    return lines;
  }

  private renderChildren(children: readonly Shape[], prefix: string, lines: string[]): void {
    const fieldWidth = this.computeFieldWidth(children);
    children.forEach((child, index) => {
      const isLast = index === children.length - 1;
      const label = child.label;
      const summary = child.treeSummary();
      let line = `${prefix}${isLast ? '└── ' : '├── '}${label}`;
      if (summary !== '') {
        const gap = Math.max(2, fieldWidth - label.length);
        line += `${' '.repeat(gap)}${summary}`;
      }
      line += this.decorators.suffixFor({ shape: child, isRoot: false });
      lines.push(line);
      const container = child.asContainer();
      if (container !== null) {
        this.renderChildren(container.children, `${prefix}${isLast ? '    ' : '│   '}`, lines);
      }
    });
  }

  private rootLine(shape: Shape): string {
    const label = shape.label;
    const summary = shape.treeSummary();
    const suffix = this.decorators.suffixFor({ shape, isRoot: false });
    return summary === '' ? `${label}${suffix}` : `${label}  ${summary}${suffix}`;
  }

  private computeFieldWidth(children: readonly Shape[]): number {
    let maxLabelLength = 0;
    for (const child of children) {
      if (child.treeSummary() !== '') {
        maxLabelLength = Math.max(maxLabelLength, child.label.length);
      }
    }
    return maxLabelLength + 2;
  }
}