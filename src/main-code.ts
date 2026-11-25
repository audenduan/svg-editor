import { ConsoleOutput } from './cli/OutputPort';
import { Repl } from './cli/Repl';
import { assembleCli } from './host/assemble';
import { NodeFileStore } from './io/NodeFileStore';
import boxPlugin from '../plugins/shape-box/src/index';
import statsPlugin from '../plugins/command-stats/src/index';
import dirPlugin from '../plugins/command-dir/src/index';

/**
 * 方式 A（改代码）：在代码里 import 插件、显式列出启用的插件。
 *
 * 与方式 B（`config/plugins.json` + `--config`）产出**逐字节相同**的输出，
 * 因为两者最终都走同一个 `assembleCli` + `activatePlugin`。
 */
const output = new ConsoleOutput();
const assembled = assembleCli({
  fileStore: new NodeFileStore(),
  output,
  plugins: [boxPlugin, statsPlugin, dirPlugin],
});
const interactive = Boolean(process.stdin.isTTY);

process.on('SIGINT', () => {
  process.stdout.write('\n');
  process.exit(0);
});

new Repl({ input: process.stdin, output, promptStream: process.stdout, interactive }, assembled.application).start();