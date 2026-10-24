import { EditorSession } from './app/EditorSession';
import { CliApplication } from './cli/CliApplication';
import { CommandDispatcher } from './cli/CommandDispatcher';
import { ConsoleOutput } from './cli/OutputPort';
import { Repl } from './cli/Repl';
import { createDefaultShapeTypeRegistry } from './core/registry/createDefaultShapeTypeRegistry';
import { NodeFileStore } from './io/NodeFileStore';

const registry = createDefaultShapeTypeRegistry();
const session = new EditorSession({ registry, fileStore: new NodeFileStore() });
const output = new ConsoleOutput();
const application = new CliApplication(new CommandDispatcher(session, registry), output);
const interactive = Boolean(process.stdin.isTTY);

process.on('SIGINT', () => {
  process.stdout.write('\n');
  process.exit(0);
});

new Repl({ input: process.stdin, output, promptStream: process.stdout, interactive }, application).start();