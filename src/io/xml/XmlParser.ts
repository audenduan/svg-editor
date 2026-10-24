import { EditorError } from '../../core/errors/EditorError';
import type { XmlElement } from './XmlElement';

/**
 * 手写的最小 XML 解析器（零第三方依赖）。
 *
 * 只覆盖 SVG 文档需要的子集：XML 声明、注释、CDATA、DOCTYPE/处理指令、自闭合标签、
 * 单双引号属性、实体解码。不做 DTD 校验、不做命名空间解析（元素名取 `localName`）。
 * 解析失败抛 `EditorError`，信息以 `invalid svg:` 开头，指出出错位置，便于用户定位。
 */
export class XmlParser {
  private source = '';
  private position = 0;

  public parse(source: string): XmlElement {
    this.source = source.replace(/^\uFEFF/, '');
    this.position = 0;
    this.skipProlog();
    if (!this.startsWith('<')) {
      throw this.error('expected root element');
    }
    const root = this.parseElement();
    this.skipTrailing();
    return root;
  }

  /** 元素名、属性名允许的字符集（含命名空间前缀）。 */
  private readName(): string {
    const start = this.position;
    while (this.position < this.source.length) {
      const char = this.source[this.position] as string;
      if (/[A-Za-z0-9_:.\-]/.test(char)) {
        this.position += 1;
      } else {
        break;
      }
    }
    if (this.position === start) {
      throw this.error('expected a name');
    }
    return this.source.slice(start, this.position);
  }

  private parseElement(): XmlElement {
    this.expect('<');
    const name = this.readName();
    const attributes: Array<[string, string]> = [];
    for (;;) {
      this.skipWhitespace();
      if (this.startsWith('/>')) {
        this.position += 2;
        return { name, attributes, children: [], text: '' };
      }
      if (this.startsWith('>')) {
        this.position += 1;
        break;
      }
      const attributeName = this.readName();
      this.skipWhitespace();
      this.expect('=');
      this.skipWhitespace();
      attributes.push([attributeName, this.readAttributeValue()]);
    }

    const children: XmlElement[] = [];
    const textParts: string[] = [];
    for (;;) {
      if (this.position >= this.source.length) {
        throw this.error(`unclosed element <${name}>`);
      }
      if (this.startsWith('</')) {
        this.position += 2;
        this.skipWhitespace();
        const closingName = this.readName();
        if (closingName !== name) {
          throw this.error(`mismatched closing tag </${closingName}>, expected </${name}>`);
        }
        this.skipWhitespace();
        this.expect('>');
        return { name, attributes, children, text: textParts.join('') };
      }
      if (this.startsWith('<!--')) {
        this.skipUntil('-->', 'comment');
        continue;
      }
      if (this.startsWith('<![CDATA[')) {
        this.position += '<![CDATA['.length;
        const end = this.source.indexOf(']]>', this.position);
        if (end < 0) {
          throw this.error('unclosed CDATA section');
        }
        textParts.push(this.source.slice(this.position, end));
        this.position = end + 3;
        continue;
      }
      if (this.startsWith('<?')) {
        this.skipUntil('?>', 'processing instruction');
        continue;
      }
      if (this.startsWith('<!')) {
        this.skipUntil('>', 'declaration');
        continue;
      }
      if (this.startsWith('<')) {
        children.push(this.parseElement());
        continue;
      }
      textParts.push(this.readText());
    }
  }

  private readAttributeValue(): string {
    const quote = this.source[this.position];
    if (quote !== '"' && quote !== "'") {
      throw this.error('expected a quoted attribute value');
    }
    this.position += 1;
    const start = this.position;
    while (this.position < this.source.length && this.source[this.position] !== quote) {
      this.position += 1;
    }
    if (this.position >= this.source.length) {
      throw this.error('unclosed attribute value');
    }
    const raw = this.source.slice(start, this.position);
    this.position += 1;
    return decodeEntities(raw);
  }

  private readText(): string {
    const start = this.position;
    while (this.position < this.source.length && this.source[this.position] !== '<') {
      this.position += 1;
    }
    return decodeEntities(this.source.slice(start, this.position));
  }

  private skipProlog(): void {
    for (;;) {
      this.skipWhitespace();
      if (this.startsWith('<?')) {
        this.skipUntil('?>', 'processing instruction');
      } else if (this.startsWith('<!--')) {
        this.skipUntil('-->', 'comment');
      } else if (this.startsWith('<!DOCTYPE') || this.startsWith('<!doctype')) {
        this.skipUntil('>', 'doctype');
      } else {
        return;
      }
    }
  }

  private skipTrailing(): void {
    for (;;) {
      this.skipWhitespace();
      if (this.startsWith('<!--')) {
        this.skipUntil('-->', 'comment');
      } else if (this.startsWith('<?')) {
        this.skipUntil('?>', 'processing instruction');
      } else if (this.position < this.source.length) {
        throw this.error('unexpected content after the root element');
      } else {
        return;
      }
    }
  }

  private skipWhitespace(): void {
    while (this.position < this.source.length && /\s/.test(this.source[this.position] as string)) {
      this.position += 1;
    }
  }

  private skipUntil(marker: string, what: string): void {
    const end = this.source.indexOf(marker, this.position);
    if (end < 0) {
      throw this.error(`unclosed ${what}`);
    }
    this.position = end + marker.length;
  }

  private startsWith(prefix: string): boolean {
    return this.source.startsWith(prefix, this.position);
  }

  private expect(char: string): void {
    if (!this.startsWith(char)) {
      throw this.error(`expected "${char}"`);
    }
    this.position += char.length;
  }

  private error(message: string): EditorError {
    return new EditorError(`invalid svg: ${message} (offset ${this.position})`);
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
