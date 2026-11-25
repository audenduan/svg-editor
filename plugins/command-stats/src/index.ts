import { EditorError } from '../../../src/core/errors/EditorError';
import type { Shape } from '../../../src/core/model/Shape';
import type { CommandExtension } from '../../../src/core/plugin/CommandExtension';
import type { Plugin } from '../../../src/core/plugin/PluginContext';

/**
 * 命令插件 `stats`：按类型统计叶子图形数量与容器数量。
 *
 * 独立于内置命令表：它只依赖内核公开的扩展点接口（`CommandExtension`）与领域抽象
 * （`Shape.asContainer()` / `typeName`），不认识 `EditorSession`、也不认识任何其他命令。
 * 统计不修改文档，因此不进 undo 栈。
 */
export function createStatsCommand(): CommandExtension {
  return {
    name: 'stats',
    usage: 'stats',
    summary: 'count leaf shapes by type and containers',
    run: (_args, context) => {
      if (context.document === null) {
        throw new EditorError("no document. use 'init' or 'read' first");
      }
      const counts = new Map<string, number>();
      let leaves = 0;
      let containers = 0;

      // 从画布子节点按当前顺序深度优先；类型顺序 = 首次出现顺序（Map 保序）。
      const walk = (shapes: readonly Shape[]): void => {
        for (const shape of shapes) {
          const container = shape.asContainer();
          if (container === null) {
            leaves += 1;
            counts.set(shape.typeName, (counts.get(shape.typeName) ?? 0) + 1);
            continue;
          }
          containers += 1;
          walk(container.children);
        }
      };
      walk(context.document.children);

      const parts = [...counts.entries()].map(([typeName, count]) => `${typeName}: ${count}`);
      const totals = `(total ${leaves}, containers ${containers})`;
      return [parts.length === 0 ? totals : `${parts.join('  ')}  ${totals}`];
    },
  };
}

const plugin: Plugin = {
  name: '@svgframe/plugin-command-stats',
  activate: (context) => {
    context.registerCommand(createStatsCommand());
  },
};

export default plugin;