import { EditorError } from '../core/errors/EditorError';
import { SvgDocument } from '../core/model/SvgDocument';
import type { ShapeContainer } from '../core/model/ShapeContainer';
import type { ShapeTypeRegistry } from '../core/registry/ShapeTypeRegistry';
import { XmlParser } from './xml/XmlParser';
import type { XmlElement } from './xml/XmlElement';

/** 不承载图形的元数据元素：读入时静默跳过。 */
const IGNORED_ELEMENTS = new Set(['title', 'desc', 'metadata', 'style', 'script']);
/** `<defs>` 内的图形不参与渲染（要靠 `<use>` 引用），本阶段整块跳过。 */
const SKIPPED_CONTAINERS = new Set(['defs']);

export interface SvgReadResult {
  readonly document: SvgDocument;
  /** 面向用户的警告文本（CLI 负责加 `warning: ` 前缀）。 */
  readonly warnings: readonly string[];
}

interface ReadContext {
  /** 文件里显式出现过的 id，用于给自动补全的 id 让路。 */
  readonly reservedIds: Set<string>;
  /** 已经真正分配出去的 id，用于检测重复 id。 */
  readonly assignedIds: Set<string>;
  readonly counters: Map<string, number>;
  readonly warnings: string[];
}

/**
 * SVG → 领域模型。
 *
 * 职责边界：只负责 XML 结构、画布属性、id 语义与"标签名 → Provider"的分派；
 * 每个图形的属性解释交给对应 Provider 的 `restore`，因此这里没有任何 `switch (tag)`。
 */
export class SvgReader {
  public constructor(private readonly registry: ShapeTypeRegistry) {}

  public read(source: string): SvgReadResult {
    const root = new XmlParser().parse(source);
    const rootName = localName(root.name);
    if (rootName !== 'svg') {
      throw new EditorError(`invalid svg: root element must be <svg>, got <${rootName}>`);
    }
    const document = this.createDocument(root);
    const warnings: string[] = [];
    const context: ReadContext = {
      reservedIds: collectExplicitIds(root),
      assignedIds: new Set<string>(),
      counters: new Map<string, number>(),
      warnings,
    };
    this.readChildren(root, document, context);
    return { document, warnings };
  }

  private createDocument(root: XmlElement): SvgDocument {
    const attributes = new Map(root.attributes);
    const viewBox = parseViewBox(attributes.get('viewBox'));
    const width = parseLength(attributes.get('width')) ?? viewBox?.width ?? 800;
    const height = parseLength(attributes.get('height')) ?? viewBox?.height ?? 600;
    const document = new SvgDocument(width, height, {
      x: viewBox?.minX ?? 0,
      y: viewBox?.minY ?? 0,
    });
    for (const [name, value] of root.attributes) {
      if (isDocumentAttribute(name)) {
        continue;
      }
      document.addExtraAttribute(name, value);
    }
    return document;
  }

  private readChildren(parent: XmlElement, container: ShapeContainer, context: ReadContext): void {
    for (const child of parent.children) {
      this.readElement(child, container, context);
    }
  }

  private readElement(element: XmlElement, container: ShapeContainer, context: ReadContext): void {
    const tag = localName(element.name);
    if (IGNORED_ELEMENTS.has(tag)) {
      return;
    }
    if (SKIPPED_CONTAINERS.has(tag)) {
      context.warnings.push(`skipped <${tag}>: referenced shapes are not resolved in this phase`);
      return;
    }
    const provider = this.registry.findByTag(tag);
    if (provider === null) {
      context.warnings.push(`unsupported element <${tag}> skipped`);
      return;
    }
    const id = this.resolveId(element, tag, context);
    const shape = provider.restore({
      id,
      attributes: new Map(element.attributes),
      textContent: element.text.trim(),
    });
    container.appendChild(shape);
    const childContainer = shape.asContainer();
    if (childContainer !== null) {
      this.readChildren(element, childContainer, context);
    }
    // 非容器元素的子元素（如 <text> 里的 <tspan>）本阶段忽略，见文档 round-trip 限制。
  }

  /**
   * id 语义（需求 2「自动补 id」）：
   * - 有显式 id：直接采用；若与已分配的 id 重复，则改名为 `<id>-2`、`-3`… 并警告；
   * - 无 id：按 `标签名+序号` 分配（避开文件里所有显式 id），并警告。
   */
  private resolveId(element: XmlElement, tag: string, context: ReadContext): string {
    const explicit = element.attributes.find(([name]) => name === 'id')?.[1];
    if (explicit !== undefined && explicit !== '') {
      if (!context.assignedIds.has(explicit)) {
        context.assignedIds.add(explicit);
        return explicit;
      }
      const renamed = this.uniqueId(explicit, context);
      context.warnings.push(`duplicate id ${explicit} renamed to ${renamed}`);
      return renamed;
    }
    let counter = context.counters.get(tag) ?? 0;
    let candidate = '';
    do {
      counter += 1;
      candidate = `${tag}${counter}`;
    } while (context.reservedIds.has(candidate) || context.assignedIds.has(candidate));
    context.counters.set(tag, counter);
    context.assignedIds.add(candidate);
    context.warnings.push(`assigned id ${candidate} to unnamed <${tag}>`);
    return candidate;
  }

  private uniqueId(base: string, context: ReadContext): string {
    let suffix = 2;
    let candidate = `${base}-${suffix}`;
    while (context.reservedIds.has(candidate) || context.assignedIds.has(candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    context.assignedIds.add(candidate);
    return candidate;
  }
}

function localName(name: string): string {
  const parts = name.split(':');
  return parts[parts.length - 1] ?? name;
}

function isDocumentAttribute(name: string): boolean {
  const local = localName(name);
  return local === 'width' || local === 'height' || local === 'viewBox' || local === 'xmlns'
    || name.startsWith('xmlns:');
}

function collectExplicitIds(element: XmlElement): Set<string> {
  const ids = new Set<string>();
  const visit = (node: XmlElement): void => {
    const id = node.attributes.find(([name]) => name === 'id')?.[1];
    if (id !== undefined && id !== '') {
      ids.add(id);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  visit(element);
  return ids;
}

function parseLength(raw: string | undefined): number | null {
  if (raw === undefined) {
    return null;
  }
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(?:px|pt|mm|cm|in)?\s*$/.exec(raw);
  if (match === null) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function parseViewBox(raw: string | undefined): { minX: number; minY: number; width: number; height: number } | null {
  if (raw === undefined) {
    return null;
  }
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const [minX, minY, width, height] = parts as [number, number, number, number];
  return { minX, minY, width, height };
}
