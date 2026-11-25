/**
 * OutlineNode → vscode.DocumentSymbol 的适配层。
 *
 * 这里**只做转换**，所有解析逻辑在纯函数模块 `outlineParser.ts` 中完成，
 * 因此本文件是唯一接触 `vscode` API 的大纲相关代码。
 */
import * as vscode from 'vscode';
import { parseSvgOutline } from './outlineParser';
import type { OutlineNode } from './outlineParser';

export class SvgOutlineProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    // VSCode 在文档变化后会重新调用本方法，document.getText() 始终是最新文本。
    const text = document.getText();

    let nodes: OutlineNode[];
    try {
      nodes = parseSvgOutline(text);
    } catch {
      // parseSvgOutline 本身已兜底，这里再保护一层，确保绝不把异常抛给 VSCode。
      return [];
    }

    try {
      return nodes.map((node) => this.toSymbol(node, document, text));
    } catch {
      return [];
    }
  }

  private toSymbol(
    node: OutlineNode,
    document: vscode.TextDocument,
    text: string,
  ): vscode.DocumentSymbol {
    const startTagEnd = findStartTagEnd(text, node.startOffset);
    const range = new vscode.Range(
      document.positionAt(node.startOffset),
      document.positionAt(node.endOffset),
    );
    const selectionRange = new vscode.Range(
      document.positionAt(node.startOffset),
      document.positionAt(startTagEnd),
    );
    const kind =
      node.children.length > 0 ? vscode.SymbolKind.Object : vscode.SymbolKind.Field;

    const symbol = new vscode.DocumentSymbol(node.name, node.tag, kind, range, selectionRange);
    symbol.children = node.children.map((child) => this.toSymbol(child, document, text));
    return symbol;
  }
}

/**
 * 从元素起始偏移出发，找到开始标签结束 `>` 之后的位置（= selectionRange 的终点）。
 * 处理引号内的 `>`（例如属性值中含 `>`）以免提前截断；找不到时退化为文本末尾。
 */
function findStartTagEnd(text: string, startOffset: number): number {
  let quote: string | null = null;
  for (let i = startOffset; i < text.length; i += 1) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i + 1;
    }
  }
  return text.length;
}
