/**
 * SVG 大纲解析（纯函数，不 import `vscode`，可被 node:test 无头测试）。
 *
 * 设计目标只有“结构”：把一段 SVG/XML 文本解析成带**源码偏移**的元素树，
 * 供原生大纲视图渲染。不做 SVG 规范校验、不做图形语义解释、不做预览。
 *
 * 对“编辑到一半”的残缺 XML（未闭合标签、多余结尾标签等）：**不抛异常**，
 * `parseSvgOutline` 捕获所有解析错误后返回空数组，让大纲临时清空而不是崩溃。
 */

/** 大纲树节点：`startOffset`/`endOffset` 覆盖该元素的整段源码（起标签到闭标签之后）。 */
export interface OutlineNode {
  tag: string;
  id: string | null;
  /** 展示名：有 id 时为 `tag#id`，否则为 `tag`。 */
  name: string;
  startOffset: number;
  endOffset: number;
  children: OutlineNode[];
}

/**
 * 解析 SVG 文本为大纲节点数组（通常是单个 `<svg>` 根节点）。
 *
 * 任何解析失败都会返回 `[]`，绝不向外抛异常。
 */
export function parseSvgOutline(text: string): OutlineNode[] {
  try {
    return new OutlineParser(text).parse();
  } catch {
    return [];
  }
}

const NAME_CHAR = /[A-Za-z0-9_:.\-]/;

/** 手写的递归下降解析器；只在内部使用，`parseSvgOutline` 负责兜底异常。 */
class OutlineParser {
  private readonly source: string;
  private pos = 0;

  public constructor(source: string) {
    this.source = source;
  }

  public parse(): OutlineNode[] {
    const nodes: OutlineNode[] = [];
    for (;;) {
      this.skipMisc();
      if (this.pos >= this.source.length) {
        break;
      }
      const ch = this.source[this.pos];
      if (ch !== '<') {
        // 顶层游离文本：跳过，继续找下一个元素。
        this.pos += 1;
        continue;
      }
      if (this.startsWith('</')) {
        // 多余的结尾标签（例如根之后又一个 `</g>`）→ 视为非法文档。
        throw new Error('unexpected closing tag at top level');
      }
      nodes.push(this.parseElement());
    }
    return nodes;
  }

  /** 解析一个元素，返回它的节点（含整段源码偏移）。 */
  private parseElement(): OutlineNode {
    const startOffset = this.pos;
    this.expect('<');
    const tag = this.readName();

    let id: string | null = null;
    for (;;) {
      this.skipWhitespace();
      if (this.startsWith('/>')) {
        this.pos += 2;
        return this.makeNode(tag, id, startOffset, this.pos, []);
      }
      if (this.startsWith('>')) {
        this.pos += 1;
        break;
      }
      const attributeName = this.readName();
      this.skipWhitespace();
      this.expect('=');
      this.skipWhitespace();
      const value = this.readAttributeValue();
      if (attributeName === 'id' && value !== '') {
        id = value;
      }
    }

    const children: OutlineNode[] = [];
    for (;;) {
      if (this.pos >= this.source.length) {
        throw new Error(`unclosed element <${tag}>`);
      }
      if (this.startsWith('</')) {
        this.pos += 2;
        this.skipWhitespace();
        const closingName = this.readName();
        if (closingName !== tag) {
          throw new Error(`mismatched closing tag </${closingName}>, expected </${tag}>`);
        }
        this.skipWhitespace();
        this.expect('>');
        return this.makeNode(tag, id, startOffset, this.pos, children);
      }
      if (this.startsWith('<!--')) {
        this.skipUntil('-->');
        continue;
      }
      if (this.startsWith('<![CDATA[')) {
        this.pos += '<![CDATA['.length;
        const end = this.source.indexOf(']]>', this.pos);
        if (end < 0) {
          throw new Error('unclosed CDATA section');
        }
        this.pos = end + ']]>'.length;
        continue;
      }
      if (this.startsWith('<?')) {
        this.skipUntil('?>');
        continue;
      }
      if (this.startsWith('<!')) {
        this.skipUntil('>');
        continue;
      }
      if (this.startsWith('<')) {
        children.push(this.parseElement());
        continue;
      }
      this.skipText();
    }
  }

  private makeNode(
    tag: string,
    id: string | null,
    startOffset: number,
    endOffset: number,
    children: OutlineNode[],
  ): OutlineNode {
    return {
      tag,
      id,
      name: id === null ? tag : `${tag}#${id}`,
      startOffset,
      endOffset,
      children,
    };
  }

  /** 跳过 XML 声明 / 注释 / DOCTYPE / 顶层空白等“非元素”内容。 */
  private skipMisc(): void {
    for (;;) {
      this.skipWhitespace();
      if (this.startsWith('<!--')) {
        this.skipUntil('-->');
        continue;
      }
      if (this.startsWith('<![CDATA[')) {
        this.pos += '<![CDATA['.length;
        const end = this.source.indexOf(']]>', this.pos);
        if (end < 0) {
          throw new Error('unclosed CDATA section');
        }
        this.pos = end + ']]>'.length;
        continue;
      }
      if (this.startsWith('<?')) {
        this.skipUntil('?>');
        continue;
      }
      if (this.startsWith('<!')) {
        this.skipUntil('>');
        continue;
      }
      return;
    }
  }

  private readName(): string {
    const start = this.pos;
    while (this.pos < this.source.length && NAME_CHAR.test(this.source[this.pos] as string)) {
      this.pos += 1;
    }
    if (this.pos === start) {
      throw new Error('expected a name');
    }
    return this.source.slice(start, this.pos);
  }

  private readAttributeValue(): string {
    const quote = this.source[this.pos];
    if (quote !== '"' && quote !== "'") {
      throw new Error('expected a quoted attribute value');
    }
    this.pos += 1;
    const start = this.pos;
    while (this.pos < this.source.length && this.source[this.pos] !== quote) {
      this.pos += 1;
    }
    if (this.pos >= this.source.length) {
      throw new Error('unclosed attribute value');
    }
    const raw = this.source.slice(start, this.pos);
    this.pos += 1;
    return decodeEntities(raw);
  }

  private skipText(): void {
    while (this.pos < this.source.length && this.source[this.pos] !== '<') {
      this.pos += 1;
    }
  }

  private skipWhitespace(): void {
    while (this.pos < this.source.length && /\s/.test(this.source[this.pos] as string)) {
      this.pos += 1;
    }
  }

  private skipUntil(marker: string): void {
    const end = this.source.indexOf(marker, this.pos);
    if (end < 0) {
      throw new Error(`unclosed construct, expected ${marker}`);
    }
    this.pos = end + marker.length;
  }

  private startsWith(prefix: string): boolean {
    return this.source.startsWith(prefix, this.pos);
  }

  private expect(char: string): void {
    if (!this.startsWith(char)) {
      throw new Error(`expected "${char}" at offset ${this.pos}`);
    }
    this.pos += char.length;
  }
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** 只解码 XML 预定义实体与字符引用；未知实体原样保留。 */
function decodeEntities(text: string): string {
  if (!text.includes('&')) {
    return text;
  }
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return isCodePoint(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return isCodePoint(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

function isCodePoint(code: number): boolean {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff;
}
