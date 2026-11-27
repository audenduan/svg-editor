import path from 'node:path';
import { ConsoleOutput } from './cli/OutputPort';
import type { OutputPort } from './cli/OutputPort';
import { Repl } from './cli/Repl';
import { PluginManifestLoader } from './core/config/PluginManifestLoader';
import type { ManifestLoadResult } from './core/config/PluginManifestLoader';
import { EditorError } from './core/errors/EditorError';
import { activatePlugin, assembleCli } from './host/assemble';
import type { CliAssembly } from './host/assemble';
import { NodePluginModuleLoader } from './host/NodePluginModuleLoader';
import { NodeFileStore } from './io/NodeFileStore';

/**
 * 入口：两种装配方式共存，差别只在"谁来实例化插件"。
 *
 * - 方式 A（改代码）：在代码里 import 插件对象，经 `assembleCli({plugins})` 激活；
 * - 方式 B（改配置）：`--config <manifest.json>` 由内核加载器解析清单并逐个激活。
 *
 * 两者最终都走同一个 `activatePlugin`，因此命令表、结构树标签、属性处理完全一致。
 *
 * 失败策略：装配失败（参数用法错 / 配置读不到 / 配置非法 / 插件加载失败 / 注册冲突）
 * 一律**打印 `error:` 后直接退出**，不进入 REPL——带着半套插件继续跑只会把错误放大成
 * 一连串 `unknown command`，掩盖真正的原因。
 */

/** 命令行用法错误：退出码 2，与运行期失败（1）区分开。 */
class CliUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

/** 解析 `--config <path>` / `--config=<path>`；未出现时返回 `null`。 */
export function parseConfigArgument(argv: readonly string[]): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === '--config') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new CliUsageError('--config requires a manifest path');
      }
      return value;
    }
    if (arg.startsWith('--config=')) {
      const value = arg.slice('--config='.length);
      if (value === '') {
        throw new CliUsageError('--config requires a manifest path');
      }
      return value;
    }
  }
  return null;
}

/**
 * 按配置装配插件。配置文件读不到时给出比 `cannot read file` 更明确的上下文；
 * 加载与激活仍走内核加载器与 `activatePlugin`（与方式 A 同一条路径）。
 */
export function activateFromConfig(
  assembly: CliAssembly,
  configPath: string,
  fileStore: NodeFileStore,
  projectRoot: string,
): ManifestLoadResult {
  let source: string;
  try {
    source = fileStore.read(configPath);
  } catch {
    throw new EditorError(`cannot read plugin config: ${configPath}`);
  }
  const loader = new PluginManifestLoader(new NodePluginModuleLoader(projectRoot));
  const result = loader.load(source, path.resolve(configPath));
  for (const plugin of result.plugins) {
    activatePlugin(assembly.extensions, plugin);
  }
  return result;
}

function main(argv: readonly string[], output: OutputPort): number {
  try {
    const configPath = parseConfigArgument(argv);
    const fileStore = new NodeFileStore();
    const projectRoot = path.resolve(__dirname, '..', '..');
    const assembly = assembleCli({ fileStore, output });
    const loadResult =
      configPath === null ? null : activateFromConfig(assembly, configPath, fileStore, projectRoot);

    const prelude = (loadResult?.warnings ?? []).map((warning) => `warning: ${warning}`);
    startRepl(assembly, output, prelude);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.writeLine(`error: ${message}`);
    return error instanceof CliUsageError ? 2 : 1;
  }
}

function startRepl(assembly: CliAssembly, output: OutputPort, prelude: readonly string[]): void {
  const interactive = Boolean(process.stdin.isTTY);
  process.on('SIGINT', () => {
    process.stdout.write('\n');
    process.exit(0);
  });
  new Repl(
    {
      input: process.stdin,
      output,
      promptStream: process.stdout,
      interactive,
      ...(prelude.length === 0 ? {} : { prelude }),
    },
    assembly.application,
  ).start();
}

process.exitCode = main(process.argv.slice(2), new ConsoleOutput());