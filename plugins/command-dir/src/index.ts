import { EditorError } from '../../../src/core/errors/EditorError';
import type { CommandExtension } from '../../../src/core/plugin/CommandExtension';
import type { Plugin } from '../../../src/core/plugin/PluginContext';
import type { DirectoryAccess } from './directoryAccess';
import { NodeDirectoryAccess } from './directoryAccess';

export interface DirCommandOptions {
  /** 目录访问接口（适配器模式的 Target）；测试可注入替身。 */
  readonly directoryAccess: DirectoryAccess;

  /** 工作目录：CLI 进程启动时的 cwd，`read` / `save` 都不会改变它。 */
  readonly workingDirectory: () => string;
}

/**
 * 命令插件 `dir`：列出**当前工作目录**的直接子项。
 *
 * 特点（需求 phase_cli_2 §2.2）：
 * - 目录在前、文件在后，各自按名称升序；包含隐藏项，不含 `.` / `..`；
 * - 不依赖 SVG 文档，未 `init` 也可用；不改变文档、dirty 状态与 undo/redo 历史；
 * - 只通过 `DirectoryAccess` 访问文件系统（适配器模式），因此可用替身独立测试。
 */
export function createDirCommand(options: DirCommandOptions): CommandExtension {
  return {
    name: 'dir',
    usage: 'dir',
    summary: 'list files and subdirectories of the working directory',
    run: (args) => {
      if (args.length > 0) {
        throw new EditorError('usage: dir');
      }
      const path = options.workingDirectory();
      const entries = options.directoryAccess.list(path);
      if (entries.length === 0) {
        return ['(empty directory)'];
      }
      const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
      const dirs = entries
        .filter((entry) => entry.kind === 'dir')
        .map((entry) => entry.name)
        .sort(byName);
      const files = entries
        .filter((entry) => entry.kind === 'file')
        .map((entry) => entry.name)
        .sort(byName);
      // 标记后对齐名称列（示例：`[DIR]  docs` / `[FILE] demo.svg`）
      return [...dirs.map((name) => `[DIR]  ${name}`), ...files.map((name) => `[FILE] ${name}`)];
    },
  };
}

const plugin: Plugin = {
  name: '@svgframe/plugin-command-dir',
  activate: (context) => {
    context.registerCommand(
      createDirCommand({
        directoryAccess: new NodeDirectoryAccess(),
        workingDirectory: () => process.cwd(),
      }),
    );
  },
};

export default plugin;