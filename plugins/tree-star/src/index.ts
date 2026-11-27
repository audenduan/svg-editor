import type { Plugin } from '../../../src/core/plugin/PluginContext';
import { ModifiedStarDecorator } from './ModifiedStarDecorator';

/**
 * 树标签插件 `modified-star`：为"未保存的变化"追加 ` *`。
 *
 * 它与 `(box)` 标签互不感知：两者只各自往行尾追加自己的字符串，
 * 拼接顺序由注册顺序决定（ADR-3），内核与渲染器都不认识这两个标签。
 */
const plugin: Plugin = {
  name: '@svgframe/plugin-tree-star',
  activate(context) {
    context.registerTreeDecorator(new ModifiedStarDecorator());
  },
};

export default plugin;