import { ConsoleOutput } from './cli/OutputPort';
import { Repl } from './cli/Repl';
import { PluginManifestLoader } from './core/config/PluginManifestLoader';
import { activatePlugin, assembleCli } from './host/assemble';
import { NodePluginModuleLoader } from './host/NodePluginModuleLoader';
import { NodeFileStore } from './io/NodeFileStore';
import path from 'node:path';

/**
 * 入口：两种装配方式共存，差别只在"谁来实例化插件"。
 *
 * - 方式 A（改代码）：在代码里 import 插件对象，经 `assembleCli({plugins})` 激活；
 * - 方式 B（改配置）：`--config <manifest.json>` 由内核加载器解析清单并逐个激活。
 *
 * 两者最终都走同一个 `activatePlugin`，因此命令表、结构树标签、属性处理完全一致。
 */
function parseConfigArgument(argv: readonly string[]): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === '--config') {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error('--config requires a manifest path');
      }
      return value;
    }
    if (arg.startsWith('--config=')) {
      return arg.slice('--config='.length);
    }
  }
  return null;
}

const output = new ConsoleOutput();
const fileStore = new NodeFileStore();
const projectRoot = path.resolve(__dirname, '..', '..');

let configPath: string | null = null;
try {
  configPath = parseConfigArgument(process.argv.slice(2));
} catch (error) {
  output.writeLine(`error: ${(error as Error).message}`);
  process.exitCode = 2;
}

if (process.exitCode !== 2) {
  const assembled = assembleCli({ fileStore, output });
  if (configPath !== null) {
    try {
      const loader = new PluginManifestLoader(new NodePluginModuleLoader(projectRoot));
      const { plugins, warnings } = loader.load(fileStore.read(configPath), path.resolve(configPath));
      for (const warning of warnings) {
        output.writeLine(`warning: ${warning}`);
      }
      for (const plugin of plugins) {
        activatePlugin(assembled.extensions, plugin);
      }
    } catch (error) {
      output.writeLine(`error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }

  const interactive = Boolean(process.stdin.isTTY);
  process.on('SIGINT', () => {
    process.stdout.write('\n');
    process.exit(0);
  });
  new Repl({ input: process.stdin, output, promptStream: process.stdout, interactive }, assembled.application).start();
}