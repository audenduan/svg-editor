import { EditorError } from '../errors/EditorError';
import type { ShapeProvider } from '../registry/ShapeProvider';
import { ShapeTypeRegistry } from '../registry/ShapeTypeRegistry';
import type { AttributeHandler } from './AttributeHandler';
import { AttributeHandlerRegistry } from './AttributeHandlerRegistry';
import type { CommandExtension } from './CommandExtension';
import { CommandRegistry } from './CommandRegistry';
import type { ExtensionCategory, PluginContext } from './PluginContext';
import type { TreeDecorator } from './TreeDecorator';
import { TreeDecoratorRegistry } from './TreeDecoratorRegistry';

interface StagedRegistration {
  readonly category: ExtensionCategory;
  readonly name: string;
  /** 图形类型的元素标签（用于标签冲突校验）。 */
  readonly tag?: string;
  /** 附加校验，返回 false 表示与已提交的注册冲突。 */
  readonly validate?: () => boolean;
  readonly apply: () => void;
}

/**
 * 四类扩展的统一存放处，也是 `PluginContext` 的实现。
 *
 * **暂存式注册**：装配侧按 `beginRegistration` → 插件 `activate` → `commitRegistration`
 * 的顺序使用。提交时先整体校验类别/名称冲突，任一冲突就抛
 * `duplicate registration: <category>/<name>`，此时**不会**应用任何一条注册；
 * 激活过程抛错则调用 `discardRegistration` 丢弃整个插件的注册（不留半个插件）。
 */
export class ExtensionRegistry implements PluginContext {
  private readonly shapes = new ShapeTypeRegistry();
  private readonly commands = new CommandRegistry();
  private readonly decorators = new TreeDecoratorRegistry();
  private readonly handlers = new AttributeHandlerRegistry();
  private pending: StagedRegistration[] | null = null;

  public get shapeRegistry(): ShapeTypeRegistry {
    return this.shapes;
  }

  public get commandRegistry(): CommandRegistry {
    return this.commands;
  }

  public get decoratorRegistry(): TreeDecoratorRegistry {
    return this.decorators;
  }

  public get attributeHandlerRegistry(): AttributeHandlerRegistry {
    return this.handlers;
  }

  /** 开始一个插件的注册事务。 */
  public beginRegistration(): void {
    if (this.pending !== null) {
      throw new Error('plugin registration already in progress');
    }
    this.pending = [];
  }

  /**
   * 提交暂存的注册：先统一校验，冲突则整体失败（不应用任何一条），
   * 校验通过后一次性应用，保证"要么全装、要么全不装"。
   */
  public commitRegistration(): void {
    const pending = this.pending;
    if (pending === null) {
      throw new Error('no plugin registration in progress');
    }
    this.pending = null;

    const seen = new Set<string>();
    const stagedTags = new Set<string>();
    for (const item of pending) {
      const key = `${item.category}/${item.name}`;
      if (seen.has(key) || this.hasRegistration(item.category, item.name)) {
        throw new EditorError(`duplicate registration: ${key}`);
      }
      seen.add(key);
      if (item.validate !== undefined && !item.validate()) {
        throw new EditorError(`duplicate registration: ${key}`);
      }
      if (item.tag !== undefined) {
        if (stagedTags.has(item.tag)) {
          throw new EditorError(`duplicate registration: ${key}`);
        }
        stagedTags.add(item.tag);
      }
    }
    for (const item of pending) {
      item.apply();
    }
  }

  /** 丢弃暂存的注册（激活失败时调用）。 */
  public discardRegistration(): void {
    this.pending = null;
  }

  public hasRegistration(category: ExtensionCategory, name: string): boolean {
    switch (category) {
      case 'shapes':
        return this.shapes.findProvider(name) !== null;
      case 'commands':
        return this.commands.has(name);
      case 'decorators':
        return this.decorators.has(name);
      case 'attributes':
        return this.handlers.has(name);
      default:
        return false;
    }
  }

  /**
   * **暂存区**里的四类名称（尚未提交）。
   *
   * 供清单校验使用：插件在 `activate` 里注册了什么，必须以"暂存区里到底有什么"
   * 为准去和清单声明比对，而不是等提交之后再回查（那时已无法区分是哪个插件注册的）。
   */
  public stagedNames(): Readonly<Record<ExtensionCategory, readonly string[]>> {
    const pending = this.pending ?? [];
    const collect = (category: ExtensionCategory): readonly string[] =>
      pending.filter((item) => item.category === category).map((item) => item.name);
    return {
      shapes: collect('shapes'),
      commands: collect('commands'),
      decorators: collect('decorators'),
      attributes: collect('attributes'),
    };
  }

  public registeredNames(category: ExtensionCategory): readonly string[] {
    switch (category) {
      case 'shapes':
        return this.shapes.listProviders().map((provider) => provider.typeName);
      case 'commands':
        return this.commands.list().map((command) => command.name);
      case 'decorators':
        return this.decorators.list().map((decorator) => decorator.name);
      case 'attributes':
        return this.handlers.list().map((handler) => handler.name);
      default:
        return [];
    }
  }

  // ------------------------------------------------------------------
  // PluginContext：插件的注册入口（写入暂存区）
  // ------------------------------------------------------------------

  public registerShapeProvider(provider: ShapeProvider): void {
    const pending = this.requirePending('shapes');
    // 标签变体（声明 matchesElement）允许共享元素标签，只有"默认 Provider"占用标签。
    const isVariant = provider.matchesElement !== undefined;
    pending.push({
      category: 'shapes',
      name: provider.typeName,
      tag: isVariant ? undefined : provider.elementTag,
      apply: () => this.shapes.register(provider),
    });
  }

  public registerCommand(command: CommandExtension): void {
    this.requirePending('commands').push({
      category: 'commands',
      name: command.name,
      apply: () => this.commands.register(command),
    });
  }

  public registerTreeDecorator(decorator: TreeDecorator): void {
    this.requirePending('decorators').push({
      category: 'decorators',
      name: decorator.name,
      apply: () => this.decorators.register(decorator),
    });
  }

  public registerAttributeHandler(handler: AttributeHandler): void {
    this.requirePending('attributes').push({
      category: 'attributes',
      name: handler.name,
      apply: () => this.handlers.register(handler),
    });
  }

  private requirePending(category: ExtensionCategory): StagedRegistration[] {
    if (this.pending === null) {
      throw new Error(`plugin registration is not open (tried to register ${category})`);
    }
    return this.pending;
  }
}