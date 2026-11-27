import { EditorSession } from '../app/EditorSession';
import { CliApplication } from '../cli/CliApplication';
import { CommandDispatcher } from '../cli/CommandDispatcher';
import type { OutputPort } from '../cli/OutputPort';
import type { CommandContext } from '../core/plugin/CommandExtension';
import { EditorError } from '../core/errors/EditorError';
import { ExtensionRegistry } from '../core/plugin/ExtensionRegistry';
import { activateChecked } from '../core/plugin/PluginActivation';
import type { ActivatablePlugin } from '../core/plugin/PluginActivation';
import type { Plugin } from '../core/plugin/PluginContext';
import type { FileStore } from '../io/FileStore';
import { createBuiltinPlugin } from './builtinPlugin';

/** 方式 A（改代码）显式启用的一条插件：实例 + 声明段 + 可选配置段。 */
export type CodePlugin = ActivatablePlugin;

export interface AssemblyOptions {
  readonly fileStore: FileStore;
  readonly output: OutputPort;
  /**
   * 方式 A（改代码）额外启用的插件，数组顺序即加载顺序。
   * 加载路径与方式 B（改配置）完全一致，只是"谁来实例化插件"不同。
   */
  readonly plugins?: readonly CodePlugin[];
}

/** 装配结果：内核门面 + 四类扩展表 + CLI + 插件加载期的失败文案。 */
export interface CliAssembly {
  readonly extensions: ExtensionRegistry;
  readonly session: EditorSession;
  readonly dispatcher: CommandDispatcher;
  readonly application: CliApplication;
  /** 规范要求的加载期失败行（不含 `error: ` 前缀），调用方负责输出。 */
  readonly failures: readonly string[];
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

  // 内置能力同样经注册机制装配（规范判据：禁用可选插件后行为与 Phase 1 一致）。
  activateChecked(extensions, { plugin: createBuiltinPlugin(session) });

  const failures = activateAll(extensions, options.plugins ?? []);

  return { extensions, session, dispatcher, application, failures };
}

/**
 * 「立即激活、失败即抛」的严格入口：供测试与需要确认装配成功的一次性场景使用。
 * 生产路径用 `activateAll`（失败只收集文案，不中断）。
 */
export function activatePlugin(extensions: ExtensionRegistry, plugin: Plugin): void {
  const failure = activateChecked(extensions, { plugin });
  if (failure !== null) {
    throw new EditorError(failure);
  }
}

/**
 * 逐条激活（方式 A 与方式 B 共用的**唯一**入口）。
 *
 * 失败不中断：后续插件与已成功的插件照常可用，失败行原样返回给输出层。
 */
export function activateAll(
  extensions: ExtensionRegistry,
  entries: readonly ActivatablePlugin[],
): string[] {
  const failures: string[] = [];
  for (const entry of entries) {
    const failure = activateChecked(extensions, entry);
    if (failure !== null) {
      failures.push(failure);
    }
  }
  return failures;
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