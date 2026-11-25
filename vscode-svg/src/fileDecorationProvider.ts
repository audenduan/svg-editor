/**
 * A.1 文件标记：给资源管理器里的 `.svg` 文件加 `[]` 徽标。
 *
 * 这是“注册式装饰/适配”：我们并不包装文件对象、也不转发任何调用，
 * 只是向 VSCode 注册一个 provider，由 VSCode 在渲染资源管理器条目时回调
 * `provideFileDecoration`，我们返回一段“附加显示信息”（badge/tooltip）。
 */
import * as vscode from 'vscode';

const SVG_EXTENSION = /\.svg$/i;

export class SvgFileDecorationProvider
  implements vscode.FileDecorationProvider, vscode.Disposable
{
  // 文档保存 / 文件增删 / 手动刷新时，用它通知 VSCode 重新询问装饰。
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  public readonly onDidChangeFileDecorations = this.emitter.event;

  public async provideFileDecoration(
    uri: vscode.Uri,
  ): Promise<vscode.FileDecoration | undefined> {
    // 先做便宜的扩展名过滤，避免对每个资源都去 stat。
    if (!SVG_EXTENSION.test(uri.path)) {
      return undefined;
    }
    // 只给“文件”加标记：目录（哪怕名字以 .svg 结尾）也不加。
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type !== vscode.FileType.File) {
        return undefined;
      }
    } catch {
      // stat 失败（如刚被删除）就不加标记，不影响其他条目。
      return undefined;
    }
    return { badge: '[]', tooltip: 'SVG file' };
  }

  /** 刷新单个（或一组）Uri 的装饰。 */
  public refresh(uri?: vscode.Uri | vscode.Uri[]): void {
    this.emitter.fire(uri);
  }

  /** 全量刷新（`undefined` 是 VSCode 约定的“全部重算”信号）。 */
  public refreshAll(): void {
    this.emitter.fire(undefined);
  }

  public dispose(): void {
    this.emitter.dispose();
  }
}
