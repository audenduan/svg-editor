import { formatNumber } from '../core/model/numbers';
import type { Shape } from '../core/model/Shape';
import type { SvgDocument } from '../core/model/SvgDocument';

/**
 * 领域模型 → SVG 文本。
 *
 * 输出规则（与需求 0.1 示例一致）：
 * - `<?xml ...?>` + `<svg xmlns width height viewBox>`，子元素统一缩进 2 空格；
 * - 属性顺序：`id` → 几何属性（模型声明顺序）→ `fill/stroke/stroke-width` → 读入保留的未知属性；
 * - 空容器写成自闭合 `<g .../>`，text 的内容写成元素文本。
 *
 * 这里没有任何 `switch (shape.typeName)`：容器/文本/普通图形通过 `asContainer()` /
 * `serializedTextContent()` 三个多态钩子区分，插件类型无需改动本类。
 */
export class SvgWriter {
  public write(document: SvgDocument): string {
    const viewBox = document.viewBox;
    const rootAttributes: Array<[string, string]> = [
      ['xmlns', 'http://www.w3.org/2000/svg'],
      ['width', formatNumber(document.width)],
      ['height', formatNumber(document.height)],
      [
        'viewBox',
        [
          formatNumber(viewBox.minX),
          formatNumber(viewBox.minY),
          formatNumber(viewBox.width),
          formatNumber(viewBox.height),
        ].join(' '),
      ],
    ];
    for (const [name, value] of document.extraAttributePairs()) {
      rootAttributes.push([name, value]);
    }

    const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<svg${this.renderAttributes(rootAttributes)}>`];
    for (const child of document.children) {
      this.writeShape(child, 1, lines);
    }
    lines.push('</svg>');
    return `${lines.join('\n')}\n`;
  }

  private writeShape(shape: Shape, depth: number, lines: string[]): void {
    const indent = '  '.repeat(depth);
    const attributes = this.attributePairs(shape);
    const container = shape.asContainer();
    const textContent = shape.serializedTextContent();

    if (container !== null) {
      if (container.children.length === 0) {
        lines.push(`${indent}<${shape.elementName}${this.renderAttributes(attributes)}/>`);
        return;
      }
      lines.push(`${indent}<${shape.elementName}${this.renderAttributes(attributes)}>`);
      for (const child of container.children) {
        this.writeShape(child, depth + 1, lines);
      }
      lines.push(`${indent}</${shape.elementName}>`);
      return;
    }

    if (textContent !== null) {
      lines.push(
        `${indent}<${shape.elementName}${this.renderAttributes(attributes)}>${SvgWriter.escapeText(textContent)}</${shape.elementName}>`,
      );
      return;
    }

    lines.push(`${indent}<${shape.elementName}${this.renderAttributes(attributes)}/>`);
  }

  private attributePairs(shape: Shape): Array<[string, string]> {
    const pairs: Array<[string, string]> = [['id', shape.id]];
    const used = new Set(['id']);
    for (const [name, value] of shape.numericAttributes()) {
      pairs.push([name, formatNumber(value)]);
      used.add(name);
    }
    for (const [name, value] of shape.styleAttributes()) {
      pairs.push([name, value]);
      used.add(name);
    }
    for (const [name, value] of shape.extraAttributePairs()) {
      // 同名时几何/样式优先，避免输出重复属性
      if (!used.has(name)) {
        pairs.push([name, value]);
        used.add(name);
      }
    }
    return pairs;
  }

  private renderAttributes(pairs: readonly (readonly [string, string])[]): string {
    return pairs.map(([name, value]) => ` ${name}="${SvgWriter.escapeAttribute(value)}"`).join('');
  }

  private static escapeAttribute(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private static escapeText(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
