import { EditorSession } from '../../src/app/EditorSession';
import { CliApplication } from '../../src/cli/CliApplication';
import { CommandDispatcher } from '../../src/cli/CommandDispatcher';
import type { ShapeTypeRegistry } from '../../src/core/registry/ShapeTypeRegistry';
import { createDefaultShapeTypeRegistry } from '../../src/core/registry/createDefaultShapeTypeRegistry';
import { BufferOutput } from './BufferOutput';
import { MemoryFileStore } from './MemoryFileStore';

export interface TestHarness {
  readonly session: EditorSession;
  readonly app: CliApplication;
  readonly out: BufferOutput;
  readonly registry: ShapeTypeRegistry;
  readonly files: MemoryFileStore;
}

/** 组装一套完整的测试环境（内存文件存储 + 缓冲输出）。 */
export function createHarness(): TestHarness {
  const files = new MemoryFileStore();
  const registry = createDefaultShapeTypeRegistry();
  const session = new EditorSession({ registry, fileStore: files });
  const out = new BufferOutput();
  const app = new CliApplication(new CommandDispatcher(session, registry), out);
  return { session, app, out, registry, files };
}

/** 逐行执行脚本；`#` 注释行会被 CLI 自动忽略。 */
export function runLines(app: CliApplication, lines: readonly string[]): void {
  for (const line of lines) {
    app.executeLine(line);
  }
}