import { ConsoleOutput } from './cli/OutputPort';
import { Repl } from './cli/Repl';
import { assembleCli } from './host/assemble';
import type { CodePlugin } from './host/assemble';
import { NodeFileStore } from './io/NodeFileStore';
import boxPlugin from '../plugins/shape-box/src/index';
import statsPlugin from '../plugins/command-stats/src/index';
import dirPlugin from '../plugins/command-dir/src/index';
import treeStarPlugin from '../plugins/tree-star/src/index';

/**
 * 方式 A（改代码）：在代码里 import 插件、显式列出启用的插件与**声明段**。
 *
 * 声明段与各插件包 `package.json` 的 `contributes` 必须一致——两者都会被
 * `activateChecked` 拿去和实际注册比对，不一致就是 `plugin manifest mismatch`。
 *
 * 与方式 B（根目录 `plugins.config.json` + `--config`）产出**逐字节相同**的输出，
 * 因为两者最终都走同一个 `assembleCli` + `activateChecked`。
 */
const codePlugins: readonly CodePlugin[] = [
  {
    plugin: boxPlugin,
    contributions: { shapes: ['box'], attributes: ['box-fill', 'box-label'], decorators: ['box-type-label'] },
  },
  { plugin: treeStarPlugin, contributions: { decorators: ['modified-star'] } },
  { plugin: statsPlugin, contributions: { commands: ['stats'] } },
  { plugin: dirPlugin, contributions: { commands: ['dir'] } },
];

const output = new ConsoleOutput();
const assembled = assembleCli({
  fileStore: new NodeFileStore(),
  output,
  plugins: codePlugins,
});
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
    ...(assembled.failures.length === 0
      ? {}
      : { prelude: assembled.failures.map((line) => `error: ${line}`) }),
  },
  assembled.application,
).start();