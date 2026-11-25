import type { Plugin } from '../../../src/core/plugin/PluginContext';
import { BoxFillHandler, BoxLabelHandler } from './BoxAttributeHandlers';
import { BoxProvider } from './BoxProvider';
import { BoxTypeLabel } from './BoxTypeLabel';

/**
 * `box` 插件：一次注册四类扩展中的三种（图形类型、属性处理器、树标签）。
 *
 * 插件只通过 `PluginContext` 与内核交互，不 import 任何内核内部实现或装配模块，
 * 因此在"接入 box 的提交"里 `src/**` 的差异为 0。
 */
const plugin: Plugin = {
  name: '@svgframe/plugin-shape-box',
  activate: (context) => {
    context.registerShapeProvider(new BoxProvider());
    context.registerAttributeHandler(new BoxFillHandler());
    context.registerAttributeHandler(new BoxLabelHandler());
    context.registerTreeDecorator(new BoxTypeLabel());
  },
};

export default plugin;