import path from 'node:path';
import { ConsoleOutput } from './cli/OutputPort';
import type { OutputPort } from './cli/OutputPort';
import { Repl } from './cli/Repl';
import { PluginManifestLoader } from './core/config/PluginManifestLoader';
import type { ManifestLoadResult } from './core/config/PluginManifestLoader';
import { activateAll, assembleCli } from './host/assemble';
import type { CliAssembly } from './host/assemble';
import { NodePluginModuleLoader } from './host/NodePluginModuleLoader';
import { NodeFileStore } from './io/NodeFileStore';

/**
 * 入口：两种装配方式共存，差别只在"谁来实例化插件"。
 *
 * - 方式 A（改代码）：在代码里 import 插件对象，经 `assembleCli({plugins})` 激活；
 * - 方式 B（改配置）：`--config <manifest.json>` 由内核加载器解析清单并逐个激活。
 *
 * 两者最终都走同一个 `activateChecked`，因此命令表、结构树标签、属性处理完全一致。
 *
 * 失败策略（严格按 Phase 2 规范）：插件加载期的四类失败——模块找不到、没有默认导出、
 * 清单声明与实际注册不一致、`activate` 抛错——以及整份配置非法，都**打印 `error:` 后
 * 继续启动**，主程序不退出；已成功的插件与内置能力照常可用。只有**参数用法错**
 * （`--config` 缺参数）属于用法错误，退出码 2。
 */

/** 命令行用法错误：退出码 2，与运行期失败区分开。 */
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
 * 读取 + 解析 + 加载配置。**任何**失败都折算成 `error` 行返回，不抛异常：
 * 这是"配置坏了也要能用内置能力跑起来"的落地方式。
 */
export function readConfig(
  configPath: string,
  fileStore: NodeFileStore,
  projectRoot: string,
): ManifestLoadResult {
  const empty: ManifestLoadResult = { candidates: [], errors: [], warnings: [] };
  let source: string;
  try {
    source = fileStore.read(configPath);
  } catch {
    return {
      ...empty,
      errors: [`invalid plugin config: ${configPath}: cannot read file`],
    };
  }
  const loader = new PluginManifestLoader(new NodePluginModuleLoader(projectRoot));
  try {
    return loader.load(source, path.resolve(configPath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...empty, errors: [message] };
  }
}

/** 装配 + 装配配置（如果有）：收集所有失败行，供 REPL 前置输出。 */
export function assembleFromConfig(
  argv: readonly string[],
  fileStore: NodeFileStore,
  output: OutputPort,
  projectRoot: string,
): CliAssembly {
  const assembly = assembleCli({ fileStore, output });
  const configPath = parseConfigArgument(argv);
  if (configPath === null) {
    return assembly;
  }
  const loaded = readConfig(configPath, fileStore, projectRoot);
  const failures = activateAll(
    assembly.extensions,
    loaded.candidates.map((candidate) => ({
      plugin: candidate.plugin,
      contributions: candidate.declaration.contributions,
      ...(candidate.declaration.options === undefined
        ? {}
        : { options: candidate.declaration.options }),
    })),
  );
  const prelude = [
    ...loaded.errors.map((line) => `error: ${line}`),
    ...loaded.warnings.map((line) => `warning: ${line}`),
    ...failures.map((line) => `error: ${line}`),
  ];
  return { ...assembly, failures: [...assembly.failures, ...prelude] };
}

function main(argv: readonly string[], output: OutputPort): number {
  const fileStore = new NodeFileStore();
  const projectRoot = path.resolve(__dirname, '..', '..');
  let assembly: CliAssembly;
  let prelude: string[];
  try {
    assembly = assembleFromConfig(argv, fileStore, output, projectRoot);
    prelude = assembly.failures.map((line) =>
      line.startsWith('error: ') || line.startsWith('warning: ') ? line : `error: ${line}`,
    );
  } catch (error) {
    // 只剩用法错会走到这里（配置类失败已在 readConfig 内消化成 error 行）。
    const message = error instanceof Error ? error.message : String(error);
    output.writeLine(`error: ${message}`);
    return error instanceof CliUsageError ? 2 : 1;
  }
  startRepl(assembly, output, prelude);
  return 0;
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