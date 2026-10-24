import { formatNumber } from '../core/model/numbers';
import type { Shape } from '../core/model/Shape';
import type { SvgDocument } from '../core/model/SvgDocument';
import type { ShapeTypeRegistry } from '../core/registry/ShapeTypeRegistry';

/**
 * `tree` 的结构树排版。
 *
 * 对齐规则（文档示例是手工排的、列宽不一致，这里定为统一规则并记入文档）：
 * 同一父容器的子图形按"最长标签 + 2"对齐，只有带内联摘要的子图形参与计算；
 * 标签 = `类型#id` + 可选类型标注（当前内置类型为空，插件类型如 ` (box)` 由 Provider 提供）。
 */
export class TreeRenderer {
  public constructor(private readonly registry: ShapeTypeRegistry) {}

  public renderDocument(document: SvgDocument): string[] {
    const lines = [`svg (${formatNumber(document.width)}x${formatNumber(document.height)})`];
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
      const label = this.labelOf(child);
      const summary = child.treeSummary();
      let line = `${prefix}${isLast ? '└── ' : '├── '}${label}`;
      if (summary !== '') {
        const gap = Math.max(2, fieldWidth - label.length);
        line += `${' '.repeat(gap)}${summary}`;
      }
      lines.push(line);
      const container = child.asContainer();
      if (container !== null) {
        this.renderChildren(container.children, `${prefix}${isLast ? '    ' : '│   '}`, lines);
      }
    });
  }

  private rootLine(shape: Shape): string {
    const label = this.labelOf(shape);
    const summary = shape.treeSummary();
    return summary === '' ? label : `${label}  ${summary}`;
  }

  private computeFieldWidth(children: readonly Shape[]): number {
    let maxLabelLength = 0;
    for (const child of children) {
      if (child.treeSummary() !== '') {
        maxLabelLength = Math.max(maxLabelLength, this.labelOf(child).length);
      }
    }
    return maxLabelLength + 2;
  }

  private labelOf(shape: Shape): string {
    const annotation = this.registry.findProvider(shape.typeName)?.treeAnnotation(shape) ?? '';
    return `${shape.label}${annotation}`;
  }
}