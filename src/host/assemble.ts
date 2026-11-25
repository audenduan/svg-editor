import { EditorSession } from '../app/EditorSession';
import { CliApplication } from '../cli/CliApplication';
import { CommandDispatcher } from '../cli/CommandDispatcher';
import type { OutputPort } from '../cli/OutputPort';
import type { CommandContext } from '../core/plugin/CommandExtension';
import { ExtensionRegistry } from '../core/plugin/ExtensionRegistry';
import type { Plugin } from '../core/plugin/PluginContext';
import type { FileStore } from '../io/FileStore';
import { createBuiltinPlugin } from './builtinPlugin';

export interface AssemblyOptions {
  readonly fileStore: FileStore;
  readonly output: OutputPort;
  /**
   * 方式 A（改代码）额外启用的插件，数组顺序即加载顺序。
   * 加载路径与方式 B（改配置）完全一致，只是"谁来实例化插件"不同。
   */
  readonly plugins?: readonly Plugin[];
}

/** 装配结果：内核门面 + 四类扩展表 + CLI。 */
export interface CliAssembly {
  readonly extensions: ExtensionRegistry;
  readonly session: EditorSession;
  readonly dispatcher: CommandDispatcher;
  readonly application: CliApplication;
}

/**
 * 组合根（装配处）：先装配默认内置插件，再按代码装配的插件顺序追加。
 * 内核（`src/core`、`src/app`、`src/render`）不知道这里的存在。
 */
export function assembleCli(options: AssemblyOptions): CliAssembly {
  const extensions = new ExtensionRegistry();
  const session = new EditorSession({ extensions, fileStore: options.fileStore });
  const dispatcher = new CommandDispatcher(extensions.commandRegistry, () =>
    buildCommandContext(extensions, session),
  );
  const application = new CliApplication(dispatcher, options.output);

  activatePlugin(extensions, createBuiltinPlugin(session));
  for (const plugin of options.plugins ?? []) {
    activatePlugin(extensions, plugin);
  }

  return { extensions, session, dispatcher, application };
}

/**
 * 插件加载的**唯一路径**：暂存注册 → `activate` → 校验并提交。
 * 任一环节抛错都丢弃整个插件的暂存注册，不留半个插件。
 */
export function activatePlugin(extensions: ExtensionRegistry, plugin: Plugin): void {
  extensions.beginRegistration();
  try {
    plugin.activate(extensions);
    extensions.commitRegistration();
  } catch (error) {
    extensions.discardRegistration();
    throw error;
  }
}

/** 命令执行时读到的内核只读视图（每次执行重建，`help` 因此总能看到最新命令表）。 */
export function buildCommandContext(
  extensions: ExtensionRegistry,
  session: EditorSession,
): CommandContext {
  return {
    document: session.document,
    commands: extensions.commandRegistry.list().map((command) => ({
      name: command.name,
      usage: command.usage,
      summary: command.summary,
    })),
    shapeTypes: session.shapeTypeNames,
  };
}