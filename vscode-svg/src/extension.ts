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

export function activate(context: vscode.ExtensionContext): void {
  const decorationProvider = new SvgFileDecorationProvider();
  context.subscriptions.push(decorationProvider);
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider));

  const outlineProvider = new SvgOutlineProvider();
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      [{ language: 'xml' }, { pattern: '**/*.svg' }],
      outlineProvider,
    ),
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

  // 手动刷新命令（`SVG: Refresh File Decorations`），作为兜底手段。
  context.subscriptions.push(
    vscode.commands.registerCommand('svgEditor.refreshDecorations', () => {
      decorationProvider.refreshAll();
    }),
  );
}

export function deactivate(): void {
  // 所有资源都通过 context.subscriptions 释放，无需额外清理。
}
