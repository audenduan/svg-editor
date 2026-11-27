import type { ShapeProvider } from '../registry/ShapeProvider';
import type { AttributeHandler } from './AttributeHandler';
import type { CommandExtension } from './CommandExtension';
import type { TreeDecorator } from './TreeDecorator';

/** 四类扩展的类别名：`PluginContext` 注册、清单校验与重复注册报错都用它。 */
export type ExtensionCategory = 'shapes' | 'commands' | 'decorators' | 'attributes';

/**
 * 插件用来注册功能的**唯一入口**（内核一侧的扩展点 API）。
 *
 * 实现由装配侧提供（`ExtensionRegistry`）：
 * - 注册分四个类别，每类按名称去重；
 * - 装配侧把一个插件的注册**暂存**起来，校验通过后一起提交，
 *   任一类冲突则整个插件回滚（不留下半个插件）。
 */
export interface PluginContext {
  registerShapeProvider(provider: ShapeProvider): void;

  registerCommand(command: CommandExtension): void;

  registerTreeDecorator(decorator: TreeDecorator): void;

  registerAttributeHandler(handler: AttributeHandler): void;
}

/** 插件契约：默认导出（或代码装配时直接引用）的对象。 */
export interface Plugin {
  /** 插件名（清单 `name`，加载器报错与清单校验用）。 */
  readonly name: string;

  /**
   * 加载过程的一环：在 `PluginContext` 上完成注册。
   *
   * `options` 来自清单条目的 `options` 段（规范键名；`config` 为同义旧键），
   * 内核**原样透传、不解释**其结构——插件自己校验，缺省为 `undefined`。
   */
  activate(context: PluginContext, options?: unknown): void;
}