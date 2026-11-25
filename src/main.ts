import { ConsoleOutput } from './cli/OutputPort';
import { Repl } from './cli/Repl';
import { assembleCli } from './host/assemble';
import { NodeFileStore } from './io/NodeFileStore';

// 组合根（方式 A：改代码装配）。Phase 2 的插件在这里 activate：
//   const ctx = createPluginContext(); shapeBox.activate(ctx); …
const output = new ConsoleOutput();
const assembled = assembleCli({ fileStore: new NodeFileStore(), output });
const interactive = Boolean(process.stdin.isTTY);

process.on('SIGINT', () => {
  process.stdout.write('\n');
  process.exit(0);
});

new Repl({ input: process.stdin, output, promptStream: process.stdout, interactive }, assembled.application).start();