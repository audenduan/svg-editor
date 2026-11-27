import { CliApplication } from '../../src/cli/CliApplication';
import type { CommandDispatcher } from '../../src/cli/CommandDispatcher';
import type { ExtensionRegistry } from '../../src/core/plugin/ExtensionRegistry';
import type { Plugin } from '../../src/core/plugin/PluginContext';
import type { ShapeTypeRegistry } from '../../src/core/registry/ShapeTypeRegistry';
import { assembleCli } from '../../src/host/assemble';
import { EditorSession } from '../../src/app/EditorSession';
import { BufferOutput } from './BufferOutput';
import { MemoryFileStore } from './MemoryFileStore';

export interface TestHarness {
  readonly session: EditorSession;
  readonly app: CliApplication;
  readonly out: BufferOutput;
  readonly registry: ShapeTypeRegistry;
  readonly extensions: ExtensionRegistry;
  readonly dispatcher: CommandDispatcher;
  readonly files: MemoryFileStore;
}

/**
 * 组装一套完整的测试环境（内存文件存储 + 缓冲输出）。
 * `plugins` 用于给单个测试追加插件，走与生产相同的注册路径。
 */
export function createHarness(plugins: readonly Plugin[] = []): TestHarness {
  const files = new MemoryFileStore();
  const out = new BufferOutput();
  const assembled = assembleCli({
    fileStore: files,
    output: out,
    plugins: plugins.map((plugin) => ({ plugin })),
  });
  return {
    session: assembled.session,
    app: assembled.application,
    out,
    registry: assembled.extensions.shapeRegistry,
    extensions: assembled.extensions,
    dispatcher: assembled.dispatcher,
    files,
  };
}

/** 逐行执行脚本；`#` 注释行会被 CLI 自动忽略。 */
export function runLines(app: CliApplication, lines: readonly string[]): void {
  for (const line of lines) {
    app.executeLine(line);
  }
}