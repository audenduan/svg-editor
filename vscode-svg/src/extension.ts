/**
 * 扩展入口：注册 A.1 文件装饰 provider 与 A.2 大纲 provider。
 *
 * 激活后：
 * - `.svg` 文件在资源管理器里显示 `[]` 徽标（含保存/增删后的刷新）；
 * - `.svg` 文件的原生大纲（Outline）视图展示元素嵌套层级。
 */
import * as vscode from 'vscode';
import { SvgFileDecorationProvider } from './fileDecorationProvider';
import { SvgOutlineProvider } from './outlineProvider';

const SVG_EXTENSION = /\.svg$/i;

/**
 * 大纲 provider 的文档选择器。
 *
 * 三个条目分别覆盖三种情况，缺一不可：
 * - `language: 'xml'`：用户把 `.svg` 关联成 xml 语言时也能命中；
 * - `pattern: '**\/*.svg'`：工作区内的多级路径；
 * - `pattern: '*.svg'`：工作区**根目录**下的文件。
 */
const SVG_DOCUMENT_SELECTOR: vscode.DocumentFilter[] = [
  { language: 'xml' },
  { pattern: '**/*.svg' },
  { pattern: '*.svg' },
];

export function activate(context: vscode.ExtensionContext): void {
  const decorationProvider = new SvgFileDecorationProvider();
  context.subscriptions.push(decorationProvider);
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider));

  const outlineProvider = new SvgOutlineProvider();
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(SVG_DOCUMENT_SELECTOR, outlineProvider),
  );

  // 文档保存 / 文件创建 / 文件删除后刷新装饰，保证徽标与磁盘状态一致。
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (SVG_EXTENSION.test(document.uri.path)) {
        decorationProvider.refresh(document.uri);
      }
    }),
    vscode.workspace.onDidCreateFiles((event) => {
      decorationProvider.refresh([...event.files]);
    }),
    vscode.workspace.onDidDeleteFiles((event) => {
      decorationProvider.refresh([...event.files]);
    }),
  );

  // 手动刷新命令（`SVG: 刷新文件徽标`），作为兜底手段。
  context.subscriptions.push(
    vscode.commands.registerCommand('svgEditor.refreshDecorations', () => {
      decorationProvider.refreshAll();
    }),
  );
}

export function deactivate(): void {
  // 所有资源都通过 context.subscriptions 释放，无需额外清理。
}
