import { EditorError } from '../core/errors/EditorError';

/**
 * 命令行分词：按空白分隔，双引号包裹的内容作为单个参数（带空格参数，需求 2）。
 * 引号不是 token 的一部分（`create text t1 20 40 "My Diagram"` → content = `My Diagram`）。
 */
export class CommandLineTokenizer {
  public tokenize(line: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let hasToken = false;
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
        hasToken = true;
        continue;
      }
      if (!inQuotes && /\s/.test(char)) {
        if (hasToken) {
          tokens.push(current);
          current = '';
          hasToken = false;
        }
        continue;
      }
      current += char;
      hasToken = true;
    }

    if (inQuotes) {
      throw new EditorError('unterminated quoted argument');
    }
    if (hasToken) {
      tokens.push(current);
    }
    return tokens;
  }
}